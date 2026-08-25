<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { buscarAlimentos, adicionarItemDiario, type Alimento, type Refeicao } from "../../lib/dietaApi";

  let {
    refeicao,
    data,
    onFechar,
    onSalvo,
  }: {
    refeicao: Refeicao;
    data: string;
    onFechar: () => void;
    onSalvo: () => void;
  } = $props();

  let termo = $state("");
  let resultados = $state<Alimento[]>([]);
  let buscando = $state(false);
  let selecionado = $state<Alimento | null>(null);
  let quantidade = $state<number | null>(null);
  let salvando = $state(false);

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
    selecionado = alimento;
    quantidade = alimento.porcaoPadraoQtd;
  }

  function voltarBusca() {
    selecionado = null;
    quantidade = null;
  }

  const fator = $derived(selecionado && quantidade != null ? quantidade / selecionado.porcaoPadraoQtd : 0);
  const caloriasPreview = $derived(selecionado ? selecionado.caloriasPorPorcao * fator : 0);
  const proteinaPreview = $derived(selecionado ? selecionado.proteinaG * fator : 0);
  const gorduraPreview = $derived(selecionado ? selecionado.gorduraG * fator : 0);
  const carboidratoPreview = $derived(selecionado ? selecionado.carboidratoG * fator : 0);

  async function salvar() {
    if (!selecionado || quantidade == null || quantidade <= 0) return;
    salvando = true;
    try {
      await adicionarItemDiario({ alimento: selecionado, data, refeicao, quantidade });
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao adicionar alimento: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo={selecionado ? selecionado.nome : "Adicionar Alimento"} {onFechar}>
  {#if !selecionado}
    <input
      class="busca-input"
      type="text"
      placeholder="Buscar alimento…"
      bind:value={termo}
      oninput={aoDigitar}
    />

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
  {:else}
    <div class="campo">
      <label for="qtd-input">Quantidade ({selecionado.porcaoPadraoUnidade})</label>
      <input id="qtd-input" type="number" inputmode="decimal" step="1" bind:value={quantidade} />
    </div>

    <div class="preview">
      <p class="preview-cal">{caloriasPreview.toFixed(0)} kcal</p>
      <p class="preview-macros">
        P: {proteinaPreview.toFixed(1)}g · G: {gorduraPreview.toFixed(1)}g · C: {carboidratoPreview.toFixed(1)}g
      </p>
    </div>

    <div class="acoes">
      <button class="trocar" onclick={voltarBusca}>Trocar alimento</button>
      <Button onclick={salvar} disabled={salvando || quantidade == null || quantidade <= 0}>Adicionar</Button>
    </div>
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
  .preview {
    text-align: center;
    margin-bottom: var(--space-4);
  }
  .preview-cal {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }
  .preview-macros {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .acoes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .trocar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
