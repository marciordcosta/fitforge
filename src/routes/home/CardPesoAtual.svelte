<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { formatDiasObjetivo } from "../../lib/pesoApi";

  let {
    pesoAtual,
    media,
    metaSemanal,
    pesoAlvo,
    diasObjetivo,
  }: {
    pesoAtual: number | null;
    media: number | null;
    metaSemanal: number | null;
    pesoAlvo: number | null;
    diasObjetivo: number | null;
  } = $props();

  function formatKg(v: number | null): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }

  const textoObjetivo = $derived(diasObjetivo != null ? `${formatDiasObjetivo(diasObjetivo, true)} para o objetivo` : null);
</script>

<button type="button" class="card" onclick={() => navigate("/peso")}>
  <p class="card-titulo">Peso</p>
  <div class="quick-actions">
    <div class="quick-card">
      <span class="quick-card-label">Peso atual</span>
      <span class="quick-card-valor">{formatKg(pesoAtual)}</span>
    </div>
    <div class="quick-card">
      <span class="quick-card-label">Média atual</span>
      <span class="quick-card-valor">{formatKg(media)}</span>
    </div>
    <div class="quick-card">
      <span class="quick-card-label">Meta semanal</span>
      <span class="quick-card-valor">{formatKg(metaSemanal)}</span>
    </div>
    <div class="quick-card">
      <span class="quick-card-label">Meta Alvo</span>
      <span class="quick-card-valor">{formatKg(pesoAlvo)}</span>
    </div>
  </div>
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
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
  }
  .quick-card {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
  }
  .quick-card-valor {
    font-size: var(--font-size-sm);
    font-weight: 700;
    white-space: nowrap;
  }
  .quick-card-label {
    font-size: 11px;
    font-weight: 400;
    color: var(--surface-muted);
    white-space: nowrap;
  }
  .subtexto {
    margin: var(--space-3) 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
