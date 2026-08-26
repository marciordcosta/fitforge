<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { criarReceita, vincularMetaReceita } from "../../lib/dietaApi";
  import { receitaRascunho, removerDoRascunho, limparRascunho, type ItemRascunho } from "../../lib/receitaRascunho.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";

  let { metaParaModeloId }: { metaParaModeloId?: string } = $props();

  let salvando = $state(false);
  let itemEditandoIndex = $state<number | null>(null);

  function caloriasItem(item: ItemRascunho): number {
    return item.alimento.caloriasPorPorcao * (item.quantidade / item.alimento.porcaoPadraoQtd);
  }

  function aoSalvarQuantidade(qtd: number) {
    if (itemEditandoIndex == null) return;
    receitaRascunho.itens[itemEditandoIndex].quantidade = qtd;
    itemEditandoIndex = null;
  }

  const totalCalorias = $derived(receitaRascunho.itens.reduce((acc, i) => acc + caloriasItem(i), 0));

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
        await vincularMetaReceita(metaParaModeloId, novoId);
      }
      limparRascunho();
      navigate(metaParaModeloId ? "/dieta/refeicoes/gerenciar" : "/dieta/receitas");
    } catch (err) {
      alert("Erro ao criar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Nova Refeição</h1>
    <button class="salvar" onclick={salvar} disabled={salvando || !valido} aria-label="Salvar">✓</button>
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

  <p class="itens-titulo">Itens ({receitaRascunho.itens.length})</p>
  {#if !receitaRascunho.itens.length}
    <p class="muted">Nenhum alimento adicionado ainda.</p>
  {:else}
    {#each receitaRascunho.itens as item, i (item.alimento.id + i)}
      <div class="item-card">
        <div class="item-info">
          <p class="item-nome">{item.alimento.nome}</p>
          <p class="item-cal">{caloriasItem(item).toFixed(0)} kcal</p>
        </div>
        <button type="button" class="qtd-btn" onclick={() => (itemEditandoIndex = i)}>
          {item.quantidade}{item.alimento.porcaoPadraoUnidade}
        </button>
        <button class="item-remover" onclick={() => removerDoRascunho(i)} aria-label="Remover item">✕</button>
      </div>
    {/each}
    <p class="total">Total: {totalCalorias.toFixed(0)} kcal</p>
  {/if}
</div>

{#if itemEditandoIndex != null}
  <DietaQuantidadeDialog
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
  .qtd-btn {
    flex-shrink: 0;
    min-width: 56px;
    text-align: center;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
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
