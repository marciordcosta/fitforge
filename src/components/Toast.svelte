<script lang="ts">
  import { toast } from "../lib/toast.svelte";
</script>

{#if toast.mensagem}
  <div class="toast">{toast.mensagem}</div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--bottom-nav-height, 0px) + var(--space-4));
    transform: translateX(-50%);
    background: var(--surface-card);
    color: var(--surface-fg);
    border: 1px solid var(--surface-border);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
    font-size: var(--font-size-sm);
    font-weight: 600;
    z-index: 400;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
