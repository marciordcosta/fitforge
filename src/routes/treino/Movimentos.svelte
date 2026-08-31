<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { listPadroesMovimentoComMusculos, correspondeBusca, type PadraoMovimentoComMusculos } from "../../lib/treinoApi";

  let padroes = $state<PadraoMovimentoComMusculos[]>([]);
  let loading = $state(true);
  let erroCarregar = $state<string | null>(null);
  let busca = $state("");

  async function carregar() {
    loading = true;
    erroCarregar = null;
    try {
      padroes = await listPadroesMovimentoComMusculos();
    } catch (e) {
      erroCarregar = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function subtitulo(p: PadraoMovimentoComMusculos): string {
    if (!p.musculos.length) return "Sem músculo definido";
    return p.musculos.map((m) => m.nome).join(", ");
  }

  const filtrados = $derived(padroes.filter((p) => correspondeBusca(`${p.nome} ${subtitulo(p)}`, busca)));
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
    <h1>Movimentos</h1>
    <button class="criar" onclick={() => navigate("/treino/movimentos/novo")} aria-label="Novo movimento">
      {@render iconMais()}
    </button>
  </div>

  <input class="search" type="text" placeholder="Procurar movimento" bind:value={busca} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erroCarregar}
    <p class="erro">Erro ao carregar: {erroCarregar}</p>
  {:else if !padroes.length}
    <p class="muted">Nenhum movimento cadastrado.</p>
  {:else if !filtrados.length}
    <p class="muted">Nenhum movimento encontrado.</p>
  {:else}
    <ul class="lista">
      {#each filtrados as p (p.id)}
        <li>
          <button class="item" onclick={() => navigate(`/treino/movimentos/${p.id}`)}>
            <span class="info">
              <span class="nome">{p.nome}</span>
              <span class="sub">{subtitulo(p)}</span>
            </span>
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
  .erro {
    color: var(--color-danger);
  }
</style>
