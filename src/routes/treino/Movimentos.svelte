<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { listPadroesMovimentoComMusculos, type PadraoMovimentoComMusculos } from "../../lib/treinoApi";

  let padroes = $state<PadraoMovimentoComMusculos[]>([]);
  let loading = $state(true);

  async function carregar() {
    loading = true;
    padroes = await listPadroesMovimentoComMusculos();
    loading = false;
  }

  void carregar();

  function subtitulo(p: PadraoMovimentoComMusculos): string {
    if (!p.musculos.length) return "Sem músculo definido";
    return p.musculos.map((m) => m.nome).join(", ");
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/exercicios")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Movimentos</h1>
    <button class="criar" onclick={() => navigate("/treino/movimentos/novo")}>Criar</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !padroes.length}
    <p class="muted">Nenhum movimento cadastrado.</p>
  {:else}
    <ul class="lista">
      {#each padroes as p (p.id)}
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
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
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
</style>
