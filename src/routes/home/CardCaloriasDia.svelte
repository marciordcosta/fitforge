<script lang="ts">
  import { navigate } from "../../lib/router.svelte";

  let {
    caloriasConsumido,
    caloriasMeta,
    proteinaConsumido,
    proteinaMeta,
    gorduraConsumido,
    gorduraMeta,
    carboidratoConsumido,
    carboidratoMeta,
  }: {
    caloriasConsumido: number;
    caloriasMeta: number;
    proteinaConsumido: number;
    proteinaMeta: number;
    gorduraConsumido: number;
    gorduraMeta: number;
    carboidratoConsumido: number;
    carboidratoMeta: number;
  } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  function passouMeta(valor: number, meta: number): boolean {
    return valor > meta;
  }

  const caloriasPassou = $derived(passouMeta(caloriasConsumido, caloriasMeta));
</script>

{#snippet anelCentroMacro(consumido: number, meta: number)}
  {#if passouMeta(consumido, meta)}
    <strong>{consumido.toFixed(0)}g</strong>
    <span class="macro-meta">{(consumido - meta).toFixed(0)} acima</span>
  {:else}
    <strong>{consumido.toFixed(0)}g</strong>
    <span class="macro-meta">{restante(consumido, meta).toFixed(0)} rest.</span>
  {/if}
{/snippet}

<button type="button" class="card" onclick={() => navigate("/dieta")}>
  <p class="card-titulo">Calorias</p>
  <div class="calorias-linha">
    <span class="calorias-valor"><strong>{caloriasConsumido.toFixed(0)}</strong> cal <span class="calorias-meta">/ {caloriasMeta.toFixed(0)}</span></span>
    <span class="calorias-restantes">
      {#if caloriasPassou}
        <strong>{(caloriasConsumido - caloriasMeta).toFixed(0)}</strong> acima
      {:else}
        <strong>{restante(caloriasConsumido, caloriasMeta).toFixed(0)}</strong> restantes
      {/if}
    </span>
  </div>
  <div class="barra-wrap-grande">
    <div class="barra-grande" style={`width:${larguraBarra(pctMeta(caloriasConsumido, caloriasMeta))}%; background:var(--color-secondary);`}></div>
  </div>

  <div class="macros-grid">
    <div class="macro-col">
      <p class="macro-nome">Carb</p>
      <div class="macro-anel" style={`background: conic-gradient(${COR_CARBO} 0% ${larguraBarra(pctMeta(carboidratoConsumido, carboidratoMeta))}%, var(--surface-border) ${larguraBarra(pctMeta(carboidratoConsumido, carboidratoMeta))}% 100%);`}>
        <div class="macro-anel-centro">
          {@render anelCentroMacro(carboidratoConsumido, carboidratoMeta)}
        </div>
      </div>
    </div>
    <div class="macro-col">
      <p class="macro-nome">Gorduras</p>
      <div class="macro-anel" style={`background: conic-gradient(${COR_GORDURA} 0% ${larguraBarra(pctMeta(gorduraConsumido, gorduraMeta))}%, var(--surface-border) ${larguraBarra(pctMeta(gorduraConsumido, gorduraMeta))}% 100%);`}>
        <div class="macro-anel-centro">
          {@render anelCentroMacro(gorduraConsumido, gorduraMeta)}
        </div>
      </div>
    </div>
    <div class="macro-col">
      <p class="macro-nome">Proteínas</p>
      <div class="macro-anel" style={`background: conic-gradient(${COR_PROTEINA} 0% ${larguraBarra(pctMeta(proteinaConsumido, proteinaMeta))}%, var(--surface-border) ${larguraBarra(pctMeta(proteinaConsumido, proteinaMeta))}% 100%);`}>
        <div class="macro-anel-centro">
          {@render anelCentroMacro(proteinaConsumido, proteinaMeta)}
        </div>
      </div>
    </div>
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
    margin-bottom: var(--space-4);
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
  .macros-grid {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .macro-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
  }
  .macro-nome {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
  }
  .macro-anel {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .macro-anel-centro {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--surface-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .macro-anel-centro strong {
    font-size: var(--font-size-sm);
  }
  .macro-anel-centro .macro-meta {
    font-size: 10px;
    color: var(--surface-muted);
  }
</style>
