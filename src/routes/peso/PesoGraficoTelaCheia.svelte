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
    pontosComRotulo,
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
    /** Quais pontos recebem rótulo (período longo rotula só alguns) — null = todos. */
    pontosComRotulo: boolean[] | null;
    /** Diferença % pra meta de cada ponto (null = sem meta visível → mostra kg). */
    diffMetaPorPonto: (number | null)[] | null;
    metaAlvoPorPonto: (number | null)[] | null;
    /** No máximo 8 datas no eixo, em intervalos iguais — mesma lista calculada em Peso.svelte. */
    pontosComData: boolean[] | null;
    /** 3 itens de exibição do gráfico (Meta > Parametrização), já resolvidos pelo filtro de
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
        let ultimoRotuloMeta: string | null = null;
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
            // A meta é a mesma linha: só repete o número quando ele muda.
            if (Math.abs(yLinha - yPeso) >= 14 && alvo.toFixed(1) !== ultimoRotuloMeta) {
              ctx.fillStyle = COR_TREINO;
              ctx.fillText(alvo.toFixed(1), ponto.x, yLinha);
              ultimoRotuloMeta = alvo.toFixed(1);
            }
          }
        }
      } else {
        // Igual Peso.svelte: linha principal sempre em kg; com a meta visível, cada ponto rotulado
        // ganha também o valor da meta (vermelho) do lado de fora do par ponto/meta.
        let ultimoRotuloMeta: string | null = null;
        pontos.forEach((ponto, i) => {
          if (pontosComRotulo && !pontosComRotulo[i]) return;
          const p = pontosGrafico[i];
          if (!p) return;
          const yPeso = ponto.y - 14;
          const diff = diffMetaPorPonto?.[i];
          ctx.fillStyle = "#fff";
          ctx.fillText(diff != null ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%` : formatPeso(p.peso), ponto.x, yPeso);
          const alvo = metaAlvoPorPonto?.[i];
          if (alvo == null || !escalaY) return;
          const yAlvo = escalaY.getPixelForValue(alvo);
          const yLinha = yAlvo >= ponto.y ? yAlvo + 12 : yAlvo - 12;
          if (Math.abs(yLinha - yPeso) < 14) return;
          if (formatPeso(alvo) === ultimoRotuloMeta) return;
          ctx.fillStyle = COR_TREINO;
          ctx.fillText(formatPeso(alvo), ponto.x, yLinha);
          ultimoRotuloMeta = formatPeso(alvo);
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
    const corPonto = (data: string) => (informarTreino && diasComTreinoGrafico.has(data) ? COR_TREINO : COR_PESO);
    // Com "Destacar registro" desligado, as bolinhas somem — exceto nos dias de treino quando
    // "Informar treino" está ligado, que continuam marcados mesmo assim.
    const raioPonto = (data: string) => (destacarRegistro || (informarTreino && diasComTreinoGrafico.has(data)) ? 4 : 0);
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pontosGrafico.map((p, i) => (pontosComData && !pontosComData[i] ? "" : mostrarDiaSemanaGrafico ? DIAS_SEMANA_ABREV[parseISODate(p.data).getDay()] : formatDataCurta(p.data))),
        datasets: [
          {
            data: pontosGrafico.map((p) => p.peso),
            borderColor: COR_PESO,
            backgroundColor: COR_PESO,
            pointBackgroundColor: pontosGrafico.map((p) => corPonto(p.data)),
            pointBorderColor: pontosGrafico.map((p) => corPonto(p.data)),
            tension: 0.3,
            pointRadius: pontosGrafico.map((p) => raioPonto(p.data)),
            // Espessura fixa em todos os filtros — só as bolinhas (destacarRegistro) diferenciam o
            // semanal dos demais. Mesmo valor de Peso.svelte (meio-termo entre 3 e 1.5).
            borderWidth: 2.25,
            // Chart.js desenha ordem MAIOR primeiro (atrás) e ordem MENOR por último (na frente) --
            // a linha de peso fica sempre atrás da linha de meta, pra não cobrir a meta quando as
            // duas estiverem sincronizadas.
            order: 1,
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
                  // Meta semanal em degraus: reta no valor da semana, salto só no dia do reset.
                  stepped: "after" as const,
                  // Sempre desenhada por cima da linha de peso (ver comentário acima) — o tracejado
                  // vermelho fica visível por cima da linha sólida, mesmo nos pontos sincronizados.
                  order: 0,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Mesmo motivo de Peso.svelte: sem isso, toda reconstrução do gráfico (destroy+new Chart)
        // replay a animação de entrada padrão, dando efeito de "piscada".
        animation: false,
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
          x: {
            // Dia da semana no mesmo formato da data, só com um respiro maior das linhas do gráfico.
            ticks: { color: "#9aa0ab", padding: mostrarDiaSemanaGrafico ? 10 : 3 },
            grid: { display: false },
          },
          y: {
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
