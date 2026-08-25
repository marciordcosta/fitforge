<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { buscarAlimentos, criarReceita, type Alimento } from "../../lib/dietaApi";

  interface ItemReceita {
    alimento: Alimento;
    quantidade: number;
  }

  let nome = $state("");
  let itens = $state<ItemReceita[]>([]);
  let termo = $state("");
  let resultados = $state<Alimento[]>([]);
  let buscando = $state(false);
  let salvando = $state(false);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    if (termo.trim().length < 2) {
      resultados = [];
      return;
    }
    timeoutBusca = setTimeout(async () => {
      buscando = true;
      try {
        resultados = await buscarAlimentos(termo);
      } finally {
        buscando = false;
      }
    }, 300);
  }

  function adicionarItem(alimento: Alimento) {
    itens = [...itens, { alimento, quantidade: alimento.porcaoPadraoQtd }];
    termo = "";
    resultados = [];
  }

  function removerItem(i: number) {
    itens = itens.filter((_, idx) => idx !== i);
  }

  function caloriasItem(item: ItemReceita): number {
    return item.alimento.caloriasPorPorcao * (item.quantidade / item.alimento.porcaoPadraoQtd);
  }

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + caloriasItem(i), 0));

  const valido = $derived(nome.trim().length > 0 && itens.length > 0);

  async function salvar() {
    if (!valido) return;
    salvando = true;
    try {
      await criarReceita(
        nome.trim(),
        itens.map((i) => ({ alimentoId: i.alimento.id, quantidade: i.quantidade })),
      );
      navigate("/dieta/alimentos");
    } catch (err) {
      alert("Erro ao criar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Nova Refeição</h1>
    <button class="salvar" onclick={salvar} disabled={salvando || !valido} aria-label="Salvar">✓</button>
  </div>

  <input class="nome-input" type="text" placeholder="Nome da refeição" bind:value={nome} />

  <input class="busca-input" type="text" placeholder="Adicionar alimento…" bind:value={termo} oninput={aoDigitar} />

  {#if buscando}
    <p class="muted">Buscando…</p>
  {:else if resultados.length}
    <div class="resultados">
      {#each resultados as alimento (alimento.id)}
        <button class="resultado-item" onclick={() => adicionarItem(alimento)}>
          <span class="resultado-nome">{alimento.nome}</span>
          <span class="resultado-cal">{alimento.caloriasPorPorcao.toFixed(0)} kcal / {alimento.porcaoPadraoQtd}{alimento.porcaoPadraoUnidade}</span>
        </button>
      {/each}
    </div>
  {/if}

  <p class="itens-titulo">Itens ({itens.length})</p>
  {#if !itens.length}
    <p class="muted">Nenhum alimento adicionado ainda.</p>
  {:else}
    {#each itens as item, i (item.alimento.id + i)}
      <div class="item-card">
        <div class="item-info">
          <p class="item-nome">{item.alimento.nome}</p>
          <p class="item-cal">{caloriasItem(item).toFixed(0)} kcal</p>
        </div>
        <input
          class="qtd-input"
          type="number"
          inputmode="decimal"
          step="1"
          min="0"
          bind:value={item.quantidade}
        />
        <span class="qtd-unidade">{item.alimento.porcaoPadraoUnidade}</span>
        <button class="item-remover" onclick={() => removerItem(i)} aria-label="Remover item">✕</button>
      </div>
    {/each}
    <p class="total">Total: {totalCalorias.toFixed(0)} kcal</p>
  {/if}
</div>

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
  .nome-input,
  .busca-input {
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
  .resultados {
    background: var(--surface-card);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    overflow: hidden;
  }
  .resultado-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    padding: var(--space-3);
    border: none;
    border-bottom: 1px solid var(--surface-border);
    background: none;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .resultado-item:last-child {
    border-bottom: none;
  }
  .resultado-nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resultado-cal {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-4) 0 var(--space-3);
  }
  .item-card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--surface-card);
    padding: var(--space-3);
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
  .item-cal {
    margin: 2px 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .qtd-input {
    width: 56px;
    text-align: right;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
  }
  .qtd-unidade {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .item-remover {
    background: none;
    border: none;
    color: var(--color-danger);
    cursor: pointer;
    padding: var(--space-1);
  }
  .total {
    text-align: right;
    font-weight: 600;
    margin-top: var(--space-3);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
