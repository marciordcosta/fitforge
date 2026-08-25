<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import DiarioAlimentar from "./DiarioAlimentar.svelte";
  import DietaRefeicaoVisualizar from "./DietaRefeicaoVisualizar.svelte";
  import DietaAlimentos from "./DietaAlimentos.svelte";
  import DietaItemForm from "./DietaItemForm.svelte";
  import DietaReceitaForm from "./DietaReceitaForm.svelte";
  import Placeholder from "../Placeholder.svelte";
  import { hojeISO } from "../../lib/dates";
  import type { Refeicao } from "../../lib/dietaApi";

  const segmentos = $derived(router.path.replace(/^\/dieta\/?/, "").split("/").filter(Boolean));
</script>

{#if segmentos[0] === "refeicao" && segmentos[1] && segmentos[2]}
  <DietaRefeicaoVisualizar refeicao={segmentos[1] as Refeicao} data={segmentos[2]} />
{:else if segmentos[0] === "alimento" && segmentos[1]}
  <DietaItemForm
    alimentoId={segmentos[1]}
    data={segmentos[2] ?? hojeISO()}
    refeicaoInicial={(segmentos[3] as Refeicao | undefined) ?? null}
  />
{:else if segmentos[0] === "alimentos"}
  <DietaAlimentos />
{:else if segmentos[0] === "receitas" && segmentos[1] === "nova"}
  <DietaReceitaForm />
{:else if segmentos[0] === "distribuicao"}
  <Placeholder titulo="Distribuição" />
{:else if segmentos[0] === "historico"}
  <Placeholder titulo="Histórico" />
{:else}
  <DiarioAlimentar />
{/if}
