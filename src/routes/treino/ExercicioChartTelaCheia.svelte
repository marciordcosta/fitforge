<script lang="ts">
  import { untrack } from "svelte";
  import { Chart, type ChartDataset } from "chart.js/auto";
  import {
    getHistoricoExercicio,
    listExercicios,
    listTreinos,
    type HistoricoPonto,
    type Exercicio,
  } from "../../lib/treinoApi";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import { PALETA } from "../../components/PieChart.svelte";

  let {
    exercicio,
    metricaInicial,
    filtroQtd = $bindable(6),
    onFechar,
  }: {
    exercicio: Exercicio;
    metricaInicial: "peso" | "1rm" | "volume";
    filtroQtd?: number | null;
    onFechar: () => void;
  } = $props();

  const COR_PRINCIPAL = "#5eead4";

  let metrica = $state(untrack(() => metricaInicial));
  let historico = $state<HistoricoPonto[]>([]);
  let loading = $state(true);

  async function carregar() {
    loading = true;
    historico = await getHistoricoExercicio(exercicio.id);
    loading = false;
  }
  void carregar();

  // ---------------- Filtro por quantidade de registros ----------------
  // Datas nem sempre têm espaçamento regular ou histórico suficiente — filtrar pela
  // quantidade dos últimos registros é mais confiável do que filtrar por período.
  const FILTROS = [
    { valor: 6, label: "Últimos 6 registros" },
    { valor: 12, label: "Últimos 12 registros" },
    { valor: 24, label: "Últimos 24 registros" },
    { valor: null, label: "Tudo" },
  ] as const;
  let mostrarFiltro = $state(false);

  const historicoFiltrado = $derived(filtroQtd == null ? historico : historico.slice(-filtroQtd));

  // ---------------- Comparação com outros exercícios ----------------
  // Mostra exercícios que estão em alguma rotina atual e que trabalham algum dos
  // mesmos músculos do exercício atual.
  let comparando = $state(false);
  let carregandoComparaveis = $state(false);
  let comparaveis = $state<{ exercicio: Exercicio; historico: HistoricoPonto[] }[]>([]);
  let comparaveisCarregados = $state(false);

  async function carregarComparaveis() {
    if (comparaveisCarregados || carregandoComparaveis) return;
    carregandoComparaveis = true;
    try {
      const musculoIds = new Set(exercicio.musculos.map((m) => m.musculo_id));
      const [todos, treinos] = await Promise.all([listExercicios(), listTreinos()]);
      const emRotina = new Set<string>();
      for (const t of treinos) {
        for (const te of t.exercicios) emRotina.add(te.exercicio_id);
      }
      const candidatos = todos.filter(
        (ex) => ex.id !== exercicio.id && emRotina.has(ex.id) && ex.musculos.some((m) => musculoIds.has(m.musculo_id)),
      );
      const resultados = await Promise.all(
        candidatos.map(async (ex) => ({ exercicio: ex, historico: await getHistoricoExercicio(ex.id) })),
      );
      comparaveis = resultados.filter((r) => r.historico.length > 0);
      comparaveisCarregados = true;
    } finally {
      carregandoComparaveis = false;
    }
  }

  function alternarComparacao() {
    comparando = !comparando;
    if (comparando) void carregarComparaveis();
  }

  function formatData(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }

  function valorMetrica(h: HistoricoPonto): number {
    return metrica === "peso" ? h.maiorPeso : metrica === "1rm" ? Math.round(h.melhor1rm * 10) / 10 : h.volumeTotal;
  }

  /** Normaliza a série pro próprio intervalo (0 a 1) — na comparação não interessa o valor
   * absoluto (escalas muito diferentes entre exercícios), só a forma da curva: se um está
   * subindo enquanto o outro cai, por exemplo. */
  function normalizar(serie: (number | null)[]): (number | null)[] {
    const valores = serie.filter((v): v is number => v != null);
    if (!valores.length) return serie;
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    if (max === min) return serie.map((v) => (v == null ? null : 0.5));
    return serie.map((v) => (v == null ? null : (v - min) / (max - min)));
  }

  /** Só entram na comparação os registros dentro da mesma janela de datas do exercício principal (já filtrado). */
  const comparaveisNaJanela = $derived.by(() => {
    if (!comparando || !historicoFiltrado.length) return [];
    const dataMin = historicoFiltrado[0].data;
    const dataMax = historicoFiltrado[historicoFiltrado.length - 1].data;
    return comparaveis
      .map((c) => ({ ...c, historico: c.historico.filter((h) => h.data >= dataMin && h.data <= dataMax) }))
      .filter((c) => c.historico.length > 0);
  });

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;

  function desenharGrafico() {
    if (!canvas || !historicoFiltrado.length) return;
    chart?.destroy();

    // União de todas as datas visíveis (principal + comparação), pra alinhar tudo na mesma linha do tempo.
    const datasSet = new Set(historicoFiltrado.map((h) => h.data));
    for (const c of comparaveisNaJanela) {
      for (const h of c.historico) datasSet.add(h.data);
    }
    const datas = Array.from(datasSet).sort();
    const indicePorData = new Map(datas.map((d, i) => [d, i]));

    function serie(hist: HistoricoPonto[]): (number | null)[] {
      const arr = new Array<number | null>(datas.length).fill(null);
      for (const h of hist) {
        const idx = indicePorData.get(h.data);
        if (idx != null) arr[idx] = valorMetrica(h);
      }
      return arr;
    }

    const ajustar = (s: (number | null)[]) => (comparando ? normalizar(s) : s);

    const datasets: ChartDataset<"line", (number | null)[]>[] = [
      {
        label: exercicio.nome,
        data: ajustar(serie(historicoFiltrado)),
        borderColor: COR_PRINCIPAL,
        backgroundColor: COR_PRINCIPAL,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      },
      ...comparaveisNaJanela.map((c, i) => {
        const cor = PALETA[i % PALETA.length];
        return {
          label: c.exercicio.nome,
          data: ajustar(serie(c.historico)),
          borderColor: cor,
          backgroundColor: cor,
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 3],
          spanGaps: true,
        };
      }),
    ];

    chart = new Chart(canvas, {
      type: "line",
      data: { labels: datas.map(formatData), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: {
          legend: {
            display: comparando,
            position: "bottom",
            labels: { color: "#9aa0ab", boxWidth: 12, font: { size: 11 } },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9aa0ab", maxTicksLimit: 6, autoSkip: true, font: { size: 10 } },
          },
          y: comparando
            ? { display: false, min: 0, max: 1 }
            : { ticks: { color: "#9aa0ab" }, grid: { color: "rgba(255, 255, 255, 0.08)" } },
        },
      },
    });
  }

  $effect(() => {
    if (!loading) desenharGrafico();
    return () => chart?.destroy();
  });
