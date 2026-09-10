<script lang="ts">
  let { mensagem, onFechar }: { mensagem: string; onFechar: () => void } = $props();
</script>

<div class="alert-overlay" role="presentation" onclick={onFechar}>
  <div class="alert-card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <p class="alert-mensagem">{mensagem}</p>
    <button class="alert-btn" onclick={onFechar}>OK</button>
  </div>
</div>

<style>
  .alert-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    z-index: 300;
  }
  .alert-card {
    width: 100%;
    max-width: 320px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .alert-mensagem {
    text-align: center;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    margin: 0 0 var(--space-4);
    white-space: pre-line;
  }
  .alert-btn {
    display: block;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
</style>
