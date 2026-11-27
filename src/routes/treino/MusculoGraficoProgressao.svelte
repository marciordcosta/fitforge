<script lang="ts">
  import { untrack } from "svelte";
  import { Chart, type ChartDataset } from "chart.js/auto";
  import { chaveSemana, parseISODate } from "../../lib/dates";
  import { PALETA } from "../../components/PieChart.svelte";

  /** Gráfico de progressão do músculo (no modal por músculo): uma linha clara por exercício (curva
   * do Máximo 1RM semana a semana, normalizada 0–1 — só a forma, pra comparar exercícios de cargas
   * muito diferentes) e, em destaque, a linha ponderada: média das curvas pesando cada exercício
   * pelo trabalho dele no músculo (séries × contribuição). */
  let {
    itens,
    obterPontos,
    cheia = $bindable(false),
    podeAmpliar = $bindable(false),
  }: {
    /** `peso` = séries × contribuição do exercício nesse músculo (soma, se aparecer em mais de uma rotina). */
    itens: { exercicioId: string; nome: string; peso: number }[];
    obterPontos: (exercicioId: string) => Promise<{ data: string; melhor1rm: number }[]>;
    /** Tela cheia: controlada por fora (o botão de ampliar fica ao lado do status de progressão, no modal). */
    cheia?: boolean;
    /** Avisa o modal se há gráfico pra ampliar. */
    podeAmpliar?: boolean;
  } = $props();

  const MAX_SEMANAS = 12;
  /** Altura fixa do bloco no modal: o gráfico não empurra a lista quando carrega. */
  const ALTURA = 190;

  type Serie = { nome: string; peso: number; porSemana: Map<string, number> };

  let carregando = $state(true);
  /** Gráfico já desenhado no tamanho final: até lá o quadro de "carregando" fica por cima. */
  let pronto = $state(false);
  let series = $state<Serie[]>([]);
  let token = 0;

  async function carregar(lista: typeof itens): Promise<void> {
    const meu = ++token;
    carregando = true;
    const resultado = await Promise.all(
      lista.map(async (it): Promise<Serie> => {
        const pontos = await obterPontos(it.exercicioId).catch(() => []);
        const porSemana = new Map<string, number>();
        for (const p of pontos) {
          const sem = chaveSemana(parseISODate(p.data));
          porSemana.set(sem, Math.max(porSemana.get(sem) ?? 0, p.melhor1rm));
        }
        return { nome: it.nome, peso: it.peso, porSemana };
      }),
    );
    if (meu !== token) return;
    series = resultado;
    pronto = false;
    carregando = false;
  }

  /** Só recarrega quando o CONTEÚDO muda (o modal pode recriar o array sem mudar nada): senão o
   * gráfico voltava ao "carregando" e piscava. */
  const chaveItens = $derived(itens.map((i) => `${i.exercicioId}:${i.peso}`).join("|"));
  let chaveCarregada = "";
  $effect(() => {
    const chave = chaveItens;
    if (chave === chaveCarregada) return;
    chaveCarregada = chave;
    void carregar(untrack(() => itens));
  });

  const semanas = $derived.by(() => {
    const todas = new Set<string>();
    for (const s of series) for (const k of s.porSemana.keys()) todas.add(k);
    return Array.from(todas).sort().slice(-MAX_SEMANAS);
  });

  function normalizar(valores: (number | null)[]): (number | null)[] {
    const nums = valores.filter((v): v is number => v != null);
    if (!nums.length) return valores;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (max === min) return valores.map((v) => (v == null ? null : 0.5));
    return valores.map((v) => (v == null ? null : (v - min) / (max - min)));
  }

  const dados = $derived.by(() => {
    const brutas = series.map((s) => semanas.map((sem) => s.porSemana.get(sem) ?? null));
    const normalizadas = brutas.map(normalizar);
    const ponderada = semanas.map((_, i) => {
      let soma = 0;
      let pesos = 0;
      series.forEach((s, k) => {
        const v = normalizadas[k][i];
        if (v != null && s.peso > 0) {
          soma += v * s.peso;
          pesos += s.peso;
        }
      });
      return pesos > 0 ? soma / pesos : null;
    });
    return { brutas, normalizadas, ponderada };
  });

  /** Só faz sentido desenhar com pelo menos 2 semanas com dados. */
  const temDados = $derived(semanas.length >= 2 && series.some((s) => s.porSemana.size > 0));

  function formatData(iso: string): string {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  function comOpacidade(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  type DS = ChartDataset<"line", (number | null)[]> & { rawData?: (number | null)[] };

  /** Ação do canvas: desenha/atualiza o gráfico sempre que os dados mudam e destrói ao sair. */
  function grafico(canvas: HTMLCanvasElement, _: unknown) {
    let chart: Chart | null = null;
    function desenhar(): void {
      chart?.destroy();
      const datasets: DS[] = series.map((s, i) => ({
        label: s.nome,
        data: dados.normalizadas[i],
        rawData: dados.brutas[i],
        borderColor: comOpacidade(PALETA[i % PALETA.length], 0.3),
        backgroundColor: comOpacidade(PALETA[i % PALETA.length], 0.3),
        tension: 0.3,
        borderWidth: 1.5,
        pointRadius: 0,
        spanGaps: true,
      }));
      datasets.push({
        label: "Ponderada",
        data: dados.ponderada,
        borderColor: "#ffffff",
        backgroundColor: "#ffffff",
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 3,
        spanGaps: true,
      });
      // Reta de tendência da linha ponderada (mínimos quadrados): o que o olho enxerga como "está subindo".
      const pts = dados.ponderada.map((v, x) => ({ x, v })).filter((p): p is { x: number; v: number } => p.v != null);
      if (pts.length >= 3) {
        const mx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
        const my = pts.reduce((acc, p) => acc + p.v, 0) / pts.length;
        const den = pts.reduce((acc, p) => acc + (p.x - mx) ** 2, 0);
        if (den > 0) {
          const incl = pts.reduce((acc, p) => acc + (p.x - mx) * (p.v - my), 0) / den;
          const clamp = (v: number) => Math.max(0, Math.min(1, v));
          datasets.push({
            label: "Tendência",
            data: dados.ponderada.map((_, x) => clamp(my + incl * (x - mx))),
            borderColor: "#ffffff",
            backgroundColor: "#ffffff",
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            spanGaps: true,
          });
        }
      }
      chart = new Chart(canvas, {
        type: "line",
        data: { labels: semanas.map(formatData), datasets },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const ds = ctx.dataset as DS;
                  if (ds.label === "Tendência") return "Tendência";
                  if (ds.label === "Ponderada") return `Ponderada: ${ctx.parsed.y == null ? "-" : Math.round(ctx.parsed.y * 100) + "%"}`;
                  const bruto = ds.rawData?.[ctx.dataIndex];
                  return `${ds.label}: ${bruto == null ? "-" : Math.round(bruto * 10) / 10 + " (1RM)"}`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#9aa0ab", maxTicksLimit: 6, autoSkip: true, font: { size: 10 } } },
            y: { min: 0, max: 1, ticks: { display: false }, grid: { color: "rgba(255, 255, 255, 0.08)" }, border: { display: false } },
          },
        },
      });
    }
    desenhar();
    // Um quadro depois do primeiro desenho (já com o tamanho final): revela o gráfico.
    requestAnimationFrame(() => requestAnimationFrame(() => (pronto = true)));
    return {
      update() {
        desenhar();
      },
      destroy() {
        chart?.destroy();
      },
    };
  }

  $effect(() => {
    podeAmpliar = !carregando && temDados;
    return () => {
      podeAmpliar = false;
      cheia = false;
    };
  });

  /** Muda a cada recálculo: faz a ação redesenhar. */
  const versao = $derived(dados);
