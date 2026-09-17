<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import { DIAS_SEMANA_COMPLETO, type TreinoComExercicios } from "../../lib/treinoApi";

  let { treino }: { treino: TreinoComExercicios | null } = $props();

  function preview(t: TreinoComExercicios): string {
    const nomes = t.exercicios
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => e.exercicio?.nome)
      .filter(Boolean);
    if (!nomes.length) return "Nenhum exercício ainda";
    return nomes.join(", ");
  }

  function abrirRotina(): void {
    navigate(treino ? `/treino/rotina/${treino.id}/ver` : "/treino");
  }
</script>

<div
  class="card"
  role="button"
  tabindex="0"
  onclick={abrirRotina}
  onkeydown={(e) => e.key === "Enter" && abrirRotina()}
>
  <p class="card-titulo">Rotinas</p>
  {#if treino}
    <div class="card-header">
      <h2>
        {treino.nome_treino}
        {#if treino.dia_semana != null}
          <span class="dia-tag">{DIAS_SEMANA_COMPLETO[treino.dia_semana]}</span>
        {/if}
      </h2>
    </div>
    <p class="preview">{preview(treino)}</p>
    <Button onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
  {:else}
    <p class="subtexto">Nenhum treino agendado pra hoje</p>
  {/if}
</div>

<style>
  .card {
    display: block;
    width: 100%;
    background: var(--surface-card);
    border: none;
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
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
  .dia-tag {
    font-size: var(--font-size-sm);
    font-weight: 400;
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
  .subtexto {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
</style>
