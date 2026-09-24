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
    pesoAtual,
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
    pesoAtual: number;
  } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  type ModoExibicao = "restante" | "absoluto" | "porPeso";
  let modo = $state<ModoExibicao>("restante");

  function proximoModo(atual: ModoExibicao): ModoExibicao {
    if (atual === "restante") return "absoluto";
    if (atual === "absoluto") return "porPeso";
    return "restante";
  }

  function gPorKg(valor: number): string {
    return pesoAtual > 0 ? (valor / pesoAtual).toFixed(1).replace(".", ",") : "—";
  }

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

  /** Hachura diagonal usada pra marcar "quanto passou" quando um macro estoura a meta (mesma ideia
   * de DiarioAlimentar.svelte, duplicada aqui — componente próprio, sem acesso ao dietaApi). */
  function hachuraEstouro(cor: string): string {
    return `repeating-linear-gradient(45deg, ${cor} 0px, ${cor} 3px, transparent 3px, transparent 6px)`;
  }

  function fundoBarraComEstouro(valor: number, meta: number, cor: string): string {
    const pct = pctMeta(valor, meta);
    if (pct <= 100 || meta <= 0) return cor;
    const solidPct = (meta / valor) * 100;
    return `linear-gradient(to right, ${cor} 0%, ${cor} ${solidPct}%, transparent ${solidPct}%), ${hachuraEstouro(cor)}`;
  }

  function fundoAnelComEstouro(valor: number, meta: number, cor: string): string {
    const pct = pctMeta(valor, meta);
    if (pct <= 100 || meta <= 0) {
      return `conic-gradient(${cor} 0% ${larguraBarra(pct)}%, var(--surface-border) ${larguraBarra(pct)}% 100%)`;
    }
    const solidPct = (meta / valor) * 100;
    return `conic-gradient(${cor} 0% ${solidPct}%, transparent ${solidPct}% 100%), ${hachuraEstouro(cor)}`;
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
  {#if modo === "restante" && passouMeta(consumido, meta)}
    <strong>{(consumido - meta).toFixed(0)}g</strong>
    <span class="macro-meta">acima</span>
  {:else if modo === "restante"}
    <strong>{restante(consumido, meta).toFixed(0)}g</strong>
    <span class="macro-meta">rest.</span>
  {:else if modo === "absoluto"}
    <strong>{consumido.toFixed(0)}g</strong>
    <span class="macro-meta">/{meta.toFixed(0)}</span>
  {:else}
    <strong>{gPorKg(consumido)}</strong>
    <span class="macro-meta">g/kg</span>
  {/if}
{/snippet}

<div class="card" role="button" tabindex="0" onclick={abrirDieta} onkeydown={(e) => e.key === "Enter" && abrirDieta()}>
  <p class="card-titulo">Calorias</p>
  <div class="calorias-linha">
    {#if modo === "absoluto"}
      <span class="calorias-valor"><strong>{caloriasConsumido.toFixed(0)}</strong> cal <span class="calorias-meta">/ {caloriasMeta.toFixed(0)}</span></span>
      <span class="calorias-restantes">
        {#if caloriasPassou}
          <strong>{(caloriasConsumido - caloriasMeta).toFixed(0)}</strong> acima
        {:else}
          <strong>{restante(caloriasConsumido, caloriasMeta).toFixed(0)}</strong> restantes
        {/if}
      </span>
    {:else}
      <span class="calorias-valor">
        {#if caloriasPassou}
          <strong>{(caloriasConsumido - caloriasMeta).toFixed(0)}</strong> acima
        {:else}
          <strong>{restante(caloriasConsumido, caloriasMeta).toFixed(0)}</strong> restantes
        {/if}
      </span>
      <span class="calorias-restantes">{caloriasConsumido.toFixed(0)} cal <span class="calorias-meta">/ {caloriasMeta.toFixed(0)}</span></span>
    {/if}
  </div>
  <div class="barra-wrap-grande">
    <div
      class="barra-grande"
      style={`width:${larguraBarra(pctMeta(caloriasConsumido, caloriasMeta))}%; background:${fundoBarraComEstouro(caloriasConsumido, caloriasMeta, "var(--color-secondary)")};`}
    ></div>
  </div>

  <div class="macros-wrap">
    <button
      type="button"
      class="toggle-btn"
      onclick={(e) => {
        e.stopPropagation();
        modo = proximoModo(modo);
      }}
      aria-label="Alternar exibição"
    >
      {@render iconToggle()}
    </button>
    <div class="macros-grid">
      <div class="macro-col">
        <p class="macro-nome">Carb</p>
        <div class="macro-anel" style={`background: ${fundoAnelComEstouro(carboidratoConsumido, carboidratoMeta, COR_CARBO)};`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(carboidratoConsumido, carboidratoMeta)}
          </div>
        </div>
      </div>
      <div class="macro-col">
        <p class="macro-nome">Gorduras</p>
        <div class="macro-anel" style={`background: ${fundoAnelComEstouro(gorduraConsumido, gorduraMeta, COR_GORDURA)};`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(gorduraConsumido, gorduraMeta)}
          </div>
        </div>
      </div>
      <div class="macro-col">
        <p class="macro-nome">Proteínas</p>
        <div class="macro-anel" style={`background: ${fundoAnelComEstouro(proteinaConsumido, proteinaMeta, COR_PROTEINA)};`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(proteinaConsumido, proteinaMeta)}
          </div>
        </div>
      </div>
      <div class="macro-col">
        <p class="macro-nome">Gordura Sat.</p>
        <div class="macro-anel" style={`background: ${fundoAnelComEstouro(gorduraSaturadaConsumido, gorduraSaturadaMeta, COR_GORDURA)};`}>
          <div class="macro-anel-centro">
            {@render anelCentroMacro(gorduraSaturadaConsumido, gorduraSaturadaMeta)}
          </div>
        </div>
      </div>
      <div class="macro-col">
        <p class="macro-nome">Fibras</p>
        <div class="macro-anel" style={`background: ${fundoAnelComEstouro(fibraConsumido, fibraMeta, COR_CARBO)};`}>
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
