<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { getMusculo, updateMusculo, deleteMusculo } from "../../lib/treinoApi";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";

  let { musculoId }: { musculoId: string } = $props();

  let nome = $state("");
  let encontrado = $state(true);
  let loading = $state(true);
  let salvando = $state(false);
  let mostrarConfirmExcluir = $state(false);

  async function carregar() {
    loading = true;
    const musculo = await getMusculo(musculoId);
    if (musculo) {
      nome = musculo.nome;
    } else {
      encontrado = false;
    }
    loading = false;
  }

  void carregar();

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do músculo.");
      return;
    }
    salvando = true;
    try {
      await updateMusculo(musculoId, nome);
      voltar("/treino/musculos");
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function excluir() {
    mostrarConfirmExcluir = false;
    try {
      await deleteMusculo(musculoId);
      navigate("/treino/musculos");
    } catch (e) {
      alert("Erro ao excluir: " + (e as Error).message);
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
    <button class="back" onclick={() => voltar("/treino/musculos")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{nome || "Músculo"}</h1>
    <button class="atualizar" disabled={salvando} onclick={salvar} aria-label="Atualizar">{@render iconCheck()}</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !encontrado}
    <p class="muted">Músculo não encontrado.</p>
  {:else}
    <label class="field">
      <span>Nome</span>
      <input type="text" bind:value={nome} placeholder="Ex: Deltoide Posterior" />
    </label>
    <button class="excluir-btn" onclick={() => (mostrarConfirmExcluir = true)}>Excluir Músculo</button>
  {/if}
</div>

{#if mostrarConfirmExcluir}
  <ConfirmDialog
    titulo="Excluir esse músculo remove ele de todos os exercícios e movimentos que o usam. Tem certeza?"
    textoConfirmar="Excluir Músculo"
    onConfirmar={excluir}
    onCancelar={() => (mostrarConfirmExcluir = false)}
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
    margin-bottom: var(--space-4);
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
  .atualizar {
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
  .atualizar svg {
    width: 18px;
    height: 18px;
  }
  .atualizar:disabled {
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
  .excluir-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-danger);
    background: none;
    color: var(--color-danger);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
