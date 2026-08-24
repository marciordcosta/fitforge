<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { toISODate, hojeISO } from "../../lib/dates";
  import { getPesosDoPeriodo, type PesoRegistro } from "../../lib/pesoApi";
  import { getDiasComTreino } from "../../lib/treinoApi";
  import PesoDiaSheet from "./PesoDiaSheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  const COR_PESO = "#5eead4";
  const COR_TREINO = "#f87171";

  interface Periodo {
    valor: string;
    label: string;
    dias: number | null;
  }

  const PERIODOS: Periodo[] = [
    { valor: "7d", label: "1 semana", dias: 7 },
    { valor: "1m", label: "1 mês", dias: 30 },
    { valor: "3m", label: "3 meses", dias: 90 },
    { valor: "6m", label: "6 meses", dias: 182 },
    { valor: "1a", label: "1 ano", dias: 365 },
    { valor: "tudo", label: "Tudo", dias: null },
  ];

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const DIAS_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  let mesBase = $state(new Date());
  let pesos = $state<PesoRegistro[]>([]);
  let diasComTreino = $state<Set<string>>(new Set());
  let loading = $state(true);
  let diaSelecionado = $state<string | null>(null);

  let periodo = $state<Periodo>(PERIODOS[2]);
  let pesosGrafico = $state<PesoRegistro[]>([]);
  let diasComTreinoGrafico = $state<Set<string>>(new Set());
  let loadingGrafico = $state(true);
  let mostrarFiltro = $state(false);

  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);
  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));

  async function carregar() {
    loading = true;
    const dataInicio = toISODate(mesInicio);
    const dataFim = toISODate(mesFim);
    const [listaPesos, listaTreinos] = await Promise.all([
      getPesosDoPeriodo(dataInicio, dataFim),
      getDiasComTreino(dataInicio, dataFim),
    ]);
    pesos = listaPesos;
    diasComTreino = new Set(listaTreinos.map((t) => t.data));
    loading = false;
  }

  void carregar();

  async function carregarGrafico() {
    loadingGrafico = true;
    const hoje = new Date();
    const dataInicio = periodo.dias == null ? "1900-01-01" : toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - periodo.dias));
    const dataFim = hojeISO();
    const [listaPesos, listaTreinos] = await Promise.all([
      getPesosDoPeriodo(dataInicio, dataFim),
      getDiasComTreino(dataInicio, dataFim),
    ]);
    pesosGrafico = listaPesos;
    diasComTreinoGrafico = new Set(listaTreinos.map((t) => t.data));
    loadingGrafico = false;
  }

  void carregarGrafico();

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregar();
  }

  function selecionarPeriodo(p: Periodo) {
    periodo = p;
    void carregarGrafico();
  }

  const pesosPorData = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const p of pesos) mapa.set(p.data, p.peso);
    return mapa;
  });

  /** Grade do mês: células vazias antes do dia 1 (pra alinhar com o dia da semana), depois um item por dia do mês. */
  const celulas = $derived.by(() => {
    const totalDias = mesFim.getDate();
    const primeiroDiaSemana = (mesInicio.getDay() + 6) % 7; // 0=Seg..6=Dom
    const lista: ({ dia: number; iso: string; peso: number | null; temTreino: boolean } | null)[] = [];
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null);
    for (let dia = 1; dia <= totalDias; dia++) {
      const iso = toISODate(new Date(mesBase.getFullYear(), mesBase.getMonth(), dia));
      lista.push({ dia, iso, peso: pesosPorData.get(iso) ?? null, temTreino: diasComTreino.has(iso) });
    }
    return lista;
  });

  function formatDataCurta(iso: string): string {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  let canvas = $state<HTMLCanvasElement | undefined>();
  let chart: Chart | null = null;

  function desenharGrafico() {
    if (!canvas) return;
    chart?.destroy();
    chart = null;
    if (!pesosGrafico.length) return;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pesosGrafico.map((p) => formatDataCurta(p.data)),
        datasets: [
          {
            data: pesosGrafico.map((p) => p.peso),
            borderColor: COR_PESO,
            backgroundColor: COR_PESO,
            pointBackgroundColor: pesosGrafico.map((p) => (diasComTreinoGrafico.has(p.data) ? COR_TREINO : COR_PESO)),
            pointBorderColor: pesosGrafico.map((p) => (diasComTreinoGrafico.has(p.data) ? COR_TREINO : COR_PESO)),
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
          x: { display: false },
          y: { ticks: { color: "#9aa0ab" }, grid: { color: "rgba(255, 255, 255, 0.08)" } },
        },
      },
    });
  }

  $effect(() => {
    if (!loadingGrafico) desenharGrafico();
  });

  function abrirDia(iso: string) {
    diaSelecionado = iso;
  }

  function abrirAdicionar() {
    diaSelecionado = hojeISO();
  }

  function aoSalvar() {
    void carregar();
    void carregarGrafico();
  }
