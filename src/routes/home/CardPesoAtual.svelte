<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { formatDiasObjetivo } from "../../lib/pesoApi";

  let {
    pesoAtual,
    media,
    diasObjetivo,
  }: {
    pesoAtual: number | null;
    media: number | null;
    diasObjetivo: number | null;
  } = $props();

  const valorPrincipal = $derived(media ?? pesoAtual);
  const textoObjetivo = $derived(diasObjetivo != null ? `${formatDiasObjetivo(diasObjetivo, true)} para o objetivo` : null);
</script>

<button type="button" class="card" onclick={() => navigate("/peso")}>
  <p class="card-titulo">Peso</p>
  <p class="valor-principal">
    {#if valorPrincipal != null}
      <strong>{valorPrincipal.toFixed(1)}</strong> <span class="unidade">kg</span>
    {:else}
      <span class="unidade">Sem registros ainda</span>
    {/if}
  </p>
  {#if media != null && pesoAtual != null}
    <p class="subtexto">Hoje: {pesoAtual.toFixed(1)} kg</p>
  {/if}
  {#if textoObjetivo}
    <p class="subtexto">{textoObjetivo}</p>
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
  .valor-principal strong {
    font-size: 22px;
  }
  .unidade {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .subtexto {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
