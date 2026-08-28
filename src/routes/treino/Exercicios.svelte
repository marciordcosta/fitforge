<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    listExercicios,
    listPadroesMovimento,
    listMusculos,
    type Exercicio,
    type PadraoMovimento,
    type Musculo,
  } from "../../lib/treinoApi";
  import ActionSheet from "../../components/ActionSheet.svelte";

  let exercicios = $state<Exercicio[]>([]);
  let padroes = $state<PadraoMovimento[]>([]);
  let musculos = $state<Musculo[]>([]);
  let loading = $state(true);
  let mostrarCriarMenu = $state(false);

  let busca = $state("");
  let filtroPadrao = $state("");
  let filtroMusculo = $state("");

  async function carregar() {
    loading = true;
    [exercicios, padroes, musculos] = await Promise.all([
      listExercicios(),
      listPadroesMovimento(),
      listMusculos(),
    ]);
    loading = false;
  }

  void carregar();

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function subtitulo(ex: Exercicio): string {
    if (!ex.musculos.length) return "Sem músculo definido";
    return ex.musculos
      .slice()
      .sort((a, b) => b.peso_contribuicao - a.peso_contribuicao)
      .map((m) => m.musculo?.nome)
      .join(", ");
  }

  const filtrados = $derived(
    exercicios.filter((ex) => {
      if (busca.trim() && !ex.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
      if (filtroPadrao && ex.padrao_id !== filtroPadrao) return false;
      if (filtroMusculo && !ex.musculos.some((m) => m.musculo_id === filtroMusculo)) return false;
      return true;
    }),
  );
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
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Exercícios</h1>
    <button class="criar" onclick={() => (mostrarCriarMenu = true)} aria-label="Criar">{@render iconMaisCriar()}</button>
  </div>

  <input class="search" type="text" placeholder="Procurar exercício" bind:value={busca} />

  <div class="filters">
    <select
      bind:value={filtroPadrao}
      onchange={() => {
        if (filtroPadrao === "__gerenciar__") {
          filtroPadrao = "";
          navigate("/treino/movimentos");
        }
      }}
    >
      <option value="">Todo padrão</option>
      {#each padroes as p (p.id)}
        <option value={p.id}>{p.nome}</option>
      {/each}
      <option value="__gerenciar__" class="opcao-gerenciar">Gerenciar Movimentos</option>
    </select>
    <select bind:value={filtroMusculo}>
      <option value="">Todos os músculos</option>
      {#each musculos as m (m.id)}
        <option value={m.id}>{m.nome}</option>
      {/each}
    </select>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !filtrados.length}
    <p class="muted">Nenhum exercício encontrado.</p>
  {:else}
    <ul class="lista">
      {#each filtrados as ex (ex.id)}
        <li>
          <button class="item" onclick={() => navigate(`/treino/exercicios/${ex.id}`)}>
            <span class="avatar">{iniciais(ex.nome)}</span>
            <span class="info">
              <span class="nome">{ex.nome}</span>
              <span class="sub">{subtitulo(ex)}</span>
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
      { label: "Movimento", icon: iconMovimento, onSelect: () => navigate("/treino/movimentos/novo") },
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
  .filters {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .filters select {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-2) 30px var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background-color: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
    font-family: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa0ab' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 16px;
  }
  .opcao-gerenciar {
    color: var(--color-primary);
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
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
