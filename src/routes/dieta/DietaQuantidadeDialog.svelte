<script lang="ts">
  import { untrack } from "svelte";

  let {
    quantidadeInicial,
    unidadeInicial,
    porcaoPadraoQtd,
    porcaoPadraoUnidade,
    onSalvar,
    onCancelar,
  }: {
    quantidadeInicial: number;
    unidadeInicial: "porcao" | "grama";
    porcaoPadraoQtd: number;
    porcaoPadraoUnidade: string;
    onSalvar: (quantidade: number, unidade: "porcao" | "grama") => void;
    onCancelar: () => void;
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
    if (quantidade > 0) onSalvar(quantidade, unidade);
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

<div class="overlay" role="presentation" onclick={onCancelar}>
  <div class="card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <p class="titulo">Quanto?</p>

    <div class="linha-qtd">
      <input class="qtd-input" type="number" inputmode="decimal" step="any" min="0" bind:value={quantidade} />
      <span class="rotulo">Porção(ões) de</span>
    </div>

    <p class="unidade-texto">{unidade === "porcao" ? `${porcaoPadraoQtd} ${porcaoPadraoUnidade} (porção completa)` : `1 ${porcaoPadraoUnidade} (fracionada)`}</p>

    <div class="acoes">
      <button class="icone-alternar" onclick={alternarUnidade} aria-label="Alternar unidade">
        {@render iconAlternar()}
      </button>
      <div class="botoes-texto">
        <button class="btn-texto" onclick={onCancelar}>Cancelar</button>
        <button class="btn-texto destaque" onclick={salvar}>Salvar</button>
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
    max-width: 260px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .titulo {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0 0 var(--space-4);
    text-align: center;
  }
  .linha-qtd {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .qtd-input {
    width: 70px;
    padding: var(--space-1) 0;
    border: none;
    border-bottom: 2px solid var(--color-primary);
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    font-weight: 700;
    text-align: center;
  }
  .rotulo {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .unidade-texto {
    margin: 0 0 var(--space-5);
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
  }
  .acoes {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .icone-alternar {
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
    padding: var(--space-1);
    display: flex;
  }
  .icone-alternar svg {
    width: 20px;
    height: 20px;
  }
  .botoes-texto {
    display: flex;
    gap: var(--space-4);
  }
  .btn-texto {
    background: none;
    border: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-1);
  }
  .btn-texto.destaque {
    color: var(--color-primary);
  }
</style>
