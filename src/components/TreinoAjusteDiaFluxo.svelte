<script lang="ts">
  import ActionSheet from "./ActionSheet.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import TreinoMudarDiaSheet from "../routes/treino/TreinoMudarDiaSheet.svelte";
  import { cancelarTreinoDoDia, labelDiaSemanaRelativo } from "../lib/treinoApi";
  import { hojeISO, parseISODate } from "../lib/dates";

  /** Texto "Não vai treinar hoje?" + o fluxo de mudar/cancelar o treino do dia (só essa semana) —
   * usado no card do Home, no item "de hoje" e no card "Próxima rotina" de Rotinas.svelte, pra
   * nunca ter duas implementações divergentes da mesma interação. `data` pode ser hoje ou um dia
   * futuro dessa semana (card "Próxima rotina") — os textos se ajustam pro dia certo. A pergunta
   * sobre ajustar a dieta (quando 1 rotina troca de dia e a dieta está em Ondulatória) mora dentro
   * do próprio TreinoMudarDiaSheet — ele já sabe os 2 dias envolvidos na troca, não precisa de um
   * seletor de 7 dias separado. */
  let { data, onMudou }: { data: string; onMudou: () => void } = $props();

  const ehHoje = $derived(data === hojeISO());
  const labelDia = $derived(labelDiaSemanaRelativo(parseISODate(data).getDay()).toLowerCase());

  let mostrarMenu = $state(false);
  let mostrarConfirmCancelar = $state(false);
  let mostrarMudarDia = $state(false);
  let processando = $state(false);

  async function confirmarCancelar(): Promise<void> {
    mostrarConfirmCancelar = false;
    processando = true;
    try {
      await cancelarTreinoDoDia(data);
      onMudou();
    } catch (err) {
      alert("Erro ao cancelar o treino: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }
</script>

{#snippet iconCalendario()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
{/snippet}

<button
  type="button"
  class="nao-vai-treinar"
  disabled={processando}
  onclick={() => (mostrarMenu = true)}
  aria-label={ehHoje ? "Não vai treinar hoje?" : `Ajustar treino de ${labelDia}`}
>
  {@render iconCalendario()}
</button>

{#if mostrarMenu}
  <ActionSheet
    titulo={ehHoje ? "O que fazer hoje?" : `O que fazer com o treino de ${labelDia}?`}
    onFechar={() => (mostrarMenu = false)}
    opcoes={[
      { label: "Mudar dia", subtitulo: "Reposicionar os treinos dessa semana", onSelect: () => (mostrarMudarDia = true) },
      { label: `Cancelar treino de ${ehHoje ? "hoje" : labelDia}`, destructive: true, onSelect: () => (mostrarConfirmCancelar = true) },
    ]}
  />
{/if}

{#if mostrarConfirmCancelar}
  <ConfirmDialog
    titulo={ehHoje
      ? "Cancelar o treino de hoje? Só vale pra hoje — a semana que vem volta ao normal."
      : `Cancelar o treino de ${labelDia}? Só vale pra essa semana — a semana que vem volta ao normal.`}
    textoConfirmar="Cancelar Treino"
    onConfirmar={confirmarCancelar}
    onCancelar={() => (mostrarConfirmCancelar = false)}
  />
{/if}

{#if mostrarMudarDia}
  <TreinoMudarDiaSheet
    {data}
    onFechar={() => (mostrarMudarDia = false)}
    onSalvo={() => {
      mostrarMudarDia = false;
      onMudou();
    }}
  />
{/if}

<style>
  .nao-vai-treinar {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-muted);
    padding: 0;
    cursor: pointer;
  }
  .nao-vai-treinar svg {
    width: 18px;
    height: 18px;
  }
  .nao-vai-treinar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
