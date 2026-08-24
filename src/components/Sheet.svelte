<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    titulo,
    onFechar,
    children,
  }: {
    titulo?: string;
    onFechar: () => void;
    children: Snippet;
  } = $props();

  let sheetEl = $state<HTMLDivElement | undefined>();
  let alturaArrasto = $state<number | null>(null);

  const ALTURA_FECHAR = 120;

  function iniciarArraste(e: PointerEvent) {
    if (!sheetEl) return;
    const startY = e.clientY;
    const startHeight = sheetEl.getBoundingClientRect().height;
    const maxima = window.innerHeight * 0.92;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    function mover(ev: PointerEvent) {
      const delta = startY - ev.clientY;
      alturaArrasto = Math.min(Math.max(startHeight + delta, 0), maxima);
    }
    function soltar() {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      if (alturaArrasto != null && alturaArrasto < ALTURA_FECHAR) {
        onFechar();
      }
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }
</script>

<div class="sheet-overlay" role="presentation" onclick={onFechar}>
  <div
    class="sheet"
    bind:this={sheetEl}
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    style={alturaArrasto != null ? `height: ${alturaArrasto}px; max-height: ${alturaArrasto}px;` : ""}
  >
    <div class="sheet-handle-wrap" onpointerdown={iniciarArraste} role="presentation">
      <span class="sheet-handle"></span>
    </div>
    <div class="sheet-conteudo">
      {#if titulo}<h3>{titulo}</h3>{/if}
      {@render children()}
    </div>
  </div>
</div>

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
  }
  .sheet {
    width: 100%;
    max-width: 520px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-card);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: var(--shadow-float);
  }
  .sheet-handle-wrap {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    padding: var(--space-3) 0;
    touch-action: none;
    cursor: grab;
  }
  .sheet-handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-border);
  }
  .sheet-conteudo {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  }
  .sheet-conteudo :global(h3) {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-base);
    text-align: center;
  }
</style>
