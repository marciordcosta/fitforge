<script lang="ts">
  import { router } from "../../lib/router.svelte";
  import Rotinas from "./Rotinas.svelte";
  import RotinaVisualizar from "./RotinaVisualizar.svelte";
  import RotinaEditor from "./RotinaEditor.svelte";
  import TreinoLog from "./TreinoLog.svelte";
  import Exercicios from "./Exercicios.svelte";
  import ExercicioDetalhe from "./ExercicioDetalhe.svelte";
  import ExercicioForm from "./ExercicioForm.svelte";
  import Movimentos from "./Movimentos.svelte";
  import MovimentoDetalhe from "./MovimentoDetalhe.svelte";
  import MovimentoForm from "./MovimentoForm.svelte";
  import Musculos from "./Musculos.svelte";
  import MusculoDetalhe from "./MusculoDetalhe.svelte";
  import MusculoForm from "./MusculoForm.svelte";
  import AgrupamentosMusculares from "./AgrupamentosMusculares.svelte";
  import AgrupamentoMuscularDetalhe from "./AgrupamentoMuscularDetalhe.svelte";
  import AgrupamentoMuscularForm from "./AgrupamentoMuscularForm.svelte";
  import DistribuicaoMusculos from "./DistribuicaoMusculos.svelte";
  import HistoricoCalendario from "./HistoricoCalendario.svelte";
  import HistoricoDia from "./HistoricoDia.svelte";

  const segmentos = $derived(
    router.path.replace(/^\/treino\/?/, "").split("/").filter(Boolean),
  );
</script>

{#if segmentos.length === 0}
  <Rotinas />
{:else if segmentos[0] === "rotina" && segmentos[1] === "nova"}
  <RotinaEditor treinoId={null} />
{:else if segmentos[0] === "rotina" && segmentos[1] && segmentos[2] === "ver"}
  <RotinaVisualizar treinoId={segmentos[1]} />
{:else if segmentos[0] === "rotina" && segmentos[1]}
  <RotinaEditor treinoId={segmentos[1]} />
{:else if segmentos[0] === "log" && segmentos[1]}
  <TreinoLog treinoId={segmentos[1]} />
{:else if segmentos[0] === "exercicios" && segmentos[1] === "novo" && segmentos[2] === "voltar"}
  <ExercicioForm voltarAoSalvar={true} />
{:else if segmentos[0] === "exercicios" && segmentos[1] === "novo"}
  <ExercicioForm />
{:else if segmentos[0] === "exercicios" && segmentos[1]}
  <ExercicioDetalhe exercicioId={segmentos[1]} />
{:else if segmentos[0] === "exercicios"}
  <Exercicios />
{:else if segmentos[0] === "movimentos" && segmentos[1] === "novo"}
  <MovimentoForm />
{:else if segmentos[0] === "movimentos" && segmentos[1]}
  <MovimentoDetalhe padraoId={segmentos[1]} />
{:else if segmentos[0] === "movimentos"}
  <Movimentos />
{:else if segmentos[0] === "musculos" && segmentos[1] === "novo"}
  <MusculoForm />
{:else if segmentos[0] === "musculos" && segmentos[1]}
  <MusculoDetalhe musculoId={segmentos[1]} />
{:else if segmentos[0] === "musculos"}
  <Musculos />
{:else if segmentos[0] === "agrupamentos" && segmentos[1] === "novo"}
  <AgrupamentoMuscularForm />
{:else if segmentos[0] === "agrupamentos" && segmentos[1]}
  <AgrupamentoMuscularDetalhe agrupamentoId={segmentos[1]} />
{:else if segmentos[0] === "agrupamentos"}
  <AgrupamentosMusculares />
{:else if segmentos[0] === "distribuicao"}
  <DistribuicaoMusculos />
{:else if segmentos[0] === "historico" && segmentos[1] === "avulso" && segmentos[2]}
  <HistoricoDia treinoId={null} data={segmentos[2]} destaqueExercicioId={segmentos[3] ?? null} />
{:else if segmentos[0] === "historico" && segmentos[1] && segmentos[2]}
  <HistoricoDia treinoId={segmentos[1]} data={segmentos[2]} destaqueExercicioId={segmentos[3] ?? null} />
{:else if segmentos[0] === "historico"}
  <HistoricoCalendario />
{:else}
  <Rotinas />
{/if}
