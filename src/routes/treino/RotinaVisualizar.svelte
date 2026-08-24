<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { formatMinSeg } from "../../lib/tempo";
  import { getTreino, DIAS_SEMANA_COMPLETO, type TreinoComExercicios } from "../../lib/treinoApi";

  let { treinoId }: { treinoId: string } = $props();

  let treino = $state<TreinoComExercicios | null>(null);
  let loading = $state(true);

  async function carregar() {
    loading = true;
    treino = await getTreino(treinoId);
    loading = false;
  }

  void carregar();
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => navigate("/treino")} aria-label="Voltar">←</button>
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
      <button class="btn-iniciar" onclick={() => navigate(`/treino/log/${treino!.id}`)}>Iniciar Rotina</button>
      <button class="btn-editar" onclick={() => navigate(`/treino/rotina/${treino!.id}`)}>Editar Rotina</button>
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
    width: 24px;
    flex-shrink: 0;
  }
  .back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
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
  .btn-iniciar,
  .btn-editar {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .btn-iniciar {
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .btn-editar {
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
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
