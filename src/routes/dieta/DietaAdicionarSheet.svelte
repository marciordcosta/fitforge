<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import { buscarAlimentos, type Alimento, type Refeicao } from "../../lib/dietaApi";

  let {
    refeicao,
    data,
    onFechar,
  }: {
    refeicao: Refeicao;
    data: string;
    onFechar: () => void;
  } = $props();

  let termo = $state("");
  let resultados = $state<Alimento[]>([]);
  let buscando = $state(false);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    if (termo.trim().length < 2) {
      resultados = [];
      return;
    }
    timeoutBusca = setTimeout(async () => {
      buscando = true;
      try {
        resultados = await buscarAlimentos(termo);
      } finally {
        buscando = false;
      }
    }, 300);
  }

  function selecionar(alimento: Alimento) {
    onFechar();
    navigate(`/dieta/alimento/${alimento.id}/${data}/${refeicao}`);
  }
</script>

<Sheet titulo="Adicionar Alimento" {onFechar}>
  <input class="busca-input" type="text" placeholder="Buscar alimento…" bind:value={termo} oninput={aoDigitar} />

  {#if buscando}
    <p class="muted">Buscando…</p>
  {:else if termo.trim().length >= 2 && !resultados.length}
    <p class="muted">Nenhum alimento encontrado.</p>
  {:else}
    {#each resultados as alimento (alimento.id)}
      <button class="resultado-item" onclick={() => selecionar(alimento)}>
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