</script>

{#snippet iconFiltro()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="4 4 20 4 14 12 14 19 10 21 10 12 4 4" />
  </svg>
{/snippet}
{#snippet iconComparar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="12" r="7" />
    <circle cx="15" cy="12" r="7" />
  </svg>
{/snippet}

<div class="tela-cheia">
  <div class="topo-esquerda">
    <button class="icone-topo" onclick={() => (mostrarFiltro = true)} aria-label="Filtrar registros">
      {@render iconFiltro()}
    </button>
    <button
      class="icone-topo"
      class:ativo={comparando}
      onclick={alternarComparacao}
      disabled={carregandoComparaveis}
      aria-label="Comparar com outros exercícios"
    >
      {@render iconComparar()}
    </button>
  </div>
  <button class="fechar" onclick={onFechar} aria-label="Fechar">✕</button>
  <div class="grafico-wrap">
    {#if loading}
      <p class="muted">Carregando…</p>
    {:else if !historicoFiltrado.length}
      <p class="muted">Nenhum registro ainda.</p>
    {:else}
      <canvas bind:this={canvas}></canvas>
    {/if}
  </div>
  <div class="toggle">
    <button class:active={metrica === "1rm"} onclick={() => (metrica = "1rm")}>Máximo 1RM</button>
    <button class:active={metrica === "peso"} onclick={() => (metrica = "peso")}>Maior Peso</button>
    <button class:active={metrica === "volume"} onclick={() => (metrica = "volume")}>Maior Volume</button>
  </div>
</div>

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

<style>
  .tela-cheia {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 200;
    display: flex;
    flex-direction: column;
  }
  @media (orientation: portrait) {
    .tela-cheia {
      top: 50%;
      left: 50%;
      width: 100vh;
      height: 100vw;
      transform: translate(-50%, -50%) rotate(90deg);
    }
  }
  .topo-esquerda {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    display: flex;
    gap: var(--space-2);
    z-index: 1;
  }
  .icone-topo {
    width: 32px;
    height: 32px;
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
    width: 17px;
    height: 17px;
  }
  .icone-topo.ativo {
    background: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .icone-topo:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .fechar {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
    z-index: 1;
  }
  .grafico-wrap {
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: var(--space-6) var(--space-5) var(--space-2);
  }
  .toggle {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-4);
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
    text-align: center;
  }
</style>
