<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { getHistoricoExercicio, type HistoricoPonto } from "../../lib/treinoApi";

  let { exercicioId }: { exercicioId: string } = $props();

  let historico = $state<HistoricoPonto[]>([]);
  let loading = $state(true);
  let metrica = $state<"peso" | "1rm">("peso");
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;

  async function carregar() {
    loading = true;
    historico = await getHistoricoExercicio(exercicioId);
    loading = false;
  }

  void carregar();

  function formatData(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }

  function desenharGrafico() {
    if (!canvas || !historico.length) return;
    chart?.destroy();
    const valores = historico.map((h) => (metrica === "peso" ? h.maiorPeso : Math.round(h.melhor1rm * 10) / 10));
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: historico.map((h) => formatData(h.data)),
        datasets: [
          {
            data: valores,
            borderColor: "#5eead4",
            backgroundColor: "#5eead4",
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#9aa0ab" } },
          y: { ticks: { color: "#9aa0ab" } },
        },
      },
    });
  }

  $effect(() => {
    if (!loading) desenharGrafico();
  });
</script>

{#if loading}
  <p class="muted">Carregando histórico…</p>
{:else if !historico.length}
  <p class="muted">Nenhum registro ainda. O gráfico aparece depois do primeiro treino logado.</p>
{:else}
  <div class="chart-wrap">
    <canvas bind:this={canvas}></canvas>
  </div>
  <div class="toggle">
    <button class:active={metrica === "peso"} onclick={() => (metrica = "peso")}>Maior Peso</button>
    <button class:active={metrica === "1rm"} onclick={() => (metrica = "1rm")}>Máximo de Uma Repetição</button>
  </div>
{/if}

<style>
  .chart-wrap {
    height: 220px;
    margin-bottom: var(--space-3);
  }
  .toggle {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .toggle button {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .toggle button.active {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
