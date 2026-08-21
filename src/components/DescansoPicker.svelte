<script lang="ts">
  import { untrack } from "svelte";
  import { OPCOES_DESCANSO, formatMinSeg } from "../lib/tempo";

  let {
    nomeExercicio,
    valorAtual,
    onSelecionar,
    onFechar,
  }: {
    nomeExercicio: string;
    valorAtual: number | null;
    onSelecionar: (segundos: number | null) => void;
    onFechar: () => void;
  } = $props();

  let selecionado = $state<number | null>(untrack(() => valorAtual));

  function confirmar() {
    onSelecionar(selecionado);
    onFechar();
  }
</script>

<div class="sheet-overlay" role="presentation" onclick={onFechar}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="sheet-handle"></div>
    <h3>Tempo de Descanso</h3>
    <p class="sub">Tempo de Descanso - {nomeExercicio}</p>
    <div class="opcoes-lista">
      <button class="opcao" class:ativo={selecionado === null} onclick={() => (selecionado = null)}>
        Desativado
      </button>
      {#each OPCOES_DESCANSO as seg (seg)}
        <button class="opcao" class:ativo={selecionado === seg} onclick={() => (selecionado = seg)}>
          {formatMinSeg(seg)}
        </button>
      {/each}
    </div>
    <button class="feito" onclick={confirmar}>Feito</button>
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
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .sheet-handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-border);
    margin: 0 auto var(--space-4);
    flex-shrink: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    text-align: center;
  }
  .sub {
    margin: var(--space-1) 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    text-align: center;
  }
  .opcoes-lista {
    overflow-y: auto;
    margin-bottom: var(--space-4);
  }
  .opcao {
    display: block;
    width: 100%;
    text-align: center;
    padding: var(--space-3);
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .opcao.ativo {
    color: var(--surface-fg);
    font-weight: 600;
    background: var(--surface-bg);
    border-radius: var(--radius-md);
  }
  .feito {
    flex-shrink: 0;
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
