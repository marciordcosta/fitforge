<script lang="ts">
  import { untrack } from "svelte";

  interface Opcao {
    valor: string;
    label: string;
  }

  let {
    opcoes,
    valorAtual,
    onMudar,
    vazio = "Nenhuma opção",
  }: {
    opcoes: Opcao[];
    valorAtual: string;
    onMudar: (valor: string) => void;
    vazio?: string;
  } = $props();

  const ALTURA_ITEM = 40;
  const ITENS_VISIVEIS = 3;
  const PADDING_VERTICAL = (ALTURA_ITEM * (ITENS_VISIVEIS - 1)) / 2;

  function indiceDe(lista: Opcao[], valor: string): number {
    const i = lista.findIndex((o) => o.valor === valor);
    return i < 0 ? 0 : i;
  }

  let listaEl = $state<HTMLDivElement | undefined>();
  let indiceSelecionado = $state(untrack(() => indiceDe(opcoes, valorAtual)));
  let opcoesAnteriores = untrack(() => opcoes);

  function posicionarInicial(el: HTMLDivElement) {
    el.scrollTop = indiceSelecionado * ALTURA_ITEM;
  }

  /** Recarga em cascata: quando o pai troca a lista dessa coluna (ex: mudou o dia, recarrega as refeições daquele dia), volta pro topo. */
  $effect(() => {
    if (opcoes !== opcoesAnteriores) {
      opcoesAnteriores = opcoes;
      const i = indiceDe(opcoes, valorAtual);
      indiceSelecionado = i;
      listaEl?.scrollTo({ top: i * ALTURA_ITEM, behavior: "auto" });
    }
  });

  function aoRolar() {
    if (!listaEl) return;
    const novoIndice = Math.round(listaEl.scrollTop / ALTURA_ITEM);
    if (novoIndice !== indiceSelecionado && novoIndice >= 0 && novoIndice < opcoes.length) {
      indiceSelecionado = novoIndice;
      if (navigator.vibrate) navigator.vibrate(5);
      onMudar(opcoes[novoIndice].valor);
    }
  }

  function selecionarIndice(i: number) {
    listaEl?.scrollTo({ top: i * ALTURA_ITEM, behavior: "smooth" });
    indiceSelecionado = i;
    onMudar(opcoes[i].valor);
  }

  function opacidade(i: number): number {
    return Math.max(1 - Math.abs(i - indiceSelecionado) * 0.4, 0.25);
  }
</script>

{#if opcoes.length}
  <div class="roda-wrap" style={`height: ${ALTURA_ITEM * ITENS_VISIVEIS}px;`}>
    <div class="roda-marcador" style={`height: ${ALTURA_ITEM}px;`}></div>
    <div
      class="roda-lista"
      bind:this={listaEl}
      onscroll={aoRolar}
      use:posicionarInicial
      style={`padding: ${PADDING_VERTICAL}px 0;`}
    >
      {#each opcoes as opcao, i (opcao.valor)}
        <button
          class="roda-item"
          class:ativo={i === indiceSelecionado}
          style={`height: ${ALTURA_ITEM}px; opacity: ${opacidade(i)};`}
          onclick={() => selecionarIndice(i)}
        >
          {opcao.label}
        </button>
      {/each}
    </div>
  </div>
{:else}
  <p class="vazio">{vazio}</p>
{/if}

<style>
  .roda-wrap {
    position: relative;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent);
  }
  .roda-marcador {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: var(--surface-bg);
    border-radius: var(--radius-md);
    pointer-events: none;
  }
  .roda-lista {
    position: relative;
    height: 100%;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    scrollbar-width: none;
  }
  .roda-lista::-webkit-scrollbar {
    display: none;
  }
  .roda-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    scroll-snap-align: center;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    padding: 0 var(--space-1);
    text-align: center;
  }
  .roda-item.ativo {
    color: var(--surface-fg);
    font-weight: 700;
  }
  .vazio {
    margin: 0;
    padding: var(--space-3) 0;
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
</style>
