<script lang="ts">
  import { navigate } from "../../lib/router.svelte";

  let {
    pesoAtual,
    media,
    metaSemanal,
    pesoAlvo,
  }: {
    pesoAtual: number | null;
    media: number | null;
    metaSemanal: number | null;
    pesoAlvo: number | null;
  } = $props();

  function formatKg(v: number | null): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }
</script>

<button type="button" class="card" onclick={() => navigate("/peso")}>
  <div class="quick-actions">
    <div class="quick-card">
      <span class="quick-card-label">Últ. registro</span>
      <span class="quick-card-valor">{formatKg(pesoAtual)}</span>
    </div>
    <div class="quick-card">
      <span class="quick-card-label">Peso média</span>
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
</button>

<style>
  .card {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    margin-bottom: var(--space-4);
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
  }
  .quick-card {
    flex: 1;
    min-width: 0;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-card);
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
    text-align: center;
  }
</style>
