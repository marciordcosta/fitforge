<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { hojeISO } from "../../lib/dates";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    listRefeicoesModelo,
    listMetasDiaModelo,
    getReceita,
    getContextoMetaCatalogo,
    salvarMetaNumericaRefeicao,
    garantirReceitaPrivadaRefeicao,
    desvincularMetaReceita,
    removerMetaReceitaDias,
    excluirReceita,
    excluirRefeicaoModelo,
    removerRefeicaoDoDia,
    receitaEhMetaDeRefeicao,
    atualizarItemReceita,
    removerItemReceita,
    adicionarItemReceita,
    atualizarRefeicaoModelo,
    salvarNomeRefeicaoDias,
    getMetasDiarias,
    getPreferenciasRefeicoesHome,
    type RefeicaoModelo,
    type MetaDiaModelo,
    type Receita,
    type ReceitaItem,
    type ContextoMetaCatalogo,
    type MetasDiarias,
    type PreferenciasRefeicoesHome,
  } from "../../lib/dietaApi";

  let { modeloId, nome, diasSemana }: { modeloId: string; nome: string; diasSemana?: number[] } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  /** Cópia local do nome (a prop vem da URL e não muda sozinha depois de renomear) — atualizada
   * ao confirmar, pra o título já refletir sem precisar sair e voltar da tela. */
  let nomeAtual = $state(untrack(() => nome));
  let nomeEditando = $state(false);
  let nomeEditavel = $state("");
  let salvandoNome = $state(false);

  function abrirRenomear(): void {
    nomeEditavel = nomeAtual;
    nomeEditando = true;
  }

  function focarAoMontar(el: HTMLInputElement): void {
    el.focus();
    el.select();
  }

  /** Disponível pra qualquer refeição, inclusive a "automática" (a última, cuja meta numérica é
   * calculada sozinha) — o nome é só um rótulo, não tem relação com esse cálculo. Quando a tela
   * está aberta pra um grupo de dias específico (Ondulatória), o nome vira um override só desse
   * grupo — outros grupos e o catálogo global não mudam, igual já funciona pra meta/receita. */
  async function confirmarRenomear(): Promise<void> {
    nomeEditando = false;
    const novoNome = nomeEditavel.trim();
    if (!novoNome || novoNome === nomeAtual) return;
    salvandoNome = true;
    try {
      if (diasSemana?.length) {
        await salvarNomeRefeicaoDias(modeloId, diasSemana, novoNome);
      } else {
        await atualizarRefeicaoModelo(modeloId, novoNome);
      }
      nomeAtual = novoNome;
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao renomear refeição: " + (err as Error).message);
    } finally {
      salvandoNome = false;
    }
  }

  let modelo = $state<RefeicaoModelo | null>(null);
  /** Catálogo inteiro e overrides de todas as refeições — só usados pra montar a lista de
   * destinos do "Mover" (outras refeições) e resolver a receita efetiva de cada uma. */
  let modelosCatalogo = $state<RefeicaoModelo[]>([]);
  let metasDiaModeloTodos = $state<MetaDiaModelo[]>([]);
  let overrideDia = $state<MetaDiaModelo | null>(null);
  let receita = $state<Receita | null>(null);
  let contexto = $state<ContextoMetaCatalogo | null>(null);
  let metasDia = $state<MetasDiarias | null>(null);
  let prefsRefeicoes = $state<PreferenciasRefeicoesHome>({ barraBase: "refeicao", valoresFormato: "restante_acima" });
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);

  interface Totais {
    calorias: number;
    proteinaG: number;
    gorduraG: number;
    carboidratoG: number;
  }

  function somarItens(itens: ReceitaItem[]): Totais {
    return itens.reduce(
      (acc, i) => ({
        calorias: acc.calorias + i.calorias,
        proteinaG: acc.proteinaG + i.proteinaG,
        gorduraG: acc.gorduraG + i.gorduraG,
        carboidratoG: acc.carboidratoG + i.carboidratoG,
      }),
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
    );
  }

  /** Soma dos alimentos da lista (quando há algum) — a meta em si passa a ser isso, igual funciona
   * em toda outra tela que soma os itens de uma receita (visualizar receita, nova receita etc.). */
  const totaisItens = $derived(receita?.itens.length ? somarItens(receita.itens) : null);

  async function carregar(): Promise<void> {
    loading = true;
    erro = null;
    try {
      const [modelos, metasDiaModelo, contextoRes, metasDiaRes, prefs] = await Promise.all([
        listRefeicoesModelo(),
        listMetasDiaModelo(),
        getContextoMetaCatalogo(modeloId, diasSemana),
        getMetasDiarias(),
        getPreferenciasRefeicoesHome(),
      ]);
      modelo = modelos.find((m) => m.id === modeloId) ?? null;
      modelosCatalogo = modelos;
      metasDiaModeloTodos = metasDiaModelo;
      overrideDia = diasSemana?.length ? (metasDiaModelo.find((m) => m.modeloId === modeloId && m.diaSemana === diasSemana![0]) ?? null) : null;
      // A prop `nome` vem da URL e pode estar desatualizada (ex: um link antigo, ou o nome global
      // quando na verdade esse grupo de dias tem um override) — corrige com o valor efetivo assim
      // que carrega, sem pisar numa edição em andamento.
      if (!nomeEditando) nomeAtual = overrideDia?.nome ?? modelo?.nome ?? nomeAtual;
      contexto = contextoRes;
      metasDia = metasDiaRes;
      prefsRefeicoes = prefs;
      const receitaId = overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null;
      receita = receitaId ? await getReceita(receitaId) : null;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  function abrirDetalheItem(item: ReceitaItem): void {
    if (!receita) return;
    navigate(`/dieta/alimento/${item.alimentoId}/${hojeISO()}/receita/${receita.id}?origem=${encodeURIComponent(caminhoProprio())}`);
  }

  const ehUltima = $derived(contexto?.ehUltima ?? false);

  const proteinaG = $derived(ehUltima ? Math.max(0, contexto!.disponivel.proteinaG) : (overrideDia?.metaProteinaG ?? modelo?.metaProteinaG ?? null));
  const gorduraG = $derived(ehUltima ? Math.max(0, contexto!.disponivel.gorduraG) : (overrideDia?.metaGorduraG ?? modelo?.metaGorduraG ?? null));
  const carboidratoG = $derived(ehUltima ? Math.max(0, contexto!.disponivel.carboidratoG) : (overrideDia?.metaCarboidratoG ?? modelo?.metaCarboidratoG ?? null));
  const receitaIdAtual = $derived(overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null);

  const caloriasCalc = $derived((carboidratoG ?? 0) * 4 + (gorduraG ?? 0) * 9 + (proteinaG ?? 0) * 4);

  /** Anel do topo: composição real dos alimentos já inseridos (mesmo cálculo e mesmo padrão visual
   * não-clicável de DietaRefeicaoVisualizar.svelte) — não é mais a meta. A meta em si (proteinaG/
   * gorduraG/carboidratoG acima) continua existindo só como referência pra "Total dos Alimentos"
   * logo abaixo. */
  const totalCaloriasAlimentos = $derived(totaisItens?.calorias ?? 0);
  const totalCarboidratoAlimentos = $derived(totaisItens?.carboidratoG ?? 0);
  const totalGorduraAlimentos = $derived(totaisItens?.gorduraG ?? 0);
  const totalProteinaAlimentos = $derived(totaisItens?.proteinaG ?? 0);

  const caloriasCarboAlimentos = $derived(totalCarboidratoAlimentos * 4);
  const caloriasGorduraAlimentos = $derived(totalGorduraAlimentos * 9);
  const caloriasProteinaAlimentos = $derived(totalProteinaAlimentos * 4);
  const caloriasMacrosAlimentos = $derived(caloriasCarboAlimentos + caloriasGorduraAlimentos + caloriasProteinaAlimentos);

  const pctCarbo = $derived(caloriasMacrosAlimentos > 0 ? (caloriasCarboAlimentos / caloriasMacrosAlimentos) * 100 : 0);
  const pctGordura = $derived(caloriasMacrosAlimentos > 0 ? (caloriasGorduraAlimentos / caloriasMacrosAlimentos) * 100 : 0);
  const pctProteina = $derived(caloriasMacrosAlimentos > 0 ? (caloriasProteinaAlimentos / caloriasMacrosAlimentos) * 100 : 0);

  /** Mesma regra do Diário (Exibição das Refeições, em Parametrização): a barra pode corresponder
   * à meta DESSA refeição (padrão, a roda tripla acima) ou à meta diária inteira. */
  function metaBarraPara(metaRefeicaoValor: number, campo: keyof MetasDiarias): number {
    if (prefsRefeicoes.barraBase === "diaria" && metasDia) return metasDia[campo];
    return metaRefeicaoValor;
  }

  /** Total dos alimentos da lista abaixo — só informativo (barras, não anel), independente da
   * meta definida na roda tripla acima; não altera nem é alterado por ela. A barra vai de 0 até a
   * meta manual (100% = meta), preenchida com o quanto os alimentos inseridos já somam dela. */
  const pctCaloriasItens = $derived(totaisItens ? pctMeta(totaisItens.calorias, metaBarraPara(caloriasCalc, "calorias")) : 0);
  const pctCarboItens = $derived(totaisItens ? pctMeta(totaisItens.carboidratoG, metaBarraPara(carboidratoG ?? 0, "carboidratoG")) : 0);
  const pctGorduraItens = $derived(totaisItens ? pctMeta(totaisItens.gorduraG, metaBarraPara(gorduraG ?? 0, "gorduraG")) : 0);
  const pctProteinaItens = $derived(totaisItens ? pctMeta(totaisItens.proteinaG, metaBarraPara(proteinaG ?? 0, "proteinaG")) : 0);

  /** Mesma regra do Diário — percentual tem variante refeição/diária; resto-ou-acima e a meta em
   * gramas são sempre contra a meta DESSA refeição (a roda tripla acima). */
  function valorItensTexto(consumido: number, metaRefeicaoValor: number, campo: keyof MetasDiarias, unidade: string): string {
    const metaDiariaValor = metasDia ? metasDia[campo] : 0;
    switch (prefsRefeicoes.valoresFormato) {
      case "percentual_refeicao": {
        const pct = metaRefeicaoValor > 0 ? (consumido / metaRefeicaoValor) * 100 : 0;
        return `${consumido.toFixed(0)}${unidade} / ${pct.toFixed(0)}%`;
      }
      case "percentual_diario": {
        const pct = metaDiariaValor > 0 ? (consumido / metaDiariaValor) * 100 : 0;
        return `${consumido.toFixed(0)}${unidade} / ${pct.toFixed(0)}%`;
      }
      case "meta_refeicao":
        return `${consumido.toFixed(0)}/${metaRefeicaoValor.toFixed(0)}${unidade}`;
      case "restante_acima":
      default:
        if (consumido > metaRefeicaoValor) return `${consumido.toFixed(0)}${unidade} (${(consumido - metaRefeicaoValor).toFixed(0)}${unidade} acima)`;
        return `${consumido.toFixed(0)}${unidade} (${Math.max(0, metaRefeicaoValor - consumido).toFixed(0)}${unidade} rest.)`;
    }
  }

  // Sem alimentos ainda, o conic-gradient sem essa checagem preenchia o anel inteiro com a cor da
  // proteína por engano (o último stop, aberto até 100%, "herda" tudo quando os stops anteriores
  // têm largura zero) — mostra uma cor neutra em vez disso.
  const donutStyle = $derived(
    caloriasMacrosAlimentos > 0
      ? `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`
      : `background: var(--surface-border);`,
  );

  let itemEditando = $state<ReceitaItem | null>(null);
  let itemParaRemover = $state<ReceitaItem | null>(null);
  /** Menu aberto ao segurar um item (Mover/Excluir) — a exclusão em si continua passando pelo
   * ConfirmDialog de itemParaRemover, só a abertura desse menu que muda. */
  let itemMenu = $state<ReceitaItem | null>(null);
  /** Quando não-nulo, o ActionSheet "Mover para" está aberto pra este item. */
  let itemParaMover = $state<ReceitaItem | null>(null);
  let movendoItem = $state(false);

  /** Nome efetivo de outra refeição do catálogo pro mesmo contexto de dias desta tela — usado só
   * pra montar a lista de destinos do "Mover" (mesma regra de override já usada pro resto da tela). */
  function nomeEfetivoModelo(m: RefeicaoModelo): string {
    const override = diasSemana?.length ? metasDiaModeloTodos.find((md) => md.modeloId === m.id && md.diaSemana === diasSemana![0]) : null;
    return override?.nome ?? m.nome;
  }

  function receitaIdEfetivaModelo(m: RefeicaoModelo): string | null {
    const override = diasSemana?.length ? metasDiaModeloTodos.find((md) => md.modeloId === m.id && md.diaSemana === diasSemana![0]) : null;
    return override?.metaReceitaId ?? m.metaReceitaId ?? null;
  }

  /** Opções de destino pro "Mover" — as outras refeições do catálogo, mesmo contexto de dias desta
   * tela (Ondulatória). */
  const opcoesMoverPara = $derived(modelosCatalogo.filter((m) => m.id !== modeloId));

  async function moverItemPara(destino: RefeicaoModelo): Promise<void> {
    if (!itemParaMover) return;
    const item = itemParaMover;
    itemParaMover = null;
    movendoItem = true;
    let adicionadoNoDestino = false;
    try {
      const destinoReceitaId = await garantirReceitaPrivadaRefeicao(destino.id, nomeEfetivoModelo(destino), receitaIdEfetivaModelo(destino), diasSemana);
      await adicionarItemReceita(destinoReceitaId, item.alimentoId, item.quantidade);
      adicionadoNoDestino = true;
      await removerItemReceita(item.id);
      await carregar();
      mostrarToast("Movido");
    } catch (err) {
      // Sem transação real: se já adicionou no destino mas falhou ao remover da origem, o alimento
      // fica duplicado nas duas — avisa explicitamente em vez de um erro genérico, pra não passar
      // despercebido contando calorias em dobro.
      if (adicionadoNoDestino) {
        alert(`O alimento foi adicionado em "${destino.nome}" mas não foi possível removê-lo daqui — confira as duas refeições pra não ficar duplicado. Erro: ${(err as Error).message}`);
        await carregar();
      } else {
        alert("Erro ao mover alimento: " + (err as Error).message);
      }
    } finally {
      movendoItem = false;
    }
  }

  async function aoSalvarQuantidadeItem(novaQuantidade: number): Promise<void> {
    if (!itemEditando) return;
    try {
      await atualizarItemReceita(itemEditando.id, novaQuantidade);
      itemEditando = null;
      await carregar();
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao salvar quantidade: " + (err as Error).message);
    }
  }

  async function removerItem(): Promise<void> {
    if (!itemParaRemover) return;
    try {
      await removerItemReceita(itemParaRemover.id);
      itemParaRemover = null;
      await carregar();
    } catch (err) {
      alert("Erro ao remover alimento: " + (err as Error).message);
    }
  }

  let preparandoAlimento = $state(false);

  /** Caminho desta própria tela — usado como "pai" explícito ao abrir "Adicionar Alimentos", já
   * que essa tela também é aberta a partir de uma receita salva de verdade (destino padrão
   * diferente) e não dá pra distinguir isso só pelo id da receita oculta do outro lado. */
  function caminhoProprio(): string {
    const diasSeg = diasSemana?.length ? `/${diasSemana.join(",")}` : "";
    return `/dieta/refeicoes/meta/${modeloId}/${encodeURIComponent(nomeAtual)}${diasSeg}`;
  }

  async function abrirAdicionarAlimento(): Promise<void> {
    preparandoAlimento = true;
    try {
      const receitaId = await garantirReceitaPrivadaRefeicao(modeloId, nomeAtual, receitaIdAtual, diasSemana);
      navigate(`/dieta/alimentos/receita/${receitaId}?origem=${encodeURIComponent(caminhoProprio())}`);
    } catch (err) {
      alert("Erro ao preparar lista de alimentos: " + (err as Error).message);
    } finally {
      preparandoAlimento = false;
    }
  }

  /** Tempo segurando o card parado antes do toque virar "pressionar" (abre a confirmação de remover). */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownItem(e: PointerEvent, item: ReceitaItem): void {
    pressionarX = e.clientX;
    pressionarY = e.clientY;
    pressionouLongo = false;
    window.addEventListener("pointermove", aoPointerMovePressionar);
    window.addEventListener("pointerup", aoPointerUpPressionar);
    timeoutPressionar = setTimeout(() => {
      pressionouLongo = true;
      cancelarPressionar();
      if (navigator.vibrate) navigator.vibrate(10);
      itemMenu = item;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuItem(e: MouseEvent, item: ReceitaItem): void {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    itemMenu = item;
  }

  function abrirMoverItem(item: ReceitaItem): void {
    itemMenu = null;
    if (!opcoesMoverPara.length) {
      alert("Não há outra refeição no catálogo pra mover.");
      return;
    }
    itemParaMover = item;
  }

  function cancelarPressionar(): void {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent): void {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) cancelarPressionar();
  }

  function aoPointerUpPressionar(): void {
    cancelarPressionar();
  }

  function aoClickItem(item: ReceitaItem): void {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    itemEditando = item;
  }

  /** Menu com as duas opções de exclusão (refeição inteira ou só a meta) — cada uma abre seu
   * próprio ConfirmDialog de confirmação, já existentes. */
  let mostrarMenuExcluir = $state(false);
  let confirmandoRemoverMeta = $state(false);
  let removendoMeta = $state(false);
  let confirmandoExcluirRefeicao = $state(false);
  let excluindoRefeicao = $state(false);

  /** Diferente de "Remover Meta" (limpa a lista de alimentos/macros, o card continua existindo):
   * isso apaga o card inteiro. Num grupo de dias (Ondulatória), só desse(s) dia(s) — a refeição
   * continua existindo nos outros dias que ainda a incluem; sem grupo (Fixa), apaga o catálogo
   * inteiro de vez (dieta_refeicoes_modelo), cascata cuida dos overrides dela. */
  async function excluirRefeicaoCompleta(): Promise<void> {
    excluindoRefeicao = true;
    try {
      if (diasSemana?.length) {
        await Promise.all(diasSemana.map((dia) => removerRefeicaoDoDia(dia, modeloId)));
      } else {
        await excluirRefeicaoModelo(modeloId);
      }
      voltar("/dieta/refeicoes/gerenciar?aba=refeicoes");
    } catch (err) {
      alert("Erro ao excluir refeição: " + (err as Error).message);
      excluindoRefeicao = false;
    }
  }

  async function removerMetaCompleta(): Promise<void> {
    removendoMeta = true;
    try {
      if (diasSemana?.length) {
        await removerMetaReceitaDias(modeloId, diasSemana);
      } else {
        await salvarMetaNumericaRefeicao(modeloId, null, null, null);
        await desvincularMetaReceita(modeloId);
      }
      // A mesma lista de alimentos oculta pode ser compartilhada por outro grupo de dias (ou pelo
      // modelo global) — só apaga de vez se, depois de desvincular ESTE contexto, mais ninguém
      // mais aponta pra ela. Excluir sem checar isso apagava a meta de outros dias juntos (o
      // "meta_receita_id" deles tem ON DELETE CASCADE pra essa tabela).
      if (receita?.oculta && !(await receitaEhMetaDeRefeicao(receita.id))) {
        await excluirReceita(receita.id);
      }
      voltar("/dieta/refeicoes/gerenciar?aba=refeicoes");
    } catch (err) {
      alert("Erro ao remover meta: " + (err as Error).message);
      removendoMeta = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconInfo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
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
{#snippet iconMover()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M9 13h6M12 10l3 3-3 3" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/dieta/refeicoes/gerenciar?aba=refeicoes")} aria-label="Voltar">{@render iconVoltar()}</button>
    {#if nomeEditando}
      <input
        class="nome-titulo-input"
        type="text"
        bind:value={nomeEditavel}
        onblur={confirmarRenomear}
        onkeydown={(e) => e.key === "Enter" && confirmarRenomear()}
        use:focarAoMontar
      />
    {:else}
      <button type="button" class="nome-titulo-btn" onclick={abrirRenomear} disabled={salvandoNome}>{nomeAtual}</button>
    {/if}
    <span class="header-spacer"></span>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
      <div class="card-meta">
        <p class="card-meta-titulo">Total da Refeição</p>
        <div class="resumo">
          <div class="donut" style={donutStyle}>
            <div class="donut-centro">
              <strong>{totalCaloriasAlimentos.toFixed(0)}</strong>
              <span>Cal</span>
            </div>
          </div>
          <div class="resumo-macros">
            <p><strong class="pct" style={`color:${COR_CARBO}`}>{pctCarbo.toFixed(0)}%</strong><br /><span class="valor-g">{totalCarboidratoAlimentos.toFixed(0)} g</span><br />Carb</p>
            <p><strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong><br /><span class="valor-g">{totalGorduraAlimentos.toFixed(0)} g</span><br />Gorduras</p>
            <p><strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong><br /><span class="valor-g">{totalProteinaAlimentos.toFixed(0)} g</span><br />Proteínas</p>
          </div>
        </div>
      </div>

      {#if totaisItens}
        <p class="pct-titulo">Total dos Alimentos</p>
        <div class="pct-grid">
          <div class="pct-col">
            <p class="pct-nome">Calorias</p>
            <div class="pct-barra-wrap">
              <div class="pct-barra" style={`width:${larguraBarra(pctCaloriasItens)}%; background:var(--color-secondary);`}></div>
            </div>
            <p class="pct-valor">{valorItensTexto(totaisItens.calorias, caloriasCalc, "calorias", "")}</p>
          </div>
          <div class="pct-col">
            <p class="pct-nome">Carb</p>
            <div class="pct-barra-wrap">
              <div class="pct-barra" style={`width:${larguraBarra(pctCarboItens)}%; background:${COR_CARBO};`}></div>
            </div>
            <p class="pct-valor">{valorItensTexto(totaisItens.carboidratoG, carboidratoG ?? 0, "carboidratoG", "g")}</p>
          </div>
          <div class="pct-col">
            <p class="pct-nome">Gorduras</p>
            <div class="pct-barra-wrap">
              <div class="pct-barra" style={`width:${larguraBarra(pctGorduraItens)}%; background:${COR_GORDURA};`}></div>
            </div>
            <p class="pct-valor">{valorItensTexto(totaisItens.gorduraG, gorduraG ?? 0, "gorduraG", "g")}</p>
          </div>
          <div class="pct-col">
            <p class="pct-nome">Proteínas</p>
            <div class="pct-barra-wrap">
              <div class="pct-barra" style={`width:${larguraBarra(pctProteinaItens)}%; background:${COR_PROTEINA};`}></div>
            </div>
            <p class="pct-valor">{valorItensTexto(totaisItens.proteinaG, proteinaG ?? 0, "proteinaG", "g")}</p>
          </div>
        </div>
      {/if}

      <p class="itens-titulo">Itens</p>
      {#if !receita?.itens.length}
        <p class="muted">Nenhum alimento adicionado ainda.</p>
      {:else}
        {#each receita.itens as item (item.id)}
          {@const pctItem = pctMeta(item.calorias, totaisItens?.calorias ?? 0)}
          <button
            class="item-card"
            onpointerdown={(e) => aoPointerDownItem(e, item)}
            onclick={() => aoClickItem(item)}
            oncontextmenu={(e) => aoContextMenuItem(e, item)}
          >
            <div class="item-info">
              <p class="item-nome">{item.nome}</p>
              <p class="item-qtd">
                <strong class="item-qtd-valor">{item.quantidade}{item.unidade}</strong>
                <span class="item-qtd-detalhe">· {item.calorias.toFixed(0)} kcal · {pctItem.toFixed(0)}% da refeição</span>
              </p>
              <div class="item-barra-wrap">
                <div class="item-barra" style={`width:${larguraBarra(pctItem)}%;`}></div>
              </div>
            </div>
            <span
              class="item-detalhe"
              role="button"
              tabindex="0"
              onclick={(e) => { e.stopPropagation(); abrirDetalheItem(item); }}
              onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); abrirDetalheItem(item); } }}
              aria-label="Detalhes do alimento"
            >
              {@render iconInfo()}
            </span>
          </button>
        {/each}
      {/if}

      <button class="acao-adicionar" onclick={abrirAdicionarAlimento} disabled={preparandoAlimento}>+ Adicionar Alimento</button>

      {#if !ehUltima}
        <div class="acao-excluir">
          <Button variant="danger" onclick={() => (mostrarMenuExcluir = true)} disabled={removendoMeta || excluindoRefeicao}>Excluir</Button>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if mostrarMenuExcluir}
  <ActionSheet
    titulo="Excluir"
    onFechar={() => (mostrarMenuExcluir = false)}
    opcoes={[
      { label: "Excluir Refeição", icon: iconLixeira, destructive: true, onSelect: () => (confirmandoExcluirRefeicao = true) },
      { label: "Excluir Meta", icon: iconLixeira, destructive: true, onSelect: () => (confirmandoRemoverMeta = true) },
    ]}
  />
{/if}

{#if itemEditando}
  <DietaQuantidadeDialog
    titulo={itemEditando.nome}
    quantidadeInicial={itemEditando.quantidade}
    porcaoPadraoUnidade={itemEditando.unidade}
    onSalvar={aoSalvarQuantidadeItem}
    onFechar={() => (itemEditando = null)}
  />
{/if}

{#if itemMenu}
  <ActionSheet
    titulo={itemMenu.nome}
    onFechar={() => (itemMenu = null)}
    opcoes={[
      { label: "Mover", icon: iconMover, onSelect: () => abrirMoverItem(itemMenu!) },
      { label: "Excluir", icon: iconLixeira, destructive: true, onSelect: () => { itemParaRemover = itemMenu; itemMenu = null; } },
    ]}
  />
{/if}

{#if itemParaMover}
  <ActionSheet
    titulo="Mover para"
    onFechar={() => (itemParaMover = null)}
    opcoes={opcoesMoverPara.map((m) => ({ label: nomeEfetivoModelo(m), onSelect: () => moverItemPara(m) }))}
  />
{/if}

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo="Tem certeza de que quer remover este alimento?"
    textoConfirmar="Remover"
    onConfirmar={removerItem}
    onCancelar={() => (itemParaRemover = null)}
  />
{/if}

{#if confirmandoRemoverMeta}
  <ConfirmDialog
    titulo="Excluir a meta e os alimentos dessa refeição?"
    textoConfirmar="Excluir Meta"
    onConfirmar={removerMetaCompleta}
    onCancelar={() => (confirmandoRemoverMeta = false)}
  />
{/if}

{#if confirmandoExcluirRefeicao}
  <ConfirmDialog
    titulo={diasSemana?.length
      ? `Excluir "${nomeAtual}" desse(s) dia(s)? Ela continua existindo nos outros dias, se houver.`
      : `Excluir "${nomeAtual}" do catálogo? Essa ação não pode ser desfeita.`}
    textoConfirmar="Excluir Refeição"
    onConfirmar={excluirRefeicaoCompleta}
    onCancelar={() => (confirmandoExcluirRefeicao = false)}
  />
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
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .nome-titulo-btn,
  .nome-titulo-input {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: inherit;
  }
  .nome-titulo-btn {
    border: none;
    background: none;
    color: var(--surface-fg);
    cursor: pointer;
    padding: var(--space-1) 0;
  }
  .nome-titulo-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .nome-titulo-input {
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    color-scheme: dark;
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
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .card-meta {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .card-meta-titulo {
    margin: 0;
    font-weight: 600;
    color: var(--surface-fg);
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .resumo {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) 0 0;
  }
  .donut {
    position: relative;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-centro {
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: 18px;
    color: var(--surface-fg);
  }
  .donut-centro span {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--surface-fg);
  }
  .resumo-macros > p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-sm);
    text-align: center;
    line-height: 1.5;
  }
  .resumo-macros .pct {
    font-size: var(--font-size-base);
  }
  .resumo-macros .valor-g {
    font-size: 17px;
  }
  .pct-titulo {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .pct-grid {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .pct-col {
    flex: 1;
    min-width: 0;
  }
  .pct-nome {
    margin: 0 0 var(--space-1);
    font-size: 12px;
    color: var(--surface-fg);
  }
  .pct-barra-wrap {
    height: 6px;
    background: var(--surface-border);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--space-1);
  }
  .pct-barra {
    height: 100%;
    border-radius: 4px;
  }
  .pct-valor {
    margin: 0;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .item-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-2);
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    /* Segurar pra excluir não pode abrir o menu de copiar/selecionar do Android. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .item-info {
    flex: 1;
    min-width: 0;
  }
  .item-nome {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-qtd {
    margin: 2px 0 0;
  }
  .item-qtd-valor {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .item-qtd-detalhe {
    font-size: 12px;
    color: var(--surface-muted);
  }
  .item-barra-wrap {
    width: 85%;
    height: 4px;
    margin-top: var(--space-2);
    background: var(--surface-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .item-barra {
    height: 100%;
    border-radius: 3px;
    background: var(--color-primary);
  }
  .item-detalhe {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
  }
  .item-detalhe svg {
    width: 18px;
    height: 18px;
  }
  .acao-adicionar {
    width: 100%;
    padding: var(--space-3);
    margin-top: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .acao-adicionar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .acao-excluir {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .conteudo {
    transition: opacity 0.15s;
  }
  .conteudo.carregando {
    opacity: 0.5;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
