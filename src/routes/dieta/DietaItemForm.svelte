<script lang="ts">
  import { untrack } from "svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import {
    getAlimento,
    getMetasDiarias,
    adicionarItemDiario,
    REFEICOES,
    labelRefeicao,
    type Alimento,
    type MetasDiarias,
    type Refeicao,
  } from "../../lib/dietaApi";

  let {
    alimentoId,
    data,
    refeicaoInicial,
  }: { alimentoId: string; data: string; refeicaoInicial: Refeicao | null } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let alimento = $state<Alimento | null>(null);
  let metas = $state<MetasDiarias | null>(null);
  let loading = $state(true);
  let refeicao = $state<Refeicao | null>(untrack(() => refeicaoInicial));
  let porcoes = $state(1);
  let mostrarEscolhaRefeicao = $state(false);
  let salvando = $state(false);

  async function carregar() {
    loading = true;
    [alimento, metas] = await Promise.all([getAlimento(alimentoId), getMetasDiarias()]);
    loading = false;
  }

  void carregar();

  const quantidade = $derived(alimento ? porcoes * alimento.porcaoPadraoQtd : 0);
  const calorias = $derived(alimento ? alimento.caloriasPorPorcao * porcoes : 0);
  const proteinaG = $derived(alimento ? alimento.proteinaG * porcoes : 0);
  const gorduraG = $derived(alimento ? alimento.gorduraG * porcoes : 0);
  const carboidratoG = $derived(alimento ? alimento.carboidratoG * porcoes : 0);

  const caloriasCarbo = $derived(carboidratoG * 4);
  const caloriasGordura = $derived(gorduraG * 9);
  const caloriasProteina = $derived(proteinaG * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`,
  );

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  }

  async function salvar() {
    if (!alimento || !refeicao) return;
    salvando = true;
    try {
      await adicionarItemDiario({ alimento, data, refeicao, quantidade });
      window.history.back();
    } catch (err) {
      alert("Erro ao adicionar alimento: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Adicionar Alimento</h1>
    <button class="salvar" onclick={salvar} disabled={salvando || !refeicao || loading} aria-label="Salvar">✓</button>
  </div>

  {#if loading || !alimento}
    <p class="muted">Carregando…</p>
  {:else}
    <h2 class="nome-alimento">{alimento.nome}</h2>

    <div class="linha" role="button" tabindex="0" onclick={() => (mostrarEscolhaRefeicao = true)} onkeydown={(e) => e.key === "Enter" && (mostrarEscolhaRefeicao = true)}>
      <span>Refeição</span>
      <span class:placeholder={!refeicao}>{refeicao ? labelRefeicao(refeicao) : "Selecione uma refeição"}</span>
    </div>

    <div class="linha">
      <span>Quantidade de porções</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" bind:value={porcoes} />
    </div>

    <div class="resumo">
      <div class="donut" style={donutStyle}>
        <div class="donut-centro">
          <strong>{calorias.toFixed(0)}</strong>
          <span>Cal</span>
        </div>
      </div>
      <div class="resumo-macros">
        <p style={`color:${COR_CARBO}`}><strong>{pctCarbo.toFixed(0)}%</strong><br />{carboidratoG.toFixed(1)} g<br />Carb</p>
        <p style={`color:${COR_GORDURA}`}><strong>{pctGordura.toFixed(0)}%</strong><br />{gorduraG.toFixed(1)} g<br />Gorduras</p>
        <p style={`color:${COR_PROTEINA}`}><strong>{pctProteina.toFixed(0)}%</strong><br />{proteinaG.toFixed(1)} g<br />Proteínas</p>
      </div>
    </div>

    {#if metas}
      <p class="metas-titulo">Percentual das suas metas diárias</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(calorias, metas.calorias)}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{pctMeta(calorias, metas.calorias).toFixed(0)}% · {metas.calorias.toFixed(0)}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(carboidratoG, metas.carboidratoG)}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{pctMeta(carboidratoG, metas.carboidratoG).toFixed(0)}% · {metas.carboidratoG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(gorduraG, metas.gorduraG)}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{pctMeta(gorduraG, metas.gorduraG).toFixed(0)}% · {metas.gorduraG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(proteinaG, metas.proteinaG)}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{pctMeta(proteinaG, metas.proteinaG).toFixed(0)}% · {metas.proteinaG.toFixed(0)}g</span>
        </div>
      </div>
    {/if}

    <p class="itens-titulo">Itens da refeição</p>
    <div class="item-preview">
      <span class="item-nome">{alimento.nome}</span>
      <span class="item-sub">{quantidade.toFixed(0)}{alimento.porcaoPadraoUnidade} · {calorias.toFixed(0)} kcal</span>
    </div>
  {/if}
</div>

{#if mostrarEscolhaRefeicao}
  <ActionSheet
    titulo="Selecione a refeição"
    onFechar={() => (mostrarEscolhaRefeicao = false)}
    opcoes={REFEICOES.map((r) => ({ label: r.label, onSelect: () => (refeicao = r.valor) }))}
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
  .back,
  .salvar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
  }
  .salvar:disabled {
    color: var(--surface-muted);
    cursor: not-allowed;
  }
  .nome-alimento {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-4);
  }
  .linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    cursor: pointer;
  }
  .linha span:first-child {
    color: var(--surface-fg);
  }
  .linha span.placeholder {
    color: var(--color-danger);
  }
  .linha input {
    width: 70px;
    text-align: right;
    padding: var(--space-1);
    border: none;
    background: none;
    color: var(--color-secondary);
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0;
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
    inset: 14px;
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
  .metas-titulo,
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .metas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-5);
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
  .item-preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .item-nome {
    font-size: var(--font-size-base);
  }
  .item-sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
