<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { criarRefeicaoDia } from "../../lib/dietaApi";

  let {
    data,
    onFechar,
    onCriada,
  }: {
    data: string;
    onFechar: () => void;
    onCriada: (id: string) => void;
  } = $props();

  let nome = $state("");
  let salvando = $state(false);

  async function criar() {
    if (!nome.trim()) return;
    salvando = true;
    try {
      const id = await criarRefeicaoDia(data, nome.trim());
      onCriada(id);
    } catch (err) {
      alert("Erro ao criar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Refeição Avulsa" {onFechar}>
  <input class="nome-input" type="text" placeholder="Nome da refeição" bind:value={nome} />
  <Button onclick={criar} disabled={salvando || !nome.trim()}>Criar Refeição</Button>
</Sheet>

<style>
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
</style>
