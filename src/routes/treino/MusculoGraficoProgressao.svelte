<script lang="ts">
  import { untrack } from "svelte";
  import { Chart, type ChartDataset } from "chart.js/auto";
  import { PALETA } from "../../components/PieChart.svelte";
  import { calcularProgressaoMusculo, type ItemProgressao, type StatusProgressao } from "../../lib/progressaoMusculo";

  /** Gráfico de progressão do músculo (no modal por músculo). Uma linha clara por exercício (1RM
   * semanal em % da primeira semana válida) e, em destaque, a linha ponderada (média pesando cada
   * exercício pelo trabalho dele no músculo) com a reta de tendência tracejada. O status
   * (Progredindo/Estagnado/Regredindo) sai da reta desse mesmo gráfico — ver lib/progressaoMusculo. */
  let {
    itens,
    obterPontos,
    cheia = $bindable(false),
    podeAmpliar = $bindable(false),
    status = $bindable(null),
    carregando = $bindable(true),
  }: {
    /** `peso` = ponderamento do exercício no músculo (séries × contribuição, somado se aparecer em mais de uma rotina). */
    itens: { exercicioId: string; nome: string; peso: number }[];
    obterPontos: (exercicioId: string) => Promise<{ data: string; melhor1rm: number }[]>;
    /** Tela cheia: controlada por fora (o botão de ampliar fica no cabeçalho do modal). */
    cheia?: boolean;
    podeAmpliar?: boolean;
    /** Status lido da reta do gráfico (o modal mostra no topo). */
    status?: StatusProgressao | null;
    carregando?: boolean;
  } = $props();

  /** Altura fixa do bloco no modal: o gráfico não empurra a lista quando carrega. */
  const ALTURA = 190;

  /** Gráfico já desenhado no tamanho final: até lá o quadro de "carregando" fica por cima. */
  let pronto = $state(false);
  let carregados = $state<ItemProgressao[]>([]);
  let token = 0;

  async function carregar(lista: typeof itens): Promise<void> {
    const meu = ++token;
    carregando = true;
    const resultado = await Promise.all(
      lista.map(async (it): Promise<ItemProgressao> => {
        const pontos = await obterPontos(it.exercicioId).catch(() => []);
        return { nome: it.nome, peso: it.peso, pontos };
      }),
    );
    if (meu !== token) return;
    carregados = resultado;
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

  const prog = $derived(calcularProgressaoMusculo(carregados));

  $effect(() => {
    status = carregando ? null : prog.status;
  });

  /** Só faz sentido desenhar com pelo menos 2 semanas com dados. */
  const temDados = $derived(prog.semanas.length >= 2 && prog.ponderada.filter((v) => v != null).length >= 2);

  $effect(() => {
    podeAmpliar = !carregando && temDados;
    return () => {
      podeAmpliar = false;
      cheia = false;
    };
  });

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

  type DS = ChartDataset<"line", (number | null)[]>;

  /** Ação do canvas: desenha/atualiza o gráfico sempre que os dados mudam e destrói ao sair. */
  function grafico(canvas: HTMLCanvasElement, _: unknown) {
    let chart: Chart | null = null;
    function desenhar(): void {
      chart?.destroy();
      const datasets: DS[] = carregados.map((it, i) => ({
        label: it.nome,
        data: prog.curvas[i],
        borderColor: comOpacidade(PALETA[i % PALETA.length], 0.3),
        backgroundColor: comOpacidade(PALETA[i % PALETA.length], 0.3),
        tension: 0.3,
        borderWidth: 1.5,
        pointRadius: 0,
        spanGaps: true,
      }));
      datasets.push({
        label: "Ponderada",
        data: prog.ponderada,
        borderColor: "#ffffff",
        backgroundColor: "#ffffff",
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: true,
      });
      if (prog.reta.some((v) => v != null)) {
        datasets.push({
          label: "Tendência",
          data: prog.reta,
          borderColor: "#ffffff",
          backgroundColor: "#ffffff",
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          spanGaps: true,
        });
      }
      chart = new Chart(canvas, {
        type: "line",
        data: { labels: prog.semanas.map(formatData), datasets },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "-" : Math.round(ctx.parsed.y) + "%"}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#9aa0ab", maxTicksLimit: 6, autoSkip: true, font: { size: 10 } } },
            y: {
              grid: { color: "rgba(255, 255, 255, 0.08)" },
              border: { display: false },
              ticks: { color: "#9aa0ab", maxTicksLimit: 5, font: { size: 10 }, callback: (v) => `${v}%` },
            },
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

  /** Muda a cada recálculo: faz a ação redesenhar. */
  const versao = $derived(prog);
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
      <span class="item destaque"><i style="background:#fff"></i>Ponderada (tracejada = tendência, em % do início)</span>
      {#each carregados as s, i (s.nome + i)}
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
