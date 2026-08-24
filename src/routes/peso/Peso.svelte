<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { toISODate } from "../../lib/dates";
  import { getPesosDoPeriodo, type PesoRegistro } from "../../lib/pesoApi";
  import PesoDiaSheet from "./PesoDiaSheet.svelte";

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
  let loading = $state(true);
  let diaSelecionado = $state<string | null>(null);

  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);
  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));

  async function carregar() {
    loading = true;
    pesos = await getPesosDoPeriodo(toISODate(mesInicio), toISODate(mesFim));
    loading = false;
  }

  void carregar();

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregar();
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
    const lista: ({ dia: number; iso: string; peso: number | null } | null)[] = [];
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null);
    for (let dia = 1; dia <= totalDias; dia++) {
      const iso = toISODate(new Date(mesBase.getFullYear(), mesBase.getMonth(), dia));
      lista.push({ dia, iso, peso: pesosPorData.get(iso) ?? null });
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
    if (!pesos.length) return;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pesos.map((p) => formatDataCurta(p.data)),
        datasets: [
          {
            data: pesos.map((p) => p.peso),
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

  function abrirDia(iso: string) {
    diaSelecionado = iso;
  }

  function aoSalvar() {
    void carregar();
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Peso</h1>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !pesos.length}
    <p class="muted">Nenhum registro ainda. Toque em um dia no calendário pra começar.</p>
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

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    margin-bottom: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0;
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
