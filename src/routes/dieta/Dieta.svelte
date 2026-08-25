<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import DiarioAlimentar from "./DiarioAlimentar.svelte";
  import DietaRefeicaoVisualizar from "./DietaRefeicaoVisualizar.svelte";
  import DietaAlimentos from "./DietaAlimentos.svelte";
  import DietaItemForm from "./DietaItemForm.svelte";
  import DietaReceitaForm from "./DietaReceitaForm.svelte";
  import DietaReceitas from "./DietaReceitas.svelte";
  import DietaReceitaVisualizar from "./DietaReceitaVisualizar.svelte";
  import DietaRefeicoesGerenciar from "./DietaRefeicoesGerenciar.svelte";
  import Placeholder from "../Placeholder.svelte";
  import { hojeISO } from "../../lib/dates";

  const segmentos = $derived(router.path.replace(/^\/dieta\/?/, "").split("/").filter(Boolean));
</script>

{#if segmentos[0] === "refeicao" && segmentos[1]}
  <DietaRefeicaoVisualizar refeicaoId={segmentos[1]} />
{:else if segmentos[0] === "item" && segmentos[1]}
  <DietaItemForm itemDiarioId={segmentos[1]} />
{:else if segmentos[0] === "alimento" && segmentos[1] && segmentos[2] === "receita"}
  <DietaItemForm alimentoId={segmentos[1]} modoReceita={true} receitaIdExistente={segmentos[3]} />
{:else if segmentos[0] === "alimento" && segmentos[1]}
  <DietaItemForm
    alimentoId={segmentos[1]}
    data={segmentos[2] ?? hojeISO()}
    refeicaoIdInicial={segmentos[3] ?? null}
  />
{:else if segmentos[0] === "alimentos" && segmentos[1] === "refeicao" && segmentos[2]}
  <DietaAlimentos refeicaoId={segmentos[2]} />
{:else if segmentos[0] === "alimentos" && segmentos[1] === "receita"}
  <DietaAlimentos modoReceita={true} receitaIdExistente={segmentos[2]} />
{:else if segmentos[0] === "alimentos"}
  <DietaAlimentos />
{:else if segmentos[0] === "receitas" && segmentos[1] === "nova"}
  <DietaReceitaForm />
{:else if segmentos[0] === "receitas" && segmentos[1] === "ver" && segmentos[2]}
  <DietaReceitaVisualizar receitaId={segmentos[2]} />
{:else if segmentos[0] === "receitas"}
  <DietaReceitas />
{:else if segmentos[0] === "refeicoes" && segmentos[1] === "gerenciar"}
  <DietaRefeicoesGerenciar />
{:else if segmentos[0] === "scanear" && segmentos[1] === "receita"}
  {#await import("./DietaScanear.svelte") then { default: DietaScanear }}
    <DietaScanear modoReceita={true} receitaIdExistente={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "scanear"}
  {#await import("./DietaScanear.svelte") then { default: DietaScanear }}
    <DietaScanear data={segmentos[1]} refeicaoId={segmentos[2]} />
  {/await}
{:else if segmentos[0] === "distribuicao"}
  <Placeholder titulo="Distribuição" />
{:else if segmentos[0] === "historico"}
  <Placeholder titulo="Histórico" />
{:else if segmentos[0] === "meta"}
  <Placeholder titulo="Meta" />
{:else}
  <DiarioAlimentar />
{/if}
