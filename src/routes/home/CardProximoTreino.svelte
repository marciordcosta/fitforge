<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import TreinoAjusteDiaFluxo from "../../components/TreinoAjusteDiaFluxo.svelte";
  import type { TreinoComExercicios } from "../../lib/treinoApi";

  /** `treinos` no plural porque um dia pode ter mais de uma rotina depois de "Mudar dia" (ver
   * TreinoAjusteDiaFluxo) — no caso comum (0 ou 1) o card se comporta como sempre se comportou. */
  let { treinos, data, onMudou }: { treinos: TreinoComExercicios[]; data: string; onMudou: () => void } = $props();

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
</script>

<div class="card">
  {#if treinos.length}
    <div class="canto-superior" role="presentation" onclick={(e) => e.stopPropagation()}>
      <TreinoAjusteDiaFluxo {data} {onMudou} />
    </div>
    {#each treinos as treino, i (treino.id)}
      <div
        class="treino-bloco"
        class:com-margem={i < treinos.length - 1}
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
  .subtexto {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
