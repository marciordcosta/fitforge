<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { parseISODate } from "../../lib/dates";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getRefeicaoDia,
    getItensDaRefeicao,
    removerItemDiario,
    removerRefeicaoDia,
    getMetasDiarias,
    getMetaRefeicaoPorNome,
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
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let itemParaRemover = $state<ItemDiario | null>(null);
  let confirmandoExclusaoRefeicao = $state(false);
  let processando = $state(false);
  let itemEditando = $state<ItemDiario | null>(null);
  let alimentoEditando = $state<Alimento | null>(null);
  let itemParaMover = $state<ItemDiario | null>(null);
  let refeicoesParaMover = $state<RefeicaoDia[]>([]);
  let mostrarMoverItem = $state(false);
  let menuItemAberto = $state<ItemDiario | null>(null);
  let modoDiarioMeta = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [refeicao, itens, metas] = await Promise.all([getRefeicaoDia(refeicaoId), getItensDaRefeicao(refeicaoId), getMetasDiarias()]);
      metaRefeicao = refeicao ? await getMetaRefeicaoPorNome(refeicao.nome) : null;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  const usaMetaRefeicao = $derived(metaRefeicao != null && !modoDiarioMeta);
  const metasEfetivas = $derived(usaMetaRefeicao ? metaRefeicao : metas);

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
    if (usaMetaRefeicao) return `${consumido.toFixed(0)} de ${meta.toFixed(0)}${unidade}`;
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
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
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
{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}

<div class="header-fixo">
  <div class="header-fixo-inner">
    <button class="back" onclick={() => voltar("/dieta")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>
      {refeicao?.nome ?? ""}
      <span class="data-inline">{dataLabel}</span>
    </h1>
    <span class="header-spacer"></span>
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

      {#if metasEfetivas}
        <div class="metas-titulo-linha">
          <p class="metas-titulo">{usaMetaRefeicao ? `Meta de ${refeicao?.nome}` : "Percentual das suas metas diárias"}</p>
          {#if metaRefeicao}
            <button class="toggle-btn-meta" onclick={() => (modoDiarioMeta = !modoDiarioMeta)} aria-label="Alternar exibição">
              {@render iconToggle()}
            </button>
          {/if}
        </div>
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
    <button class="descartar" disabled={processando} onclick={() => (confirmandoExclusaoRefeicao = true)}>Descartar refeição</button>
    </div>
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

{#if confirmandoExclusaoRefeicao}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar esta refeição? Todos os alimentos dela serão apagados."
    textoConfirmar="Descartar Refeição"
    onConfirmar={descartarRefeicao}
    onCancelar={() => (confirmandoExclusaoRefeicao = false)}
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
    width: 68px;
    height: 68px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-centro {
    position: absolute;
    inset: 6px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: 15px;
  }
  .donut-centro span {
    font-size: 10px;
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
  .metas-titulo-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3);
  }
  .metas-titulo {
    font-weight: 600;
    margin: 0;
  }
  .toggle-btn-meta {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn-meta svg {
    width: 14px;
    height: 14px;
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
