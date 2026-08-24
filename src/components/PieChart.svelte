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
  import Sheet from "./Sheet.svelte";

  interface DetalheExercicio {
    exercicio: string;
    series: number;
  }

  interface Fatia {
    nome: string;
    valor: number;
    detalhe?: DetalheExercicio[] | null;
  }

  let { dados }: { dados: Fatia[] } = $props();

  let fatiaSelecionada = $state<{ nome: string; detalhe: DetalheExercicio[] } | null>(null);

  function aoClicarFatia(f: { nome: string; detalhe?: DetalheExercicio[] | null }): void {
    if (!f.detalhe?.length) return;
    fatiaSelecionada = { nome: f.nome, detalhe: f.detalhe };
  }

  const CX = 50;
  const CY = 50;
  const R = 32;
  const COL_DIREITA = 78;
  const COL_ESQUERDA = 22;
  const MAX_CHARS_LINHA = 9;
  const ALTURA_LINHA = 5.4;

  function ponto(r: number, anguloGraus: number): { x: number; y: number } {
    const rad = ((anguloGraus - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  /** Quebra o nome em linhas curtas pra nunca ultrapassar a largura reservada pro rótulo. */
  function quebrarLinhas(texto: string): string[] {
    const palavras = texto.split(" ");
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (tentativa.length > MAX_CHARS_LINHA && atual) {
        linhas.push(atual);
        atual = p;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
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
      const pct = Math.round((d.valor / total) * 100);

      const pBorda = ponto(R, meio);
      const pCotovelo = ponto(R + 6, meio);
      const ladoDireito = pCotovelo.x >= CX;
      const colX = ladoDireito ? COL_DIREITA : COL_ESQUERDA;
      const labelX = colX + (ladoDireito ? 2 : -2);

      const linhasNome = quebrarLinhas(d.nome);
      const totalLinhas = linhasNome.length + 1;
      const dyInicial = -((totalLinhas - 1) / 2) * ALTURA_LINHA;

      return {
        nome: d.nome,
        pct,
        linhasNome,
        dyInicial,
        path,
        cor,
        detalhe: d.detalhe,
        linha: `M ${pBorda.x} ${pBorda.y} L ${pCotovelo.x} ${pCotovelo.y} L ${colX} ${pCotovelo.y}`,
        label: { x: labelX, y: pCotovelo.y },
        ancora: ladoDireito ? "start" : "end",
      };
    });
  });
</script>

<svg viewBox="0 0 100 100" class="pizza" role="img" aria-label="Distribuição muscular">
  {#each fatias as f (f.nome)}
    <path
      d={f.path}
      fill={f.cor}
      class:fatia-clicavel={!!f.detalhe?.length}
      role="button"
      tabindex={0}
      onclick={() => aoClicarFatia(f)}
      onkeydown={(e) => e.key === "Enter" && aoClicarFatia(f)}
    />
  {/each}
  {#each fatias as f (f.nome)}
    <path d={f.linha} class="fatia-linha" style={`stroke: ${f.cor};`} fill="none" />
    <text
      x={f.label.x}
      y={f.label.y}
      text-anchor={f.ancora}
      class="fatia-texto"
      class:fatia-clicavel={!!f.detalhe?.length}
      role="button"
      tabindex={0}
      onclick={() => aoClicarFatia(f)}
      onkeydown={(e) => e.key === "Enter" && aoClicarFatia(f)}
    >
      {#each f.linhasNome as linha, i (i)}
        <tspan x={f.label.x} dy={i === 0 ? `${f.dyInicial}` : `${ALTURA_LINHA}`} class="fatia-nome">{linha}</tspan>
      {/each}
      <tspan x={f.label.x} dy={`${ALTURA_LINHA}`} class="fatia-pct">{f.pct}%</tspan>
    </text>
  {/each}
</svg>

{#if fatiaSelecionada}
  <Sheet titulo={fatiaSelecionada.nome} onFechar={() => (fatiaSelecionada = null)}>
    <div class="detalhe-lista">
      {#each fatiaSelecionada.detalhe as d (d.exercicio)}
        <div class="detalhe-item">
          <span class="detalhe-nome">{d.exercicio}</span>
          <span class="detalhe-series">{d.series} {d.series === 1 ? "série" : "séries"}</span>
        </div>
      {/each}
    </div>
  </Sheet>
{/if}

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
    font-size: 4.2px;
    font-weight: 600;
  }
  .fatia-pct {
    font-size: 4.2px;
    font-weight: 700;
    opacity: 0.75;
  }
  .fatia-linha {
    stroke-width: 0.6;
  }
  .fatia-clicavel {
    cursor: pointer;
  }
  .detalhe-lista {
    display: flex;
    flex-direction: column;
  }
  .detalhe-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .detalhe-item:last-child {
    border-bottom: none;
  }
  .detalhe-nome {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .detalhe-series {
    flex-shrink: 0;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
</style>
