<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar } from "../../lib/router.svelte";
  import { criarReceita, vincularMetaReceita, vincularMetaReceitaDias, getMetasDiarias, type MetasDiarias } from "../../lib/dietaApi";
  import { receitaRascunho, removerDoRascunho, limparRascunho, type ItemRascunho } from "../../lib/receitaRascunho.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";

  let { metaParaModeloId, metaParaDiasSemana }: { metaParaModeloId?: string; metaParaDiasSemana?: number[] } = $props();

  untrack(() => {
    receitaRascunho.metaParaModeloId = metaParaModeloId ?? null;
    receitaRascunho.metaParaDiasSemana = metaParaDiasSemana ?? null;
  });

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let salvando = $state(false);
  let itemEditandoIndex = $state<number | null>(null);
  let metas = $state<MetasDiarias | null>(null);

  void getMetasDiarias().then((m) => (metas = m));

  function fatorItem(item: ItemRascunho): number {
    return item.quantidade / item.alimento.porcaoPadraoQtd;
  }
  function caloriasItem(item: ItemRascunho): number {
    return item.alimento.caloriasPorPorcao * fatorItem(item);
  }
  function proteinaItem(item: ItemRascunho): number {
    return item.alimento.proteinaG * fatorItem(item);
  }
  function gorduraItem(item: ItemRascunho): number {
    return item.alimento.gorduraG * fatorItem(item);
  }
  function carboidratoItem(item: ItemRascunho): number {
    return item.alimento.carboidratoG * fatorItem(item);
  }

  function aoSalvarQuantidade(qtd: number) {
    if (itemEditandoIndex == null) return;
    receitaRascunho.itens[itemEditandoIndex].quantidade = qtd;
    itemEditandoIndex = null;
  }

  const totalCalorias = $derived(receitaRascunho.itens.reduce((acc, i) => acc + caloriasItem(i), 0));
  const totalProteina = $derived(receitaRascunho.itens.reduce((acc, i) => acc + proteinaItem(i), 0));
  const totalGordura = $derived(receitaRascunho.itens.reduce((acc, i) => acc + gorduraItem(i), 0));
  const totalCarboidrato = $derived(receitaRascunho.itens.reduce((acc, i) => acc + carboidratoItem(i), 0));

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

  const valido = $derived(receitaRascunho.nome.trim().length > 0 && receitaRascunho.itens.length > 0);

  async function salvar() {
    if (!valido) return;
    salvando = true;
    try {
      const novoId = await criarReceita(
        receitaRascunho.nome.trim(),
        receitaRascunho.itens.map((i) => ({ alimentoId: i.alimento.id, quantidade: i.quantidade })),
      );
      if (metaParaModeloId) {
        if (metaParaDiasSemana?.length) {
          await vincularMetaReceitaDias(metaParaModeloId, metaParaDiasSemana, novoId);
        } else {
          await vincularMetaReceita(metaParaModeloId, novoId);
        }
      }
      limparRascunho();
      navigate(metaParaModeloId ? "/dieta/refeicoes/gerenciar" : "/dieta/receitas");
    } catch (err) {
      alert("Erro ao criar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet iconAlimento()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v7a2 2 0 0 0 2 2v9" />
    <path d="M7 3v4M11 3v4" />
    <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
  </svg>
{/snippet}
{#snippet iconScanner()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 7V5a1 1 0 0 1 1-1h2" />
    <path d="M17 4h2a1 1 0 0 1 1 1v2" />
    <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
    <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
    <path d="M7 8v8" />
    <path d="M10 8v8" />
    <path d="M13.5 8v8" />
    <path d="M17 8v8" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar(metaParaModeloId ? "/dieta/refeicoes/gerenciar" : "/dieta/receitas")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Nova Refeição</h1>
    <button class="salvar" onclick={salvar} disabled={salvando || !valido} aria-label="Salvar">
      {@render iconCheck()}
    </button>
  </div>

  <input class="nome-input" type="text" placeholder="Nome da refeição" bind:value={receitaRascunho.nome} />

  <div class="acoes-adicionar">
    <button class="acao-btn" onclick={() => navigate("/dieta/alimentos/receita")}>
      {@render iconAlimento()}
      <span>Adicionar Alimento</span>
    </button>
    <button class="acao-btn" onclick={() => navigate("/dieta/scanear/receita")}>
      {@render iconScanner()}
      <span>Escanear</span>
    </button>
  </div>

  {#if receitaRascunho.itens.length}
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

    {#if metas}
      <p class="metas-titulo">Percentual das suas metas diárias</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metas.calorias))}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{pctMeta(totalCalorias, metas.calorias).toFixed(0)}% · {metas.calorias.toFixed(0)}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metas.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{pctMeta(totalCarboidrato, metas.carboidratoG).toFixed(0)}% · {metas.carboidratoG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metas.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{pctMeta(totalGordura, metas.gorduraG).toFixed(0)}% · {metas.gorduraG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metas.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{pctMeta(totalProteina, metas.proteinaG).toFixed(0)}% · {metas.proteinaG.toFixed(0)}g</span>
        </div>
      </div>
    {/if}
  {/if}

  <p class="itens-titulo">Itens</p>
  {#if !receitaRascunho.itens.length}
    <p class="muted">Nenhum alimento adicionado ainda.</p>
  {:else}
    {#each receitaRascunho.itens as item, i (item.alimento.id + i)}
      <button class="item-card" onclick={() => (itemEditandoIndex = i)}>
        <div class="item-info">
          <p class="item-nome">{item.alimento.nome}</p>
          <p class="item-qtd">{item.quantidade}{item.alimento.porcaoPadraoUnidade} · {caloriasItem(item).toFixed(0)} kcal</p>
        </div>
        <span
          class="item-remover"
          role="button"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); removerDoRascunho(i); }}
          onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removerDoRascunho(i); } }}
          aria-label="Remover item"
        >
          {@render iconExcluir()}
        </span>
      </button>
    {/each}
  {/if}
</div>

{#if itemEditandoIndex != null}
  <DietaQuantidadeDialog
    titulo={receitaRascunho.itens[itemEditandoIndex].alimento.nome}
    quantidadeInicial={receitaRascunho.itens[itemEditandoIndex].quantidade}
    porcaoPadraoUnidade={receitaRascunho.itens[itemEditandoIndex].alimento.porcaoPadraoUnidade}
    onSalvar={aoSalvarQuantidade}
    onFechar={() => (itemEditandoIndex = null)}
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
  .header h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .salvar {
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
  .salvar svg {
    width: 18px;
    height: 18px;
  }
  .salvar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .acoes-adicionar {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .acao-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .acao-btn svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: var(--color-primary);
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
    inset: 6px;
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
  .item-remover {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-danger);
    cursor: pointer;
  }
  .item-remover svg {
    width: 18px;
    height: 18px;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
