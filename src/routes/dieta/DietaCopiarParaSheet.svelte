<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { toISODate, parseISODate } from "../../lib/dates";
  import { encontrarOuCriarRefeicaoDia, copiarItensEntreRefeicoes } from "../../lib/dietaApi";

  let {
    refeicaoOrigemId,
    nomeAtual,
    dataAtual,
    onFechar,
    onCopiado,
  }: {
    refeicaoOrigemId: string;
    nomeAtual: string;
    dataAtual: string;
    onFechar: () => void;
    onCopiado: (destinoId: string) => void;
  } = $props();

  function amanha(iso: string): string {
    const d = parseISODate(iso);
    return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  }

  let nome = $state(untrack(() => nomeAtual));
  let dia = $state(untrack(() => amanha(dataAtual)));
  let salvando = $state(false);

  async function copiar() {
    if (!nome.trim() || !dia) return;
    salvando = true;
    try {
      const destinoId = await encontrarOuCriarRefeicaoDia(dia, nome.trim());
      await copiarItensEntreRefeicoes(refeicaoOrigemId, destinoId);
      onCopiado(destinoId);
    } catch (err) {
      alert("Erro ao copiar refeição: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Copiar para" {onFechar}>
  <div class="campo">
    <label for="cp-nome">Refeição</label>
    <input id="cp-nome" type="text" bind:value={nome} />
  </div>
  <div class="campo">
    <label for="cp-dia">Dia</label>
    <input id="cp-dia" type="date" bind:value={dia} />
  </div>
  <Button onclick={copiar} disabled={salvando || !nome.trim() || !dia}>Copiar</Button>
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
    color-scheme: dark;
  }
</style>
