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

  function trocarUnidade(nova: string) {
    const novaUnidade = nova as "porcao" | "grama";
    if (novaUnidade === unidade) return;
    const total = totalNaUnidade(quantidade, unidade);
    unidade = novaUnidade;
    quantidade = novaUnidade === "porcao" ? total / porcaoPadraoQtd : total;
  }

  function salvar() {
    if (quantidade > 0) onSalvar(quantidade, unidade);
  }
</script>

<div class="overlay" role="presentation" onclick={onCancelar}>
  <div class="card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <p class="titulo">Quanto?</p>

    <div class="linha-qtd">
      <input class="qtd-input" type="number" inputmode="decimal" step="any" min="0" bind:value={quantidade} />
      <span class="rotulo">Porção(ões) de</span>
    </div>

    <select class="unidade-select" value={unidade} onchange={(e) => trocarUnidade(e.currentTarget.value)}>
      <option value="porcao">{porcaoPadraoQtd} {porcaoPadraoUnidade} (porção completa)</option>
      <option value="grama">1 {porcaoPadraoUnidade} (fracionada)</option>
    </select>

    <div class="acoes">
      <button class="btn-texto" onclick={onCancelar}>Cancelar</button>
      <button class="btn-texto destaque" onclick={salvar}>Salvar</button>
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
    max-width: 340px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .titulo {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0 0 var(--space-4);
  }
  .linha-qtd {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
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
  }
  .rotulo {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .unidade-select {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-5);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .acoes {
    display: flex;
    justify-content: flex-end;
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
