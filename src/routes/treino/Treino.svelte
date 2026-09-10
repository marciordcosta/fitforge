<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import Rotinas from "./Rotinas.svelte";

  const segmentos = $derived(
    router.path.replace(/^\/treino\/?/, "").split("/").filter(Boolean),
  );
</script>

{#snippet carregando()}
  <p class="tab-carregando">Carregando…</p>
{/snippet}

{#if segmentos.length === 0}
  <Rotinas />
{:else if segmentos[0] === "rotina" && segmentos[1] === "nova"}
  {#await import("./RotinaEditor.svelte")}
    {@render carregando()}
  {:then { default: RotinaEditor }}
    <RotinaEditor treinoId={null} />
  {/await}
{:else if segmentos[0] === "rotina" && segmentos[1] && segmentos[2] === "ver"}
  {#await import("./RotinaVisualizar.svelte")}
    {@render carregando()}
  {:then { default: RotinaVisualizar }}
    <RotinaVisualizar treinoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "rotina" && segmentos[1]}
  {#await import("./RotinaEditor.svelte")}
    {@render carregando()}
  {:then { default: RotinaEditor }}
    <RotinaEditor treinoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "log" && segmentos[1]}
  {#await import("./TreinoLog.svelte")}
    {@render carregando()}
  {:then { default: TreinoLog }}
    <TreinoLog treinoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "exercicios" && segmentos[1] === "novo" && segmentos[2] === "voltar"}
  {#await import("./ExercicioForm.svelte")}
    {@render carregando()}
  {:then { default: ExercicioForm }}
    <ExercicioForm voltarAoSalvar={true} />
  {/await}
{:else if segmentos[0] === "exercicios" && segmentos[1] === "novo"}
  {#await import("./ExercicioForm.svelte")}
    {@render carregando()}
  {:then { default: ExercicioForm }}
    <ExercicioForm />
  {/await}
{:else if segmentos[0] === "exercicios" && segmentos[1]}
  {#await import("./ExercicioDetalhe.svelte")}
    {@render carregando()}
  {:then { default: ExercicioDetalhe }}
    <ExercicioDetalhe exercicioId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "exercicios"}
  {#await import("./Exercicios.svelte")}
    {@render carregando()}
  {:then { default: Exercicios }}
    <Exercicios />
  {/await}
{:else if segmentos[0] === "movimentos" && segmentos[1] === "novo"}
  {#await import("./MovimentoForm.svelte")}
    {@render carregando()}
  {:then { default: MovimentoForm }}
    <MovimentoForm />
  {/await}
{:else if segmentos[0] === "movimentos" && segmentos[1]}
  {#await import("./MovimentoDetalhe.svelte")}
    {@render carregando()}
  {:then { default: MovimentoDetalhe }}
    <MovimentoDetalhe padraoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "movimentos"}
  {#await import("./Movimentos.svelte")}
    {@render carregando()}
  {:then { default: Movimentos }}
    <Movimentos />
  {/await}
{:else if segmentos[0] === "musculos" && segmentos[1] === "novo"}
  {#await import("./MusculoForm.svelte")}
    {@render carregando()}
  {:then { default: MusculoForm }}
    <MusculoForm />
  {/await}
{:else if segmentos[0] === "musculos" && segmentos[1]}
  {#await import("./MusculoDetalhe.svelte")}
    {@render carregando()}
  {:then { default: MusculoDetalhe }}
    <MusculoDetalhe musculoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "musculos"}
  {#await import("./Musculos.svelte")}
    {@render carregando()}
  {:then { default: Musculos }}
    <Musculos />
  {/await}
{:else if segmentos[0] === "agrupamentos" && segmentos[1] === "novo"}
  {#await import("./AgrupamentoMuscularForm.svelte")}
    {@render carregando()}
  {:then { default: AgrupamentoMuscularForm }}
    <AgrupamentoMuscularForm />
  {/await}
{:else if segmentos[0] === "agrupamentos" && segmentos[1]}
  {#await import("./AgrupamentoMuscularDetalhe.svelte")}
    {@render carregando()}
  {:then { default: AgrupamentoMuscularDetalhe }}
    <AgrupamentoMuscularDetalhe agrupamentoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "agrupamentos"}
  {#await import("./AgrupamentosMusculares.svelte")}
    {@render carregando()}
  {:then { default: AgrupamentosMusculares }}
    <AgrupamentosMusculares />
  {/await}
{:else if segmentos[0] === "distribuicao"}
  {#await import("./DistribuicaoMusculos.svelte")}
    {@render carregando()}
  {:then { default: DistribuicaoMusculos }}
    <DistribuicaoMusculos />
  {/await}
{:else if segmentos[0] === "parametrizacao"}
  {#await import("./DistribuicaoParametrizacao.svelte")}
    {@render carregando()}
  {:then { default: DistribuicaoParametrizacao }}
    <DistribuicaoParametrizacao />
  {/await}
{:else if segmentos[0] === "avulso"}
  {#await import("./TreinoAvulso.svelte")}
    {@render carregando()}
  {:then { default: TreinoAvulso }}
    <TreinoAvulso />
  {/await}
{:else if segmentos[0] === "historico" && segmentos[1] === "avulso" && segmentos[2]}
  {#await import("./HistoricoDia.svelte")}
    {@render carregando()}
  {:then { default: HistoricoDia }}
    <HistoricoDia treinoId={null} data={segmentos[2]} destaqueExercicioId={segmentos[3] ?? null} />
  {/await}
{:else if segmentos[0] === "historico" && segmentos[1] && segmentos[2]}
  {#await import("./HistoricoDia.svelte")}
    {@render carregando()}
  {:then { default: HistoricoDia }}
    <HistoricoDia treinoId={segmentos[1]} data={segmentos[2]} destaqueExercicioId={segmentos[3] ?? null} />
  {/await}
{:else if segmentos[0] === "historico"}
  {#await import("./HistoricoCalendario.svelte")}
    {@render carregando()}
  {:then { default: HistoricoCalendario }}
    <HistoricoCalendario />
  {/await}
{:else}
  <Rotinas />
{/if}

<style>
  .tab-carregando {
    text-align: center;
    color: var(--surface-muted);
    padding-top: var(--space-6);
  }
</style>
