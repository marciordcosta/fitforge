<script lang="ts">
  import Card from "../components/Card.svelte";

  let { titulo }: { titulo: string } = $props();
</script>

<div class="container has-bottom-nav">
  <Card>
    <h1>{titulo}</h1>
    <p>Em construção — chega nas próximas fases do plano.</p>
  </Card>
</div>

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  h1 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-2);
  }
  p {
    color: var(--surface-muted);
    margin: 0;
  }
</style>
