<script lang="ts" generics="T">
  import { untrack } from "svelte";
  import Sheet from "./Sheet.svelte";

  interface Opcao<T> {
    valor: T;
    label: string;
  }

  let {
    titulo,
    subtitulo,
    opcoes,
    valorAtual,
    onSelecionar,
    onFechar,
  }: {
    titulo: string;
    subtitulo?: string;
    opcoes: Opcao<T>[];
    valorAtual: T;
    onSelecionar: (valor: T) => void;
    onFechar: () => void;
  } = $props();

  const ALTURA_ITEM = 44;
  const ITENS_VISIVEIS = 3;
  const PADDING_VERTICAL = (ALTURA_ITEM * (ITENS_VISIVEIS - 1)) / 2;

  let indiceInicial = untrack(() => opcoes.findIndex((o) => o.valor === valorAtual));
  if (indiceInicial < 0) indiceInicial = 0;

  let indiceSelecionado = $state(indiceInicial);
  let listaEl = $state<HTMLDivElement | undefined>();

  function posicionarInicial(el: HTMLDivElement) {
    el.scrollTop = indiceInicial * ALTURA_ITEM;
  }

  function aoRolar() {
    if (!listaEl) return;
    const novoIndice = Math.round(listaEl.scrollTop / ALTURA_ITEM);
    if (novoIndice !== indiceSelecionado && novoIndice >= 0 && novoIndice < opcoes.length) {
      indiceSelecionado = novoIndice;
      if (navigator.vibrate) navigator.vibrate(5);
    }
  }

  function selecionarIndice(i: number) {
    listaEl?.scrollTo({ top: i * ALTURA_ITEM, behavior: "smooth" });
  }

  function opacidade(i: number): number {
    return Math.max(1 - Math.abs(i - indiceSelecionado) * 0.4, 0.25);
  }

  function confirmar() {
    onSelecionar(opcoes[indiceSelecionado].valor);
    onFechar();
  }
</script>

<Sheet {titulo} {onFechar}>
  {#if subtitulo}<p class="sub">{subtitulo}</p>{/if}
  <div class="roda-wrap" style={`height: ${ALTURA_ITEM * ITENS_VISIVEIS}px;`}>
    <div class="roda-marcador" style={`height: ${ALTURA_ITEM}px;`}></div>
    <div class="roda-lista" bind:this={listaEl} onscroll={aoRolar} use:posicionarInicial style={`padding: ${PADDING_VERTICAL}px 0;`}>
      {#each opcoes as opcao, i (i)}
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
  <button class="feito" onclick={confirmar}>Feito</button>
</Sheet>

<style>
  .sub {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    text-align: center;
  }
  .roda-wrap {
    position: relative;
    overflow: hidden;
    margin: var(--space-3) 0 var(--space-4);
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
    font-size: var(--font-size-lg);
    font-family: inherit;
    cursor: pointer;
  }
  .roda-item.ativo {
    color: var(--surface-fg);
    font-weight: 700;
  }
  .feito {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
</style>
