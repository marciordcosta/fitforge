<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";

  let {
    quantidadeInicial,
    unidadeInicial,
    porcaoPadraoQtd,
    porcaoPadraoUnidade,
    onSalvar,
    onFechar,
  }: {
    quantidadeInicial: number;
    unidadeInicial: "porcao" | "grama";
    porcaoPadraoQtd: number;
    porcaoPadraoUnidade: string;
    onSalvar: (quantidade: number, unidade: "porcao" | "grama") => void;
    onFechar: () => void;
  } = $props();

  let quantidade = $state(untrack(() => quantidadeInicial));
  let unidade = $state(untrack(() => unidadeInicial));

  function totalNaUnidade(qtd: number, un: "porcao" | "grama"): number {
    return un === "porcao" ? qtd * porcaoPadraoQtd : qtd;
  }

  function alternarUnidade() {
    const novaUnidade = unidade === "porcao" ? "grama" : "porcao";
    const total = totalNaUnidade(quantidade, unidade);
    unidade = novaUnidade;
    quantidade = novaUnidade === "porcao" ? total / porcaoPadraoQtd : total;
  }

  function salvar() {
    if (quantidade > 0) {
      onSalvar(quantidade, unidade);
    }
  }
</script>

{#snippet iconAlternar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}

<Sheet titulo="Quanto?" {onFechar}>
  <div class="campo">
    <label for="qtd-input">Porção(ões) de</label>
    <div class="qtd-linha">
      <input id="qtd-input" class="qtd-input" type="number" inputmode="decimal" step="any" min="0" bind:value={quantidade} />
      <span class="unidade-texto">{unidade === "porcao" ? `${porcaoPadraoQtd} ${porcaoPadraoUnidade}` : `1 ${porcaoPadraoUnidade}`}</span>
      <button class="icone-alternar" onclick={alternarUnidade} aria-label="Alternar unidade">
        {@render iconAlternar()}
      </button>
    </div>
  </div>

  <div class="acoes">
    <div class="acao-item">
      <Button variant="secondary" onclick={onFechar}>Cancelar</Button>
    </div>
    <div class="acao-item">
      <Button onclick={salvar} disabled={quantidade <= 0}>Salvar</Button>
    </div>
  </div>
</Sheet>

<style>
  .campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .campo label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .qtd-linha {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
  }
  .qtd-input {
    width: 50px;
    padding: 0;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 400;
  }
  .unidade-texto {
    flex: 1;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .icone-alternar {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
    padding: 0;
    display: flex;
  }
  .icone-alternar svg {
    width: 18px;
    height: 18px;
  }
  .acoes {
    display: flex;
    gap: var(--space-3);
  }
  .acao-item {
    flex: 1;
  }
</style>
