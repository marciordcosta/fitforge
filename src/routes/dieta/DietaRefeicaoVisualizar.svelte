<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { parseISODate } from "../../lib/dates";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaCopiarParaSheet from "./DietaCopiarParaSheet.svelte";
  import DietaCopiarDeSheet from "./DietaCopiarDeSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getRefeicaoDia,
    getItensDaRefeicao,
    removerItemDiario,
    removerRefeicaoDia,
    getMetasDiarias,
    getMetaRefeicaoPorNome,
    getMetaReceitaIdPorNome,
    refeicaoTemHistorico,
    adicionarReceitaAoDiario,
    removerItensDaRefeicao,
    getAlimento,
    atualizarItemDiario,
    getRefeicoesDoDia,
    moverItemDiario,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
    type Alimento,
  } from "../../lib/dietaApi";

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
  let metas = $state<MetasDiarias | null>(null);
  let metaRefeicao = $state<MetasDiarias | null>(null);
  let temHistorico = $state(false);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let itemParaRemover = $state<ItemDiario | null>(null);
  let confirmandoExclusaoRefeicao = $state(false);
  let processando = $state(false);
  let mostrarCopiarPara = $state(false);
  let mostrarCopiarDe = $state(false);
  let mostrarOpcoesRefPadrao = $state(false);
  let itemEditando = $state<ItemDiario | null>(null);
  let alimentoEditando = $state<Alimento | null>(null);
  let itemParaMover = $state<ItemDiario | null>(null);
  let refeicoesParaMover = $state<RefeicaoDia[]>([]);
  let mostrarMoverItem = $state(false);
  let menuItemAberto = $state<ItemDiario | null>(null);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [refeicao, itens, metas] = await Promise.all([getRefeicaoDia(refeicaoId), getItensDaRefeicao(refeicaoId), getMetasDiarias()]);
      [metaRefeicao, temHistorico] = await Promise.all([
        refeicao ? getMetaRefeicaoPorNome(refeicao.nome) : Promise.resolve(null),
        refeicao ? refeicaoTemHistorico(refeicao.nome, refeicaoId) : Promise.resolve(false),
      ]);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  const metasEfetivas = $derived(metaRefeicao ?? metas);

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

  function metaValorTexto(consumido: number, meta: number, unidade: string): string {
    if (metaRefeicao) return `${consumido.toFixed(0)} de ${meta.toFixed(0)}${unidade}`;
    return `${pctMeta(consumido, meta).toFixed(0)}% · ${meta.toFixed(0)}${unidade}`;
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
      menuItemAberto = item;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuItem(e: MouseEvent, item: ItemDiario) {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    menuItemAberto = item;
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

  async function abrirMoverItem(item: ItemDiario) {
    if (!refeicao) return;
    try {
      const todas = await getRefeicoesDoDia(refeicao.data);
      refeicoesParaMover = todas.filter((r) => r.id !== refeicaoId);
      if (!refeicoesParaMover.length) {
        alert("Não há outra refeição nesse dia pra mover o alimento.");
        return;
      }
      itemParaMover = item;
      mostrarMoverItem = true;
    } catch (err) {
      alert("Erro ao carregar refeições: " + (err as Error).message);
    }
  }

  async function moverItemPara(destino: RefeicaoDia) {
    if (!itemParaMover) return;
    mostrarMoverItem = false;
    processando = true;
    try {
      await moverItemDiario(itemParaMover.id, destino.id);
      itemParaMover = null;
      await carregar();
    } catch (err) {
      alert("Erro ao mover alimento: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  async function remover() {
    if (!itemParaRemover) return;
    processando = true;
    try {
      await removerItemDiario(itemParaRemover.id);
      itemParaRemover = null;
      await carregar();
    } finally {
      processando = false;
    }
  }

  function iniciarRefPadrao() {
    if (itens.length > 0) {
      mostrarOpcoesRefPadrao = true;
      return;
    }
    void aplicarRefPadrao(false);
  }

  async function aplicarRefPadrao(substituir: boolean) {
    if (!refeicao) return;
    processando = true;
    try {
      const metaReceitaId = await getMetaReceitaIdPorNome(refeicao.nome);
      if (!metaReceitaId) {
        alert(`"${refeicao.nome}" não tem uma referência padrão configurada em Gerenciar > Refeições.`);
        return;
      }
      if (substituir) await removerItensDaRefeicao(refeicaoId);
      await adicionarReceitaAoDiario(metaReceitaId, refeicao.data, refeicaoId);
      await carregar();
    } catch (err) {
      alert("Erro ao puxar a referência padrão: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  function aoCopiarPara(destinoId: string) {
    mostrarCopiarPara = false;
    navigate(`/dieta/refeicao/${destinoId}`);
  }

  async function aoCopiarDe() {
    mostrarCopiarDe = false;
    await carregar();
  }

  async function removerRefeicao() {
    processando = true;
    try {
      await removerRefeicaoDia(refeicaoId);
      navigate("/dieta");
    } catch (err) {
      alert("Erro ao remover refeição: " + (err as Error).message);
      processando = false;
    }
  }
</script>

{#snippet iconPratoPadrao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
  </svg>
{/snippet}
{#snippet iconCopiarDe()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="12" height="12" rx="2" />
    <path d="M21 9v10a2 2 0 0 1-2 2H9" />
    <path d="M17 13l4-4-4-4" />
  </svg>
{/snippet}
{#snippet iconCopiarPara()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M3 15V5a2 2 0 0 1 2-2h10" />
    <path d="M7 11L3 15l4 4" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}
{#snippet iconInfo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
{/snippet}
{#snippet iconMover()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 9l-3 3 3 3" />
    <path d="M9 5l3-3 3 3" />
    <path d="M15 19l-3 3-3-3" />
    <path d="M19 9l3 3-3 3" />
    <path d="M2 12h20" />
    <path d="M12 2v20" />
  </svg>
{/snippet}
{#snippet iconAdicionarPrato()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
{/snippet}
{#snippet iconSubstituirPrato()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3L4 7l4 4" />
    <path d="M4 7h16" />
    <path d="M16 21l4-4-4-4" />
    <path d="M20 17H4" />
  </svg>
{/snippet}

<div class="header-fixo">
  <div class="header-fixo-inner">
    <button class="back" onclick={() => voltar("/dieta")} aria-label="Voltar">←</button>
    <h1>
      {refeicao?.nome ?? ""}
      <span class="data-inline">{dataLabel}</span>
    </h1>
    <span class="header-spacer"></span>
  </div>
</div>

<div class="container has-bottom-nav">
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar a refeição: {erro}</p>
  {:else if !refeicao}
    <p class="muted">Refeição não encontrada.</p>
  {:else}
    <div class="acoes">
      <button class="acao-btn" disabled={processando || !metaRefeicao} onclick={iniciarRefPadrao}>
        <span class="acao-label">Ref padrão</span>
        {@render iconPratoPadrao()}
      </button>
      <button class="acao-btn" disabled={processando || !temHistorico} onclick={() => (mostrarCopiarDe = true)}>
        <span class="acao-label">Copiar de</span>
        {@render iconCopiarDe()}
      </button>
      <button class="acao-btn" disabled={processando || !temHistorico} onclick={() => (mostrarCopiarPara = true)}>
        <span class="acao-label">Copiar para</span>
        {@render iconCopiarPara()}
      </button>
      <button class="acao-btn acao-destrutiva" disabled={processando} onclick={() => (confirmandoExclusaoRefeicao = true)}>
        <span class="acao-label">Remover</span>
        {@render iconExcluir()}
      </button>
    </div>

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

      {#if metasEfetivas}
        <p class="metas-titulo">{metaRefeicao ? `Meta de ${refeicao?.nome}` : "Percentual das suas metas diárias"}</p>
        <div class="metas-grid">
          <div class="meta-col">
            <span class="meta-label">Calorias</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metasEfetivas.calorias))}%; background:var(--color-secondary);`}></div></div>
            <span class="meta-valor">{metaValorTexto(totalCalorias, metasEfetivas.calorias, "")}</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Carb</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metasEfetivas.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
            <span class="meta-valor">{metaValorTexto(totalCarboidrato, metasEfetivas.carboidratoG, "g")}</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Gorduras</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metasEfetivas.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
            <span class="meta-valor">{metaValorTexto(totalGordura, metasEfetivas.gorduraG, "g")}</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Proteínas</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metasEfetivas.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
            <span class="meta-valor">{metaValorTexto(totalProteina, metasEfetivas.proteinaG, "g")}</span>
          </div>
        </div>
      {/if}
    {/if}

    {#if !itens.length}
      <p class="muted">Nenhum alimento adicionado ainda.</p>
    {:else}
      {#each itens as item (item.id)}
        <button
          class="item-card"
          onpointerdown={(e) => aoPointerDownItem(e, item)}
          onclick={() => aoClickItem(item)}
          oncontextmenu={(e) => aoContextMenuItem(e, item)}
        >
          <div class="item-info">
            <p class="item-nome">{item.nome}</p>
            <p class="item-qtd">{item.quantidade}{item.unidade} · {item.calorias.toFixed(0)} kcal</p>
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

    <button class="acao-adicionar" onclick={() => navigate(`/dieta/alimentos/refeicao/${refeicaoId}`)}>+ Adicionar Alimento</button>
  {/if}
</div>

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo="Tem certeza de que quer remover este alimento?"
    textoConfirmar="Remover"
    onConfirmar={remover}
    onCancelar={() => (itemParaRemover = null)}
  />
{/if}

{#if mostrarOpcoesRefPadrao}
  <ActionSheet
    titulo="Ref padrão"
    onFechar={() => (mostrarOpcoesRefPadrao = false)}
    opcoes={[
      { label: "Adicionar à refeição", icon: iconAdicionarPrato, onSelect: () => aplicarRefPadrao(false) },
      { label: "Substituir refeição", icon: iconSubstituirPrato, onSelect: () => aplicarRefPadrao(true) },
      { label: "Cancelar", icon: iconExcluir, onSelect: () => {} },
    ]}
  />
{/if}

{#if confirmandoExclusaoRefeicao}
  <ConfirmDialog
    titulo="Tem certeza de que quer remover esta refeição? Todos os alimentos dela serão apagados."
    textoConfirmar="Remover Refeição"
    onConfirmar={removerRefeicao}
    onCancelar={() => (confirmandoExclusaoRefeicao = false)}
  />
{/if}

{#if mostrarCopiarPara && refeicao}
  <DietaCopiarParaSheet
    refeicaoOrigemId={refeicaoId}
    nomeAtual={refeicao.nome}
    onFechar={() => (mostrarCopiarPara = false)}
    onCopiado={aoCopiarPara}
  />
{/if}

{#if mostrarCopiarDe && refeicao}
  <DietaCopiarDeSheet
    refeicaoDestinoId={refeicaoId}
    onFechar={() => (mostrarCopiarDe = false)}
    onCopiado={aoCopiarDe}
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

{#if menuItemAberto !== null}
  {@const itemMenu = menuItemAberto}
  <ActionSheet
    titulo={itemMenu.nome}
    onFechar={() => (menuItemAberto = null)}
    opcoes={[
      { label: "Mover", icon: iconMover, onSelect: () => void abrirMoverItem(itemMenu) },
      { label: "Excluir", icon: iconExcluir, destructive: true, onSelect: () => (itemParaRemover = itemMenu) },
    ]}
  />
{/if}

{#if mostrarMoverItem && itemParaMover}
  <ActionSheet
    titulo={`Mover "${itemParaMover.nome}" para`}
    onFechar={() => { mostrarMoverItem = false; itemParaMover = null; }}
    opcoes={refeicoesParaMover.map((r) => ({ label: r.nome, onSelect: () => moverItemPara(r) }))}
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
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .data-inline {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    text-transform: capitalize;
  }
  .acoes {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .acao-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .acao-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .acao-label {
    font-size: 12px;
    font-weight: 400;
    text-align: center;
    white-space: nowrap;
  }
  .acao-btn svg {
    width: 20px;
    height: 20px;
  }
  .acao-destrutiva {
    color: var(--color-danger);
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) 0 var(--space-5);
  }
  .donut {
    position: relative;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-centro {
    position: absolute;
    inset: 12px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: var(--font-size-lg);
  }
  .donut-centro span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .resumo-macros p {
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
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
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
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
