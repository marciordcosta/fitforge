<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import type { TreinoComExercicios } from "../../lib/treinoApi";

  let { treino }: { treino: TreinoComExercicios | null } = $props();
</script>

<button
  type="button"
  class="card"
  onclick={() => navigate(treino ? `/treino/rotina/${treino.id}/ver` : "/treino")}
>
  <p class="card-titulo">Treino de hoje</p>
  {#if treino}
    <p class="valor-principal"><strong>{treino.nome_treino}</strong></p>
    <p class="subtexto">{treino.exercicios.length} {treino.exercicios.length === 1 ? "exercício" : "exercícios"}</p>
  {:else}
    <p class="subtexto">Nenhum treino agendado pra hoje</p>
  {/if}
</button>

<style>
  .card {
    display: block;
    width: 100%;
    background: var(--surface-card);
    border: none;
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .valor-principal {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-lg);
  }
  .subtexto {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
