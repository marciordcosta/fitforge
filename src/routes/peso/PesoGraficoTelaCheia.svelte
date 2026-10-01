<script lang="ts">
  import { Chart } from "chart.js/auto";
  import type { PesoRegistro } from "../../lib/pesoApi";
  import { parseISODate } from "../../lib/dates";
  import { DIAS_SEMANA_ABREV } from "../../lib/treinoApi";

  let {
    pontosGrafico,
    diasComTreinoGrafico,
    diasComTreinoNomeGrafico,
    modo,
    metaLinha,
    diffMetaPorPonto,
    metaAlvoPorPonto,
    pontosComData,
    mostrarPesoVariacao,
    mostrarDiaSemanaGrafico,
    informarTreino,
    destacarRegistro,
    onFechar,
  }: {
    pontosGrafico: PesoRegistro[];
    diasComTreinoGrafico: Set<string>;
    diasComTreinoNomeGrafico: Map<string, string>;
    modo: "diario" | "media";
    metaLinha: (number | null)[] | null;
    diffMetaPorPonto: (number | null)[] | null;
    metaAlvoPorPonto: (number | null)[] | null;
    /** No máximo 8 datas no eixo, em intervalos iguais — mesma lista calculada em Peso.svelte. */
    pontosComData: boolean[] | null;
    /** 4 itens de exibição do gráfico (Meta > Parametrização), já resolvidos pelo filtro de
     * período em Peso.svelte — aqui só consome o resultado pronto. */
    mostrarPesoVariacao: boolean;
    mostrarDiaSemanaGrafico: boolean;
    informarTreino: boolean;
    destacarRegistro: boolean;
    onFechar: () => void;
  } = $props();

  const COR_PESO = "#5eead4";
  const COR_TREINO = "#f87171";
  const COR_META = "rgba(248, 113, 113, 0.5)";

  function formatDataCurta(iso: string): string {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  function formatPeso(valor: number): string {
    return valor.toFixed(1).replace(".", ",");
  }

  const pluginRotulosMeta = {
    id: "rotulosMetaTelaCheia",
    afterDatasetsDraw(c: Chart) {
      const pontos = c.getDatasetMeta(0).data;
      const escalaY = c.scales.y;
      const { ctx } = c;
      if (!pontos.length) return;
      ctx.save();
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // ---- "Adicionar peso/variação no gráfico" ----
      if (!mostrarPesoVariacao) {
        const extremos = pontos.length > 1 ? [0, pontos.length - 1] : [0];
        for (const i of extremos) {
          const ponto = pontos[i];
          const p = pontosGrafico[i];
          if (!ponto || !p) continue;
          const yPeso = ponto.y - 14;
          ctx.fillStyle = "#fff";
          ctx.fillText(formatPeso(p.peso), ponto.x, yPeso);
          const alvo = metaAlvoPorPonto?.[i];
          if (alvo != null && escalaY) {
            const yLinha = escalaY.getPixelForValue(alvo) - 12;
            if (Math.abs(yLinha - yPeso) >= 14) {
              ctx.fillStyle = COR_TREINO;
              ctx.fillText(alvo.toFixed(1), ponto.x, yLinha);
            }
          }
        }
      } else {
        pontos.forEach((ponto, i) => {
          const diff = diffMetaPorPonto?.[i];
          // Suprimido por período maior que 1 semana (ver pontosComRotulo em Peso.svelte) — não anota esse ponto.
          if (diffMetaPorPonto != null && diff == null) return;
          const yDiff = ponto.y - 14;
          if (diff != null) {
            ctx.fillStyle = "#fff";
            const texto = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
            ctx.fillText(texto, ponto.x, yDiff);
          } else {
            // Sem meta ativa (ou sem meta cadastrada) — mostra o peso real em vez de nada, igual Peso.svelte.
            const p = pontosGrafico[i];
            if (p) {
              ctx.fillStyle = "#fff";
              ctx.fillText(formatPeso(p.peso), ponto.x, yDiff);
            }
          }
          // Só o último ponto da linha reta da meta ganha o rótulo com o valor — igual Peso.svelte.
          if (i !== pontos.length - 1) return;
          const alvo = metaAlvoPorPonto?.[i];
          if (alvo != null && escalaY) {
            const yLinha = escalaY.getPixelForValue(alvo) - 12;
            if (diff != null && Math.abs(yLinha - yDiff) < 14) return;
            ctx.fillStyle = COR_TREINO;
            ctx.fillText(alvo.toFixed(1), ponto.x, yLinha);
          }
        });
      }

      // ---- "Adicionar dia da semana no gráfico" (independente do item acima) ----
      if (mostrarDiaSemanaGrafico) {
        pontos.forEach((ponto, i) => {
          const diff = diffMetaPorPonto?.[i];
          if (diffMetaPorPonto != null && diff == null) return;
          const p = pontosGrafico[i];
          if (!p) return;
          const yDia = Math.min(ponto.y + 15, c.chartArea.bottom - 4);
          ctx.fillStyle = "#9aa0ab";
          ctx.fillText(DIAS_SEMANA_ABREV[parseISODate(p.data).getDay()], ponto.x, yDia);
        });
      }
      ctx.restore();
    },
  };

  let canvas = $state<HTMLCanvasElement | undefined>();
  let chart: Chart | null = null;

  function desenhar() {
    if (!canvas) return;
    chart?.destroy();
    const corPonto = (data: string) =>
      informarTreino && modo === "diario" && diasComTreinoGrafico.has(data) ? COR_TREINO : COR_PESO;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pontosGrafico.map((p, i) => (pontosComData && !pontosComData[i] ? "" : formatDataCurta(p.data))),
        datasets: [
          {
            data: pontosGrafico.map((p) => p.peso),
            borderColor: COR_PESO,
            backgroundColor: COR_PESO,
            pointBackgroundColor: pontosGrafico.map((p) => corPonto(p.data)),
            pointBorderColor: pontosGrafico.map((p) => corPonto(p.data)),
            tension: 0.3,
            pointRadius: destacarRegistro ? 4 : 0,
            // Espessura fixa em todos os filtros — só as bolinhas (destacarRegistro) diferenciam o
            // semanal dos demais. Mesmo valor de Peso.svelte (meio-termo entre 3 e 1.5).
            borderWidth: 2.25,
          },
          ...(metaLinha
            ? [
                {
                  data: metaLinha,
                  borderColor: COR_META,
                  backgroundColor: COR_META,
                  borderDash: [6, 4],
                  borderWidth: 1.5,
                  pointRadius: 0,
                  spanGaps: true,
                  tension: 0,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 28 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (ctx) => `${formatPeso(ctx.parsed.y ?? 0)} kg`,
              afterLabel: (ctx) => {
                const ponto = pontosGrafico[ctx.dataIndex];
                const nomeTreino = ponto ? diasComTreinoNomeGrafico.get(ponto.data) : undefined;
                return nomeTreino ? `Treino: ${nomeTreino}` : undefined;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: "#9aa0ab" }, grid: { display: false } },
          y: {
            // Mesma folga do gráfico compacto (Peso.svelte) — ver o comentário lá.
            grace: mostrarDiaSemanaGrafico ? "12%" : undefined,
            ticks: { color: "#9aa0ab" },
            grid: { color: "rgba(255, 255, 255, 0.08)" },
          },
        },
      },
      plugins: [pluginRotulosMeta],
    });
  }

  $effect(() => {
    desenhar();
    return () => chart?.destroy();
  });
</script>

<div class="tela-cheia" onclick={onFechar} role="presentation">
  <button class="fechar" onclick={onFechar} aria-label="Fechar">✕</button>
  <div class="grafico-wrap" onclick={(e) => e.stopPropagation()} role="presentation">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .tela-cheia {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 200;
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
    width: 100%;
    height: 100%;
    padding: var(--space-6) var(--space-5) var(--space-4);
  }
</style>
