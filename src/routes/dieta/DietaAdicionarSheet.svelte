<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import {
    buscarAlimentos,
    buscarReceitas,
    adicionarReceitaAoDiario,
    type Alimento,
    type ReceitaResumo,
  } from "../../lib/dietaApi";

  let {
    refeicaoId,
    data,
    onFechar,
    onAdicionado,
  }: {
    refeicaoId: string;
    data: string;
    onFechar: () => void;
    onAdicionado?: () => void;
  } = $props();

  let termo = $state("");
  let resultadosAlimentos = $state<Alimento[]>([]);
  let resultadosReceitas = $state<ReceitaResumo[]>([]);
  let buscando = $state(false);
  let adicionandoReceita = $state<string | null>(null);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    if (termo.trim().length < 2) {
      resultadosAlimentos = [];
      resultadosReceitas = [];
      return;
    }
    timeoutBusca = setTimeout(async () => {
      buscando = true;
      try {
        [resultadosAlimentos, resultadosReceitas] = await Promise.all([buscarAlimentos(termo), buscarReceitas(termo)]);
      } finally {
        buscando = false;
      }
    }, 300);
  }

  function selecionarAlimento(alimento: Alimento) {
    onFechar();
    navigate(`/dieta/alimento/${alimento.id}/${data}/${refeicaoId}`);
  }

  async function selecionarReceita(receita: ReceitaResumo) {
    adicionandoReceita = receita.id;
    try {
      await adicionarReceitaAoDiario(receita.id, data, refeicaoId);
      onAdicionado?.();
      onFechar();
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
      adicionandoReceita = null;
    }
  }

  const semResultados = $derived(termo.trim().length >= 2 && !resultadosAlimentos.length && !resultadosReceitas.length);
</script>

<Sheet titulo="Adicionar Alimento" {onFechar}>
  <input class="busca-input" type="text" placeholder="Buscar alimento ou refeição…" bind:value={termo} oninput={aoDigitar} />

  {#if buscando}
    <p class="muted">Buscando…</p>
  {:else if semResultados}
    <p class="muted">Nada encontrado.</p>
  {:else}
    {#each resultadosReceitas as receita (receita.id)}
      <button class="resultado-item" onclick={() => selecionarReceita(receita)} disabled={adicionandoReceita != null}>
        <span class="resultado-nome">
          {receita.nome}
          <span class="resultado-tag">Refeição</span>
        </span>
        <span class="resultado-cal">{adicionandoReceita === receita.id ? "Adicionando…" : "Adicionar"}</span>
      </button>
    {/each}
    {#each resultadosAlimentos as alimento (alimento.id)}
      <button class="resultado-item" onclick={() => selecionarAlimento(alimento)}>
        <span class="resultado-nome">
          {alimento.nome}
          {#if alimento.marca}<span class="resultado-marca">{alimento.marca}</span>{/if}
        </span>
        <span class="resultado-cal">{alimento.caloriasPorPorcao.toFixed(0)} kcal / {alimento.porcaoPadraoQtd}{alimento.porcaoPadraoUnidade}</span>
      </button>
    {/each}
  {/if}
</Sheet>

<style>
  .busca-input {
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
  .resultado-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    padding: var(--space-3) var(--space-1);
    border: none;
    border-bottom: 1px solid var(--surface-border);
    background: none;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .resultado-item:last-child {
    border-bottom: none;
  }
  .resultado-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .resultado-nome {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resultado-marca {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resultado-tag {
    font-size: 11px;
    color: var(--color-primary);
    font-weight: 600;
    text-transform: uppercase;
  }
  .resultado-cal {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    text-align: right;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
