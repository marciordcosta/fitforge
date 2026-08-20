<script lang="ts">
  import Card from "../components/Card.svelte";
  import { auth } from "../lib/auth.svelte";
</script>

<div class="container has-bottom-nav">
  <Card>
    <h1>Olá{auth.user?.email ? "," : ""} {auth.user?.email ?? ""}</h1>
    <p>fitforge está no ar. Treino, Peso, Fotos e Dieta chegam nas próximas fases.</p>
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
