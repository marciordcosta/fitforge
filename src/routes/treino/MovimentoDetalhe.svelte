<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    getPadraoMovimentoComMusculos,
    updatePadraoMovimentoComMusculos,
    deletePadraoMovimento,
  } from "../../lib/treinoApi";
  import MovimentoCampos from "./MovimentoCampos.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";

  let { padraoId }: { padraoId: string } = $props();

  let nome = $state("");
  let linhasMusculos = $state<{ nome: string }[]>([{ nome: "" }]);
  let encontrado = $state(true);
  let loading = $state(true);
  let salvando = $state(false);
  let mostrarConfirmExcluir = $state(false);

  async function carregar() {
    loading = true;
    const padrao = await getPadraoMovimentoComMusculos(padraoId);
    if (padrao) {
      nome = padrao.nome;
      linhasMusculos = padrao.musculos.length ? padrao.musculos.map((m) => ({ nome: m.nome })) : [{ nome: "" }];
    } else {
      encontrado = false;
    }
    loading = false;
  }

  void carregar();

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do movimento.");
      return;
    }
    salvando = true;
    try {
      await updatePadraoMovimentoComMusculos(
        padraoId,
        nome,
        linhasMusculos.map((l) => l.nome),
      );
      voltar("/treino/movimentos");
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function excluir() {
    mostrarConfirmExcluir = false;
    try {
      await deletePadraoMovimento(padraoId);
      navigate("/treino/movimentos");
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/movimentos")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{nome || "Movimento"}</h1>
    <button class="atualizar" disabled={salvando} onclick={salvar}>Atualizar</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !encontrado}
    <p class="muted">Movimento não encontrado.</p>
  {:else}
    <MovimentoCampos bind:nome bind:linhasMusculos />
    <button class="excluir-btn" onclick={() => (mostrarConfirmExcluir = true)}>Excluir Movimento</button>
  {/if}
</div>

{#if mostrarConfirmExcluir}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir este movimento?"
    textoConfirmar="Excluir Movimento"
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
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
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