</script>

<div class="bloco" style={`height:${ALTURA}px`}>
  {#if carregando}
    <div class="skeleton cheio" role="status" aria-label="Carregando gráfico"></div>
  {:else if !temDados}
    <div class="vazio"><p>Poucos registros para montar o gráfico (precisa de pelo menos 2 semanas de treino).</p></div>
  {:else}
    <canvas use:grafico={versao} class="canvas-inline" class:oculto={!pronto}></canvas>
    {#if !pronto}<div class="skeleton cheio sobre" role="status" aria-label="Carregando gráfico"></div>{/if}
  {/if}
</div>

{#if cheia && temDados}
  <div class="tela-cheia" role="dialog" aria-label="Gráfico de progressão do músculo">
    <div class="tela-cheia-topo">
      <span>Progressão por exercício</span>
      <button type="button" class="fechar" onclick={() => (cheia = false)} aria-label="Fechar">✕</button>
    </div>
    <div class="tela-cheia-grafico"><canvas use:grafico={versao}></canvas></div>
    <div class="legenda">
      <span class="item destaque"><i style="background:#fff"></i>Ponderada (tracejada = tendência)</span>
      {#each series as s, i (s.nome + i)}
        <span class="item"><i style={`background:${PALETA[i % PALETA.length]}`}></i>{s.nome}</span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .bloco {
    position: relative;
    margin-bottom: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    padding: var(--space-2);
    box-sizing: border-box;
  }
  .cheio {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-lg);
  }
  .canvas-inline.oculto {
    visibility: hidden;
  }
  .sobre {
    position: absolute;
    inset: var(--space-2);
    width: auto;
    height: auto;
  }
  .vazio {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 var(--space-4);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .vazio p {
    margin: 0;
  }
  .tela-cheia {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: flex;
    flex-direction: column;
    background: var(--surface-bg);
    padding: var(--space-4);
    box-sizing: border-box;
  }
  .tela-cheia-topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    margin-bottom: var(--space-3);
  }
  .fechar {
    width: 36px;
    height: 36px;
    border: 1px solid var(--surface-border);
    border-radius: 10px;
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .tela-cheia-grafico {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .legenda {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    padding-top: var(--space-3);
    font-size: 11px;
    color: var(--surface-muted);
  }
  .legenda .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legenda .item.destaque {
    color: var(--surface-fg);
    font-weight: 700;
  }
  .legenda i {
    width: 12px;
    height: 3px;
    border-radius: 2px;
    display: inline-block;
  }
</style>
