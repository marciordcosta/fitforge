<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { getHistoricoExercicio, type HistoricoPonto, type Exercicio } from "../../lib/treinoApi";
  import ExercicioChartTelaCheia from "./ExercicioChartTelaCheia.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  let { exercicio, filtroQtd = $bindable(6) }: { exercicio: Exercicio; filtroQtd?: number | null } = $props();

  let historico = $state<HistoricoPonto[]>([]);
  let loading = $state(true);
  let metrica = $state<"peso" | "1rm" | "volume" | "todos">("1rm");
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;
  let mostrarTelaCheia = $state(false);

  // ---------------- Filtro por quantidade de registros ----------------
  // Fica sempre visível aqui (mais usado que a comparação, que só existe na tela cheia),
  // separado da área do gráfico pra não abrir a tela cheia sem querer.
  const FILTROS = [
    { valor: 6, label: "Últimos 6 registros" },
    { valor: 12, label: "Últimos 12 registros" },
    { valor: 24, label: "Últimos 24 registros" },
    { valor: null, label: "Tudo" },
  ] as const;
  let mostrarFiltro = $state(false);

  const METRICAS_TODOS = [
    { chave: "1rm" as const, label: "1RM", cor: "#5eead4" },
    { chave: "peso" as const, label: "Peso", cor: "#60a5fa" },
    { chave: "volume" as const, label: "Volume", cor: "#f472b6" },
  ];

  function valorPorChave(h: HistoricoPonto, chave: "1rm" | "peso" | "volume"): number {
    return chave === "peso" ? h.maiorPeso : chave === "1rm" ? Math.round(h.melhor1rm * 10) / 10 : h.volumeTotal;
  }

  /** Normaliza a série pro próprio intervalo (0 a 1) — no modo "Todos" as unidades de
   * 1RM/Peso/Volume nem são comparáveis, só interessa a forma da curva de cada uma. */
  function normalizar(serie: number[]): number[] {
    if (!serie.length) return serie;
    const min = Math.min(...serie);
    const max = Math.max(...serie);
    if (max === min) return serie.map(() => 0.5);
    return serie.map((v) => (v - min) / (max - min));
  }

  async function carregar() {
    loading = true;
    historico = await getHistoricoExercicio(exercicio.id);
    loading = false;
  }

  void carregar();

  const historicoFiltrado = $derived(filtroQtd == null ? historico : historico.slice(-filtroQtd));

  function formatData(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }

  function desenharGrafico() {
    if (!canvas || !historicoFiltrado.length) return;
    chart?.destroy();

    const modoTodos = metrica === "todos";
    const metricaAtual = metrica;
    const valores = metricaAtual === "todos" ? [] : historicoFiltrado.map((h) => valorPorChave(h, metricaAtual));

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: historicoFiltrado.map((h) => formatData(h.data)),
        datasets: modoTodos
          ? METRICAS_TODOS.map((m) => ({
              label: m.label,
              data: normalizar(historicoFiltrado.map((h) => valorPorChave(h, m.chave))),
              borderColor: m.cor,
              backgroundColor: m.cor,
              tension: 0.3,
              pointRadius: 2,
            }))
          : [
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
        plugins: {
          legend: modoTodos
            ? { display: true, position: "bottom", labels: { color: "#9aa0ab", boxWidth: 10, font: { size: 9 } } }
            : { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9aa0ab", maxTicksLimit: 5, autoSkip: true, font: { size: 10 } },
          },
          y: modoTodos
            ? { display: false, min: 0, max: 1 }
            : { ticks: { color: "#9aa0ab" }, grid: { color: "rgba(255, 255, 255, 0.08)" } },
        },
      },
    });
  }

  $effect(() => {
    if (!loading) desenharGrafico();
  });
</script>

{#snippet iconFiltro()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="4 4 20 4 14 12 14 19 10 21 10 12 4 4" />
  </svg>
{/snippet}
{#snippet iconExpandir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
{/snippet}

{#if loading}
  <p class="muted">Carregando histórico…</p>
{:else if !historico.length}
  <p class="muted">Nenhum registro ainda. O gráfico aparece depois do primeiro treino logado.</p>
{:else}
  <div class="chart-toolbar">
    <button class="icone-topo" onclick={() => (mostrarFiltro = true)} aria-label="Filtrar registros">
      {@render iconFiltro()}
    </button>
    <button class="icone-topo" onclick={() => (mostrarTelaCheia = true)} aria-label="Ver gráfico em tela cheia">
      {@render iconExpandir()}
    </button>
  </div>
  <div class="chart-wrap">
    <canvas bind:this={canvas}></canvas>
  </div>
  <div class="toggle">
    <button class:active={metrica === "1rm"} onclick={() => (metrica = "1rm")}>Máximo 1RM</button>
    <button class:active={metrica === "peso"} onclick={() => (metrica = "peso")}>Maior Peso</button>
    <button class:active={metrica === "volume"} onclick={() => (metrica = "volume")}>Maior Volume</button>
    <button class:active={metrica === "todos"} onclick={() => (metrica = "todos")}>Todos</button>
  </div>
{/if}

{#if mostrarFiltro}
  <ActionSheet
    titulo="Quantidade de registros"
    onFechar={() => (mostrarFiltro = false)}
    opcoes={FILTROS.map((f) => ({
      label: f.label,
      valor: filtroQtd === f.valor ? "✓" : undefined,
      onSelect: () => (filtroQtd = f.valor),
    }))}
  />
{/if}

{#if mostrarTelaCheia}
  <ExercicioChartTelaCheia {exercicio} metricaInicial={metrica} bind:filtroQtd onFechar={() => (mostrarTelaCheia = false)} />
{/if}

<style>
  .chart-toolbar {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .icone-topo {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--surface-card);
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .icone-topo svg {
    width: 15px;
    height: 15px;
  }
  .chart-wrap {
    width: 100%;
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
    min-width: 0;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-muted);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .toggle button.active {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
    font-weight: 800;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
