<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate, toISODate, hojeISO } from "../../lib/dates";
  import Button from "../../components/Button.svelte";
  import DietaAdicionarSheet from "./DietaAdicionarSheet.svelte";
  import { REFEICOES, getDiarioDoDia, type ItemDiario, type Refeicao } from "../../lib/dietaApi";

  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  let dataAtual = $state(hojeISO());
  let itens = $state<ItemDiario[]>([]);
  let loading = $state(true);
  let refeicaoParaAdicionar = $state<Refeicao | null>(null);

  async function carregar() {
    loading = true;
    itens = await getDiarioDoDia(dataAtual);
    loading = false;
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

  function itensDaRefeicao(refeicao: Refeicao): ItemDiario[] {
    return itens.filter((i) => i.refeicao === refeicao);
  }

  function preview(refeicao: Refeicao): string {
    const nomes = itensDaRefeicao(refeicao).map((i) => i.nome);
    if (!nomes.length) return "Nenhum alimento ainda";
    return nomes.join(", ");
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
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    {#each REFEICOES as refeicao (refeicao.valor)}
      <div
        class="refeicao-item"
        role="button"
        tabindex="0"
        onclick={() => navigate(`/dieta/refeicao/${refeicao.valor}/${dataAtual}`)}
        onkeydown={(e) => e.key === "Enter" && navigate(`/dieta/refeicao/${refeicao.valor}/${dataAtual}`)}
      >
        <div class="card-header">
          <h2>{refeicao.label}</h2>
        </div>
        <p class="preview">{preview(refeicao.valor)}</p>
        <Button
          onclick={(e) => {
            e.stopPropagation();
            refeicaoParaAdicionar = refeicao.valor;
          }}
        >
          Adicionar Alimento
        </Button>
      </div>
    {/each}
  {/if}
</div>

{#if refeicaoParaAdicionar !== null}
  <DietaAdicionarSheet
    refeicao={refeicaoParaAdicionar}
    data={dataAtual}
    onFechar={() => (refeicaoParaAdicionar = null)}
    onAdicionado={carregar}
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
</style>
