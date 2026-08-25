<script lang="ts">
  import { untrack } from "svelte";
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

  const pesoEquivalente = $derived(
    unidade === "porcao" ? `${porcaoPadraoQtd} ${porcaoPadraoUnidade}` : `1 ${porcaoPadraoUnidade}`,
  );
</script>

{#snippet iconAlternar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}

<div class="overlay" role="presentation" onclick={onFechar}>
  <div class="card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <p class="titulo">Quanto?</p>
    <p class="rotulo">Porção(ões)</p>

    <div class="caixa-wrap">
      <input class="caixa-input" type="number" inputmode="decimal" step="any" min="0" bind:value={quantidade} />
    </div>

    <div class="peso-linha">
      <span class="peso-texto">{pesoEquivalente}</span>
      <button class="icone-alternar" onclick={alternarUnidade} aria-label="Alternar unidade">
        {@render iconAlternar()}
      </button>
    </div>

    <div class="acoes">
      <div class="acao-item">
        <Button variant="secondary" onclick={onFechar}>Cancelar</Button>
      </div>
      <div class="acao-item">
        <Button onclick={salvar} disabled={quantidade <= 0}>Salvar</Button>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    z-index: 200;
  }
  .card {
    width: 100%;
    max-width: 320px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .titulo {
    text-align: center;
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0 0 var(--space-4);
  }
  .rotulo {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin: 0 0 var(--space-2);
  }
  .caixa-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-3);
  }
  .caixa-input {
    width: 96px;
    text-align: center;
    padding: var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    font-weight: 700;
  }
  .peso-linha {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .peso-texto {
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
    width: 16px;
    height: 16px;
  }
  .acoes {
    display: flex;
    gap: var(--space-3);
  }
  .acao-item {
    flex: 1;
  }
</style>
