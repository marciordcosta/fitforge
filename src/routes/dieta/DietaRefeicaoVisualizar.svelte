<script lang="ts">
  import { parseISODate } from "../../lib/dates";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DietaAdicionarSheet from "./DietaAdicionarSheet.svelte";
  import { getDiarioDoDia, removerItemDiario, labelRefeicao, type ItemDiario, type Refeicao } from "../../lib/dietaApi";

  let { refeicao, data }: { refeicao: Refeicao; data: string } = $props();

  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];

  const dataLabel = $derived.by(() => {
    const d = parseISODate(data);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  let itens = $state<ItemDiario[]>([]);
  let loading = $state(true);
  let mostrarAdicionar = $state(false);
  let itemParaRemover = $state<ItemDiario | null>(null);
  let processando = $state(false);

  async function carregar() {
    loading = true;
    itens = (await getDiarioDoDia(data)).filter((i) => i.refeicao === refeicao);
    loading = false;
  }

  void carregar();

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));

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
</script>

{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>
      {labelRefeicao(refeicao)}
      <span class="data-inline">{dataLabel}</span>
    </h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    {#if itens.length}
      <p class="total">{totalCalorias.toFixed(0)} kcal</p>
    {/if}

    {#if !itens.length}
      <p class="muted">Nenhum alimento adicionado ainda.</p>
    {:else}
      {#each itens as item (item.id)}
        <div class="item-card">
          <div class="item-info">
            <p class="item-nome">{item.nome}</p>
            <p class="item-qtd">{item.quantidade}{item.unidade} · {item.calorias.toFixed(0)} kcal</p>
          </div>
          <button class="item-remover" onclick={() => (itemParaRemover = item)} aria-label="Remover alimento">
            {@render iconExcluir()}
          </button>
        </div>
      {/each}
    {/if}

    <button class="acao-adicionar" onclick={() => (mostrarAdicionar = true)}>+ Adicionar Alimento</button>
  {/if}
</div>

{#if mostrarAdicionar}
  <DietaAdicionarSheet
    {refeicao}
    {data}
    onFechar={() => (mostrarAdicionar = false)}
    onAdicionado={carregar}
  />
{/if}

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo="Tem certeza de que quer remover este alimento?"
    textoConfirmar="Remover"
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
  .data-inline {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    text-transform: capitalize;
  }
  .total {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-4);
  }
  .item-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-2);
  }
  .item-info {
    flex: 1;
    min-width: 0;
  }
  .item-nome {
    margin: 0;
    font-size: var(--font-size-base);
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
    border: none;
    background: none;
    color: var(--color-danger);
    cursor: pointer;
  }
  .item-remover svg {
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
</style>
