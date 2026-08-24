<script lang="ts">
  import { parseISODate } from "../../lib/dates";
  import { getHistoricoDia, salvarRegistrosDoDia, type SetRegistro } from "../../lib/treinoApi";

  let { treinoId, data }: { treinoId: string; data: string } = $props();

  interface ExercicioSessaoHistorico {
    exercicioId: string;
    exercicioNome: string;
    sets: SetRegistro[];
  }

  let treinoNome = $state("");
  let sessao = $state<ExercicioSessaoHistorico[]>([]);
  let loading = $state(true);
  let salvando = $state(false);
  let salvo = $state(false);

  const dataLabel = $derived.by(() => {
    const d = parseISODate(data);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  });

  async function carregar() {
    loading = true;
    const historico = await getHistoricoDia(treinoId, data);
    treinoNome = historico.treinoNome;
    sessao = historico.exercicios.map((ex) => ({
      exercicioId: ex.exercicioId,
      exercicioNome: ex.exercicioNome,
      sets: ex.sets.map((s) => ({ ...s })),
    }));
    loading = false;
  }

  void carregar();

  function adicionarSerie(exIdx: number) {
    const ex = sessao[exIdx];
    ex.sets = [...ex.sets, { serie: ex.sets.length + 1, peso: null, repeticoes: null }];
  }

  function removerSerie(exIdx: number, setIdx: number) {
    const ex = sessao[exIdx];
    ex.sets = ex.sets.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, serie: i + 1 }));
  }

  async function salvar() {
    salvando = true;
    salvo = false;
    try {
      const porExercicio = new Map<string, SetRegistro[]>();
      for (const ex of sessao) porExercicio.set(ex.exercicioId, ex.sets);
      await salvarRegistrosDoDia(treinoId, data, porExercicio);
      salvo = true;
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>{treinoNome}</h1>
    <button class="salvar" disabled={salvando || loading} onclick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
  </div>
  <p class="data-label">{dataLabel}</p>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !sessao.length}
    <p class="muted">Nenhum registro encontrado para esse dia.</p>
  {:else}
    {#if salvo}
      <p class="aviso-salvo">Alterações salvas.</p>
    {/if}
    {#each sessao as ex, exIdx (ex.exercicioId)}
      <div class="exercicio-card">
        <h2>{ex.exercicioNome}</h2>
        <div class="tabela">
          <div class="linha cabecalho">
            <span>Série</span>
            <span>Kg</span>
            <span>Reps</span>
            <span></span>
          </div>
          {#each ex.sets as serieItem, setIdx (setIdx)}
            <div class="linha">
              <span class="serie-num">{serieItem.serie}</span>
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serieItem.peso} />
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serieItem.repeticoes} />
              <button class="remover" onclick={() => removerSerie(exIdx, setIdx)} aria-label="Remover série">✕</button>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(exIdx)}>+ Adicionar Série</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .container {
    max-width: 520px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
  .back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .salvar {
    flex-shrink: 0;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .salvar:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .data-label {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: var(--space-1) 0 var(--space-4);
    text-transform: capitalize;
  }
  .aviso-salvo {
    text-align: center;
    color: var(--color-success);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-3);
  }
  .exercicio-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-5);
  }
  .exercicio-card h2 {
    font-size: var(--font-size-base);
    color: var(--color-primary);
    margin: 0 0 var(--space-2);
  }
  .tabela {
    display: flex;
    flex-direction: column;
  }
  .linha {
    display: grid;
    grid-template-columns: 36px 1fr 1fr 32px;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
  }
  .linha.cabecalho {
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
  }
  .serie-num {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: var(--surface-card);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
  }
  .linha input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2);
    border-radius: 6px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .remover {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .add-serie {
    width: 100%;
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
