<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import Button from "../../components/Button.svelte";
  import Exercicios from "./Exercicios.svelte";
  import { construirSeriesPadrao, salvarRegistrosDoDia, type Exercicio, type SetRegistro } from "../../lib/treinoApi";

  interface SerieAvulsa {
    serie: number;
    peso: number | null;
    repeticoes: number | null;
  }

  interface ExercicioAvulso {
    exercicio: Exercicio;
    series: SerieAvulsa[];
  }

  let itens = $state<ExercicioAvulso[]>([]);
  /** Abre direto ao entrar na tela — "Treino Avulso" já é "abrir a lista de exercícios pra
   * seleção", sem passo intermediário. */
  let mostrarPicker = $state(true);
  let salvando = $state(false);

  /** Insere na hora, com 2 séries pré-preenchidas pelo último histórico do exercício (se houver)
   * — não fecha o picker, pra dar pra tocar "+" em vários exercícios seguidos. */
  async function adicionarExercicio(ex: Exercicio): Promise<void> {
    const padrao = await construirSeriesPadrao(ex.id, 2);
    const series: SerieAvulsa[] = padrao.map((s) => ({ serie: s.serie, peso: s.peso_alvo, repeticoes: s.rep_min }));
    itens = [...itens, { exercicio: ex, series }];
  }

  function removerExercicio(exercicioId: string): void {
    itens = itens.filter((i) => i.exercicio.id !== exercicioId);
  }

  function adicionarSerie(exercicioId: string): void {
    itens = itens.map((i) =>
      i.exercicio.id === exercicioId ? { ...i, series: [...i.series, { serie: i.series.length + 1, peso: null, repeticoes: null }] } : i,
    );
  }

  function removerSerie(exercicioId: string, serie: number): void {
    itens = itens.map((i) => (i.exercicio.id === exercicioId ? { ...i, series: i.series.filter((s) => s.serie !== serie) } : i));
  }

  function aoVoltar(): void {
    if (itens.length && !confirm("Descartar treino avulso?")) return;
    voltar("/treino");
  }

  async function salvar(): Promise<void> {
    salvando = true;
    try {
      const porExercicio = new Map<string, SetRegistro[]>(
        itens.map((i) => [i.exercicio.id, i.series.map((s) => ({ serie: s.serie, peso: s.peso, repeticoes: s.repeticoes }))]),
      );
      await salvarRegistrosDoDia(null, hojeISO(), porExercicio);
      navigate("/treino");
    } catch (err) {
      alert("Erro ao salvar treino avulso: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMaisPeq()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={aoVoltar} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Treino Avulso</h1>
    <span class="header-spacer"></span>
  </div>

  {#if !itens.length}
    <p class="muted">Nenhum exercício ainda.</p>
    <Button onclick={() => (mostrarPicker = true)}>+ Adicionar Exercício</Button>
  {:else}
    {#each itens as item (item.exercicio.id)}
      <div class="exercicio-card">
        <div class="exercicio-cabecalho">
          <p class="exercicio-nome">{item.exercicio.nome}</p>
          <button class="remover-btn" onclick={() => removerExercicio(item.exercicio.id)} aria-label={`Remover ${item.exercicio.nome}`}>✕</button>
        </div>
        {#each item.series as s (s.serie)}
          <div class="serie-linha">
            <span class="serie-numero">Série {s.serie}</span>
            <input type="number" inputmode="decimal" step="0.5" placeholder="kg" aria-label={`Peso série ${s.serie}`} bind:value={s.peso} />
            <input type="number" inputmode="numeric" placeholder="reps" aria-label={`Repetições série ${s.serie}`} bind:value={s.repeticoes} />
            <button class="remover-serie-btn" onclick={() => removerSerie(item.exercicio.id, s.serie)} aria-label={`Remover série ${s.serie}`}>✕</button>
          </div>
        {/each}
        <button class="add-serie-btn" onclick={() => adicionarSerie(item.exercicio.id)}>{@render iconMaisPeq()} Série</button>
      </div>
    {/each}

    <button class="adicionar-mais-btn" onclick={() => (mostrarPicker = true)}>+ Adicionar Exercício</button>
    <Button onclick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar Treino"}</Button>
  {/if}
</div>

{#if mostrarPicker}
  <Exercicios
    modoSelecao
    tituloSelecao="Adicionar ao treino avulso"
    excluirIds={itens.map((i) => i.exercicio.id)}
    onSelecionar={adicionarExercicio}
    onFechar={() => (mostrarPicker = false)}
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
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .muted {
    color: var(--surface-muted);
    margin-bottom: var(--space-4);
  }
  .exercicio-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
  }
  .exercicio-cabecalho {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .exercicio-nome {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .remover-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--color-negative);
    font-size: 12px;
    cursor: pointer;
  }
  .serie-linha {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .serie-numero {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .serie-linha input {
    box-sizing: border-box;
    width: 64px;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
    color-scheme: dark;
  }
  .remover-serie-btn {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .add-serie-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: var(--space-1);
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--color-primary);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .add-serie-btn svg {
    width: 14px;
    height: 14px;
  }
  .adicionar-mais-btn {
    display: block;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 2px dashed var(--surface-border);
    background: none;
    color: var(--surface-fg);
    font-family: inherit;
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
</style>
