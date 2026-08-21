<script lang="ts">
  import type { Snippet } from "svelte";

  export interface AcaoSheet {
    label: string;
    subtitulo?: string;
    destructive?: boolean;
    icon?: Snippet;
    onSelect: () => void;
  }

  let { titulo, opcoes, onFechar }: { titulo?: string; opcoes: AcaoSheet[]; onFechar: () => void } = $props();
</script>

<div class="sheet-overlay" role="presentation" onclick={onFechar}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="sheet-handle"></div>
    {#if titulo}<h3>{titulo}</h3>{/if}
    {#each opcoes as opcao, i (i)}
      <button
        class="sheet-opcao"
        class:destructive={opcao.destructive}
        onclick={() => {
          opcao.onSelect();
          onFechar();
        }}
      >
        {#if opcao.icon}
          <span class="sheet-icon">{@render opcao.icon()}</span>
        {/if}
        <span class="sheet-opcao-texto">
          <span>{opcao.label}</span>
          {#if opcao.subtitulo}
            <span class="sheet-opcao-subtitulo">{opcao.subtitulo}</span>
          {/if}
        </span>
      </button>
    {/each}
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
    background: var(--surface-card);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: var(--space-3) var(--space-4);
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    box-shadow: var(--shadow-float);
  }
  .sheet-handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-border);
    margin: 0 auto var(--space-4);
  }
  .sheet h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .sheet-opcao {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    padding: var(--space-4) var(--space-1);
    border: none;
    border-bottom: 1px solid var(--surface-border);
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .sheet-opcao:last-child {
    border-bottom: none;
  }
  .sheet-opcao.destructive {
    color: var(--color-danger);
  }
  .sheet-opcao-texto {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sheet-opcao-subtitulo {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .sheet-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    color: inherit;
  }
  .sheet-icon :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
