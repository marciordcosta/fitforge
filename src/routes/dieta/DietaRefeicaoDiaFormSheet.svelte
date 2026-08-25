<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { criarRefeicaoDia, SUGESTOES_REFEICAO } from "../../lib/dietaApi";

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

<Sheet titulo="Nova Refeição" {onFechar}>
  <input class="nome-input" type="text" placeholder="Nome da refeição" bind:value={nome} />

  <div class="sugestoes">
    {#each SUGESTOES_REFEICAO as s (s)}
      <button class="sugestao" onclick={() => (nome = s)}>{s}</button>
    {/each}
  </div>

  <Button onclick={criar} disabled={salvando || !nome.trim()}>Criar Refeição</Button>
</Sheet>

<style>
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .sugestoes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .sugestao {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
</style>
