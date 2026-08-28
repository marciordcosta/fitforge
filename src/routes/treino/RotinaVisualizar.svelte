<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { formatMinSeg } from "../../lib/tempo";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import {
    getTreino,
    duplicateTreino,
    deleteTreino,
    DIAS_SEMANA_COMPLETO,
    type TreinoComExercicios,
  } from "../../lib/treinoApi";

  let { treinoId }: { treinoId: string } = $props();

  let treino = $state<TreinoComExercicios | null>(null);
  let loading = $state(true);
  let processando = $state(false);
  let confirmandoExclusao = $state(false);

  async function carregar() {
    loading = true;
    treino = await getTreino(treinoId);
    loading = false;
  }

  void carregar();

  async function duplicar() {
    if (!treino) return;
    processando = true;
    try {
      const novoId = await duplicateTreino(treino.id);
      navigate(`/treino/rotina/${novoId}/ver`);
    } catch (err) {
      alert("Erro ao duplicar rotina: " + (err as Error).message);
      processando = false;
    }
  }

  async function excluir() {
    if (!treino) return;
    processando = true;
    try {
      await deleteTreino(treino.id);
      navigate("/treino");
    } catch (err) {
      alert("Erro ao excluir rotina: " + (err as Error).message);
      processando = false;
    }
  }
</script>

{#snippet iconIniciar()}
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
{/snippet}
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
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">←</button>
    <h1>
      {treino?.nome_treino ?? ""}
      {#if treino?.dia_semana != null}
        <span class="dia-inline">{DIAS_SEMANA_COMPLETO[treino.dia_semana]}</span>
      {/if}
    </h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !treino}
    <p class="muted">Rotina não encontrada.</p>
  {:else}
    <div class="acoes">
      <button class="acao-btn" disabled={processando} onclick={() => navigate(`/treino/log/${treino!.id}`)}>
        <span class="acao-label">Iniciar</span>
        {@render iconIniciar()}
      </button>
      <button class="acao-btn" disabled={processando} onclick={() => navigate(`/treino/rotina/${treino!.id}`)}>
        <span class="acao-label">Editar</span>
        {@render iconEditar()}
      </button>
      <button class="acao-btn" disabled={processando} onclick={duplicar}>
        <span class="acao-label">Duplicar</span>
        {@render iconDuplicar()}
      </button>
      <button class="acao-btn acao-destrutiva" disabled={processando} onclick={() => (confirmandoExclusao = true)}>
        <span class="acao-label">Remover</span>
        {@render iconExcluir()}
      </button>
    </div>

    {#if !treino.exercicios.length}
      <p class="muted">Nenhum exercício adicionado ainda.</p>
    {:else}
      {#each treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem) as te (te.id)}
        <div class="exercicio-card">
          <h2>{te.exercicio?.nome ?? ""}</h2>
          {#if te.observacao}
            <p class="observacao">{te.observacao}</p>
          {/if}
          {#if te.descanso_seg != null}
            <p class="descanso">⏱ Descanso: {formatMinSeg(te.descanso_seg)}</p>
          {/if}
          {#if te.series.length}
            <div class="series-lista">
              <div class="series-cabecalho">
                <span>Série</span>
                <span>Kg</span>
                <span>Intervalo de repetição</span>
              </div>
              {#each te.series.slice().sort((a, b) => a.serie - b.serie) as s (s.serie)}
                <div class="series-linha">
                  <span class="serie-num">{s.serie}</span>
                  <span>{s.peso_alvo != null ? `${s.peso_alvo}kg` : "—"}</span>
                  <span>
                    {s.rep_min != null && s.rep_max != null
                      ? `${s.rep_min} a ${s.rep_max}`
                      : (s.rep_min ?? s.rep_max ?? "—")}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {/if}
</div>

{#if confirmandoExclusao}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir esta rotina?"
    textoConfirmar="Excluir Rotina"
    onConfirmar={excluir}
    onCancelar={() => (confirmandoExclusao = false)}
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
    margin-bottom: var(--space-3);
  }
  .header h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .dia-inline {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    margin-left: var(--space-1);
  }
  .acoes {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .acao-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .acao-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .acao-label {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
  .acao-btn svg {
    width: 20px;
    height: 20px;
  }
  .acao-destrutiva {
    color: var(--color-danger);
  }
  .exercicio-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-4);
  }
  .exercicio-card h2 {
    font-size: var(--font-size-base);
    color: var(--color-primary);
    margin: 0 0 var(--space-1);
  }
  .observacao {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin: 0 0 var(--space-1);
  }
  .descanso {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin: 0 0 var(--space-3);
  }
  .series-lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .series-cabecalho {
    display: grid;
    grid-template-columns: 32px 1fr 1fr;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    text-transform: uppercase;
    padding-bottom: var(--space-1);
  }
  .series-linha {
    display: grid;
    grid-template-columns: 32px 1fr 1fr;
    gap: var(--space-2);
    align-items: center;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .serie-num {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: var(--surface-card);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
