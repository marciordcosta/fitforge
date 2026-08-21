<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import {
    listTreinos,
    deleteTreino,
    duplicateTreino,
    atualizarOrdemTreinos,
    DIAS_SEMANA_COMPLETO,
    type TreinoComExercicios,
  } from "../../lib/treinoApi";

  let treinos = $state<TreinoComExercicios[]>([]);
  let loading = $state(true);
  let menuAberto = $state<string | null>(null);
  let excluindoId = $state<string | null>(null);

  /** Rotinas com dia informado sobem pro topo, ordenadas pelo dia mais próximo; sem dia, mantém a ordenação manual. */
  function ordenarPorDia(lista: TreinoComExercicios[]): TreinoComExercicios[] {
    const hoje = new Date().getDay();
    const comDia = lista
      .filter((t) => t.dia_semana != null)
      .sort((a, b) => ((a.dia_semana! - hoje + 7) % 7) - ((b.dia_semana! - hoje + 7) % 7));
    const semDia = lista.filter((t) => t.dia_semana == null);
    return [...comDia, ...semDia];
  }

  async function carregar() {
    loading = true;
    treinos = ordenarPorDia(await listTreinos());
    loading = false;
  }

  void carregar();

  function preview(t: TreinoComExercicios): string {
    const nomes = t.exercicios
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => e.exercicio?.nome)
      .filter(Boolean);
    if (!nomes.length) return "Nenhum exercício ainda";
    return nomes.join(", ");
  }

  async function excluir(id: string) {
    excluindoId = null;
    await deleteTreino(id);
    await carregar();
  }

  async function duplicar(id: string) {
    await duplicateTreino(id);
    await carregar();
  }

  // ---------------- Arrastar para reordenar (pressionar e segurar) ----------------

  let arrastandoId = $state<string | null>(null);
  let pressTimer: number | null = null;
  let idPressionado: string | null = null;
  let pointerDownPos: { x: number; y: number } | null = null;
  let moveu = false;
  let pointerTypeAtual = "touch";
  const cardRefs: Record<string, HTMLElement | null> = {};

  function cancelarPress() {
    if (pressTimer != null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function onCardPointerDown(e: PointerEvent, id: string) {
    if ((e.target as HTMLElement).closest("button")) return;
    cancelarPress();
    idPressionado = id;
    moveu = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    pointerTypeAtual = e.pointerType;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      if (moveu) return;
      arrastandoId = id;
      if (navigator.vibrate) navigator.vibrate(15);
    }, 400);
  }

  function onCardPointerCancel() {
    cancelarPress();
    arrastandoId = null;
    idPressionado = null;
    pointerDownPos = null;
    moveu = false;
  }

  /** Detecta se o dedo já se moveu o suficiente pra ser um scroll, não um toque parado. */
  function onCardPointerMoveLocal(e: PointerEvent) {
    if (!pointerDownPos || moveu) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) > 8) {
      moveu = true;
      cancelarPress();
      // No mouse não há conflito com rolagem por toque: já pode arrastar direto.
      if (pointerTypeAtual === "mouse" && idPressionado) {
        arrastandoId = idPressionado;
      }
    }
  }

  function onCardPointerMove(e: PointerEvent) {
    if (arrastandoId === null) return;
    const y = e.clientY;
    const idx = treinos.findIndex((t) => t.id === arrastandoId);
    if (idx === -1) return;
    for (let i = 0; i < treinos.length; i++) {
      if (i === idx) continue;
      const el = cardRefs[treinos[i].id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if ((i < idx && y < meio) || (i > idx && y > meio)) {
        const novos = treinos.slice();
        const [item] = novos.splice(idx, 1);
        novos.splice(i, 0, item);
        treinos = novos;
        break;
      }
    }
  }

  async function onCardPointerUpLocal() {
    cancelarPress();
    if (arrastandoId !== null) {
      arrastandoId = null;
      await atualizarOrdemTreinos(treinos.map((t) => t.id));
    } else if (idPressionado && !moveu) {
      navigate(`/treino/rotina/${idPressionado}/ver`);
    }
    idPressionado = null;
    pointerDownPos = null;
    moveu = false;
  }

  $effect(() => {
    if (arrastandoId === null) return;
    window.addEventListener("pointermove", onCardPointerMove);
    window.addEventListener("pointerup", onCardPointerUpLocal);
    return () => {
      window.removeEventListener("pointermove", onCardPointerMove);
      window.removeEventListener("pointerup", onCardPointerUpLocal);
    };
  });
</script>

{#snippet iconEditar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconDuplicar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Treino</h1>
  </div>

  <div class="quick-actions">
    <button class="quick-btn" onclick={() => navigate("/treino/exercicios")}>Exercícios</button>
    <button class="quick-btn" onclick={() => navigate("/treino/distribuicao")}>Distribuição</button>
  </div>

  <div class="rotinas-header">
    <strong>Rotinas</strong>
    <button class="icon-btn" onclick={() => navigate("/treino/rotina/nova")} aria-label="Nova rotina">+</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !treinos.length}
    <p class="muted">Nenhuma rotina ainda. Crie a primeira.</p>
  {:else}
    {#each treinos as treino (treino.id)}
      <div
        class="card-wrap"
        class:arrastando={arrastandoId === treino.id}
        bind:this={cardRefs[treino.id]}
        onpointerdown={(e) => onCardPointerDown(e, treino.id)}
        onpointermove={onCardPointerMoveLocal}
        onpointerup={onCardPointerUpLocal}
        onpointercancel={onCardPointerCancel}
        role="presentation"
      >
        <div class="rotina-item">
          <div class="card-header">
            <h2>
              {treino.nome_treino}
              {#if treino.dia_semana != null}
                <span class="dia-tag">{DIAS_SEMANA_COMPLETO[treino.dia_semana]}</span>
              {/if}
            </h2>
            <button class="icon-btn" onclick={() => (menuAberto = treino.id)} aria-label="Mais opções">⋮</button>
          </div>
          <p class="preview">{preview(treino)}</p>
          <Button onclick={() => navigate(`/treino/log/${treino.id}`)}>Iniciar Rotina</Button>
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if menuAberto !== null}
  {@const treinoId = menuAberto}
  <ActionSheet
    titulo={treinos.find((t) => t.id === treinoId)?.nome_treino}
    onFechar={() => (menuAberto = null)}
    opcoes={[
      { label: "Editar Rotina", icon: iconEditar, onSelect: () => navigate(`/treino/rotina/${treinoId}`) },
      { label: "Duplicar Rotina", icon: iconDuplicar, onSelect: () => duplicar(treinoId) },
      { label: "Excluir Rotina", icon: iconExcluir, destructive: true, onSelect: () => (excluindoId = treinoId) },
    ]}
  />
{/if}

{#if excluindoId !== null}
  {@const idExcluir = excluindoId}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir esta rotina?"
    textoConfirmar="Excluir Rotina"
    onConfirmar={() => excluir(idExcluir)}
    onCancelar={() => (excluindoId = null)}
  />
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-3);
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .rotinas-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    line-height: 1;
    cursor: pointer;
  }
  .card-wrap {
    touch-action: none;
    user-select: none;
    -webkit-user-drag: none;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }
  .card-wrap.arrastando {
    transform: scale(1.02);
    opacity: 0.85;
    box-shadow: var(--shadow-float);
    position: relative;
    z-index: 10;
  }
  .rotina-item {
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .card-header h2 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .dia-tag {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    margin-left: var(--space-1);
  }
  .preview {
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
