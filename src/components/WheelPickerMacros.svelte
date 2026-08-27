<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "./Sheet.svelte";

  interface Opcao {
    valor: number;
    label: string;
  }
  interface ColunaMacro {
    chave: string;
    titulo: string;
    cor: string;
    opcoes: Opcao[];
    valorAtual: number;
    kcalPorGrama: number;
  }

  let {
    titulo,
    colunas,
    onSelecionar,
    onFechar,
  }: {
    titulo: string;
    colunas: ColunaMacro[];
    onSelecionar: (valores: Record<string, number>) => void;
    onFechar: () => void;
  } = $props();

  const ALTURA_ITEM = 40;
  /** Usada só como altura mínima (3 itens visíveis) antes de medir o wrap de verdade — a roda cresce com o modal esticado. */
  const ALTURA_MINIMA = ALTURA_ITEM * 3;

  function indiceMaisProximo(opcoes: Opcao[], valor: number): number {
    let melhor = 0;
    let menorDist = Infinity;
    opcoes.forEach((o, i) => {
      const dist = Math.abs(o.valor - valor);
      if (dist < menorDist) {
        menorDist = dist;
        melhor = i;
      }
    });
    return melhor;
  }

  let indices = $state(untrack(() => colunas.map((c) => indiceMaisProximo(c.opcoes, c.valorAtual))));
  let listaEls: (HTMLDivElement | undefined)[] = [];
  /** Altura real de cada roda, medida via bind:clientHeight — o padding vertical da lista é recalculado a partir dela, pra centralizar o item selecionado não importa a altura do modal. */
  let alturasWrap = $state<number[]>([]);

  function paddingVertical(idx: number): number {
    const altura = alturasWrap[idx] ?? ALTURA_MINIMA;
    return Math.max(0, (altura - ALTURA_ITEM) / 2);
  }

  function posicionarInicial(el: HTMLDivElement, idx: number) {
    el.scrollTop = indices[idx] * ALTURA_ITEM;
  }

  function aoRolar(idx: number) {
    const el = listaEls[idx];
    if (!el) return;
    const novoIndice = Math.round(el.scrollTop / ALTURA_ITEM);
    if (novoIndice !== indices[idx] && novoIndice >= 0 && novoIndice < colunas[idx].opcoes.length) {
      indices[idx] = novoIndice;
      if (navigator.vibrate) navigator.vibrate(5);
    }
  }

  function selecionarIndice(idx: number, i: number) {
    listaEls[idx]?.scrollTo({ top: i * ALTURA_ITEM, behavior: "smooth" });
  }

  function opacidade(idx: number, i: number): number {
    return Math.max(1 - Math.abs(i - indices[idx]) * 0.4, 0.25);
  }

  const caloriasTotais = $derived(
    Math.round(colunas.reduce((acc, c, idx) => acc + c.opcoes[indices[idx]].valor * c.kcalPorGrama, 0)),
  );

  function confirmar() {
    const valores: Record<string, number> = {};
    colunas.forEach((c, idx) => (valores[c.chave] = c.opcoes[indices[idx]].valor));
    onSelecionar(valores);
    onFechar();
  }
</script>

<Sheet {titulo} {onFechar}>
  <div class="wrapper">
    <p class="total-cal">≈ <strong>{caloriasTotais}</strong> kcal</p>
    <div class="colunas">
      {#each colunas as coluna, idx (coluna.chave)}
        <div class="coluna">
          <p class="coluna-titulo" style={`color:${coluna.cor}`}>{coluna.titulo}</p>
          <div class="roda-wrap" bind:clientHeight={alturasWrap[idx]} style={`min-height: ${ALTURA_MINIMA}px;`}>
            <div class="roda-marcador" style={`height: ${ALTURA_ITEM}px;`}></div>
            <div
              class="roda-lista"
              bind:this={listaEls[idx]}
              onscroll={() => aoRolar(idx)}
              use:posicionarInicial={idx}
              style={`padding: ${paddingVertical(idx)}px 0;`}
            >
              {#each coluna.opcoes as opcao, i (i)}
                <button
                  class="roda-item"
                  class:ativo={i === indices[idx]}
                  style={`height: ${ALTURA_ITEM}px; opacity: ${opacidade(idx, i)};`}
                  onclick={() => selecionarIndice(idx, i)}
                >
                  {opcao.label}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
    <button class="feito" onclick={confirmar}>Feito</button>
  </div>
</Sheet>

<style>
  .wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .total-cal {
    flex-shrink: 0;
    margin: 0 0 var(--space-3);
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .total-cal strong {
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
  }
  .colunas {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .coluna {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .coluna-titulo {
    flex-shrink: 0;
    margin: 0 0 var(--space-1);
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
  .roda-wrap {
    flex: 1;
    min-height: 0;
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
    padding: 0;
  }
  .roda-item.ativo {
    color: var(--surface-fg);
    font-weight: 700;
  }
  .feito {
    flex-shrink: 0;
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
