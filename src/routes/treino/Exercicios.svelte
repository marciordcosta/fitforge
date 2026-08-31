<script lang="ts">
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

  let exercicios = $state<Exercicio[]>([]);
  let loading = $state(true);
  let mostrarCriarMenu = $state(false);

  let busca = $state("");

  /** Primeira rotina (na ordem de exibição das rotinas) que usa cada exercício. */
  let rotinaPorExercicio = $state<Map<string, string>>(new Map());

  async function carregar() {
    loading = true;
    const [exs, treinos] = await Promise.all([listExercicios(), listTreinos()]);
    exercicios = exs;
    const mapa = new Map<string, string>();
    for (const t of treinos) {
      for (const te of t.exercicios) {
        if (!mapa.has(te.exercicio_id)) mapa.set(te.exercicio_id, t.nome_treino);
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

  const filtrados = $derived(exercicios.filter((ex) => correspondeBusca(textoBuscavelExercicio(ex), busca)));
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Exercícios</h1>
    <button class="criar" onclick={() => (mostrarCriarMenu = true)} aria-label="Criar">{@render iconMaisCriar()}</button>
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
          <button class="item" onclick={() => navigate(`/treino/exercicios/${ex.id}`)}>
            <span class="avatar" class:avatar-rotina={rotinaPorExercicio.has(ex.id)}>
              {#if rotinaPorExercicio.has(ex.id)}
                <span class="avatar-rotina-texto">{rotinaPorExercicio.get(ex.id)}</span>
              {:else}
                {iniciais(ex.nome)}
              {/if}
            </span>
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
            <span class="chevron">›</span>
          </button>
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
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    cursor: pointer;
    text-align: left;
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
    background: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .avatar-rotina-texto {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding: 0 3px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    word-break: break-word;
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
  .muted {
    color: var(--surface-muted);
  }
</style>
