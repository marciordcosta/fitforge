<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet, { type AcaoSheet } from "../../components/ActionSheet.svelte";
  import type { RefeicaoDia, ItemDiario } from "../../lib/dietaApi";

  let { refeicoes, itens }: { refeicoes: RefeicaoDia[]; itens: ItemDiario[] } = $props();

  let mostrarEscolherRefeicao = $state(false);

  const feitas = $derived(refeicoes.filter((r) => itens.some((i) => i.refeicaoId === r.id)).length);
  const largura = $derived(Math.min(100, refeicoes.length > 0 ? (feitas / refeicoes.length) * 100 : 0));

  function opcoesRefeicoes(): AcaoSheet[] {
    return refeicoes
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => ({ label: r.nome, onSelect: () => navigate(`/dieta/alimentos/refeicao/${r.id}`) }));
  }
</script>

<div class="card" role="button" tabindex="0" onclick={() => navigate("/dieta")} onkeydown={(e) => e.key === "Enter" && navigate("/dieta")}>
  <p class="card-titulo">Refeições</p>
  <p class="valor-principal"><strong>{feitas}</strong> de {refeicoes.length} registradas</p>
  <div class="barra-wrap-grande">
    <div class="barra-grande" style={`width:${largura}%; background:var(--color-secondary);`}></div>
  </div>
  <Button onclick={(e) => { e.stopPropagation(); mostrarEscolherRefeicao = true; }}>Registrar Refeição</Button>
</div>

{#if mostrarEscolherRefeicao}
  <ActionSheet titulo="Escolher refeição" opcoes={opcoesRefeicoes()} onFechar={() => (mostrarEscolherRefeicao = false)} />
{/if}

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
    margin-bottom: var(--space-4);
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
</style>
