<script lang="ts">
  import { navigate } from "../../lib/router.svelte";

  let { consumido, meta }: { consumido: number; meta: number } = $props();

  const restantes = $derived(Math.max(0, meta - consumido));
  const largura = $derived(Math.min(100, meta > 0 ? (consumido / meta) * 100 : 0));
</script>

<button type="button" class="card" onclick={() => navigate("/dieta")}>
  <p class="card-titulo">Calorias</p>
  <div class="calorias-linha">
    <span class="calorias-valor"><strong>{consumido.toFixed(0)}</strong> cal <span class="calorias-meta">/ {meta.toFixed(0)}</span></span>
    <span class="calorias-restantes"><strong>{restantes.toFixed(0)}</strong> restantes</span>
  </div>
  <div class="barra-wrap-grande">
    <div class="barra-grande" style={`width:${largura}%; background:var(--color-secondary);`}></div>
  </div>
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
  .calorias-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .calorias-valor {
    font-size: var(--font-size-lg);
  }
  .calorias-valor strong {
    font-size: 22px;
  }
  .calorias-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .calorias-restantes {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .barra-wrap-grande {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
</style>