</script>

{#snippet iconFiltro()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
{/snippet}
{#snippet iconAdicionar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Peso</h1>
    <div class="header-acoes">
      <button class="icon-btn" onclick={() => (mostrarFiltro = true)} aria-label="Filtro de período">
        {@render iconFiltro()}
      </button>
      <button class="icon-btn" onclick={abrirAdicionar} aria-label="Adicionar peso">
        {@render iconAdicionar()}
      </button>
    </div>
  </div>

  {#if loadingGrafico}
    <p class="muted">Carregando…</p>
  {:else if !pesosGrafico.length}
    <p class="muted">Nenhum registro nesse período.</p>
  {:else}
    <div class="chart-wrap">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}

  <div class="mes-nav">
    <button onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
    <span>{mesLabel}</span>
    <button onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
  </div>

  <div class="dias-semana">
    {#each DIAS_ABREV as d (d)}
      <span>{d}</span>
    {/each}
  </div>

  {#if !loading}
    <div class="grade">
      {#each celulas as cel, i (i)}
        {#if cel === null}
          <div class="celula vazia"></div>
        {:else}
          <button class="celula" class:com-peso={cel.peso != null} onclick={() => abrirDia(cel.iso)}>
            {#if cel.temTreino}
              <span class="marcador-treino" aria-hidden="true"></span>
            {/if}
            <span class="dia-numero" class:muted={cel.peso == null}>{cel.dia}</span>
            {#if cel.peso != null}
              <span class="peso-valor">{cel.peso}</span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

{#if diaSelecionado !== null}
  <PesoDiaSheet data={diaSelecionado} onFechar={() => (diaSelecionado = null)} onSalvo={aoSalvar} />
{/if}

{#if mostrarFiltro}
  <ActionSheet
    titulo="Período do gráfico"
    onFechar={() => (mostrarFiltro = false)}
    opcoes={PERIODOS.map((p) => ({ label: p.label, onSelect: () => selecionarPeriodo(p) }))}
  />
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .header-acoes {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .icon-btn svg {
    width: 22px;
    height: 22px;
  }
  .chart-wrap {
    height: 220px;
    margin-bottom: var(--space-4);
  }
  .mes-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .mes-nav span {
    font-weight: 600;
    min-width: 140px;
    text-align: center;
  }
  .mes-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .dias-semana {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: var(--space-2);
  }
  .dias-semana span {
    text-align: center;
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
  }
  .grade {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .celula {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: var(--radius-sm);
    background: none;
    border: none;
    font-family: inherit;
    padding: 2px;
    box-sizing: border-box;
    overflow: hidden;
    cursor: pointer;
  }
  .marcador-treino {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f87171;
  }
  .celula.vazia {
    visibility: hidden;
    cursor: default;
  }
  .celula.com-peso {
    background: var(--surface-card);
  }
  .dia-numero {
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    font-weight: 600;
  }
  .dia-numero.muted {
    color: var(--surface-muted);
    font-weight: 400;
  }
  .peso-valor {
    font-size: 9px;
    color: var(--color-primary);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
