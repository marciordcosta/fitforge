<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { createExercicio, construirMusculosInput, type LinhaMusculoInput } from "../../lib/treinoApi";
  import ExercicioCampos from "./ExercicioCampos.svelte";

  let nome = $state("");
  let padraoId = $state("");
  let linhasMusculos = $state<LinhaMusculoInput[]>([]);
  let salvando = $state(false);

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do exercício.");
      return;
    }
    const musculosInput = await construirMusculosInput(linhasMusculos);
    if (!musculosInput.length) {
      alert("Informe ao menos um músculo envolvido.");
      return;
    }
    salvando = true;
    try {
      const novoId = await createExercicio({
        nome: nome.trim(),
        padrao_id: padraoId || null,
        musculos: musculosInput,
      });
      navigate(`/treino/exercicios/${novoId}`);
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/exercicios")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Novo Exercício</h1>
    <button class="salvar" disabled={salvando} onclick={salvar}>Criar</button>
  </div>

  <ExercicioCampos bind:nome bind:padraoId bind:linhasMusculos />
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
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .salvar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
