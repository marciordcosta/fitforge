<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { findOrCreateAgrupamentoMuscular } from "../../lib/treinoApi";

  let nome = $state("");
  let salvando = $state(false);

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do agrupamento.");
      return;
    }
    salvando = true;
    try {
      const agrupamento = await findOrCreateAgrupamentoMuscular(nome);
      navigate(`/treino/agrupamentos/${agrupamento.id}`);
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/agrupamentos")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Novo Agrupamento</h1>
    <button class="salvar" disabled={salvando} onclick={salvar} aria-label="Criar">{@render iconCheck()}</button>
  </div>

  <label class="field">
    <span>Nome</span>
    <input type="text" bind:value={nome} placeholder="Ex: Ombro" />
  </label>
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
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
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
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
  .field > span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .field input {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
</style>
