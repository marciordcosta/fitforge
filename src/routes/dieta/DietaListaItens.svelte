<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getAlimento,
    atualizarItemDiario,
    removerItemDiario,
    moverItemDiario,
    getRefeicoesDoDia,
    type ItemDiario,
    type Alimento,
    type RefeicaoDia,
  } from "../../lib/dietaApi";

  /** Lista de alimentos de uma refeição, com editar quantidade/excluir/mover — usada tanto na tela
   * da refeição (DietaRefeicaoVisualizar) quanto nos cards expandidos do Diário (DiarioAlimentar),
   * pra nunca ter duas implementações divergentes da mesma interação. */
  let {
    itens,
    refeicaoId,
    dataRefeicao,
    onMudou,
  }: {
    itens: ItemDiario[];
    refeicaoId: string;
    dataRefeicao: string;
    onMudou: () => void;
  } = $props();

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }
  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  let itemEditando = $state<ItemDiario | null>(null);
  let alimentoEditando = $state<Alimento | null>(null);
  let itemParaRemover = $state<ItemDiario | null>(null);
  /** Menu aberto ao segurar um item (Mover/Excluir) — a exclusão em si continua passando pelo
   * ConfirmDialog de itemParaRemover, só a abertura desse menu que muda. */
  let itemMenu = $state<ItemDiario | null>(null);
  /** Quando não-nulo, o ActionSheet "Mover para" está aberto pra este item. */
  let itemParaMover = $state<ItemDiario | null>(null);
  let opcoesMoverPara = $state<RefeicaoDia[]>([]);
  let processando = $state(false);

  async function abrirItem(item: ItemDiario) {
    try {
      alimentoEditando = await getAlimento(item.alimentoId);
      itemEditando = item;
    } catch (err) {
      alert("Erro ao carregar alimento: " + (err as Error).message);
    }
  }

  function abrirDetalheItem(item: ItemDiario) {
    navigate(`/dieta/item/${item.id}`);
  }

  async function aoSalvarQuantidadeItem(quantidade: number) {
    if (!itemEditando || !alimentoEditando) return;
    processando = true;
    try {
      await atualizarItemDiario(itemEditando.id, alimentoEditando, quantidade, refeicaoId, quantidade !== itemEditando.quantidade);
      itemEditando = null;
      alimentoEditando = null;
      onMudou();
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao atualizar item: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  /** Tempo segurando o card parado antes do toque virar "pressionar" (mover pra outra refeição) — evita disparar sem querer num toque rápido/rolagem. */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownItem(e: PointerEvent, item: ItemDiario) {
    pressionarX = e.clientX;
    pressionarY = e.clientY;
    pressionouLongo = false;
    window.addEventListener("pointermove", aoPointerMovePressionar);
    window.addEventListener("pointerup", aoPointerUpPressionar);
    timeoutPressionar = setTimeout(() => {
      pressionouLongo = true;
      cancelarPressionar();
      if (navigator.vibrate) navigator.vibrate(10);
      itemMenu = item;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuItem(e: MouseEvent, item: ItemDiario) {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    itemMenu = item;
  }

  function cancelarPressionar() {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarPressionar();
    }
  }

  function aoPointerUpPressionar() {
    cancelarPressionar();
  }

  function aoClickItem(item: ItemDiario) {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    void abrirItem(item);
  }

  async function remover() {
    if (!itemParaRemover) return;
    processando = true;
    try {
      await removerItemDiario(itemParaRemover.id);
      itemParaRemover = null;
      onMudou();
    } catch (err) {
      alert("Erro ao excluir alimento: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  /** Refeições do MESMO dia pra mover o item — busca na hora (não fica em cache), já que o
   * usuário pode ter criado uma refeição avulsa nova desde que essa tela abriu. */
  async function abrirMoverItem(item: ItemDiario): Promise<void> {
    itemMenu = null;
    try {
      const todas = await getRefeicoesDoDia(dataRefeicao);
      const opcoes = todas.filter((r) => r.id !== refeicaoId);
      if (!opcoes.length) {
        alert("Não há outra refeição hoje pra mover.");
        return;
      }
      opcoesMoverPara = opcoes;
      itemParaMover = item;
    } catch (err) {
      alert("Erro ao carregar refeições: " + (err as Error).message);
    }
  }

  async function moverItemPara(destinoId: string): Promise<void> {
    if (!itemParaMover) return;
    const item = itemParaMover;
    itemParaMover = null;
    try {
      await moverItemDiario(item.id, destinoId);
      onMudou();
      mostrarToast("Movido");
    } catch (err) {
      alert("Erro ao mover alimento: " + (err as Error).message);
    }
  }
</script>

{#snippet iconInfo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
{/snippet}
{#snippet iconMover()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M9 13h6M12 10l3 3-3 3" />
  </svg>
{/snippet}
{#snippet iconLixeira()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
{/snippet}

{#if !itens.length}
  <p class="muted">Nenhum alimento adicionado ainda.</p>
{:else}
  {#each itens as item (item.id)}
    {@const pctItem = pctMeta(item.calorias, totalCalorias)}
    <button
      class="item-card"
      onpointerdown={(e) => aoPointerDownItem(e, item)}
      onclick={() => aoClickItem(item)}
      oncontextmenu={(e) => aoContextMenuItem(e, item)}
    >
      <div class="item-info">
        <p class="item-nome">{item.nome}</p>
        <p class="item-qtd">
          <strong class="item-qtd-valor">{item.quantidade}{item.unidade}</strong>
          <span class="item-qtd-detalhe">· {item.calorias.toFixed(0)} kcal · {pctItem.toFixed(0)}% da refeição</span>
        </p>
        <div class="item-barra-wrap">
          <div class="item-barra" style={`width:${larguraBarra(pctItem)}%;`}></div>
        </div>
      </div>
      <span
        class="item-detalhe"
        role="button"
        tabindex="0"
        onclick={(e) => { e.stopPropagation(); abrirDetalheItem(item); }}
        onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); abrirDetalheItem(item); } }}
        aria-label="Detalhes do alimento"
      >
        {@render iconInfo()}
      </span>
    </button>
  {/each}
{/if}

{#if itemEditando && alimentoEditando}
  <DietaQuantidadeDialog
    titulo={itemEditando.nome}
    quantidadeInicial={itemEditando.quantidade}
    porcaoPadraoUnidade={itemEditando.unidade}
    onSalvar={aoSalvarQuantidadeItem}
    onFechar={() => { itemEditando = null; alimentoEditando = null; }}
  />
{/if}

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo={`Tem certeza de que quer excluir "${itemParaRemover.nome}"?`}
    textoConfirmar="Excluir"
    onConfirmar={remover}
    onCancelar={() => (itemParaRemover = null)}
  />
{/if}

{#if itemMenu}
  <ActionSheet
    titulo={itemMenu.nome}
    onFechar={() => (itemMenu = null)}
    opcoes={[
      { label: "Mover", icon: iconMover, onSelect: () => abrirMoverItem(itemMenu!) },
      { label: "Excluir", icon: iconLixeira, destructive: true, onSelect: () => { itemParaRemover = itemMenu; itemMenu = null; } },
    ]}
  />
{/if}

{#if itemParaMover}
  <ActionSheet
    titulo="Mover para"
    onFechar={() => (itemParaMover = null)}
    opcoes={opcoesMoverPara.map((r) => ({ label: r.nome, onSelect: () => moverItemPara(r.id) }))}
  />
{/if}

<style>
  .item-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-2);
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    /* Segurar pra excluir não pode abrir o menu de copiar/selecionar do Android. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .item-info {
    flex: 1;
    min-width: 0;
  }
  .item-nome {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-qtd {
    margin: 2px 0 0;
  }
  .item-qtd-valor {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .item-qtd-detalhe {
    font-size: 12px;
    color: var(--surface-muted);
  }
  .item-barra-wrap {
    width: 85%;
    height: 4px;
    margin-top: var(--space-2);
    background: var(--surface-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .item-barra {
    height: 100%;
    border-radius: 3px;
    background: var(--color-primary);
  }
  .item-detalhe {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
    cursor: pointer;
  }
  .item-detalhe svg {
    width: 18px;
    height: 18px;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
