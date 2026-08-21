<script lang="ts">
  let {
    titulo,
    textoConfirmar,
    textoCancelar = "Cancelar",
    onConfirmar,
    onCancelar,
  }: {
    titulo: string;
    textoConfirmar: string;
    textoCancelar?: string;
    onConfirmar: () => void;
    onCancelar: () => void;
  } = $props();
</script>

<div class="confirm-overlay" role="presentation" onclick={onCancelar}>
  <div class="confirm-card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <p class="confirm-titulo">{titulo}</p>
    <button class="confirm-btn destructive" onclick={onConfirmar}>{textoConfirmar}</button>
    <button class="confirm-btn" onclick={onCancelar}>{textoCancelar}</button>
  </div>
</div>

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    z-index: 200;
  }
  .confirm-card {
    width: 100%;
    max-width: 320px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .confirm-titulo {
    text-align: center;
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-4);
  }
  .confirm-btn {
    display: block;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    margin-bottom: var(--space-2);
  }
  .confirm-btn:last-child {
    margin-bottom: 0;
  }
  .confirm-btn.destructive {
    color: var(--color-danger);
  }
</style>
