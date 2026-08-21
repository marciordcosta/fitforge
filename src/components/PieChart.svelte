<script module lang="ts">
  export const PALETA = [
    "#4ade80",
    "#60a5fa",
    "#f472b6",
    "#fbbf24",
    "#a78bfa",
    "#fb7185",
    "#34d399",
    "#38bdf8",
    "#f97316",
    "#c084fc",
  ];
</script>

<script lang="ts">
  interface Fatia {
    nome: string;
    valor: number;
  }

  let { dados }: { dados: Fatia[] } = $props();

  const CX = 50;
  const CY = 50;
  const R = 32;

  function ponto(r: number, anguloGraus: number): { x: number; y: number } {
    const rad = ((anguloGraus - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  const total = $derived(dados.reduce((s, d) => s + d.valor, 0));

  const fatias = $derived.by(() => {
    if (total <= 0) return [];
    let anguloAtual = 0;
    return dados.map((d, i) => {
      const angulo = (d.valor / total) * 360;
      const inicio = anguloAtual;
      const fim = anguloAtual + angulo;
      anguloAtual = fim;
      let path: string;
      if (angulo >= 359.99) {
        const p0 = ponto(R, 0);
        const p1 = ponto(R, 179.99);
        const p2 = ponto(R, 359.98);
        path = `M ${p0.x} ${p0.y} A ${R} ${R} 0 1 1 ${p1.x} ${p1.y} A ${R} ${R} 0 1 1 ${p2.x} ${p2.y} Z`;
      } else {
        const p0 = ponto(R, inicio);
        const p1 = ponto(R, fim);
        const largeArc = angulo > 180 ? 1 : 0;
        path = `M ${CX} ${CY} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`;
      }

      const meio = (inicio + fim) / 2;
      const cor = PALETA[i % PALETA.length];

      const pBorda = ponto(R, meio);
      const pCotovelo = ponto(R + 7, meio);
      const ladoDireito = pCotovelo.x >= CX;
      const pLabel = { x: pCotovelo.x + (ladoDireito ? 3 : -3), y: pCotovelo.y };
      return {
        nome: d.nome,
        valor: d.valor,
        path,
        cor,
        linha: `M ${pBorda.x} ${pBorda.y} L ${pCotovelo.x} ${pCotovelo.y} L ${pLabel.x} ${pLabel.y}`,
        label: pLabel,
        ancora: ladoDireito ? "start" : "end",
      };
    });
  });
</script>

<svg viewBox="0 0 100 100" class="pizza" role="img" aria-label="Distribuição muscular">
  {#each fatias as f (f.nome)}
    <path d={f.path} fill={f.cor} />
  {/each}
  {#each fatias as f (f.nome)}
    <path d={f.linha} class="fatia-linha" style={`stroke: ${f.cor};`} fill="none" />
    <text x={f.label.x} y={f.label.y} text-anchor={f.ancora} dominant-baseline="middle" class="fatia-texto">
      <tspan class="fatia-nome">{f.nome}</tspan>
      <tspan class="fatia-valor"> {f.valor}</tspan>
    </text>
  {/each}
</svg>

<style>
  .pizza {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .fatia-texto {
    fill: #fff;
  }
  .fatia-nome {
    font-size: 4.5px;
    font-weight: 600;
  }
  .fatia-valor {
    font-size: 4.5px;
    font-weight: 700;
  }
  .fatia-linha {
    stroke-width: 0.6;
  }
</style>
