<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { formatMinSeg } from "../../lib/tempo";
  import { mostrarToast } from "../../lib/toast.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DescansoPicker from "../../components/DescansoPicker.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import Exercicios from "./Exercicios.svelte";
  import {
    getTreino,
    createTreino,
    renameTreino,
    salvarExerciciosRotina,
    limparMetasMusculoRotina,
    getUltimoRegistro,
    getObservacoesAtuais,
    salvarObservacaoExercicio,
    listTreinos,
    adicionarTreinoExercicio,
    removerTreinoExercicio,
    DIAS_SEMANA_ABREV,
    DIAS_SEMANA_COMPLETO,
    type Exercicio,
    type SetRegistro,
    type TreinoComExercicios,
    type TreinoExercicio,
  } from "../../lib/treinoApi";
  import { hojeISO } from "../../lib/dates";
  import { rotinaEditorSessao, type Linha, type LinhaSerie } from "../../lib/rotinaEditorSessao.svelte";
  import { criarGuardaSaida } from "../../lib/guardaSaida.svelte";
  import type { PendenteMoverTrocar } from "../../lib/treinoEditorRascunho.svelte";

  let { treinoId }: { treinoId: string | null } = $props();

  let nomeTreino = $state("");
  let diaSemana = $state<number | null>(null);
  let linhas = $state<Linha[]>([]);
  /** Observação atual de cada exercício (por exercicio_id, não por slot da rotina) — fora do
   * dirty-check de `linhas`: salva instantâneo ao editar, igual ao descanso, em vez de disputar
   * com o "Salvar rotina" (era a causa da nota some/reaparecer sozinha). */
  let observacoesPorExercicio = $state<Map<string, string>>(new Map());
  let loading = $state(true);
  let salvando = $state(false);
  let mostrarPicker = $state(false);
  /** Busca digitada no picker (Adicionar/Substituir) — persistida em rotinaEditorSessao (junto
   * com qual picker estava aberto) pra sobreviver a tocar no nome de um exercício pra ver o
   * detalhe e voltar, em vez de cair de volta na tela de rotina "pelada". */
  let buscaPicker = $state("");
  /** "Ir para Rotinas" (mover/trocar exercício com outra rotina) ainda não salvo — igual ao
   * editor completo em DistribuicaoMusculos.svelte, só grava de verdade ao Salvar. Declarado logo
   * no topo (antes de `void carregar()`, mais abaixo) porque `carregar()` já atribui aqui na
   * primeira execução síncrona, ao restaurar uma sessão salva. */
  let pendentesMoverTrocar = $state<PendenteMoverTrocar[]>([]);
  let mostrarDiaPicker = $state(false);

  const opcoesDia = [
    { valor: null, label: "Sem dia fixo" },
    ...DIAS_SEMANA_COMPLETO.map((label, idx) => ({ valor: idx, label })),
  ];

  const anteriorCache = new Map<string, SetRegistro[]>();

  async function getAnteriorCached(exercicioId: string): Promise<SetRegistro[]> {
    let anterior = anteriorCache.get(exercicioId);
    if (!anterior) {
      anterior = await getUltimoRegistro(exercicioId);
      anteriorCache.set(exercicioId, anterior);
    }
    return anterior;
  }

  let erroCarregar = $state<string | null>(null);

  async function carregar() {
    loading = true;
    erroCarregar = null;
    try {
      const salva = rotinaEditorSessao.atual;
      if (salva && salva.treinoId === treinoId) {
        nomeTreino = salva.nomeTreino;
        diaSemana = salva.diaSemana;
        linhas = salva.linhas;
        if (salva.picker?.modo === "adicionar") {
          mostrarPicker = true;
          buscaPicker = salva.picker.busca;
        } else if (salva.picker?.modo === "substituir") {
          substituindoIdx = salva.picker.idx;
          buscaPicker = salva.picker.busca;
        }
        pendentesMoverTrocar = salva.pendentes ?? [];
        observacoesPorExercicio = await getObservacoesAtuais(linhas.map((l) => l.exercicio_id));
        loading = false;
        return;
      }

      if (treinoId) {
        const t = await getTreino(treinoId);
        if (t) {
          nomeTreino = t.nome_treino;
          diaSemana = t.dia_semana;
          linhas = t.exercicios.map((e) => ({
            exercicio_id: e.exercicio_id,
            nome: e.exercicio?.nome ?? "",
            descanso_seg: e.descanso_seg,
            series: e.series.map((s) => ({
              serie: s.serie,
              peso_alvo: s.peso_alvo,
              rep_min: s.rep_min,
              rep_max: s.rep_max,
            })),
          }));
        }
      }
      observacoesPorExercicio = await getObservacoesAtuais(linhas.map((l) => l.exercicio_id));
      rotinaEditorSessao.definirOriginal(JSON.stringify({ nomeTreino, diaSemana, linhas }));
    } catch (e) {
      erroCarregar = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function temAlteracoes(): boolean {
    const original = rotinaEditorSessao.original;
    if (original == null) return true;
    return JSON.stringify({ nomeTreino, diaSemana, linhas }) !== original;
  }

  function aoClicarCancelar() {
    if (temAlteracoes()) {
      mostrarConfirmCancelar = true;
    } else {
      rotinaEditorSessao.limpar();
      window.history.back();
    }
  }

  /** Cobre também o voltar FÍSICO/gesto (o botão "Cancelar" já se protege sozinho acima) — mesmo
   * alerta de descartar, só reaproveitando o ConfirmDialog que já existe. */
  const guardaSaida = criarGuardaSaida(() => !loading && !erroCarregar && temAlteracoes());

  $effect(() => {
    if (loading || erroCarregar) return;
    const picker = mostrarPicker
      ? ({ modo: "adicionar", busca: buscaPicker } as const)
      : substituindoIdx != null
        ? ({ modo: "substituir", idx: substituindoIdx, busca: buscaPicker } as const)
        : null;
    rotinaEditorSessao.iniciar({ treinoId, nomeTreino, diaSemana, linhas, picker, pendentes: pendentesMoverTrocar });
  });

  void carregar();

  let adicionandoId = $state<string | null>(null);

  async function construirLinha(ex: Exercicio): Promise<Linha> {
    const anterior = await getAnteriorCached(ex.id);
    const series: LinhaSerie[] = Array.from({ length: 3 }, (_, i) => {
      const ant = anterior.find((a) => a.serie === i + 1);
      return {
        serie: i + 1,
        peso_alvo: ant?.peso ?? null,
        rep_min: ant?.repeticoes ?? null,
        rep_max: ant?.repeticoes ?? null,
      };
    });
    return {
      exercicio_id: ex.id,
      nome: ex.nome,
      descanso_seg: ex.descanso_padrao_seg ?? 180,
      series,
    };
  }

  async function salvarObservacao(exercicioId: string, valor: string): Promise<void> {
    const texto = valor.trim();
    observacoesPorExercicio = new Map(observacoesPorExercicio).set(exercicioId, texto);
    try {
      await salvarObservacaoExercicio(exercicioId, texto, hojeISO());
    } catch (e) {
      alert("Erro ao salvar observação: " + (e as Error).message);
    }
  }

  async function adicionarRapido(ex: Exercicio) {
    adicionandoId = ex.id;
    try {
      const [novaLinha, obs] = await Promise.all([construirLinha(ex), getObservacoesAtuais([ex.id])]);
      linhas = [...linhas, novaLinha];
      observacoesPorExercicio = new Map(observacoesPorExercicio).set(ex.id, obs.get(ex.id) ?? "");
    } finally {
      adicionandoId = null;
    }
  }

  function remover(idx: number) {
    linhas = linhas.filter((_, i) => i !== idx);
  }

  async function adicionarSerie(idx: number) {
    const linha = linhas[idx];
    const anterior = await getAnteriorCached(linha.exercicio_id);
    const proxSerie = linha.series.length + 1;
    const ant = anterior.find((a) => a.serie === proxSerie);
    linha.series = [
      ...linha.series,
      {
        serie: proxSerie,
        peso_alvo: ant?.peso ?? null,
        rep_min: ant?.repeticoes ?? null,
        rep_max: ant?.repeticoes ?? null,
      },
    ];
  }

  function removerSerie(idx: number, setIdx: number) {
    const linha = linhas[idx];
    linha.series = linha.series.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, serie: i + 1 }));
  }

  let menuExercicioAberto = $state<number | null>(null);
  let menuSerieAberto = $state<{ idx: number; setIdx: number } | null>(null);
  let mostrarConfirmCancelar = $state(false);
  let substituindoIdx = $state<number | null>(null);

  function abrirSubstituir(idx: number) {
    substituindoIdx = idx;
  }

  function fecharSubstituir() {
    substituindoIdx = null;
    buscaPicker = "";
  }

  /** Troca o exercício da linha mantendo a mesma quantidade de séries, com metas
   * pré-preenchidas a partir do histórico do novo exercício (igual a construirLinha). */
  async function substituirExercicio(novoEx: Exercicio) {
    if (substituindoIdx == null) return;
    const idx = substituindoIdx;
    const linha = linhas[idx];
    const [anterior, obs] = await Promise.all([getAnteriorCached(novoEx.id), getObservacoesAtuais([novoEx.id])]);
    const series: LinhaSerie[] = Array.from({ length: linha.series.length }, (_, i) => {
      const ant = anterior.find((a) => a.serie === i + 1);
      return {
        serie: i + 1,
        peso_alvo: ant?.peso ?? null,
        rep_min: ant?.repeticoes ?? null,
        rep_max: ant?.repeticoes ?? null,
      };
    });
    linhas[idx] = { ...linha, exercicio_id: novoEx.id, nome: novoEx.nome, series };
    observacoesPorExercicio = new Map(observacoesPorExercicio).set(novoEx.id, obs.get(novoEx.id) ?? "");
    fecharSubstituir();
  }

  // ---------------- Substituir Exercício: submenu Ir para Lista / Ir para Rotinas ----------------

  /** Item cujo submenu "Ir para Lista / Ir para Rotinas" (dentro de Substituir Exercício) está
   * aberto — igual ao mesmo submenu já usado no treino ao vivo e em Distribuição Muscular. */
  let submenuSubstituirIdx = $state<number | null>(null);

  /** Candidatas pra "Ir para Rotinas" — carregado à parte, não bloqueia a tela. */
  let outrasRotinas = $state<TreinoComExercicios[]>([]);

  async function carregarOutrasRotinas() {
    outrasRotinas = (await listTreinos()).filter((t) => t.id !== treinoId);
  }

  void carregarOutrasRotinas();

  let trocandoIdx = $state<number | null>(null);
  let processandoTroca = $state(false);

  /** Rotinas candidatas: precisam ter pelo menos 1 exercício (precisa de alguém pra trocar de
   * lugar) e ainda não ter o exercício que está saindo — senão ficaria duplicado nela. */
  const rotinasParaTrocar = $derived(
    trocandoIdx != null
      ? outrasRotinas.filter(
          (t) => t.exercicios.length > 0 && !t.exercicios.some((te) => te.exercicio_id === linhas[trocandoIdx!].exercicio_id),
        )
      : [],
  );

  function abrirTrocarDeRotina(idx: number): void {
    trocandoIdx = idx;
  }

  function fecharTrocarDeRotina(): void {
    trocandoIdx = null;
  }

  /** Troca os dois exercícios de rotina entre si: o que sai daqui entra na rotina de destino
   * (registrado em `pendentesMoverTrocar`, só aplicado de verdade ao Salvar) e o escolhido lá
   * entra aqui no lugar, com o mesmo número de séries que já tinha — igual ao editor completo em
   * DistribuicaoMusculos.svelte. Diferente do treino ao vivo (que grava a rotina de destino na
   * hora): aqui tudo é rascunho local até Salvar, então cancelar não deixa nenhuma das duas com um
   * exercício a mais/a menos. Rotina e exercício de destino vêm juntos num só toque (lista de
   * rotinas com os exercícios já dentro do card), sem etapa intermediária de escolher a rotina. */
  async function trocarExercicioDeRotina(destino: TreinoComExercicios, destinoItem: TreinoExercicio): Promise<void> {
    if (trocandoIdx == null) return;
    const idx = trocandoIdx;
    const linha = linhas[idx];
    processandoTroca = true;
    try {
      const [anterior, obs] = await Promise.all([
        getAnteriorCached(destinoItem.exercicio_id),
        getObservacoesAtuais([destinoItem.exercicio_id]),
      ]);
      const series: LinhaSerie[] = Array.from({ length: linha.series.length }, (_, i) => {
        const ant = anterior.find((a) => a.serie === i + 1);
        return {
          serie: i + 1,
          peso_alvo: ant?.peso ?? null,
          rep_min: ant?.repeticoes ?? null,
          rep_max: ant?.repeticoes ?? null,
        };
      });
      linhas[idx] = { ...linha, exercicio_id: destinoItem.exercicio_id, nome: destinoItem.exercicio?.nome ?? "", series };
      observacoesPorExercicio = new Map(observacoesPorExercicio).set(
        destinoItem.exercicio_id,
        obs.get(destinoItem.exercicio_id) ?? "",
      );
      pendentesMoverTrocar = [
        ...pendentesMoverTrocar,
        {
          destinoTreinoId: destino.id,
          destinoTreinoNome: destino.nome_treino,
          exercicioEntraId: linha.exercicio_id,
          exercicioEntraNumSeries: destinoItem.series.length,
          exercicioSaiTreinoExercicioId: destinoItem.id,
          destinoOrdem: destinoItem.ordem,
        },
      ];
      fecharTrocarDeRotina();
    } finally {
      processandoTroca = false;
    }
  }

  let descansoEditandoIdx = $state<number | null>(null);
  let reordenando = $state(false);
  let arrastandoIdx = $state<number | null>(null);
  let itemRefs: (HTMLElement | null)[] = [];

  function toggleMenuSerie(idx: number, setIdx: number) {
    menuSerieAberto =
      menuSerieAberto?.idx === idx && menuSerieAberto?.setIdx === setIdx ? null : { idx, setIdx };
  }

  function iniciarArraste(e: PointerEvent, idx: number) {
    arrastandoIdx = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moverDurante(e: PointerEvent) {
    if (arrastandoIdx === null) return;
    const y = e.clientY;
    for (let i = 0; i < itemRefs.length; i++) {
      const el = itemRefs[i];
      if (!el || i === arrastandoIdx) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if ((i < arrastandoIdx && y < meio) || (i > arrastandoIdx && y > meio)) {
        const novas = linhas.slice();
        const [item] = novas.splice(arrastandoIdx, 1);
        novas.splice(i, 0, item);
        linhas = novas;
        arrastandoIdx = i;
        break;
      }
    }
  }

  function finalizarArraste() {
    arrastandoIdx = null;
  }

  $effect(() => {
    if (arrastandoIdx === null) return;
    window.addEventListener("pointermove", moverDurante);
    window.addEventListener("pointerup", finalizarArraste);
    return () => {
      window.removeEventListener("pointermove", moverDurante);
      window.removeEventListener("pointerup", finalizarArraste);
    };
  });

  async function salvar() {
    if (!nomeTreino.trim()) {
      alert("Informe o nome da rotina.");
      return;
    }
    salvando = true;
    try {
      const id = treinoId ?? (await createTreino(nomeTreino.trim(), diaSemana));
      if (treinoId) await renameTreino(treinoId, nomeTreino.trim(), diaSemana);
      await salvarExerciciosRotina(
        id,
        linhas.map((l) => ({
          exercicio_id: l.exercicio_id,
          descanso_seg: l.descanso_seg,
          series: l.series,
        })),
      );
      // "Ir para Rotinas" só é aplicado de verdade aqui — até agora mexeu só no rascunho local
      // (linhas), igual ao editor completo em DistribuicaoMusculos.svelte. Cancelar antes daqui
      // não afeta nenhuma das duas rotinas.
      for (const p of pendentesMoverTrocar) {
        const anterior = await getUltimoRegistro(p.exercicioEntraId);
        await adicionarTreinoExercicio(p.destinoTreinoId, p.exercicioEntraId, p.exercicioEntraNumSeries, anterior, p.destinoOrdem);
        if (p.exercicioSaiTreinoExercicioId) await removerTreinoExercicio(p.exercicioSaiTreinoExercicioId);
      }
      // A meta é um alvo pra guiar o ajuste (grade "Distribuição na Semana") — uma vez salvo o
      // resultado, ela deixa de fazer sentido e some, até definir um novo alvo. Mesma regra que
      // já valia salvando pelo editor embutido em DistribuicaoMusculos.svelte.
      await limparMetasMusculoRotina(id);
      pendentesMoverTrocar = [];
      rotinaEditorSessao.limpar();
      mostrarToast("Salvo");
      // Não usa window.history.back() direto: o guarda de saída (voltar físico) continuaria
      // armado nesse instante — limpar() zera rotinaEditorSessao.original, o que faz
      // temAlteracoes() voltar true — e interceptaria essa navegação como se fosse um descarte.
      guardaSaida.resolverSaida(() => window.history.back());
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}
{#snippet iconReordenar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 7l-4 4 4 4M16 7l4 4-4 4" />
    <path d="M4 11h16" />
  </svg>
{/snippet}
{#snippet iconRemoverExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}
{#snippet iconSubstituir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
{/snippet}
{#snippet iconLista()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
{/snippet}
{#snippet iconRemoverSerie()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="cancelar" onclick={aoClicarCancelar}>Cancelar</button>
    <h1>{treinoId ? "Editar rotina" : "Nova rotina"}</h1>
    <button class="atualizar" disabled={salvando} onclick={salvar} aria-label={treinoId ? "Atualizar" : "Criar"}>
      {@render iconCheck()}
    </button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erroCarregar}
    <p class="erro">Erro ao carregar: {erroCarregar}</p>
  {:else}
    <div class="nome-linha">
      <input class="nome-input" type="text" placeholder="Nome da rotina (ex: Upper A)" bind:value={nomeTreino} />
      <button class="dia-select" onclick={() => (mostrarDiaPicker = true)}>
        {diaSemana != null ? DIAS_SEMANA_ABREV[diaSemana] : "—"}
      </button>
    </div>

    {#each linhas as linha, idx (linha.exercicio_id)}
      <div class="linha-card">
        <div class="linha-header">
          <button class="nome" onclick={() => navigate(`/treino/exercicios/${linha.exercicio_id}`)}>
            {linha.nome}
          </button>
          <button class="menu-btn" onclick={() => (menuExercicioAberto = idx)} aria-label="Mais opções">⋮</button>
        </div>
        <input
          class="observacao-input"
          type="text"
          placeholder="Adicionar notas do exercício aqui"
          value={observacoesPorExercicio.get(linha.exercicio_id) ?? ""}
          onchange={(e) => salvarObservacao(linha.exercicio_id, (e.target as HTMLInputElement).value)}
        />
        <button class="descanso-select" onclick={() => (descansoEditandoIdx = idx)}>
          ⏱ Descanso: {linha.descanso_seg != null ? formatMinSeg(linha.descanso_seg) : "Desativado"}
        </button>

        <div class="series-tabela">
          <div class="series-cabecalho">
            <span>Série</span>
            <span>Kg</span>
            <span>Intervalo de repetição</span>
          </div>
          {#each linha.series as serie, setIdx (serie.serie)}
            <div class="series-linha">
              <button class="serie-num" onclick={() => toggleMenuSerie(idx, setIdx)}>{serie.serie}</button>
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.peso_alvo} />
              <div class="rep-range">
                <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.rep_min} />
                <span>a</span>
                <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.rep_max} />
              </div>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(idx)}>+ Adicionar Série</button>
      </div>
    {/each}

    {#if !linhas.length}
      <p class="muted">Nenhum exercício adicionado ainda.</p>
    {/if}

    <button class="adicionar-btn" onclick={() => (mostrarPicker = true)}>+ Adicionar Exercício</button>
  {/if}
</div>

{#if menuExercicioAberto !== null}
  {@const idxMenu = menuExercicioAberto}
  <ActionSheet
    titulo={linhas[idxMenu]?.nome}
    onFechar={() => (menuExercicioAberto = null)}
    opcoes={[
      { label: "Reordenar Exercícios", icon: iconReordenar, onSelect: () => (reordenando = true) },
      { label: "Substituir Exercício", icon: iconSubstituir, onSelect: () => (submenuSubstituirIdx = idxMenu) },
      { label: "Remover Exercício", icon: iconRemoverExercicio, destructive: true, onSelect: () => remover(idxMenu) },
    ]}
  />
{/if}

{#if submenuSubstituirIdx !== null}
  {@const idxSub = submenuSubstituirIdx}
  <ActionSheet
    titulo="Substituir Exercício"
    onFechar={() => (submenuSubstituirIdx = null)}
    opcoes={[
      { label: "Ir para Lista", icon: iconLista, onSelect: () => abrirSubstituir(idxSub) },
      { label: "Ir para Rotinas", icon: iconSubstituir, onSelect: () => abrirTrocarDeRotina(idxSub) },
    ]}
  />
{/if}

{#if menuSerieAberto !== null}
  {@const { idx: idxSerie, setIdx: setIdxSerie } = menuSerieAberto}
  <ActionSheet
    titulo={`Série ${linhas[idxSerie]?.series[setIdxSerie]?.serie ?? ""}`}
    onFechar={() => (menuSerieAberto = null)}
    opcoes={[
      { label: "Remover Série", icon: iconRemoverSerie, destructive: true, onSelect: () => removerSerie(idxSerie, setIdxSerie) },
    ]}
  />
{/if}

{#if mostrarConfirmCancelar || guardaSaida.confirmando}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar todas as alterações à rotina?"
    textoConfirmar="Descartar alterações"
    onConfirmar={() => {
      mostrarConfirmCancelar = false;
      rotinaEditorSessao.limpar();
      guardaSaida.resolverSaida(() => window.history.back());
    }}
    onCancelar={() => {
      mostrarConfirmCancelar = false;
      guardaSaida.cancelar();
    }}
  />
{/if}

{#if mostrarDiaPicker}
  <WheelPicker
    titulo="Dia da Semana"
    opcoes={opcoesDia}
    valorAtual={diaSemana}
    onSelecionar={(v) => (diaSemana = v)}
    onFechar={() => (mostrarDiaPicker = false)}
  />
{/if}

{#if descansoEditandoIdx !== null}
  {@const idxDescanso = descansoEditandoIdx}
  <DescansoPicker
    nomeExercicio={linhas[idxDescanso]?.nome ?? ""}
    valorAtual={linhas[idxDescanso]?.descanso_seg ?? null}
    onSelecionar={(seg) => (linhas[idxDescanso].descanso_seg = seg)}
    onFechar={() => (descansoEditandoIdx = null)}
  />
{/if}

{#if substituindoIdx !== null}
  <Exercicios
    modoSelecao
    tituloSelecao="Substituir por"
    substituirExercicioId={linhas[substituindoIdx]?.exercicio_id ?? null}
    bind:busca={buscaPicker}
    onSelecionar={substituirExercicio}
    onFechar={fecharSubstituir}
  />
{/if}

{#if trocandoIdx !== null}
  {@const idxTroca = trocandoIdx}
  <div class="tela-avulso">
    <div class="tela-avulso-conteudo">
      <div class="picker-header">
        <button class="back" onclick={fecharTrocarDeRotina} aria-label="Cancelar">{@render iconVoltar()}</button>
        <h1>Substituir "{linhas[idxTroca]?.nome}"</h1>
        <span class="header-spacer"></span>
      </div>
      {#if !rotinasParaTrocar.length}
        <p class="muted">Nenhuma rotina disponível pra troca — as outras estão vazias ou já têm esse exercício.</p>
      {:else}
        <ul class="troca-rotinas-lista">
          {#each rotinasParaTrocar as treinoOpcao (treinoOpcao.id)}
            <li class="troca-rotina-card">
              <p class="troca-rotina-nome">{treinoOpcao.nome_treino}</p>
              <ul class="troca-exercicios-lista">
                {#each treinoOpcao.exercicios.slice().sort((a, b) => a.ordem - b.ordem) as te (te.id)}
                  <li class="troca-exercicio-linha">
                    <span class="troca-exercicio-info">
                      <span class="troca-exercicio-nome">{te.exercicio?.nome ?? ""}</span>
                      <span class="troca-exercicio-sub">{te.series.length} {te.series.length === 1 ? "série" : "séries"}</span>
                    </span>
                    <button
                      type="button"
                      class="troca-exercicio-btn"
                      disabled={processandoTroca}
                      onclick={() => trocarExercicioDeRotina(treinoOpcao, te)}
                      aria-label={`Trocar por ${te.exercicio?.nome ?? ""}`}
                    >
                      {@render iconSubstituir()}
                    </button>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

{#if mostrarPicker}
  <Exercicios
    modoSelecao
    tituloSelecao="Adicionar Exercício"
    excluirIds={linhas.map((l) => l.exercicio_id)}
    bind:busca={buscaPicker}
    onSelecionar={adicionarRapido}
    onFechar={() => {
      mostrarPicker = false;
      buscaPicker = "";
    }}
  />
{/if}

{#if reordenando}
  <div class="tela-reordenar">
    <div class="tela-picker-conteudo">
      <div class="header">
        <button class="back" onclick={() => (reordenando = false)} aria-label="Voltar">{@render iconVoltar()}</button>
        <h1>Reordenar</h1>
        <span class="header-spacer"></span>
      </div>
      <div class="reordenar-lista">
        {#each linhas as linha, idx (linha.exercicio_id)}
          <div
            class="reordenar-item"
            class:arrastando={arrastandoIdx === idx}
            bind:this={itemRefs[idx]}
          >
            <button class="remover-circulo" onclick={() => remover(idx)} aria-label="Remover">−</button>
            <span class="reordenar-nome">{linha.nome}</span>
            <button
              class="handle-arraste"
              onpointerdown={(e) => iniciarArraste(e, idx)}
              aria-label="Arrastar para reordenar"
            >
              ☰
            </button>
          </div>
        {/each}
      </div>
      <button class="feito-btn" onclick={() => (reordenando = false)}>Feito</button>
    </div>
  </div>
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-base);
    margin: 0;
    text-align: center;
  }
  .cancelar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
  }
  .atualizar {
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
  .atualizar svg {
    width: 18px;
    height: 18px;
  }
  .atualizar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .nome-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-4);
  }
  .nome-linha {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .nome-linha .nome-input {
    flex: 1;
    margin-bottom: 0;
  }
  .dia-select {
    flex-shrink: 0;
    width: 64px;
    box-sizing: border-box;
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    text-align: center;
  }
  .linha-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-4);
  }
  .linha-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }
  .linha-header .nome {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-md);
    font-family: inherit;
    font-weight: 600;
    color: var(--color-primary);
    cursor: pointer;
  }
  .menu-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    line-height: 1;
    cursor: pointer;
  }
  .observacao-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: none;
    border: none;
    padding: 0;
    margin: 0 0 var(--space-2);
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .observacao-input::placeholder {
    color: var(--surface-muted);
  }
  .descanso-select {
    display: block;
    background: none;
    border: none;
    padding: 0;
    margin: 0 0 var(--space-3);
    color: var(--color-primary);
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .series-tabela {
    display: flex;
    flex-direction: column;
  }
  .series-cabecalho {
    display: grid;
    grid-template-columns: 32px 1fr 1.4fr;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
    padding-bottom: var(--space-1);
  }
  .series-linha {
    display: grid;
    grid-template-columns: 36px 1fr 1.4fr;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
  }
  .serie-num {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .series-linha input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2);
    border-radius: 6px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .rep-range {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .rep-range span {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .add-serie {
    width: 100%;
    height: 40px;
    margin-top: var(--space-3);
    padding: 0 var(--space-3);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .adicionar-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .tela-reordenar {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    overflow: hidden;
  }
  .tela-picker-conteudo {
    max-width: 480px;
    height: 100%;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .tela-reordenar .header {
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }
  .header-spacer {
    width: 56px;
    flex-shrink: 0;
  }
  .back {
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
  .back svg {
    width: 18px;
    height: 18px;
  }
  .tela-avulso {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    overflow-y: auto;
  }
  .tela-avulso-conteudo {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
  }
  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }
  .picker-header h1 {
    flex: 1;
    font-size: var(--font-size-base);
    margin: 0;
    text-align: center;
  }
  .troca-rotinas-lista {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
  }
  .troca-rotina-card {
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
  }
  .troca-rotina-nome {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .troca-exercicios-lista {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .troca-exercicio-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--surface-border);
  }
  .troca-exercicio-linha:first-child {
    border-top: none;
  }
  .troca-exercicio-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .troca-exercicio-nome {
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .troca-exercicio-sub {
    font-size: 12px;
    color: var(--surface-muted);
  }
  .troca-exercicio-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--color-primary);
    cursor: pointer;
  }
  .troca-exercicio-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .troca-exercicio-btn :global(svg) {
    width: 16px;
    height: 16px;
  }
  .reordenar-lista {
    overflow-y: auto;
    flex: 1;
  }
  .reordenar-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    touch-action: none;
  }
  .reordenar-item.arrastando {
    background: var(--surface-card);
    opacity: 0.8;
  }
  .remover-circulo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .reordenar-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .handle-arraste {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    cursor: grab;
    touch-action: none;
    padding: var(--space-2);
  }
  .feito-btn {
    flex-shrink: 0;
    margin-top: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
