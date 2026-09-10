<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import DiarioAlimentar from "./DiarioAlimentar.svelte";
  import Placeholder from "../Placeholder.svelte";
  import { hojeISO } from "../../lib/dates";

  const segmentos = $derived(router.path.replace(/^\/dieta\/?/, "").split("/").filter(Boolean));
</script>

{#snippet carregando()}
  <p class="tab-carregando">Carregando…</p>
{/snippet}

{#if segmentos[0] === "refeicao" && segmentos[1]}
  {#await import("./DietaRefeicaoVisualizar.svelte")}
    {@render carregando()}
  {:then { default: DietaRefeicaoVisualizar }}
    <DietaRefeicaoVisualizar refeicaoId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "item" && segmentos[1]}
  {#await import("./DietaItemForm.svelte")}
    {@render carregando()}
  {:then { default: DietaItemForm }}
    <DietaItemForm itemDiarioId={segmentos[1]} />
  {/await}
{:else if segmentos[0] === "alimento" && segmentos[1] && segmentos[2] === "receita"}
  {#await import("./DietaItemForm.svelte")}
    {@render carregando()}
  {:then { default: DietaItemForm }}
    <DietaItemForm alimentoId={segmentos[1]} modoReceita={true} receitaIdExistente={segmentos[3]} />
  {/await}
{:else if segmentos[0] === "alimento" && segmentos[1] && segmentos[3] === "receita" && segmentos[4]}
  {#await import("./DietaItemForm.svelte")}
    {@render carregando()}
  {:then { default: DietaItemForm }}
    <DietaItemForm alimentoId={segmentos[1]} data={segmentos[2]} voltarPara={`/dieta/receitas/ver/${segmentos[4]}`} />
  {/await}
{:else if segmentos[0] === "alimento" && segmentos[1]}
  {#await import("./DietaItemForm.svelte")}
    {@render carregando()}
  {:then { default: DietaItemForm }}
    <DietaItemForm
      alimentoId={segmentos[1]}
      data={segmentos[2] ?? hojeISO()}
      refeicaoIdInicial={segmentos[3] ?? null}
    />
  {/await}
{:else if segmentos[0] === "alimentos" && segmentos[1] === "refeicao" && segmentos[2]}
  {#await import("./DietaAlimentos.svelte")}
    {@render carregando()}
  {:then { default: DietaAlimentos }}
    <DietaAlimentos refeicaoId={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "alimentos" && segmentos[1] === "receita"}
  {#await import("./DietaAlimentos.svelte")}
    {@render carregando()}
  {:then { default: DietaAlimentos }}
    <DietaAlimentos modoReceita={true} receitaIdExistente={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "alimentos"}
  {#await import("./DietaAlimentos.svelte")}
    {@render carregando()}
  {:then { default: DietaAlimentos }}
    <DietaAlimentos />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "nova" && segmentos[2] === "meta" && segmentos[3] && segmentos[4]}
  {#await import("./DietaReceitaForm.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitaForm }}
    <DietaReceitaForm metaParaModeloId={segmentos[3]} metaParaDiasSemana={segmentos[4].split(",").map(Number)} />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "nova" && segmentos[2] === "meta" && segmentos[3]}
  {#await import("./DietaReceitaForm.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitaForm }}
    <DietaReceitaForm metaParaModeloId={segmentos[3]} />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "nova"}
  {#await import("./DietaReceitaForm.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitaForm }}
    <DietaReceitaForm />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "ver" && segmentos[2]}
  {#await import("./DietaReceitaVisualizar.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitaVisualizar }}
    <DietaReceitaVisualizar receitaId={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "buscar" && segmentos[2] === "meta" && segmentos[3] && segmentos[5]}
  {#await import("./DietaReceitas.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitas }}
    <DietaReceitas metaParaModeloId={segmentos[3]} nomeInicial={decodeURIComponent(segmentos[4] ?? "")} metaParaDiasSemana={segmentos[5].split(",").map(Number)} />
  {/await}
{:else if segmentos[0] === "receitas" && segmentos[1] === "buscar" && segmentos[2] === "meta" && segmentos[3]}
  {#await import("./DietaReceitas.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitas }}
    <DietaReceitas metaParaModeloId={segmentos[3]} nomeInicial={decodeURIComponent(segmentos[4] ?? "")} />
  {/await}
{:else if segmentos[0] === "receitas"}
  {#await import("./DietaReceitas.svelte")}
    {@render carregando()}
  {:then { default: DietaReceitas }}
    <DietaReceitas />
  {/await}
{:else if segmentos[0] === "refeicoes" && segmentos[1] === "gerenciar"}
  {#await import("./DietaRefeicoesGerenciar.svelte")}
    {@render carregando()}
  {:then { default: DietaRefeicoesGerenciar }}
    <DietaRefeicoesGerenciar />
  {/await}
{:else if segmentos[0] === "scanear" && segmentos[1] === "receita"}
  {#await import("./DietaScanear.svelte")}
    {@render carregando()}
  {:then { default: DietaScanear }}
    <DietaScanear modoReceita={true} receitaIdExistente={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "scanear"}
  {#await import("./DietaScanear.svelte")}
    {@render carregando()}
  {:then { default: DietaScanear }}
    <DietaScanear data={segmentos[1]} refeicaoId={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "distribuicao"}
  <Placeholder titulo="Distribuição" />
{:else if segmentos[0] === "historico"}
  <Placeholder titulo="Histórico" />
{:else if segmentos[0] === "meta"}
  <Placeholder titulo="Meta" />
{:else if segmentos[0] === "parametrizacao"}
  {#await import("./DietaParametrizacao.svelte")}
    {@render carregando()}
  {:then { default: DietaParametrizacao }}
    <DietaParametrizacao />
  {/await}
{:else}
  <DiarioAlimentar />
{/if}

<style>
  .tab-carregando {
    text-align: center;
    color: var(--surface-muted);
    padding-top: var(--space-6);
  }
</style>
