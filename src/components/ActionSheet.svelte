<script lang="ts">
  import type { Snippet } from "svelte";
  import Sheet from "./Sheet.svelte";

  export interface AcaoSheet {
    label: string;
    subtitulo?: string;
    valor?: string;
    destructive?: boolean;
    disabled?: boolean;
    icon?: Snippet;
    onSelect: () => void;
  }

  let {
    titulo,
    opcoes,
    onFechar,
    acaoTitulo,
  }: { titulo?: string; opcoes: AcaoSheet[]; onFechar: () => void; acaoTitulo?: Snippet } = $props();
</script>

<Sheet {titulo} {onFechar} {acaoTitulo}>
  {#each opcoes as opcao, i (i)}
    <button
      class="sheet-opcao"
      class:destructive={opcao.destructive}
      disabled={opcao.disabled}
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
      {#if opcao.valor}
        <span class="sheet-opcao-valor">{opcao.valor}</span>
      {/if}
    </button>
  {/each}
</Sheet>

<style>
  .sheet-opcao {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    padding: var(--space-4) var(--space-1);
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .sheet-opcao.destructive {
    color: var(--color-danger);
  }
  .sheet-opcao:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .sheet-opcao-texto {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .sheet-opcao-subtitulo {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .sheet-opcao-valor {
    flex-shrink: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
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
