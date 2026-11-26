<script lang="ts">
  /** Quadrados de carregamento (ver .skeleton em tokens.css) no lugar do texto "Carregando…":
   * reservam espaço de cartões em vez de uma linha de texto, então o conteúdo que chega depois não
   * "explode" a tela de uma linha pra várias. */
  let { linhas = 3, altura = 76 }: { linhas?: number; altura?: number } = $props();
</script>

<div class="blocos" role="status" aria-label="Carregando">
  {#each Array.from({ length: linhas }) as _, i (i)}
    <div class="skeleton bloco" style={`height:${altura}px`}></div>
  {/each}
</div>

<style>
  .blocos {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .bloco {
    width: 100%;
    border-radius: var(--radius-lg);
  }
</style>
