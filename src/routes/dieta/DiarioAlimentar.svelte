<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate, toISODate, hojeISO } from "../../lib/dates";
  import Button from "../../components/Button.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import {
    getRefeicoesDoDia,
    getDiarioDoDia,
    getMetasDiarias,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
  } from "../../lib/dietaApi";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  let dataAtual = $state(hojeISO());
  let refeicoes = $state<RefeicaoDia[]>([]);
  let itens = $state<ItemDiario[]>([]);
  let metas = $state<MetasDiarias | null>(null);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let mostrarCriarRefeicao = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [refeicoes, itens, metas] = await Promise.all([getRefeicoesDoDia(dataAtual), getDiarioDoDia(dataAtual), getMetasDiarias()]);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function trocarDia(delta: number) {
    const d = parseISODate(dataAtual);
    dataAtual = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
    void carregar();
  }

  const dataLabel = $derived.by(() => {
    if (dataAtual === hojeISO()) return "Hoje";
    const d = parseISODate(dataAtual);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  function preview(refeicaoId: string): string {
    const nomes = itens.filter((i) => i.refeicaoId === refeicaoId).map((i) => i.nome);
    if (!nomes.length) return "Nenhum alimento ainda";
    return nomes.join(", ");
  }

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    navigate(`/dieta/refeicao/${id}`);
  }

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itens.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itens.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itens.reduce((acc, i) => acc + i.carboidratoG, 0));

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Dieta</h1>
  </div>

  <div class="quick-actions">
    <button class="quick-btn" onclick={() => navigate("/dieta/alimentos")}>Alimentos</button>
    <button class="quick-btn" onclick={() => navigate("/dieta/distribuicao")}>Distribuição</button>
    <button class="quick-btn" onclick={() => navigate("/dieta/historico")}>Histórico</button>
  </div>

  <div class="dia-nav">
    <button onclick={() => trocarDia(-1)} aria-label="Dia anterior">‹</button>
    <span>{dataLabel}</span>
    <button onclick={() => trocarDia(1)} aria-label="Próximo dia">›</button>
    <button class="icon-btn" onclick={() => (mostrarCriarRefeicao = true)} aria-label="Nova refeição">+</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar o diário: {erro}</p>
  {:else}
    {#if metas}
      <div class="detalhes-card">
        <div class="detalhes-cabecalho">
          <h2 class="detalhes-titulo">Detalhes</h2>
        </div>
        <div class="detalhes-lista">
          <div class="detalhes-item">
            <span class="detalhes-nome">Calorias</span>
            <div class="detalhes-barra-wrap">
              <div class="detalhes-barra" style={`width:${pctMeta(totalCalorias, metas.calorias)}%; background:var(--color-secondary);`}></div>
            </div>
            <span class="detalhes-valor">{totalCalorias.toFixed(0)}/{metas.calorias.toFixed(0)}</span>
          </div>
          <div class="detalhes-item">
            <span class="detalhes-nome">Carboidratos</span>
            <div class="detalhes-barra-wrap">
              <div class="detalhes-barra" style={`width:${pctMeta(totalCarboidrato, metas.carboidratoG)}%; background:${COR_CARBO};`}></div>
            </div>
            <span class="detalhes-valor">{totalCarboidrato.toFixed(0)}/{metas.carboidratoG.toFixed(0)}g</span>
          </div>
          <div class="detalhes-item">
            <span class="detalhes-nome">Gorduras</span>
            <div class="detalhes-barra-wrap">
              <div class="detalhes-barra" style={`width:${pctMeta(totalGordura, metas.gorduraG)}%; background:${COR_GORDURA};`}></div>
            </div>
            <span class="detalhes-valor">{totalGordura.toFixed(0)}/{metas.gorduraG.toFixed(0)}g</span>
          </div>
          <div class="detalhes-item">
            <span class="detalhes-nome">Proteínas</span>
            <div class="detalhes-barra-wrap">
              <div class="detalhes-barra" style={`width:${pctMeta(totalProteina, metas.proteinaG)}%; background:${COR_PROTEINA};`}></div>
            </div>
            <span class="detalhes-valor">{totalProteina.toFixed(0)}/{metas.proteinaG.toFixed(0)}g</span>
          </div>
        </div>
      </div>
    {/if}

    {#if !refeicoes.length}
      <p class="muted">Nenhuma refeição ainda. Toque em + pra criar.</p>
    {:else}
      {#each refeicoes as refeicao (refeicao.id)}
      <div
        class="refeicao-item"
        role="button"
        tabindex="0"
        onclick={() => navigate(`/dieta/refeicao/${refeicao.id}`)}
        onkeydown={(e) => e.key === "Enter" && navigate(`/dieta/refeicao/${refeicao.id}`)}
      >
        <div class="card-header">
          <h2>{refeicao.nome}</h2>
        </div>
        <p class="preview">{preview(refeicao.id)}</p>
        <Button
          onclick={(e) => {
            e.stopPropagation();
            navigate(`/dieta/alimentos/refeicao/${refeicao.id}`);
          }}
        >
          Adicionar Alimento
        </Button>
      </div>
    {/each}
    {/if}
  {/if}
</div>

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={dataAtual}
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
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-3);
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .dia-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
    position: relative;
  }
  .dia-nav span {
    font-weight: 600;
    min-width: 160px;
    text-align: center;
    text-transform: capitalize;
  }
  .dia-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .icon-btn {
    position: absolute;
    right: 0;
    color: var(--color-primary);
  }
  .detalhes-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .detalhes-cabecalho {
    margin-bottom: var(--space-3);
  }
  .detalhes-titulo {
    font-size: var(--font-size-base);
    margin: 0;
  }
  .detalhes-lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .detalhes-item {
    display: grid;
    grid-template-columns: 100px 1fr 70px;
    align-items: center;
    gap: var(--space-3);
  }
  .detalhes-nome {
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detalhes-barra-wrap {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .detalhes-barra {
    height: 100%;
    border-radius: 6px;
  }
  .detalhes-valor {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .refeicao-item {
    cursor: pointer;
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .card-header h2 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .preview {
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
