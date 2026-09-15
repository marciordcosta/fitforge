<script lang="ts">
  import { untrack } from "svelte";
  import { Chart, type ChartDataset } from "chart.js/auto";
  import { getHistoricoExercicio, listExercicios, type HistoricoPonto, type Exercicio, type MarcadorExercicio } from "../../lib/treinoApi";
  import { chaveSemana, parseISODate } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import { PALETA } from "../../components/PieChart.svelte";

  let {
    exercicio,
    metricaInicial,
    marcadores = [],
    filtroQtd = $bindable(6),
    onFechar,
  }: {
    exercicio: Exercicio;
    metricaInicial: "peso" | "1rm" | "volume" | "todos";
    marcadores?: MarcadorExercicio[];
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
  // Mostra exercícios que trabalham algum dos mesmos músculos do exercício atual e têm
  // histórico registrado — não precisa mais estar numa rotina ATUAL: um exercício que já saiu
  // da rotina (trocado, removido) mas tem registros antigos continua útil pra comparar.
  let comparando = $state(false);
  let carregandoComparaveis = $state(false);
  let comparaveis = $state<{ exercicio: Exercicio; historico: HistoricoPonto[] }[]>([]);
  let comparaveisCarregados = $state(false);

  async function carregarComparaveis() {
    if (comparaveisCarregados || carregandoComparaveis) return;
    carregandoComparaveis = true;
    try {
      const musculoIds = new Set(exercicio.musculos.map((m) => m.musculo_id));
      const todos = await listExercicios();
      const candidatos = todos.filter((ex) => ex.id !== exercicio.id && ex.musculos.some((m) => musculoIds.has(m.musculo_id)));
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
    if (metrica === "todos") return;
    comparando = !comparando;
    if (comparando) void carregarComparaveis();
    else mostrarMedia = false;
  }

  function escolherMetrica(nova: typeof metrica) {
    metrica = nova;
    if (nova === "todos") {
      comparando = false;
      mostrarMedia = false;
    }
  }

  /** Linha branca com a média das curvas normalizadas (principal + comparáveis) — só faz
   * sentido dentro da comparação, onde tudo já está na mesma escala 0-1. Quando ativa, as
   * linhas individuais ficam esmaecidas no fundo pra não competir com ela. */
  let mostrarMedia = $state(false);

  function alternarMedia(): void {
    if (!comparando) return;
    mostrarMedia = !mostrarMedia;
  }

  function comOpacidade(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Comparação entre 1RM, Peso e Volume do próprio exercício, cada um numa linha (também
   * só a forma da curva, não o valor bruto — as unidades nem são comparáveis entre si). */
  const METRICAS_TODOS = [
    { chave: "1rm" as const, label: "1RM", cor: "#5eead4" },
    { chave: "peso" as const, label: "Peso", cor: "#60a5fa" },
    { chave: "volume" as const, label: "Volume", cor: "#f472b6" },
  ];

  function valorPorChave(h: HistoricoPonto, chave: "1rm" | "peso" | "volume"): number {
    return chave === "peso" ? h.maiorPeso : chave === "1rm" ? Math.round(h.melhor1rm * 10) / 10 : h.volumeTotal;
  }

  function formatData(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }

  function formatNumero(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  /** Nos modos "Todos" e comparação, os pontos do gráfico são normalizados (0 a 1, só a forma
   * da curva) — sem isso o tooltip mostraria "0.42" em vez do valor real (1RM/peso/volume). */
  function tooltipValorReal(ctx: { dataset: { rawData?: (number | null)[]; label?: string }; dataIndex: number; parsed: { y: number | null } }): string {
    if (ctx.dataset.label === "Média") {
      const v = ctx.parsed.y;
      return `Média: ${v == null ? "-" : Math.round(v * 100) + "%"}`;
    }
    const bruto = ctx.dataset.rawData?.[ctx.dataIndex];
    const valor = bruto ?? ctx.parsed.y;
    return `${ctx.dataset.label}: ${valor == null ? "-" : formatNumero(valor)}`;
  }

  /** Linha extra do tooltip, embaixo do valor — quantas séries entraram nesse ponto (não se
   * aplica à linha de Média, que agrega vários exercícios). */
  function tooltipSeries(ctx: { dataset: { label?: string; seriesData?: (number | null)[] }; dataIndex: number }): string {
    if (ctx.dataset.label === "Média") return "";
    const n = ctx.dataset.seriesData?.[ctx.dataIndex];
    if (n == null) return "";
    return `${n} ${n === 1 ? "série" : "séries"}`;
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
    /** Semana ancorada em terça (mesma convenção do resto do app) de cada registro do
     * exercício principal — um exercício comparável só entra se tiver registro na MESMA
     * semana de alguma sessão do principal, não só dentro do intervalo min/max (que podia
     * incluir semanas inteiras sem nenhuma sessão do principal). */
    const semanasPrincipal = new Set(historicoFiltrado.map((h) => chaveSemana(parseISODate(h.data))));
    return comparaveis
      .map((c) => ({
        ...c,
        historico: c.historico.filter((h) => semanasPrincipal.has(chaveSemana(parseISODate(h.data)))),
      }))
      .filter((c) => c.historico.length > 0);
  });

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;

  /** Preenche os buracos ENTRE dois pontos conhecidos de uma série com interpolação linear —
   * sem isso, num dia em que só um exercício tem sessão registrada, a "média" daquele dia vira
   * o valor desse exercício sozinho (os outros contribuem null e saem da conta), fazendo a linha
   * pular de acordo com qual exercício foi treinado em cada dia em vez de refletir uma tendência
   * combinada de verdade. Não extrapola antes do primeiro nem depois do último ponto conhecido —
   * ali a série realmente não existe ainda/mais, ela fica de fora da média nesse trecho. */
  function interpolarSerie(serie: (number | null)[]): (number | null)[] {
    const resultado = serie.slice();
    let idxAnterior = -1;
    for (let i = 0; i < resultado.length; i++) {
      if (resultado[i] == null) continue;
      if (idxAnterior !== -1 && i - idxAnterior > 1) {
        const valorAnterior = resultado[idxAnterior]!;
        const passo = (resultado[i]! - valorAnterior) / (i - idxAnterior);
        for (let j = idxAnterior + 1; j < i; j++) {
          resultado[j] = valorAnterior + passo * (j - idxAnterior);
        }
      }
      idxAnterior = i;
    }
    return resultado;
  }

  function calcularMedia(series: (number | null)[][], tamanho: number): (number | null)[] {
    const interpoladas = series.map(interpolarSerie);
    return Array.from({ length: tamanho }, (_, i) => {
      const valores = interpoladas.map((s) => s[i]).filter((v): v is number => v != null);
      return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
    });
  }

  /** Recalcula a linha de Média a partir de quais linhas estão visíveis na legenda no momento —
   * esconder um exercício (clicando nele na legenda) tira ele da média também, em vez dela
   * continuar fixa considerando todo mundo. */
  function recalcularMedia(c: Chart): void {
    const idxMedia = c.data.datasets.findIndex((d) => d.label === "Média");
    if (idxMedia === -1) return;
    const seriesVisiveis = c.data.datasets
      .map((d, i) => ({ dados: d.data as (number | null)[], visivel: c.isDatasetVisible(i) }))
      .filter((_, i) => i !== idxMedia)
      .filter((s) => s.visivel)
      .map((s) => s.dados);
    const tamanho = (c.data.labels ?? []).length;
    (c.data.datasets[idxMedia].data as (number | null)[]) = calcularMedia(seriesVisiveis, tamanho);
  }

  function aoClicarLegenda(_e: unknown, legendItem: { datasetIndex?: number }, legend: { chart: Chart }): void {
    const index = legendItem.datasetIndex;
    if (index == null) return;
    const ci = legend.chart;
    if (ci.data.datasets[index]?.label === "Média") return;
    if (ci.isDatasetVisible(index)) {
      ci.hide(index);
    } else {
      ci.show(index);
    }
    recalcularMedia(ci);
    ci.update();
  }

  function desenharGrafico() {
    if (!canvas || !historicoFiltrado.length) return;
    chart?.destroy();

    if (metrica === "todos") {
      const datasetsTodos: (ChartDataset<"line", (number | null)[]> & { rawData?: (number | null)[]; seriesData?: (number | null)[] })[] =
        METRICAS_TODOS.map((m) => {
          const bruto = historicoFiltrado.map((h) => valorPorChave(h, m.chave));
          return {
            label: m.label,
            data: normalizar(bruto),
            rawData: bruto,
            seriesData: historicoFiltrado.map((h) => h.numSeries),
            borderColor: m.cor,
            backgroundColor: m.cor,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: true,
            // Peso não é relevante nessa comparação de forma de curva — some por padrão, mas continua clicável na legenda.
            hidden: m.chave === "peso",
          };
        });
      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: historicoFiltrado.map((h) => formatData(h.data)),
          datasets: datasetsTodos,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 20 } },
          plugins: {
            legend: { display: true, position: "bottom", labels: { color: "#9aa0ab", boxWidth: 12, font: { size: 11 } } },
            tooltip: { callbacks: { label: tooltipValorReal, afterLabel: tooltipSeries } },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#9aa0ab", maxTicksLimit: 6, autoSkip: true, font: { size: 10 } },
            },
            y: {
              min: 0,
              max: 1,
              ticks: { display: false },
              grid: { color: "rgba(255, 255, 255, 0.08)" },
              border: { display: false },
            },
          },
        },
      });
      return;
    }

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

    function serieNumSeries(hist: HistoricoPonto[]): (number | null)[] {
      const arr = new Array<number | null>(datas.length).fill(null);
      for (const h of hist) {
        const idx = indicePorData.get(h.data);
        if (idx != null) arr[idx] = h.numSeries;
      }
      return arr;
    }

    const ajustar = (s: (number | null)[]) => (comparando ? normalizar(s) : s);
    // Com a Média ativa, as linhas individuais ficam esmaecidas no fundo — só a média (branca,
    // adicionada depois, por cima) fica em destaque.
    const opacidadeLinha = mostrarMedia ? 0.25 : 1;

    const brutoPrincipal = serie(historicoFiltrado);
    const principalAjustado = ajustar(brutoPrincipal);
    const comparaveisAjustados = comparaveisNaJanela.map((c) => {
      const bruto = serie(c.historico);
      return { c, bruto, ajustado: ajustar(bruto) };
    });

    const datasets: (ChartDataset<"line", (number | null)[]> & { rawData?: (number | null)[]; seriesData?: (number | null)[] })[] = [
      {
        label: exercicio.nome,
        data: principalAjustado,
        rawData: brutoPrincipal,
        seriesData: serieNumSeries(historicoFiltrado),
        borderColor: comOpacidade(COR_PRINCIPAL, opacidadeLinha),
        backgroundColor: comOpacidade(COR_PRINCIPAL, opacidadeLinha),
        tension: 0.3,
        pointRadius: datas.map((d) => (marcadores.some((m) => m.data === d) ? 6 : 3)),
        pointBackgroundColor: datas.map((d) => (marcadores.some((m) => m.data === d) ? "#fbbf24" : comOpacidade(COR_PRINCIPAL, opacidadeLinha))),
        pointBorderColor: datas.map((d) => (marcadores.some((m) => m.data === d) ? "#d97706" : comOpacidade(COR_PRINCIPAL, opacidadeLinha))),
        spanGaps: true,
      },
      ...comparaveisAjustados.map(({ c, bruto, ajustado }, i) => {
        const cor = PALETA[i % PALETA.length];
        return {
          label: c.exercicio.nome,
          data: ajustado,
          rawData: bruto,
          seriesData: serieNumSeries(c.historico),
          borderColor: comOpacidade(cor, opacidadeLinha),
          backgroundColor: comOpacidade(cor, opacidadeLinha),
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 3],
          spanGaps: true,
        };
      }),
    ];

    if (mostrarMedia) {
      const todasSeries = [principalAjustado, ...comparaveisAjustados.map((x) => x.ajustado)];
      const media = calcularMedia(todasSeries, datas.length);
      datasets.push({
        label: "Média",
        data: media,
        borderColor: "#ffffff",
        backgroundColor: "#ffffff",
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 0,
        spanGaps: true,
      });
    }

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
            onClick: mostrarMedia ? aoClicarLegenda : Chart.defaults.plugins.legend.onClick,
          },
          tooltip: { callbacks: { label: tooltipValorReal, afterLabel: tooltipSeries } },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9aa0ab", maxTicksLimit: 6, autoSkip: true, font: { size: 10 } },
          },
          y: comparando
            ? {
                min: 0,
                max: 1,
                ticks: { display: false },
                grid: { color: "rgba(255, 255, 255, 0.08)" },
                border: { display: false },
              }
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
{#snippet iconMedia()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17c3-8 6-8 9 0s6 8 9 0" />
    <line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2.5 2.5" />
  </svg>
{/snippet}

<div class="tela-cheia">
  <div class="topo-esquerda">
    <button class="icone-topo" class:ativo={filtroQtd !== 6} onclick={() => (mostrarFiltro = true)} aria-label="Filtrar registros">
      {@render iconFiltro()}
    </button>
    <button
      class="icone-topo"
      class:ativo={comparando}
      onclick={alternarComparacao}
      disabled={carregandoComparaveis || metrica === "todos"}
      aria-label="Comparar com outros exercícios"
    >
      {@render iconComparar()}
    </button>
    <button
      class="icone-topo"
      class:ativo={mostrarMedia}
      onclick={alternarMedia}
      disabled={!comparando}
      aria-label="Mostrar linha de média"
    >
      {@render iconMedia()}
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
    <button class:active={metrica === "1rm"} onclick={() => escolherMetrica("1rm")}>Máximo 1RM</button>
    <button class:active={metrica === "peso"} onclick={() => escolherMetrica("peso")}>Maior Peso</button>
    <button class:active={metrica === "volume"} onclick={() => escolherMetrica("volume")}>Maior Volume</button>
    <button class:active={metrica === "todos"} onclick={() => escolherMetrica("todos")}>Todos</button>
  </div>
</div>

{#if mostrarFiltro}
  <div class="sheet-acima">
    <ActionSheet
      titulo="Quantidade de registros"
      onFechar={() => (mostrarFiltro = false)}
      opcoes={FILTROS.map((f) => ({
        label: f.label,
        valor: filtroQtd === f.valor ? "✓" : undefined,
        onSelect: () => (filtroQtd = f.valor),
      }))}
    />
  </div>
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
  /* O Sheet/ActionSheet usa z-index: 100, menor que o da tela cheia (200) — sem esse
     wrapper com z-index maior, o menu de filtro abre escondido atrás do gráfico. */
  .sheet-acima {
    position: relative;
    z-index: 300;
  }
</style>
