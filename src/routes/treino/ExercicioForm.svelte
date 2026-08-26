<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    createExercicio,
    construirMusculosInput,
    findOrCreatePadraoMovimento,
    type LinhaMusculoInput,
  } from "../../lib/treinoApi";
  import ExercicioCampos from "./ExercicioCampos.svelte";

  let nome = $state("");
  let padraoNome = $state("");
  let linhasMusculos = $state<LinhaMusculoInput[]>([{ nome: "", peso: 1 }]);
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
      const padrao = padraoNome.trim() ? await findOrCreatePadraoMovimento(padraoNome) : null;
      const novoId = await createExercicio({
        nome: nome.trim(),
        padrao_id: padrao?.id ?? null,
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/exercicios")} aria-label="Voltar">←</button>
    <h1>Novo Exercício</h1>
    <button class="salvar" disabled={salvando} onclick={salvar}>Criar</button>
  </div>

  <ExercicioCampos bind:nome bind:padraoNome bind:linhasMusculos />
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
  .back,
  .salvar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
</style>
