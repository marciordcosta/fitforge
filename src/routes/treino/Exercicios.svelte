<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    listExercicios,
    listTreinos,
    correspondeBusca,
    textoBuscavelExercicio,
    distribuicaoMusculosExercicio,
    abreviarMusculo,
    type Exercicio,
  } from "../../lib/treinoApi";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import { PALETA } from "../../components/PieChart.svelte";

  let {
    modoSelecao = false,
    tituloSelecao = "Adicionar Exercício",
    buscaInicial = "",
    excluirIds = [],
    onSelecionar,
    onFechar,
  }: {
    modoSelecao?: boolean;
    tituloSelecao?: string;
    buscaInicial?: string;
    excluirIds?: string[];
    onSelecionar?: (ex: Exercicio) => void | Promise<void>;
    onFechar?: () => void;
  } = $props();

  let exercicios = $state<Exercicio[]>([]);
  let loading = $state(true);
  let mostrarCriarMenu = $state(false);
  let selecionandoId = $state<string | null>(null);

  let busca = $state(untrack(() => buscaInicial));

  /** Primeira rotina (na ordem de exibição das rotinas) que usa cada exercício. */
  let rotinaPorExercicio = $state<Map<string, { id: string; nome: string }>>(new Map());

  async function carregar() {
    loading = true;
    const [exs, treinos] = await Promise.all([listExercicios(), listTreinos()]);
    exercicios = exs;
    const mapa = new Map<string, { id: string; nome: string }>();
    for (const t of treinos) {
      for (const te of t.exercicios) {
        if (!mapa.has(te.exercicio_id)) mapa.set(te.exercicio_id, { id: t.id, nome: t.nome_treino });
      }
    }
    rotinaPorExercicio = mapa;
    loading = false;
  }

  void carregar();

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function distribuicao(ex: Exercicio) {
    return distribuicaoMusculosExercicio(ex).map((m, i) => ({ ...m, cor: PALETA[i % PALETA.length] }));
  }

  const filtrados = $derived(
    exercicios
      .filter((ex) => correspondeBusca(textoBuscavelExercicio(ex), busca))
      .filter((ex) => !modoSelecao || !excluirIds.includes(ex.id)),
  );

  async function selecionar(ex: Exercicio): Promise<void> {
    if (!onSelecionar || selecionandoId) return;
    selecionandoId = ex.id;
    try {
      await onSelecionar(ex);
    } finally {
      selecionandoId = null;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMaisCriar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}
{#snippet iconExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="9" width="4" height="6" rx="1" />
    <rect x="18" y="9" width="4" height="6" rx="1" />
    <line x1="9" y1="9" x2="9" y2="15" />
    <line x1="15" y1="9" x2="15" y2="15" />
    <line x1="6" y1="12" x2="18" y2="12" />
  </svg>
{/snippet}
{#snippet iconMovimento()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 3 21 7 17 11" />
    <path d="M3 7h18" />
    <polyline points="7 13 3 17 7 21" />
    <path d="M21 17H3" />
  </svg>
{/snippet}
{#snippet iconMusculo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
{/snippet}
{#snippet iconAgrupamento()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
{/snippet}
{#snippet iconMaisPeq()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
{/snippet}

{#snippet infoExercicio(ex: Exercicio)}
  <span class="info">
    <span class="nome">{ex.nome}</span>
    {#if !ex.musculos.length}
      <span class="sub">Sem músculo definido</span>
    {:else}
      <span class="musculos-linhas">
        {#each distribuicao(ex) as m (m.nome)}
          <span class="musculo-coluna">
            <span class="musculo-nome-mini">{ex.musculos.length > 1 ? abreviarMusculo(m.nome) : m.nome}</span>
            <span class="musculo-linha-barra">
              <span class="musculo-barra-mini-wrap">
                <span class="musculo-barra-mini" style={`width: ${m.pct}%; background: ${m.cor};`}></span>
              </span>
              <span class="musculo-pct-mini">{m.pct.toFixed(0)}%</span>
            </span>
          </span>
        {/each}
      </span>
    {/if}
  </span>
{/snippet}

<div class="container" class:has-bottom-nav={!modoSelecao} class:modo-selecao={modoSelecao}>
  <div class="header">
    <button
      class="back"
      onclick={() => (modoSelecao ? onFechar?.() : voltar("/treino"))}
      aria-label="Voltar"
    >{@render iconVoltar()}</button>
    <h1>{modoSelecao ? tituloSelecao : "Exercícios"}</h1>
    {#if modoSelecao}
      <span class="header-spacer"></span>
    {:else}
      <button class="criar" onclick={() => (mostrarCriarMenu = true)} aria-label="Criar">{@render iconMaisCriar()}</button>
    {/if}
  </div>

  <input class="search" type="text" placeholder="Procurar exercício" bind:value={busca} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !filtrados.length}
    <p class="muted">Nenhum exercício encontrado.</p>
  {:else}
    <ul class="lista">
      {#each filtrados as ex (ex.id)}
        <li>
          <div class="item">
            {#if modoSelecao}
              <span class="avatar" class:avatar-rotina={rotinaPorExercicio.has(ex.id)}>
                {#if rotinaPorExercicio.has(ex.id)}
                  <span class="avatar-rotina-texto">{rotinaPorExercicio.get(ex.id)?.nome}</span>
                {:else}
                  {iniciais(ex.nome)}
                {/if}
              </span>
              <button class="conteudo-btn" onclick={() => navigate(`/treino/exercicios/${ex.id}`)}>
                {@render infoExercicio(ex)}
              </button>
              <button
                class="selecionar-btn"
                onclick={() => selecionar(ex)}
                disabled={selecionandoId === ex.id}
                aria-label={`Adicionar ${ex.nome}`}
              >
                {@render iconMaisPeq()}
              </button>
            {:else}
              <button
                class="avatar-btn"
                onclick={() => {
                  const rotina = rotinaPorExercicio.get(ex.id);
                  navigate(rotina ? `/treino/rotina/${rotina.id}/ver` : `/treino/exercicios/${ex.id}`);
                }}
                aria-label={rotinaPorExercicio.has(ex.id) ? `Ver rotina ${rotinaPorExercicio.get(ex.id)?.nome}` : ex.nome}
              >
                <span class="avatar" class:avatar-rotina={rotinaPorExercicio.has(ex.id)}>
                  {#if rotinaPorExercicio.has(ex.id)}
                    <span class="avatar-rotina-texto">{rotinaPorExercicio.get(ex.id)?.nome}</span>
                  {:else}
                    {iniciais(ex.nome)}
                  {/if}
                </span>
              </button>
              <button class="conteudo-btn" onclick={() => navigate(`/treino/exercicios/${ex.id}`)}>
                {@render infoExercicio(ex)}
                <span class="chevron">›</span>
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if mostrarCriarMenu}
  <ActionSheet
    onFechar={() => (mostrarCriarMenu = false)}
    opcoes={[
      { label: "Exercício", icon: iconExercicio, onSelect: () => navigate("/treino/exercicios/novo") },
      { label: "Padrão de Movimento", icon: iconMovimento, onSelect: () => navigate("/treino/movimentos") },
      { label: "Grupo Muscular", icon: iconMusculo, onSelect: () => navigate("/treino/musculos") },
      { label: "Agrupamento", icon: iconAgrupamento, onSelect: () => navigate("/treino/agrupamentos") },
    ]}
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
  .container.modo-selecao {
    position: fixed;
    inset: 0;
    /* Precisa ficar acima de qualquer Sheet (z-index 100) e de telas cheias tipo o editor
       completo da rotina (.tela-editor-rotina, z-index 110) — pode abrir a partir de qualquer
       um dos dois, em qualquer ordem no DOM. */
    z-index: 120;
    background: var(--surface-bg);
    overflow-y: auto;
    padding-bottom: var(--space-4);
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
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
  .criar {
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
  .criar svg {
    width: 18px;
    height: 18px;
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-3);
  }
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .avatar-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .conteudo-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-border);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .avatar-rotina {
    border: 2px solid var(--color-primary);
    color: var(--surface-fg);
  }
  .avatar-rotina-texto {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 0 3px;
    font-size: 5px;
    font-weight: 700;
    text-align: center;
  }
  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nome {
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .musculos-linhas {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-1);
  }
  .musculo-coluna {
    flex: 0 0 calc((100% - 3 * var(--space-3)) / 4);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .musculo-nome-mini {
    font-size: 10px;
    color: var(--surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .musculo-linha-barra {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .musculo-barra-mini-wrap {
    flex: 1;
    min-width: 0;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--surface-border);
  }
  .musculo-barra-mini {
    display: block;
    height: 100%;
  }
  .musculo-pct-mini {
    flex-shrink: 0;
    font-size: 9px;
    color: var(--surface-muted);
  }
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
  }
  .selecionar-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .selecionar-btn svg {
    width: 16px;
    height: 16px;
  }
  .selecionar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
