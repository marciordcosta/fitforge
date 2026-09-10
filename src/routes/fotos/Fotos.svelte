<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import FotosGaleria from "./FotosGaleria.svelte";

  const segmentos = $derived(router.path.replace(/^\/fotos\/?/, "").split("/").filter(Boolean));
</script>

{#snippet carregando()}
  <p class="tab-carregando">Carregando…</p>
{/snippet}

{#if segmentos[0] === "comparar" && segmentos[1] && segmentos[2]}
  {#await import("./FotoComparar.svelte")}
    {@render carregando()}
  {:then { default: FotoComparar }}
    <FotoComparar fotoId1={segmentos[1]} fotoId2={segmentos[2]} />
  {/await}
{:else}
  <FotosGaleria />
{/if}

<style>
  .tab-carregando {
    text-align: center;
    color: var(--surface-muted);
    padding-top: var(--space-6);
  }
</style>
