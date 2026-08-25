<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import Button from "../../components/Button.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import {
    getReceita,
    garantirRefeicoesPadraoDoDia,
    getRefeicoesDoDia,
    getRefeicaoDia,
    getMetasDiarias,
    adicionarReceitaAoDiario,
    type Receita,
    type RefeicaoDia,
    type MetasDiarias,
  } from "../../lib/dietaApi";

  let { receitaId }: { receitaId: string } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let receita = $state<Receita | null>(null);
  let metas = $state<MetasDiarias | null>(null);
  let refeicao = $state<RefeicaoDia | null>(null);
  let opcoesRefeicao = $state<RefeicaoDia[]>([]);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let mostrarEscolhaRefeicao = $state(false);
  let mostrarCriarRefeicao = $state(false);
  let salvando = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const [receitaRes, metasRes, refeicoesHoje] = await Promise.all([
        getReceita(receitaId),
        getMetasDiarias(),
        garantirRefeicoesPadraoDoDia(hojeISO()),
      ]);
      receita = receitaRes;
      metas = metasRes;
      refeicao = refeicoesHoje[0] ?? null;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  async function abrirEscolhaRefeicao() {
    opcoesRefeicao = await getRefeicoesDoDia(hojeISO());
    mostrarEscolhaRefeicao = true;
  }

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    mostrarEscolhaRefeicao = false;
    void getRefeicaoDia(id).then((r) => (refeicao = r));
  }

  const totalCalorias = $derived(receita ? receita.itens.reduce((acc, i) => acc + i.calorias, 0) : 0);
  const totalProteina = $derived(receita ? receita.itens.reduce((acc, i) => acc + i.proteinaG, 0) : 0);
  const totalGordura = $derived(receita ? receita.itens.reduce((acc, i) => acc + i.gorduraG, 0) : 0);
  const totalCarboidrato = $derived(receita ? receita.itens.reduce((acc, i) => acc + i.carboidratoG, 0) : 0);

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
    return meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  }

  async function adicionar() {
    if (!receita || !refeicao) return;
    salvando = true;
    try {
      await adicionarReceitaAoDiario(receita.id, hojeISO(), refeicao.id);
      navigate(`/dieta/refeicao/${refeicao.id}`);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>{receita?.nome ?? ""}</h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else if !receita}
    <p class="muted">Refeição não encontrada.</p>
  {:else}
    <div
      class="linha"
      role="button"
      tabindex="0"
      onclick={() => abrirEscolhaRefeicao()}
      onkeydown={(e) => e.key === "Enter" && abrirEscolhaRefeicao()}
    >
      <span>Adicionar à refeição</span>
      <span class:placeholder={!refeicao}>{refeicao ? refeicao.nome : "Selecione uma refeição"}</span>
    </div>

    {#if receita.itens.length}
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
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(totalCalorias, metas.calorias)}%; background:var(--color-secondary);`}></div></div>
            <span class="meta-valor">{pctMeta(totalCalorias, metas.calorias).toFixed(0)}% · {metas.calorias.toFixed(0)}</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Carb</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(totalCarboidrato, metas.carboidratoG)}%; background:${COR_CARBO};`}></div></div>
            <span class="meta-valor">{pctMeta(totalCarboidrato, metas.carboidratoG).toFixed(0)}% · {metas.carboidratoG.toFixed(0)}g</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Gorduras</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(totalGordura, metas.gorduraG)}%; background:${COR_GORDURA};`}></div></div>
            <span class="meta-valor">{pctMeta(totalGordura, metas.gorduraG).toFixed(0)}% · {metas.gorduraG.toFixed(0)}g</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Proteínas</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(totalProteina, metas.proteinaG)}%; background:${COR_PROTEINA};`}></div></div>
            <span class="meta-valor">{pctMeta(totalProteina, metas.proteinaG).toFixed(0)}% · {metas.proteinaG.toFixed(0)}g</span>
          </div>
        </div>
      {/if}
    {/if}

    <p class="itens-titulo">Itens</p>
    {#if !receita.itens.length}
      <p class="muted">Nenhum alimento nessa refeição.</p>
    {:else}
      {#each receita.itens as item (item.alimentoId)}
        <div class="item-card">
          <p class="item-nome">{item.nome}</p>
          <p class="item-qtd">{item.quantidade}{item.unidade} · {item.calorias.toFixed(0)} kcal</p>
        </div>
      {/each}
    {/if}

    <div class="acao-adicionar">
      <Button onclick={adicionar} disabled={salvando || !refeicao}>Adicionar à Refeição</Button>
    </div>
  {/if}
</div>

{#if mostrarEscolhaRefeicao}
  <ActionSheet
    titulo="Selecione a refeição"
    onFechar={() => (mostrarEscolhaRefeicao = false)}
    opcoes={[
      ...opcoesRefeicao.map((r) => ({ label: r.nome, onSelect: () => (refeicao = r) })),
      { label: "+ Nova Refeição", onSelect: () => (mostrarCriarRefeicao = true) },
    ]}
  />
{/if}

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={hojeISO()}
    onFechar={() => (mostrarCriarRefeicao = false)}
    onCriada={aoCriarRefeicao}
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
  .header-spacer {
    width: 24px;
    flex-shrink: 0;
  }
  .back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
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
    inset: 18px;
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
    background: var(--surface-card);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-2);
  }
  .item-nome {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .item-qtd {
    margin: 2px 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .acao-adicionar {
    margin-top: var(--space-4);
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
