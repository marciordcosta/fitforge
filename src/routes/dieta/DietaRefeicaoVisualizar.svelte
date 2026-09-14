<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { parseISODate } from "../../lib/dates";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getRefeicaoDia,
    getItensDaRefeicao,
    removerItemDiario,
    removerRefeicaoDia,
    getMetaRefeicaoPorNome,
    getAlimento,
    atualizarItemDiario,
    listRefeicoesModelo,
    listMetasDiaModelo,
    getReceita,
    lancarReceitaPadrao,
    salvarComoReceitaPadrao,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
    type Alimento,
    type RefeicaoModelo,
  } from "../../lib/dietaApi";
  import { receitaRascunho, definirContexto, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";

  let { refeicaoId }: { refeicaoId: string } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];

  let refeicao = $state<RefeicaoDia | null>(null);
  let itens = $state<ItemDiario[]>([]);
  let metaRefeicao = $state<MetasDiarias | null>(null);
  let modeloRefeicao = $state<RefeicaoModelo | null>(null);
  /** Só mostra o botão "Refeição Padrão" quando a lista de alimentos efetiva desse dia (override do
   * dia se houver, senão a global) realmente tem algum item — senão o botão aparece sem ter nada
   * pra lançar. */
  let receitaPadraoTemItens = $state(false);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let mostrarMenuExcluir = $state(false);
  let confirmandoExcluirAlimentos = $state(false);
  let confirmandoExclusaoRefeicao = $state(false);
  let processando = $state(false);
  let itemEditando = $state<ItemDiario | null>(null);
  let alimentoEditando = $state<Alimento | null>(null);
  let itemParaRemover = $state<ItemDiario | null>(null);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const [refeicaoRes, itensRes, modelos, metasDia] = await Promise.all([
        getRefeicaoDia(refeicaoId),
        getItensDaRefeicao(refeicaoId),
        listRefeicoesModelo(),
        listMetasDiaModelo(),
      ]);
      refeicao = refeicaoRes;
      itens = itensRes;
      modeloRefeicao = refeicao ? (modelos.find((m) => m.nome === refeicao!.nome) ?? null) : null;
      metaRefeicao = refeicao ? await getMetaRefeicaoPorNome(refeicao.nome, refeicao.data) : null;

      if (refeicao && modeloRefeicao) {
        const diaSemana = parseISODate(refeicao.data).getDay();
        const override = metasDia.find((md) => md.modeloId === modeloRefeicao!.id && md.diaSemana === diaSemana);
        const receitaIdEfetiva = override?.metaReceitaId ?? modeloRefeicao.metaReceitaId ?? null;
        const receitaPadrao = receitaIdEfetiva ? await getReceita(receitaIdEfetiva) : null;
        receitaPadraoTemItens = !!receitaPadrao?.itens.length;
      } else {
        receitaPadraoTemItens = false;
      }
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  const dataLabel = $derived.by(() => {
    if (!refeicao) return "";
    const d = parseISODate(refeicao.data);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itens.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itens.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itens.reduce((acc, i) => acc + i.carboidratoG, 0));

  const caloriasCarbo = $derived(totalCarboidrato * 4);
  const caloriasGordura = $derived(totalGordura * 9);
  const caloriasProteina = $derived(totalProteina * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`,
  );

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  /** Mesmo texto usado no Diário: quanto falta pra bater a meta ("rest."), ou "X acima" se já
   * passou — em vez de "consumido de meta". */
  function metaValorTexto(consumido: number, meta: number, unidade: string): string {
    if (consumido > meta) return `${(consumido - meta).toFixed(0)}${unidade} acima`;
    return `${Math.max(0, meta - consumido).toFixed(0)}${unidade} rest.`;
  }

  async function abrirItem(item: ItemDiario) {
    try {
      alimentoEditando = await getAlimento(item.alimentoId);
      itemEditando = item;
    } catch (err) {
      alert("Erro ao carregar alimento: " + (err as Error).message);
    }
  }

  function abrirDetalheItem(item: ItemDiario) {
    navigate(`/dieta/item/${item.id}`);
  }

  async function aoSalvarQuantidadeItem(quantidade: number) {
    if (!itemEditando || !alimentoEditando) return;
    processando = true;
    try {
      await atualizarItemDiario(itemEditando.id, alimentoEditando, quantidade, refeicaoId);
      itemEditando = null;
      alimentoEditando = null;
      await carregar();
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao atualizar item: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  /** Tempo segurando o card parado antes do toque virar "pressionar" (mover pra outra refeição) — evita disparar sem querer num toque rápido/rolagem. */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownItem(e: PointerEvent, item: ItemDiario) {
    pressionarX = e.clientX;
    pressionarY = e.clientY;
    pressionouLongo = false;
    window.addEventListener("pointermove", aoPointerMovePressionar);
    window.addEventListener("pointerup", aoPointerUpPressionar);
    timeoutPressionar = setTimeout(() => {
      pressionouLongo = true;
      cancelarPressionar();
      if (navigator.vibrate) navigator.vibrate(10);
      itemParaRemover = item;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuItem(e: MouseEvent, item: ItemDiario) {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    itemParaRemover = item;
  }

  function cancelarPressionar() {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarPressionar();
    }
  }

  function aoPointerUpPressionar() {
    cancelarPressionar();
  }

  function aoClickItem(item: ItemDiario) {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    void abrirItem(item);
  }

  async function remover() {
    if (!itemParaRemover) return;
    processando = true;
    try {
      await removerItemDiario(itemParaRemover.id);
      itemParaRemover = null;
      await carregar();
    } catch (err) {
      alert("Erro ao excluir alimento: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  let lancandoPadrao = $state(false);

  async function aoClicarRefeicaoPadrao() {
    if (!refeicao || !modeloRefeicao) return;
    lancandoPadrao = true;
    try {
      const lancou = await lancarReceitaPadrao(modeloRefeicao.id, parseISODate(refeicao.data).getDay(), refeicaoId, refeicao.data);
      if (!lancou) {
        alert("Essa refeição não tem alimentos configurados na Refeição Padrão.");
        return;
      }
      await carregar();
    } catch (err) {
      alert("Erro ao lançar refeição padrão: " + (err as Error).message);
    } finally {
      lancandoPadrao = false;
    }
  }

  let mostrarMenuSalvar = $state(false);
  let confirmandoSalvarPadrao = $state(false);
  let salvandoPadrao = $state(false);
  let preparandoNovaReceita = $state(false);

  /** Caminho inverso de "Lançar Refeição Padrão": salva os alimentos de hoje como a nova Refeição
   * Padrão desse dia da semana, substituindo a lista antiga (se houver). */
  async function salvarComoPadrao() {
    confirmandoSalvarPadrao = false;
    if (!refeicao || !modeloRefeicao) return;
    salvandoPadrao = true;
    try {
      await salvarComoReceitaPadrao(
        modeloRefeicao.id,
        modeloRefeicao.nome,
        parseISODate(refeicao.data).getDay(),
        itens.map((item) => ({ alimentoId: item.alimentoId, quantidade: item.quantidade })),
      );
      receitaPadraoTemItens = true;
    } catch (err) {
      alert("Erro ao salvar refeição padrão: " + (err as Error).message);
    } finally {
      salvandoPadrao = false;
    }
  }

  /** Diferente de "Salvar como Refeição Padrão" (sobrescreve o catálogo direto): aqui só prepara
   * o rascunho com os alimentos de hoje e abre a tela de Nova Refeição, pra revisar/renomear antes
   * de confirmar — vira uma refeição salva normal, na lista de Receitas. */
  async function prepararNovaReceita() {
    if (!refeicao) return;
    preparandoNovaReceita = true;
    try {
      const alimentos = await Promise.all(itens.map((item) => getAlimento(item.alimentoId)));
      definirContexto("nova");
      receitaRascunho.nome = refeicao.nome;
      receitaRascunho.itens = itens
        .map((item, i) => ({ alimento: alimentos[i], quantidade: item.quantidade }))
        .filter((it): it is { alimento: Alimento; quantidade: number } => it.alimento != null);
      navigate(urlNovaReceitaMeta());
    } catch (err) {
      alert("Erro ao preparar nova refeição: " + (err as Error).message);
    } finally {
      preparandoNovaReceita = false;
    }
  }

  async function descartarRefeicao() {
    processando = true;
    try {
      await removerRefeicaoDia(refeicaoId);
      navigate("/dieta");
    } catch (err) {
      alert("Erro ao descartar refeição: " + (err as Error).message);
      processando = false;
    }
  }

  /** Só os alimentos — a refeição em si continua existindo (vazia) pro dia, diferente de
   * descartarRefeicao (que apaga o "slot" inteiro). */
  async function excluirTodosAlimentos(): Promise<void> {
    processando = true;
    try {
      await Promise.all(itens.map((item) => removerItemDiario(item.id)));
      await carregar();
    } catch (err) {
      alert("Erro ao excluir alimentos: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
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

{#snippet iconBaixar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="4" x2="12" y2="15" />
    <polyline points="7 11 12 16 17 11" />
    <line x1="6" y1="20" x2="18" y2="20" />
  </svg>
{/snippet}

{#snippet iconSubir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="20" x2="12" y2="9" />
    <polyline points="7 13 12 8 17 13" />
    <line x1="6" y1="4" x2="18" y2="4" />
  </svg>
{/snippet}

{#snippet iconInfo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
{/snippet}

<div class="header-fixo">
  <div class="header-fixo-inner">
    <button class="icone-header" onclick={() => voltar("/dieta")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>
      {refeicao?.nome ?? ""}
      <span class="data-inline">{dataLabel}</span>
    </h1>
    {#if itens.length && modeloRefeicao}
      <button class="icone-header" disabled={salvandoPadrao || preparandoNovaReceita} onclick={() => (mostrarMenuSalvar = true)} aria-label="Salvar Refeição">{@render iconSubir()}</button>
    {:else if receitaPadraoTemItens}
      <button class="icone-header" disabled={lancandoPadrao} onclick={aoClicarRefeicaoPadrao} aria-label="Lançar Refeição Padrão">{@render iconBaixar()}</button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </div>
</div>

<div class="container has-bottom-nav">
  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar a refeição: {erro}</p>
  {:else if !refeicao}
    <p class="muted">Refeição não encontrada.</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    {#if itens.length}
      <div class="resumo">
        <div class="donut" style={donutStyle}>
          <div class="donut-centro">
            <strong>{totalCalorias.toFixed(0)}</strong>
            <span>Cal</span>
          </div>
        </div>
        <div class="resumo-macros">
          <p><strong class="pct" style={`color:${COR_CARBO}`}>{pctCarbo.toFixed(0)}%</strong><br /><span class="valor-g">{totalCarboidrato.toFixed(1)} g</span><br />Carb</p>
          <p><strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong><br /><span class="valor-g">{totalGordura.toFixed(1)} g</span><br />Gorduras</p>
          <p><strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong><br /><span class="valor-g">{totalProteina.toFixed(1)} g</span><br />Proteínas</p>
        </div>
      </div>
    {/if}

    {#if metaRefeicao}
      <p class="metas-titulo">Meta de {refeicao?.nome}</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metaRefeicao.calorias))}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalCalorias, metaRefeicao.calorias, "")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metaRefeicao.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalCarboidrato, metaRefeicao.carboidratoG, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metaRefeicao.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalGordura, metaRefeicao.gorduraG, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metaRefeicao.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalProteina, metaRefeicao.proteinaG, "g")}</span>
        </div>
      </div>
    {:else if itens.length}
      <p class="metas-titulo">Refeição sem meta</p>
    {/if}

    {#if !itens.length}
      <p class="muted">Nenhum alimento adicionado ainda.</p>
    {:else}
      {#each itens as item (item.id)}
        {@const pctItem = pctMeta(item.calorias, totalCalorias)}
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

    <div class="acoes-refeicao">
      <button class="acao-adicionar" onclick={() => navigate(`/dieta/alimentos/refeicao/${refeicaoId}`)}>+ Adicionar Alimento</button>
    </div>
    <button class="descartar" disabled={processando} onclick={() => (mostrarMenuExcluir = true)}>Excluir</button>
    </div>
  {/if}
</div>

{#if mostrarMenuExcluir}
  <ActionSheet
    titulo="O que deseja excluir?"
    onFechar={() => (mostrarMenuExcluir = false)}
    opcoes={[
      {
        label: "Excluir Alimentos",
        subtitulo: "A refeição continua, só os itens somem",
        icon: iconLixeira,
        destructive: true,
        onSelect: () => (confirmandoExcluirAlimentos = true),
      },
      {
        label: "Excluir Refeição",
        subtitulo: "Remove a refeição inteira desse dia",
        icon: iconLixeira,
        destructive: true,
        onSelect: () => (confirmandoExclusaoRefeicao = true),
      },
    ]}
  />
{/if}

{#if confirmandoExcluirAlimentos}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir todos os alimentos dessa refeição?"
    textoConfirmar="Excluir Alimentos"
    onConfirmar={excluirTodosAlimentos}
    onCancelar={() => (confirmandoExcluirAlimentos = false)}
  />
{/if}

{#if confirmandoExclusaoRefeicao}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir esta refeição? Todos os alimentos dela serão apagados."
    textoConfirmar="Excluir Refeição"
    onConfirmar={descartarRefeicao}
    onCancelar={() => (confirmandoExclusaoRefeicao = false)}
  />
{/if}

{#if mostrarMenuSalvar}
  <ActionSheet
    titulo="Salvar refeição"
    onFechar={() => (mostrarMenuSalvar = false)}
    opcoes={[
      {
        label: "Salvar Refeição",
        subtitulo: "Vira uma refeição salva normal, na lista de Receitas",
        onSelect: () => prepararNovaReceita(),
      },
      {
        label: "Salvar como Refeição Padrão",
        subtitulo: "Substitui a lista de alimentos padrão desse dia da semana",
        onSelect: () => (confirmandoSalvarPadrao = true),
      },
    ]}
  />
{/if}

{#if confirmandoSalvarPadrao}
  <ConfirmDialog
    titulo="Salvar os alimentos de hoje como a Refeição Padrão desse dia? A lista antiga (se houver) é substituída."
    textoConfirmar="Salvar Refeição"
    destrutivo={false}
    onConfirmar={salvarComoPadrao}
    onCancelar={() => (confirmandoSalvarPadrao = false)}
  />
{/if}

{#if itemEditando && alimentoEditando}
  <DietaQuantidadeDialog
    titulo={itemEditando.nome}
    quantidadeInicial={itemEditando.quantidade}
    porcaoPadraoUnidade={itemEditando.unidade}
    onSalvar={aoSalvarQuantidadeItem}
    onFechar={() => { itemEditando = null; alimentoEditando = null; }}
  />
{/if}

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo={`Tem certeza de que quer excluir "${itemParaRemover.nome}"?`}
    textoConfirmar="Excluir"
    onConfirmar={remover}
    onCancelar={() => (itemParaRemover = null)}
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
  .header-fixo {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
  }
  .header-fixo-inner {
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4);
  }
  .header-fixo-inner h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .icone-header {
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
  .icone-header svg {
    width: 18px;
    height: 18px;
  }
  .icone-header:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .data-inline {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    text-transform: capitalize;
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) 0 var(--space-5);
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
  }
  .resumo-macros p {
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
  .metas-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .metas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }
  .meta-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .meta-label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .meta-barra {
    height: 4px;
    border-radius: 2px;
    background: var(--surface-border);
    overflow: hidden;
  }
  .meta-barra-fill {
    height: 100%;
  }
  .meta-valor {
    font-size: 11px;
    color: var(--surface-muted);
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
    cursor: pointer;
  }
  .item-detalhe svg {
    width: 18px;
    height: 18px;
  }
  .acoes-refeicao {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
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
  .descartar {
    width: 100%;
    padding: var(--space-3);
    margin-top: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .descartar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
