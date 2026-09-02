<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet, { type AcaoSheet } from "../../components/ActionSheet.svelte";
  import { getLayoutHome, salvarLayoutHome, CATALOGO_CARDS, type HomeCardTipo } from "../../lib/homeApi";

  let itens = $state<HomeCardTipo[]>([]);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let salvando = $state(false);
  let mostrarAdicionar = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      itens = await getLayoutHome();
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function titulo(tipo: HomeCardTipo): string {
    return CATALOGO_CARDS.find((c) => c.tipo === tipo)?.titulo ?? tipo;
  }

  function remover(tipo: HomeCardTipo) {
    itens = itens.filter((t) => t !== tipo);
  }

  function opcoesAdicionar(): AcaoSheet[] {
    return CATALOGO_CARDS.filter((c) => !itens.includes(c.tipo)).map((c) => ({
      label: c.titulo,
      subtitulo: c.descricao,
      onSelect: () => {
        itens = [...itens, c.tipo];
      },
    }));
  }

  async function salvar() {
    salvando = true;
    try {
      await salvarLayoutHome(itens);
      navigate("/");
    } catch (err) {
      alert("Erro ao salvar: " + (err as Error).message);
      salvando = false;
    }
  }

  // --- Arrastar pra reordenar (mesmo mecanismo de DietaRefeicoesGerenciar.svelte, sem agrupamento) ---
  let itemRefs: (HTMLLIElement | null)[] = [];
  let arrastandoIndex = $state<number | null>(null);
  let arrastarOffsetY = $state(0);
  let alturaLinha = 0;
  let startY = 0;
  const ATRASO_ARRASTAR_MS = 250;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutArrastar: ReturnType<typeof setTimeout> | undefined;
  let pointerDownX = 0;
  let pointerDownY = 0;

  function aoPointerDownHandle(e: PointerEvent, index: number) {
    const el = itemRefs[index];
    if (!el) return;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    window.addEventListener("pointermove", aoPointerMoveEsperando);
    window.addEventListener("pointerup", aoPointerUpEsperando);
    timeoutArrastar = setTimeout(() => iniciarArrasto(el, index), ATRASO_ARRASTAR_MS);
  }

  function cancelarEsperaArrastar() {
    clearTimeout(timeoutArrastar);
    timeoutArrastar = undefined;
    window.removeEventListener("pointermove", aoPointerMoveEsperando);
    window.removeEventListener("pointerup", aoPointerUpEsperando);
  }

  function aoPointerMoveEsperando(e: PointerEvent) {
    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarEsperaArrastar();
    }
  }

  function aoPointerUpEsperando() {
    cancelarEsperaArrastar();
  }

  function iniciarArrasto(el: HTMLLIElement, index: number) {
    cancelarEsperaArrastar();
    alturaLinha = el.getBoundingClientRect().height;
    startY = pointerDownY;
    arrastandoIndex = index;
    arrastarOffsetY = 0;
    if (navigator.vibrate) navigator.vibrate(10);
    window.addEventListener("pointermove", aoPointerMove);
    window.addEventListener("pointerup", aoPointerUp);
  }

  function aoPointerMove(e: PointerEvent) {
    if (arrastandoIndex === null || !alturaLinha) return;
    const delta = e.clientY - startY;
    arrastarOffsetY = delta;
    const passos = Math.round(delta / alturaLinha);
    if (passos !== 0) {
      const novoIndex = Math.min(itens.length - 1, Math.max(0, arrastandoIndex + passos));
      if (novoIndex !== arrastandoIndex) {
        const copia = itens.slice();
        const [item] = copia.splice(arrastandoIndex, 1);
        copia.splice(novoIndex, 0, item);
        itens = copia;
        arrastandoIndex = novoIndex;
        startY = e.clientY;
        arrastarOffsetY = 0;
      }
    }
  }

  function aoPointerUp() {
    window.removeEventListener("pointermove", aoPointerMove);
    window.removeEventListener("pointerup", aoPointerUp);
    arrastandoIndex = null;
    arrastarOffsetY = 0;
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconArrastar()}
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Cards da Início</h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else}
    <p class="ajuda">Arraste pra reordenar. Toque no ✕ pra remover um card.</p>

    {#if !itens.length}
      <p class="muted">Nenhum card selecionado.</p>
    {:else}
      <ul class="lista">
        {#each itens as tipo, i (tipo)}
          <li
            class="linha"
            class:arrastando={arrastandoIndex === i}
            bind:this={itemRefs[i]}
            style={arrastandoIndex === i ? `transform: translateY(${arrastarOffsetY}px);` : ""}
          >
            <button class="handle" onpointerdown={(e) => aoPointerDownHandle(e, i)} aria-label="Reordenar">
              {@render iconArrastar()}
            </button>
            <span class="nome">{titulo(tipo)}</span>
            <button class="remover-btn" onclick={() => remover(tipo)} aria-label={`Remover ${titulo(tipo)}`}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if itens.length < CATALOGO_CARDS.length}
      <button type="button" class="add-btn" onclick={() => (mostrarAdicionar = true)}>+ Adicionar card</button>
    {/if}

    <Button onclick={salvar} disabled={salvando}>Salvar</Button>
  {/if}
</div>

{#if mostrarAdicionar}
  <ActionSheet titulo="Adicionar card" opcoes={opcoesAdicionar()} onFechar={() => (mostrarAdicionar = false)} />
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
  }
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .back svg {
    width: 18px;
    height: 18px;
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .ajuda {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-3);
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .lista {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .linha {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--surface-border);
    position: relative;
  }
  .linha:last-child {
    border-bottom: none;
  }
  .linha.arrastando {
    z-index: 10;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    border-bottom-color: transparent;
  }
  .handle {
    flex-shrink: 0;
    width: 32px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-muted);
    cursor: grab;
    touch-action: none;
  }
  .handle svg {
    width: 18px;
    height: 18px;
  }
  .nome {
    flex: 1;
    min-width: 0;
    padding: var(--space-3) 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .remover-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-2);
  }
  .add-btn {
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
</style>
