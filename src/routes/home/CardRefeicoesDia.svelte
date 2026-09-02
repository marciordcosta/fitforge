<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import type { RefeicaoDia, ItemDiario } from "../../lib/dietaApi";

  let { refeicoes, itens }: { refeicoes: RefeicaoDia[]; itens: ItemDiario[] } = $props();

  const feitas = $derived(refeicoes.filter((r) => itens.some((i) => i.refeicaoId === r.id)).length);
  const largura = $derived(Math.min(100, refeicoes.length > 0 ? (feitas / refeicoes.length) * 100 : 0));
</script>

<button type="button" class="card" onclick={() => navigate("/dieta")}>
  <p class="card-titulo">Refeições</p>
  <p class="valor-principal"><strong>{feitas}</strong> de {refeicoes.length} registradas</p>
  <div class="barra-wrap-grande">
    <div class="barra-grande" style={`width:${largura}%; background:var(--color-secondary);`}></div>
  </div>
</button>

<style>
  .card {
    display: block;
    width: 100%;
    background: var(--surface-card);
    border: none;
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .valor-principal {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-lg);
  }
  .barra-wrap-grande {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
</style>
