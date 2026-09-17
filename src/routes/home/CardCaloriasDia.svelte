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
    fibraConsumido,
    fibraMeta,
    gorduraSaturadaConsumido,
    gorduraSaturadaMeta,
  }: {
    caloriasConsumido: number;
    caloriasMeta: number;
    proteinaConsumido: number;
    proteinaMeta: number;
    gorduraConsumido: number;
    gorduraMeta: number;
    carboidratoConsumido: number;
    carboidratoMeta: number;
    fibraConsumido: number;
    fibraMeta: number;
    gorduraSaturadaConsumido: number;
    gorduraSaturadaMeta: number;
  } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let modoRestante = $state(true);

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

  function abrirDieta(): void {
    navigate("/dieta");
  }
</script>

{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}

{#snippet anelCentroMacro(consumido: number, meta: number)}
  {#if modoRestante && passouMeta(consumido, meta)}
    <strong>{(consumido - meta).toFixed(0)}g</strong>
    <span class="macro-meta">acima</span>
  {:else if modoRestante}
    <strong>{restante(consumido, meta).toFixed(0)}g</strong>
    <span class="macro-meta">rest.</span>
  {:else}
    <strong>{consumido.toFixed(0)}g</strong>
    <span class="macro-meta">/{meta.toFixed(0)}</span>
  {/if}
{/snippet}

<div class="card" role="button" tabindex="0" onclick={abrirDieta} onkeydown={(e) => e.key === "Enter" && abrirDieta()}>
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

  <div class="macros-wrap">
    <button
      type="button"
      class="toggle-btn"
      onclick={(e) => {
        e.stopPropagation();
        modoRestante = !modoRestante;
      }}
      aria-label="Alternar exibição"
    >
      {@render iconToggle()}
    </button>
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
      <div class="macro-col">
        <p class="macro-nome">Gordura Sat.</p>
        <div class="macro-anel" style={`background: conic-gradient(${COR_GORDURA} 0% ${larguraBarra(pctMeta(gorduraSaturadaConsumido, gorduraSaturadaMeta))}%, var(--surface-border) ${larguraBarra(pctMeta(gorduraSaturadaConsumido, gorduraSaturadaMeta))}% 100%);`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(gorduraSaturadaConsumido, gorduraSaturadaMeta)}
          </div>
        </div>
      </div>
      <div class="macro-col">
        <p class="macro-nome">Fibras</p>
        <div class="macro-anel" style={`background: conic-gradient(${COR_CARBO} 0% ${larguraBarra(pctMeta(fibraConsumido, fibraMeta))}%, var(--surface-border) ${larguraBarra(pctMeta(fibraConsumido, fibraMeta))}% 100%);`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(fibraConsumido, fibraMeta)}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

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
    -webkit-tap-highlight-color: transparent;
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
  .macros-wrap {
    position: relative;
    padding-right: 40px;
  }
  .toggle-btn {
    position: absolute;
    top: 0;
    right: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn svg {
    width: 16px;
    height: 16px;
  }
  .macros-grid {
    display: flex;
    gap: var(--space-3);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .macros-grid::-webkit-scrollbar {
    display: none;
  }
  .macro-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .macro-nome {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
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
