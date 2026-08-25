<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { getRefeicoesDoDia, copiarItensEntreRefeicoes, type RefeicaoDia } from "../../lib/dietaApi";

  let {
    refeicaoDestinoId,
    dataAtual,
    onFechar,
    onCopiado,
  }: {
    refeicaoDestinoId: string;
    dataAtual: string;
    onFechar: () => void;
    onCopiado: () => void;
  } = $props();

  let dia = $state(untrack(() => dataAtual));
  let opcoes = $state<RefeicaoDia[]>([]);
  let origemId = $state("");
  let carregandoOpcoes = $state(true);
  let salvando = $state(false);

  async function carregarOpcoes() {
    carregandoOpcoes = true;
    const todas = await getRefeicoesDoDia(dia);
    opcoes = todas.filter((r) => r.id !== refeicaoDestinoId);
    origemId = opcoes[0]?.id ?? "";
    carregandoOpcoes = false;
  }

  void carregarOpcoes();

  function aoMudarDia(novoDia: string) {
    dia = novoDia;
    void carregarOpcoes();
  }

  async function copiar() {
    if (!origemId) return;
    salvando = true;
    try {
      await copiarItensEntreRefeicoes(origemId, refeicaoDestinoId);
      onCopiado();
    } catch (err) {
      alert("Erro ao copiar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Copiar de" {onFechar}>
  <div class="campo">
    <label for="cd-dia">Dia</label>
    <input id="cd-dia" type="date" value={dia} onchange={(e) => aoMudarDia(e.currentTarget.value)} />
  </div>
  <div class="campo">
    <label for="cd-refeicao">Refeição</label>
    {#if carregandoOpcoes}
      <p class="muted">Carregando…</p>
    {:else if !opcoes.length}
      <p class="muted">Nenhuma outra refeição nesse dia.</p>
    {:else}
      <select id="cd-refeicao" bind:value={origemId}>
        {#each opcoes as r (r.id)}
          <option value={r.id}>{r.nome}</option>
        {/each}
      </select>
    {/if}
  </div>
  <Button onclick={copiar} disabled={salvando || !origemId}>Copiar</Button>
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
  .campo input,
  .campo select {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
