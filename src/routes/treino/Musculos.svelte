<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { listMusculos, correspondeBusca, type Musculo } from "../../lib/treinoApi";

  let musculos = $state<Musculo[]>([]);
  let loading = $state(true);
  let busca = $state("");

  async function carregar() {
    loading = true;
    musculos = (await listMusculos()).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    loading = false;
  }

  void carregar();

  const filtrados = $derived(
    musculos.filter((m) => correspondeBusca(`${m.nome} ${m.agrupamento?.nome ?? ""}`, busca)),
  );
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/exercicios")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Músculos</h1>
    <button class="criar" onclick={() => navigate("/treino/musculos/novo")} aria-label="Novo músculo">
      {@render iconMais()}
    </button>
  </div>

  <input class="search" type="text" placeholder="Procurar músculo" bind:value={busca} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !musculos.length}
    <p class="muted">Nenhum músculo cadastrado.</p>
  {:else if !filtrados.length}
    <p class="muted">Nenhum músculo encontrado.</p>
  {:else}
    <ul class="lista">
      {#each filtrados as m (m.id)}
        <li>
          <button class="item" onclick={() => navigate(`/treino/musculos/${m.id}`)}>
            <span class="nome">{m.nome}</span>
            <span class="chevron">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

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
    justify-content: space-between;
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
  .nome {
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
