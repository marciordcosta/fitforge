<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { scale } from "svelte/transition";
  import { parseISODate, hojeISO, somarDias } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import FotoPainel from "./FotoPainel.svelte";
  import {
    listFotosAgrupadas,
    getUrlsAssinadas,
    adicionarFoto,
    excluirFotoDoDia,
    getPesoDoDia,
    getPesoMedioNaData,
    getPesosDoPeriodo,
    type FotoGrupoData,
    type FotoItem,
  } from "../../lib/pesoApi";

  interface FotoAbertaState {
    grupo: FotoGrupoData;
    indiceInicial: number;
    pesoDia: number | null;
    mediaSemana: number | null;
  }

  let grupos = $state<FotoGrupoData[]>([]);
  let urls = $state<Map<string, string>>(new Map());
  /** Peso do dia e média móvel de 7 dias terminando nele, por data de foto — mostrados na lista
   * (embaixo do título da data), mesma info já usada na visualização em tela cheia. Buscados numa
   * janela só (do dia mais antigo -6 até o mais recente) pra não fazer 2 consultas por data. */
  let pesoPorData = $state<Map<string, number>>(new Map());
  let mediaPorData = $state<Map<string, number>>(new Map());
  let loading = $state(true);
  let erro = $state<string | null>(null);
  /** Ids selecionados — sem limite (a barra de ações mostra Excluir sempre que há 1+; Comparar
   * só aparece junto quando são exatamente 2, já que a comparação é sempre entre um par). */
  let selecionadas = $state<string[]>([]);
  let confirmandoExcluir = $state(false);
  let excluindo = $state(false);
  /** Entra ao pressionar uma foto (seleciona a pressionada); enquanto ativo, tocar em qualquer
   * foto alterna seleção em vez de abrir em tela cheia — igual às galerias do sistema. */
  let modoSelecao = $state(false);
  let fotoAberta = $state<FotoAbertaState | null>(null);
  /** Foto do carrossel realmente em exibição agora, no dia de fotoAberta — pode ter mudado do
   * indiceInicial se o usuário arrastou pra outra foto do mesmo dia antes de comparar/excluir. */
  let indiceAtualAberta = $state(0);
  let mostrarPickerComparar = $state(false);
  let confirmandoExcluirUnica = $state(false);
  /** Data "estacionada" esperando a segunda escolha pra comparar — clicar no título de uma data
   * (não numa foto) na lista principal. O bloco daquela data encolhe pro rodapé (fica visível ali
   * num chip com as miniaturas) e some da lista; clicar em outra data já abre a comparação. */
  let dataComparando = $state<FotoGrupoData | null>(null);

  /** Todas as outras datas (excluindo a que já está aberta) — base do grid de "escolher pra
   * comparar" dentro da visualização em tela cheia. */
  const outrosGrupos = $derived(fotoAberta ? grupos.filter((g) => g.data !== fotoAberta!.grupo.data) : []);

  /** Miniaturas embaçadas por padrão (fotos pessoais) — só o "olho" no topo revela sem filtro;
   * a tela de comparação (ao abrir uma foto de fato) sempre mostra sem embaçar. */
  let mostrarNormal = $state(false);

  type Ordenacao = "data" | "maior_peso" | "menor_peso";
  let ordenacao = $state<Ordenacao>("data");
  let mostrarOrdenacao = $state(false);

  const ORDENACOES: { valor: Ordenacao; label: string }[] = [
    { valor: "data", label: "Data (mais recente)" },
    { valor: "maior_peso", label: "Maior peso (média)" },
    { valor: "menor_peso", label: "Menor peso (média)" },
  ];

  /** Grupos sem média entrada vão pro fim da lista, nas duas ordenações por peso — não tem base
   * pra comparar, então não faz sentido competir pelo topo/fim com quem tem média de verdade. */
  const gruposOrdenados = $derived.by(() => {
    if (ordenacao === "data") return grupos;
    const comMedia = grupos.filter((g) => mediaPorData.has(g.data));
    const semMedia = grupos.filter((g) => !mediaPorData.has(g.data));
    comMedia.sort((a, b) => {
      const diff = mediaPorData.get(a.data)! - mediaPorData.get(b.data)!;
      return ordenacao === "maior_peso" ? -diff : diff;
    });
    return [...comMedia, ...semMedia];
  });

  let mostrarAdicionar = $state(false);
  let dataNovaFoto = $state(hojeISO());
  let mostrarOpcoesFoto = $state(false);
  let enviando = $state(false);
  let inputCamera = $state<HTMLInputElement | undefined>();
  let inputGaleria = $state<HTMLInputElement | undefined>();

  async function carregarPesosPorData(datas: string[]): Promise<void> {
    if (!datas.length) {
      pesoPorData = new Map();
      mediaPorData = new Map();
      return;
    }
    const ordenadas = [...new Set(datas)].sort();
    // Junta em janelas (cada uma -6 dias até a data) só quando ficam próximas/se sobrepõem — evita
    // buscar o período inteiro entre a foto mais antiga e a mais recente quando elas estão
    // espalhadas ao longo de meses/anos (comum com histórico importado), mas ainda faz 1 query só
    // por trecho denso de fotos, não uma por data.
    const janelas: { inicio: string; fim: string }[] = [];
    for (const data of ordenadas) {
      const inicio = somarDias(data, -6);
      const ultima = janelas[janelas.length - 1];
      if (ultima && inicio <= somarDias(ultima.fim, 1)) {
        ultima.fim = data;
      } else {
        janelas.push({ inicio, fim: data });
      }
    }
    const resultados = await Promise.all(janelas.map((j) => getPesosDoPeriodo(j.inicio, j.fim)));
    const registros = resultados.flat();
    const pesoMap = new Map<string, number>();
    const mediaMap = new Map<string, number>();
    for (const data of datas) {
      const doDia = registros.find((r) => r.data === data);
      if (doDia) pesoMap.set(data, doDia.peso);
      const inicioJanela = somarDias(data, -6);
      const janela = registros.filter((r) => r.data >= inicioJanela && r.data <= data);
      if (janela.length) mediaMap.set(data, janela.reduce((acc, r) => acc + r.peso, 0) / janela.length);
    }
    pesoPorData = pesoMap;
    mediaPorData = mediaMap;
  }

  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  function formatarDataCompleta(iso: string): string {
    const [ano, mes, dia] = iso.split("-");
    return `${dia} de ${MESES[Number(mes) - 1]} de ${ano}`;
  }

  function formatarPeso(v: number | null | undefined): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const lista = await listFotosAgrupadas();
      grupos = lista;
      const [urlsRes] = await Promise.all([
        getUrlsAssinadas(lista.flatMap((g) => g.fotos.map((f) => f.path))),
        carregarPesosPorData(lista.map((g) => g.data)),
      ]);
      urls = urlsRes;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function formatarData(iso: string): string {
    const texto = parseISODate(iso).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function alternarSelecao(id: string) {
    if (selecionadas.includes(id)) {
      selecionadas = selecionadas.filter((x) => x !== id);
      if (!selecionadas.length) modoSelecao = false;
    } else {
      selecionadas = [...selecionadas, id];
    }
  }

  function cancelarSelecao() {
    selecionadas = [];
    modoSelecao = false;
  }

  /** Gatilho de comparação na lista principal: clicar no título de uma data seleciona-a, clicar no
   * título de outra já abre a comparação (primeira foto de cada uma) — em vez de escolher fotos
   * uma a uma. Clicar de novo na mesma data cancela. */
  function aoClicarData(grupo: FotoGrupoData): void {
    if (modoSelecao) return;
    if (dataComparando?.data === grupo.data) {
      dataComparando = null;
      return;
    }
    if (!dataComparando) {
      dataComparando = grupo;
      return;
    }
    const foto1 = dataComparando.fotos[0];
    const foto2 = grupo.fotos[0];
    dataComparando = null;
    navigate(`/fotos/comparar/${foto1.id}/${foto2.id}`);
  }

  async function excluirSelecionadas() {
    confirmandoExcluir = false;
    const fotosPorId = new Map(grupos.flatMap((g) => g.fotos).map((f) => [f.id, f]));
    excluindo = true;
    try {
      await Promise.all(
        selecionadas.map((id) => {
          const foto = fotosPorId.get(id);
          return foto ? excluirFotoDoDia(foto) : Promise.resolve();
        }),
      );
      selecionadas = [];
      modoSelecao = false;
      await carregar();
    } catch (err) {
      alert("Erro ao excluir foto(s): " + (err as Error).message);
    } finally {
      excluindo = false;
    }
  }

  /** Tempo segurando a foto parada antes do toque virar "pressionar" (entra no modo de seleção) —
   * evita disparar sem querer num toque rápido/rolagem. Mesmo padrão usado nos cards da Dieta. */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownFoto(e: PointerEvent, id: string) {
    if (dataComparando) return;
    pressionarX = e.clientX;
    pressionarY = e.clientY;
    pressionouLongo = false;
    window.addEventListener("pointermove", aoPointerMovePressionar);
    window.addEventListener("pointerup", aoPointerUpPressionar);
    window.addEventListener("pointercancel", aoPointerUpPressionar);
    timeoutPressionar = setTimeout(() => {
      pressionouLongo = true;
      cancelarPressionar();
      if (navigator.vibrate) navigator.vibrate(10);
      modoSelecao = true;
      alternarSelecao(id);
    }, ATRASO_PRESSIONAR_MS);
  }

  function cancelarPressionar() {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
    window.removeEventListener("pointercancel", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarPressionar();
    }
  }

  function aoPointerUpPressionar() {
    cancelarPressionar();
  }

  function aoClickFoto(foto: FotoItem) {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    if (modoSelecao) {
      alternarSelecao(foto.id);
      return;
    }
    void abrirFoto(foto);
  }

  /** Token da abertura em andamento — evita que a resposta de um abrirFoto() antigo (ainda em voo)
   * sobrescreva peso/média de uma abertura mais nova da MESMA data (fechar e reabrir rápido antes
   * do primeiro fetch terminar); comparar só a data não bastava, já que duas aberturas seguidas da
   * mesma data passariam nesse teste igual. */
  let tokenAbrirFoto = 0;

  /** Abre a foto em tela cheia com o carrossel já posicionado nela, dentro das fotos DAQUELE dia
   * — peso/média são buscados à parte (mesma info mostrada em FotoComparar) sem travar a abertura. */
  async function abrirFoto(foto: FotoItem): Promise<void> {
    const grupo = grupos.find((g) => g.fotos.some((f) => f.id === foto.id));
    if (!grupo) return;
    const meuToken = ++tokenAbrirFoto;
    const indiceInicial = Math.max(0, grupo.fotos.findIndex((f) => f.id === foto.id));
    indiceAtualAberta = indiceInicial;
    mostrarPickerComparar = false;
    fotoAberta = { grupo, indiceInicial, pesoDia: null, mediaSemana: null };
    try {
      const [pesoDia, mediaSemana] = await Promise.all([getPesoDoDia(grupo.data), getPesoMedioNaData(grupo.data)]);
      if (tokenAbrirFoto === meuToken && fotoAberta) fotoAberta = { ...fotoAberta, pesoDia, mediaSemana };
    } catch {
      // peso/média são só informativos aqui — a foto continua visível mesmo se isso falhar
    }
  }

  function fecharFotoAberta(): void {
    fotoAberta = null;
    mostrarPickerComparar = false;
  }

  /** Compara a foto REALMENTE em exibição (pode ter mudado do indiceInicial arrastando o
   * carrossel) com a escolhida no grid — reaproveita a tela de comparação já existente. */
  function selecionarParaComparar(foto: FotoItem): void {
    if (!fotoAberta) return;
    const fotoAtual = fotoAberta.grupo.fotos[indiceAtualAberta] ?? fotoAberta.grupo.fotos[fotoAberta.indiceInicial];
    navigate(`/fotos/comparar/${fotoAtual.id}/${foto.id}`);
    fecharFotoAberta();
  }

  async function excluirFotoAberta(): Promise<void> {
    confirmandoExcluirUnica = false;
    if (!fotoAberta) return;
    const foto = fotoAberta.grupo.fotos[indiceAtualAberta] ?? fotoAberta.grupo.fotos[fotoAberta.indiceInicial];
    excluindo = true;
    try {
      await excluirFotoDoDia(foto);
      fecharFotoAberta();
      await carregar();
    } catch (err) {
      alert("Erro ao excluir foto: " + (err as Error).message);
    } finally {
      excluindo = false;
    }
  }

  function abrirAdicionar() {
    dataNovaFoto = hojeISO();
    mostrarAdicionar = true;
  }

  async function selecionarFotos(e: Event) {
    const input = e.target as HTMLInputElement;
    const arquivos = input.files ? Array.from(input.files) : [];
    if (!arquivos.length) return;
    enviando = true;
    try {
      // Base calculada uma vez só, fora do map — passar `ordem` explícito evita que os uploads em
      // paralelo leiam a mesma contagem antes de qualquer um confirmar (ordem duplicada).
      const baseOrdem = grupos.find((g) => g.data === dataNovaFoto)?.fotos.length ?? 0;
      await Promise.all(arquivos.map((arquivo, i) => adicionarFoto(dataNovaFoto, arquivo, baseOrdem + i)));
      mostrarAdicionar = false;
      await carregar();
    } catch (err) {
      alert("Erro ao adicionar foto: " + (err as Error).message);
    } finally {
      enviando = false;
      input.value = "";
    }
  }
</script>

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}
{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}
{#snippet iconCamera()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
{/snippet}
{#snippet iconGaleria()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15l-5-5-9 9" />
  </svg>
{/snippet}
{#snippet iconOrdenar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="14" y2="12" />
    <line x1="4" y1="18" x2="8" y2="18" />
  </svg>
{/snippet}
{#snippet iconOlho()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
{/snippet}
{#snippet iconOlhoFechado()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 4.22-5.44M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
{/snippet}
{#snippet iconFechar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
{/snippet}
{#snippet iconLixeira()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
{/snippet}
{#snippet iconComparar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    {#if modoSelecao}
      <button class="icon-btn" onclick={cancelarSelecao} aria-label="Cancelar seleção">{@render iconFechar()}</button>
      <h1>{selecionadas.length} selecionada{selecionadas.length === 1 ? "" : "s"}</h1>
      <button
        type="button"
        class="icon-btn excluir"
        disabled={excluindo}
        onclick={() => (confirmandoExcluir = true)}
        aria-label="Excluir selecionadas"
      >
        {@render iconLixeira()}
      </button>
    {:else}
      <h1>Fotos</h1>
      <button class="icon-btn" onclick={() => (mostrarOrdenacao = true)} aria-label="Ordenar">
        {@render iconOrdenar()}
      </button>
      <button
        class="icon-btn"
        onclick={() => (mostrarNormal = !mostrarNormal)}
        aria-label={mostrarNormal ? "Embaçar miniaturas" : "Mostrar miniaturas sem filtro"}
      >
        {@render (mostrarNormal ? iconOlho : iconOlhoFechado)()}
      </button>
      <button class="icon-btn" onclick={abrirAdicionar} aria-label="Adicionar foto">{@render iconMais()}</button>
    {/if}
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar fotos: {erro}</p>
  {:else if !grupos.length}
    <p class="muted">Nenhuma foto registrada ainda — toque no "+" pra adicionar a primeira.</p>
  {:else}
    {#each gruposOrdenados as grupo (grupo.data)}
      <div class="grupo-data-wrap" class:saindo={dataComparando?.data === grupo.data}>
        <div class="grupo-data-inner">
          <button
            type="button"
            class="data-titulo-btn"
            class:aguardando={dataComparando != null && dataComparando.data !== grupo.data}
            onclick={() => aoClicarData(grupo)}
          >
            {formatarData(grupo.data)}
          </button>
          {#if pesoPorData.has(grupo.data) || mediaPorData.has(grupo.data)}
            <p class="data-peso">
              {formatarPeso(pesoPorData.get(grupo.data))}
              <span class="data-peso-media">· méd. sem. {formatarPeso(mediaPorData.get(grupo.data))}</span>
            </p>
          {/if}
          <div class="grade-fotos">
            {#each grupo.fotos as foto (foto.id)}
              <button
                type="button"
                class="foto-item"
                class:selecionada={selecionadas.includes(foto.id)}
                onpointerdown={(e) => aoPointerDownFoto(e, foto.id)}
                oncontextmenu={(e) => e.preventDefault()}
                onclick={() => aoClickFoto(foto)}
                aria-label="Abrir foto"
              >
                {#if urls.get(foto.path)}
                  <img src={urls.get(foto.path)} alt="" loading="lazy" class:embacada={!mostrarNormal} />
                {/if}
                {#if selecionadas.includes(foto.id)}
                  <span class="foto-check">{@render iconCheck()}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if dataComparando}
  <div class="chip-comparando" in:scale={{ duration: 300, start: 0.55 }}>
    <div class="chip-thumbs">
      {#each dataComparando.fotos.slice(0, 3) as foto (foto.id)}
        {#if urls.get(foto.path)}
          <img src={urls.get(foto.path)} alt="" class="chip-thumb" />
        {/if}
      {/each}
      {#if dataComparando.fotos.length > 3}
        <span class="chip-mais">+{dataComparando.fotos.length - 3}</span>
      {/if}
    </div>
    <div class="chip-texto">
      <strong>{formatarData(dataComparando.data)}</strong>
      <span>Toque em outra data pra comparar</span>
    </div>
    <button type="button" class="chip-cancelar" onclick={() => (dataComparando = null)} aria-label="Cancelar comparação">
      {@render iconFechar()}
    </button>
  </div>
{/if}

{#if confirmandoExcluir}
  <ConfirmDialog
    titulo={`Excluir ${selecionadas.length} foto${selecionadas.length === 1 ? "" : "s"}?`}
    textoConfirmar="Excluir"
    onConfirmar={excluirSelecionadas}
    onCancelar={() => (confirmandoExcluir = false)}
  />
{/if}

{#if fotoAberta}
  <div class="visualizar-container">
    <div class="visualizar-topbar">
      <button class="visualizar-fechar" onclick={fecharFotoAberta} aria-label="Fechar">{@render iconFechar()}</button>
      {#if fotoAberta.grupo.fotos.length > 1}
        <span class="visualizar-contador">{indiceAtualAberta + 1}/{fotoAberta.grupo.fotos.length}</span>
      {/if}
    </div>
    <div class="visualizar-split" class:comparando={mostrarPickerComparar}>
      <div class="visualizar-topo">
        <FotoPainel
          fotos={fotoAberta.grupo.fotos}
          indiceInicial={fotoAberta.indiceInicial}
          {urls}
          pesoDia={fotoAberta.pesoDia}
          mediaSemana={fotoAberta.mediaSemana}
          data={fotoAberta.grupo.data}
          ocultarTopo
          ocultarRodape
          ocultarContador
          onIndiceChange={(i) => (indiceAtualAberta = i)}
        />
      </div>
      {#if mostrarPickerComparar}
        <div class="visualizar-picker">
          <p class="picker-titulo">Escolha a foto pra comparar</p>
          {#if !outrosGrupos.length}
            <p class="picker-vazio">Nenhuma outra data com fotos pra comparar.</p>
          {:else}
            {#each outrosGrupos as grupo (grupo.data)}
              <p class="data-titulo picker-data-titulo">{formatarData(grupo.data)}</p>
              {#if pesoPorData.has(grupo.data) || mediaPorData.has(grupo.data)}
                <p class="data-peso">
                  {formatarPeso(pesoPorData.get(grupo.data))}
                  <span class="data-peso-media">· méd. sem. {formatarPeso(mediaPorData.get(grupo.data))}</span>
                </p>
              {/if}
              <div class="grade-fotos">
                {#each grupo.fotos as foto (foto.id)}
                  <button type="button" class="foto-item" onclick={() => selecionarParaComparar(foto)} aria-label="Comparar com esta foto">
                    {#if urls.get(foto.path)}
                      <img src={urls.get(foto.path)} alt="" loading="lazy" />
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    {#if mostrarPickerComparar}
      <button type="button" class="picker-cancelar" onclick={() => (mostrarPickerComparar = false)}>Cancelar</button>
    {:else}
      <div class="visualizar-rodape">
        <div class="visualizar-rodape-info">
          <strong>{formatarDataCompleta(fotoAberta.grupo.data)}</strong>
          {#if fotoAberta.pesoDia != null || fotoAberta.mediaSemana != null}
            <span>{formatarPeso(fotoAberta.pesoDia)}{fotoAberta.mediaSemana != null ? ` · méd. ${formatarPeso(fotoAberta.mediaSemana)}` : ""}</span>
          {/if}
        </div>
        <div class="visualizar-acoes">
          <button type="button" class="visualizar-acao-btn comparar" onclick={() => (mostrarPickerComparar = true)} aria-label="Comparar">
            {@render iconComparar()}
          </button>
          <button type="button" class="visualizar-acao-btn excluir" disabled={excluindo} onclick={() => (confirmandoExcluirUnica = true)} aria-label="Excluir">
            {@render iconLixeira()}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if confirmandoExcluirUnica}
  <ConfirmDialog
    titulo="Excluir esta foto?"
    textoConfirmar="Excluir"
    onConfirmar={excluirFotoAberta}
    onCancelar={() => (confirmandoExcluirUnica = false)}
  />
{/if}

{#if mostrarAdicionar}
  <Sheet titulo="Adicionar foto" onFechar={() => (mostrarAdicionar = false)}>
    <label class="campo-data">
      <span>Data da foto</span>
      <input type="date" bind:value={dataNovaFoto} max={hojeISO()} />
    </label>
    <Button onclick={() => (mostrarOpcoesFoto = true)} disabled={enviando}>
      {enviando ? "Enviando…" : "Escolher foto"}
    </Button>
  </Sheet>
{/if}

{#if mostrarOrdenacao}
  <ActionSheet
    titulo="Ordenar por"
    onFechar={() => (mostrarOrdenacao = false)}
    opcoes={ORDENACOES.map((o) => ({
      label: o.label,
      valor: ordenacao === o.valor ? "✓" : undefined,
      onSelect: () => (ordenacao = o.valor),
    }))}
  />
{/if}

{#if mostrarOpcoesFoto}
  <ActionSheet
    titulo="Adicionar foto"
    onFechar={() => (mostrarOpcoesFoto = false)}
    opcoes={[
      { label: "Câmera", icon: iconCamera, onSelect: () => inputCamera?.click() },
      { label: "Galeria", icon: iconGaleria, onSelect: () => inputGaleria?.click() },
    ]}
  />
{/if}

<input bind:this={inputCamera} type="file" accept="image/*" capture="environment" class="foto-input" onchange={selecionarFotos} />
<input bind:this={inputGaleria} type="file" accept="image/*" multiple class="foto-input" onchange={selecionarFotos} />

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-2);
    margin-top: calc(var(--space-2) * -1);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-2);
    background: var(--surface-bg);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .icon-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
  }
  .icon-btn.excluir {
    background: var(--color-danger);
    color: #fff;
  }
  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .campo-data {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
  .campo-data span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo-data input {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .foto-input {
    display: none;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .data-titulo {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-muted);
  }
  .data-titulo:first-of-type {
    margin-top: 0;
  }
  .picker-data-titulo {
    color: var(--surface-fg);
  }
  /** Grupo de uma data na lista principal — encolhe suavemente (grid-rows) quando escolhido pra
   * comparar, em vez de sumir com um salto no resto da lista (transform sozinho não afeta layout). */
  .grupo-data-wrap {
    display: grid;
    grid-template-rows: 1fr;
    transform-origin: center bottom;
    transition:
      grid-template-rows 0.38s cubic-bezier(0.22, 0.61, 0.36, 1),
      opacity 0.38s ease,
      transform 0.38s ease;
  }
  .grupo-data-wrap.saindo {
    grid-template-rows: 0fr;
    opacity: 0;
    transform: scale(0.92);
  }
  .grupo-data-inner {
    overflow: hidden;
    min-height: 0;
  }
  .data-titulo-btn {
    display: block;
    width: 100%;
    margin: var(--space-4) 0 var(--space-1);
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .grupo-data-wrap:first-of-type .data-titulo-btn {
    margin-top: 0;
  }
  .data-titulo-btn.aguardando {
    color: var(--color-secondary);
  }
  .data-peso {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .data-peso-media {
    opacity: 0.75;
  }
  .grade-fotos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }
  .foto-item {
    position: relative;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface-card);
    cursor: pointer;
    /* Segurar pra selecionar/comparar não pode abrir o menu de copiar/selecionar do Android. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .foto-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .foto-item img.embacada {
    filter: blur(7px);
    transform: scale(1.08);
  }
  .foto-item.selecionada img {
    opacity: 0.6;
  }
  .foto-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .foto-check svg {
    width: 14px;
    height: 14px;
  }
  .chip-comparando {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
    max-width: 448px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-float);
    padding: var(--space-2) var(--space-3);
    z-index: 60;
  }
  .chip-thumbs {
    display: flex;
    flex-shrink: 0;
  }
  .chip-thumb {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    border: 2px solid var(--surface-card);
    margin-left: -10px;
  }
  .chip-thumb:first-child {
    margin-left: 0;
  }
  .chip-mais {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    background: var(--surface-bg);
    color: var(--surface-muted);
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -10px;
    flex-shrink: 0;
  }
  .chip-texto {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .chip-texto strong {
    font-size: var(--font-size-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip-texto span {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .chip-cancelar {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .chip-cancelar svg {
    width: 14px;
    height: 14px;
  }
  .visualizar-container {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 300;
    display: flex;
    flex-direction: column;
  }
  .visualizar-topbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: max(var(--space-3), env(safe-area-inset-top, 0px)) var(--space-4) var(--space-3);
  }
  .visualizar-contador {
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
    padding: 4px 12px;
    border-radius: 999px;
  }
  .visualizar-split {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .visualizar-topo {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .visualizar-split.comparando .visualizar-topo {
    flex: 0 0 42%;
  }
  .visualizar-picker {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-4) var(--space-4);
    background: var(--surface-bg);
  }
  .picker-titulo {
    position: sticky;
    top: 0;
    margin: 0;
    padding: var(--space-3) 0;
    background: var(--surface-bg);
    font-weight: 600;
    text-align: center;
  }
  .picker-vazio {
    color: var(--surface-muted);
    text-align: center;
    padding: var(--space-4) 0;
  }
  .visualizar-rodape {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) max(var(--space-3), env(safe-area-inset-bottom, 0px));
  }
  .visualizar-rodape-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: #fff;
    text-align: center;
  }
  .visualizar-rodape-info strong {
    font-size: 15px;
    font-weight: 600;
  }
  .visualizar-rodape-info span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  .visualizar-acoes {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
  }
  .visualizar-acao-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .visualizar-acao-btn svg {
    width: 22px;
    height: 22px;
  }
  .visualizar-acao-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .visualizar-acao-btn.comparar {
    background: rgba(255, 255, 255, 0.15);
  }
  .visualizar-acao-btn.excluir {
    background: rgba(220, 38, 38, 0.85);
  }
  .picker-cancelar {
    width: 100%;
    padding: var(--space-3);
    border: none;
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    padding-bottom: max(var(--space-3), env(safe-area-inset-bottom, 0px));
  }
  .visualizar-fechar {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .visualizar-fechar svg {
    width: 18px;
    height: 18px;
  }
</style>
