<script lang="ts">
  import ActionSheet from "./ActionSheet.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import TreinoMudarDiaSheet from "../routes/treino/TreinoMudarDiaSheet.svelte";
  import DietaAjustarSemanaSheet from "../routes/dieta/DietaAjustarSemanaSheet.svelte";
  import { cancelarTreinoDoDia } from "../lib/treinoApi";
  import { getModoCalorias } from "../lib/dietaApi";

  /** Texto "Não vai treinar hoje?" + todo o fluxo de mudar/cancelar o treino do dia (só essa
   * semana) e, se a dieta estiver em modo Ondulatória, oferecer ajustar as metas de calorias da
   * semana também — usado no card do Home e no item "de hoje" de Rotinas.svelte, pra nunca ter
   * duas implementações divergentes da mesma interação. */
  let { data, onMudou }: { data: string; onMudou: () => void } = $props();

  let mostrarMenu = $state(false);
  let mostrarConfirmCancelar = $state(false);
  let mostrarMudarDia = $state(false);
  let mostrarConfirmDieta = $state(false);
  let mostrarAjustarDieta = $state(false);
  let processando = $state(false);

  async function talvezPerguntarDieta(): Promise<void> {
    try {
      const modo = await getModoCalorias();
      if (modo === "ondulatoria") mostrarConfirmDieta = true;
    } catch {
      // informativo — se falhar, só não oferece o ajuste de dieta
    }
  }

  async function confirmarCancelar(): Promise<void> {
    mostrarConfirmCancelar = false;
    processando = true;
    try {
      await cancelarTreinoDoDia(data);
      onMudou();
      await talvezPerguntarDieta();
    } catch (err) {
      alert("Erro ao cancelar o treino: " + (err as Error).message);
    } finally {
      processando = false;
    }
  }

  async function aoSalvarMudarDia(): Promise<void> {
    mostrarMudarDia = false;
    onMudou();
    await talvezPerguntarDieta();
  }
</script>

<button type="button" class="nao-vai-treinar" disabled={processando} onclick={() => (mostrarMenu = true)}>
  Não vai treinar hoje?
</button>

{#if mostrarMenu}
  <ActionSheet
    titulo="O que fazer hoje?"
    onFechar={() => (mostrarMenu = false)}
    opcoes={[
      { label: "Mudar dia", subtitulo: "Reposicionar os treinos dessa semana", onSelect: () => (mostrarMudarDia = true) },
      { label: "Cancelar treino de hoje", destructive: true, onSelect: () => (mostrarConfirmCancelar = true) },
    ]}
  />
{/if}

{#if mostrarConfirmCancelar}
  <ConfirmDialog
    titulo="Cancelar o treino de hoje? Só vale pra hoje — a semana que vem volta ao normal."
    textoConfirmar="Cancelar Treino"
    onConfirmar={confirmarCancelar}
    onCancelar={() => (mostrarConfirmCancelar = false)}
  />
{/if}

{#if mostrarMudarDia}
  <TreinoMudarDiaSheet {data} onFechar={() => (mostrarMudarDia = false)} onSalvo={aoSalvarMudarDia} />
{/if}

{#if mostrarConfirmDieta}
  <ConfirmDialog
    titulo="Quer ajustar as metas de calorias dessa semana também?"
    textoConfirmar="Ajustar"
    destrutivo={false}
    onConfirmar={() => {
      mostrarConfirmDieta = false;
      mostrarAjustarDieta = true;
    }}
    onCancelar={() => (mostrarConfirmDieta = false)}
  />
{/if}

{#if mostrarAjustarDieta}
  <DietaAjustarSemanaSheet {data} onFechar={() => (mostrarAjustarDieta = false)} onSalvo={() => (mostrarAjustarDieta = false)} />
{/if}

<style>
  .nao-vai-treinar {
    display: block;
    width: 100%;
    margin-top: var(--space-2);
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--surface-muted);
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: center;
    text-decoration: underline;
    cursor: pointer;
  }
  .nao-vai-treinar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
