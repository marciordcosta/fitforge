<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import TreinoAjusteDiaFluxo from "../../components/TreinoAjusteDiaFluxo.svelte";
  import { moverTreinoParaDia, labelDiaSemanaRelativo, type TreinoComExercicios, type StatusSemanalTreino } from "../../lib/treinoApi";

  /** `treinos` no plural porque um dia pode ter mais de uma rotina depois de "Mudar dia" (ver
   * TreinoAjusteDiaFluxo) — no caso comum (0 ou 1) o card se comporta como sempre se comportou.
   * `fantasmas` são rotinas cujo dia FIXO é hoje, mas que essa semana foram reagendadas pra outro
   * dia ou canceladas — mostradas com o rótulo do que aconteceu e uma forma rápida de reverter. */
  let {
    treinos,
    fantasmas,
    data,
    onMudou,
  }: {
    treinos: TreinoComExercicios[];
    fantasmas: { treino: TreinoComExercicios; status: StatusSemanalTreino }[];
    data: string;
    onMudou: () => void;
  } = $props();

  function preview(t: TreinoComExercicios): string {
    const nomes = t.exercicios
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => e.exercicio?.nome)
      .filter(Boolean);
    if (!nomes.length) return "Nenhum exercício ainda";
    return nomes.join(", ");
  }

  function abrirRotina(treino: TreinoComExercicios | null): void {
    navigate(treino ? `/treino/rotina/${treino.id}/ver` : "/treino");
  }

  let revertendo = $state<string | null>(null);

  async function reverter(treino: TreinoComExercicios): Promise<void> {
    if (treino.dia_semana == null) return;
    revertendo = treino.id;
    try {
      await moverTreinoParaDia(treino.id, treino.dia_semana, data);
      onMudou();
    } catch (err) {
      alert("Erro ao reverter: " + (err as Error).message);
    } finally {
      revertendo = null;
    }
  }

  function rotuloStatus(status: StatusSemanalTreino): string {
    return status.tipo === "reagendado" ? `Reagendado para ${labelDiaSemanaRelativo(status.novoDia)}` : "Cancelado essa semana";
  }
</script>

<div class="card">
  {#if treinos.length || fantasmas.length}
    <div class="canto-superior" role="presentation" onclick={(e) => e.stopPropagation()}>
      <TreinoAjusteDiaFluxo {data} {onMudou} />
    </div>
    {#each treinos as treino, i (treino.id)}
      <div
        class="treino-bloco"
        class:com-margem={i < treinos.length - 1 || fantasmas.length > 0}
        role="button"
        tabindex="0"
        onclick={() => abrirRotina(treino)}
        onkeydown={(e) => e.key === "Enter" && abrirRotina(treino)}
      >
        <div class="card-header">
          <h2>{treino.nome_treino}</h2>
        </div>
        <p class="preview">{preview(treino)}</p>
        <Button variant="secondary" onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
      </div>
    {/each}
    {#each fantasmas as { treino, status }, i (treino.id)}
      <div
        class="treino-bloco fantasma"
        class:com-margem={i < fantasmas.length - 1}
        role="button"
        tabindex="0"
        onclick={() => abrirRotina(treino)}
        onkeydown={(e) => e.key === "Enter" && abrirRotina(treino)}
      >
        <div class="card-header">
          <h2 class="nome-neutro">{treino.nome_treino}</h2>
        </div>
        <p class="status-fantasma">{rotuloStatus(status)}</p>
        <div class="acoes-fantasma">
          <button
            type="button"
            class="reverter-btn"
            disabled={revertendo === treino.id}
            onclick={(e) => { e.stopPropagation(); void reverter(treino); }}
          >
            Reverter
          </button>
          {#if status.tipo === "cancelado"}
            <Button variant="secondary" onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
          {/if}
        </div>
      </div>
    {/each}
  {:else}
    <button class="sem-treino-btn" onclick={() => abrirRotina(null)}>
      <p class="subtexto">Nenhum treino agendado pra hoje</p>
    </button>
  {/if}
</div>

<style>
  .card {
    position: relative;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .canto-superior {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
  }
  .treino-bloco {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .treino-bloco.com-margem {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--surface-border);
  }
  .sem-treino-btn {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
  }
  .card-header {
    margin-bottom: var(--space-1);
  }
  .card-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .nome-neutro {
    color: var(--surface-muted);
  }
  .preview {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .status-fantasma {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-negative);
  }
  .acoes-fantasma {
    display: flex;
    gap: var(--space-2);
  }
  .acoes-fantasma :global(button) {
    flex: 1;
  }
  .reverter-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: none;
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .reverter-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .subtexto {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
