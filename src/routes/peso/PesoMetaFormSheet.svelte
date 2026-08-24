<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import {
    getMeta,
    getUltimoPeso,
    salvarMetaPercentual,
    salvarMetaManutencao,
    type PesoMeta,
  } from "../../lib/pesoApi";

  let {
    tipo,
    onFechar,
    onSalvo,
  }: {
    tipo: "ganho" | "perda" | "manutencao";
    onFechar: () => void;
    onSalvo: () => void;
  } = $props();

  const titulo = $derived(tipo === "ganho" ? "Meta de Ganho" : tipo === "perda" ? "Meta de Perda" : "Meta de Manutenção");

  let valor = $state<number | null>(null);
  let carregando = $state(true);
  let salvando = $state(false);

  async function carregar() {
    carregando = true;
    try {
      if (tipo === "manutencao") {
        const metaAtual: PesoMeta | null = await getMeta();
        valor = metaAtual?.tipo === "manutencao" ? metaAtual.pesoManutencao : await getUltimoPeso();
      } else {
        const metaAtual = await getMeta();
        const sinalEsperado = tipo === "ganho" ? 1 : -1;
        if (metaAtual?.tipo === "percentual" && metaAtual.percentual != null && Math.sign(metaAtual.percentual) === sinalEsperado) {
          valor = Math.abs(metaAtual.percentual);
        }
      }
    } finally {
      carregando = false;
    }
  }

  void carregar();

  async function salvar() {
    if (valor == null) return;
    salvando = true;
    try {
      if (tipo === "manutencao") {
        await salvarMetaManutencao(valor);
      } else {
        const sinal = tipo === "ganho" ? 1 : -1;
        await salvarMetaPercentual(sinal * Math.abs(valor));
      }
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao salvar meta: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet {titulo} {onFechar}>
  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else if tipo === "manutencao"}
    <div class="campo">
      <label for="meta-input">Peso de manutenção (kg)</label>
      <input id="meta-input" type="number" inputmode="decimal" step="0.1" placeholder="-" bind:value={valor} />
    </div>
  {:else}
    <div class="campo">
      <label for="meta-input">Percentual semanal (%)</label>
      <input id="meta-input" type="number" inputmode="decimal" step="0.1" placeholder="-" bind:value={valor} />
    </div>
  {/if}

  <Button onclick={salvar} disabled={salvando || carregando || valor == null}>Salvar Meta</Button>
</Sheet>

<style>
  .campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .campo label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
