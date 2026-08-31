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
    /** Se informado, subdivide a fatia nessas partes internas (cores próprias), mantendo
     * o ângulo total da fatia baseado em valor — ex: quanto do músculo veio de séries no
     * início/meio/fim do treino (faixa A/B/C por posição, não por músculo). */
    partes?: { valor: number; cor: string }[];
  }

  let {
    dados,
    cores,
    centroValor,
    centroLabel,
  }: { dados: Fatia[]; cores?: string[]; centroValor?: string | number; centroLabel?: string } = $props();

  let nomeDestacado = $state<string | null>(null);
  let svgEl = $state<SVGSVGElement | undefined>();

  function aoClicarFatia(f: { nome: string }): void {
    nomeDestacado = nomeDestacado === f.nome ? null : f.nome;
  }

  $effect(() => {
    if (!nomeDestacado) return;
    function aoClicarFora(e: MouseEvent) {
      if (svgEl && !svgEl.contains(e.target as Node)) {
        nomeDestacado = null;
      }
    }
    // Registra só depois do clique atual (o que selecionou a fatia) terminar de se propagar,
    // senão esse mesmo clique já cai aqui e desfaz a seleção antes de renderizar o destaque.
    const id = setTimeout(() => window.addEventListener("click", aoClicarFora));
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", aoClicarFora);
    };
  });

  const CX = 50;
  const CY = 50;
  const R = 32;
  /** Raio interno — o que faz o gráfico ser um anel (donut) em vez de uma pizza fechada. */
  const R_INTERNO = 18;
  const COL_DIREITA = 78;
  const COL_ESQUERDA = 22;
  const MAX_CHARS_LINHA = 9;
  const ALTURA_LINHA = 5.4;
  /** Espaço vazio (graus) entre fatias de músculos diferentes, no lugar de uma linha. */
  const GAP_GRAUS = 2.5;

  function ponto(r: number, anguloGraus: number): { x: number; y: number } {
    const rad = ((anguloGraus - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  /** Número inteiro sem casas decimais soltas; fracionário com 1 casa. */
  function formatValor(valor: number): string {
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
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

  /** Caminho de um arco do anel entre dois ângulos (graus), com o truque de 3 pontos pra círculo completo. */
  function caminhoAnel(inicio: number, fim: number): string {
    const angulo = fim - inicio;
    if (angulo >= 359.99) {
      const o0 = ponto(R, inicio);
      const o1 = ponto(R, inicio + 179.99);
      const o2 = ponto(R, inicio + 359.98);
      const i0 = ponto(R_INTERNO, inicio);
      const i1 = ponto(R_INTERNO, inicio + 179.99);
      const i2 = ponto(R_INTERNO, inicio + 359.98);
      return `M ${o0.x} ${o0.y} A ${R} ${R} 0 1 1 ${o1.x} ${o1.y} A ${R} ${R} 0 1 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_INTERNO} ${R_INTERNO} 0 1 0 ${i1.x} ${i1.y} A ${R_INTERNO} ${R_INTERNO} 0 1 0 ${i0.x} ${i0.y} Z`;
    }
    const o0 = ponto(R, inicio);
    const o1 = ponto(R, fim);
    const i0 = ponto(R_INTERNO, inicio);
    const i1 = ponto(R_INTERNO, fim);
    const largeArc = angulo > 180 ? 1 : 0;
    return `M ${o0.x} ${o0.y} A ${R} ${R} 0 ${largeArc} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${R_INTERNO} ${R_INTERNO} 0 ${largeArc} 0 ${i0.x} ${i0.y} Z`;
  }

  const fatias = $derived.by(() => {
    if (total <= 0) return [];
    let anguloAtual = 0;
    return dados.map((d, i) => {
      const angulo = (d.valor / total) * 360;
      const inicio = anguloAtual;
      const fim = anguloAtual + angulo;
      anguloAtual = fim;

      // Espaço vazio entre músculos vizinhos (não entre as partes internas do mesmo
      // músculo) — encolhe a fatia desenhada pra dentro dos dois lados, sem tocar o
      // ângulo "cheio" usado pro rótulo/linha guia (meio, pct etc. abaixo).
      const gap = Math.min(GAP_GRAUS, angulo * 0.3);
      const inicioDesenho = inicio + gap / 2;
      const fimDesenho = fim - gap / 2;
      const anguloDesenho = fimDesenho - inicioDesenho;

      const corPadrao = cores?.[i] ?? PALETA[i % PALETA.length];
      const partesValidas = (d.partes ?? []).filter((p) => p.valor > 0);
      const dividida = partesValidas.length > 1;
      const partesResolvidas = partesValidas.length ? partesValidas : [{ valor: d.valor, cor: corPadrao }];
      const somaPartes = partesResolvidas.reduce((s, p) => s + p.valor, 0) || 1;
      const R_MEIO = (R + R_INTERNO) / 2;
      let anguloParte = inicioDesenho;
      const segmentos = partesResolvidas.map((p) => {
        const anguloSeg = anguloDesenho * (p.valor / somaPartes);
        const segInicio = anguloParte;
        const segFim = anguloParte + anguloSeg;
        anguloParte = segFim;
        const pRotulo = ponto(R_MEIO, (segInicio + segFim) / 2);
        return {
          path: caminhoAnel(segInicio, segFim),
          cor: p.cor,
          valor: p.valor,
          pct: Math.round((p.valor / total) * 100),
          // Só mostra o rótulo interno se o arco for largo o bastante pra caber o texto.
          rotuloVisivel: dividida && anguloSeg >= 12,
          rotuloX: pRotulo.x,
          rotuloY: pRotulo.y,
        };
      });

      const meio = (inicio + fim) / 2;
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
        valor: d.valor,
        pct,
        linhasNome,
        dyInicial,
        segmentos,
        corLinha: corPadrao,
        linha: `M ${pBorda.x} ${pBorda.y} L ${pCotovelo.x} ${pCotovelo.y} L ${colX} ${pCotovelo.y}`,
        label: { x: labelX, y: pCotovelo.y },
        ancora: ladoDireito ? "start" : "end",
      };
    });
  });

  /** Com uma fatia selecionada, o centro troca o total pelo valor daquele músculo — o rótulo
   * (ex: "séries") continua o mesmo, só o número muda. */
  const centro = $derived.by(() => {
    const f = nomeDestacado ? fatias.find((f) => f.nome === nomeDestacado) : undefined;
    return { valor: f ? formatValor(f.valor) : centroValor, label: centroLabel };
  });
</script>

<svg bind:this={svgEl} viewBox="0 0 100 100" class="pizza" role="img" aria-label="Distribuição muscular">
  {#each fatias as f (f.nome)}
    {#each f.segmentos as seg, i (i)}
      <path
        d={seg.path}
        fill={seg.cor}
        opacity={nomeDestacado && f.nome !== nomeDestacado ? 0.35 : 1}
        class="fatia-clicavel"
        role="button"
        tabindex={0}
        onclick={() => aoClicarFatia(f)}
        onkeydown={(e) => e.key === "Enter" && aoClicarFatia(f)}
      />
      {#if seg.rotuloVisivel && f.nome === nomeDestacado}
        <text x={seg.rotuloX} y={seg.rotuloY} text-anchor="middle" class="seg-texto" style="pointer-events: none;">
          <tspan x={seg.rotuloX} dy="-0.9" class="seg-valor">{formatValor(seg.valor)}</tspan>
          <tspan x={seg.rotuloX} dy="2.6" class="seg-pct">{seg.pct}%</tspan>
        </text>
      {/if}
    {/each}
  {/each}
  {#if centro.valor != null}
    <text x={CX} y={CY - 3.5} text-anchor="middle" dominant-baseline="central" class="centro-valor">{centro.valor}</text>
    {#if centro.label}
      <text x={CX} y={CY + 3.5} text-anchor="middle" dominant-baseline="central" class="centro-label">{centro.label}</text>
    {/if}
  {/if}
  {#each fatias as f (f.nome)}
    <path
      d={f.linha}
      class="fatia-linha"
      style={`stroke: ${f.corLinha}; opacity: ${nomeDestacado && f.nome !== nomeDestacado ? 0.35 : 1};`}
      fill="none"
    />
    <text
      x={f.label.x}
      y={f.label.y}
      text-anchor={f.ancora}
      class="fatia-texto fatia-clicavel"
      style={`opacity: ${nomeDestacado && f.nome !== nomeDestacado ? 0.35 : 1};`}
      role="button"
      tabindex={0}
      onclick={() => aoClicarFatia(f)}
      onkeydown={(e) => e.key === "Enter" && aoClicarFatia(f)}
    >
      {#each f.linhasNome as linha, i (i)}
        <tspan
          x={f.label.x}
          dy={i === 0 ? `${f.dyInicial}` : `${ALTURA_LINHA}`}
          class="fatia-nome"
          class:destaque={f.nome === nomeDestacado}
        >{linha}</tspan>
      {/each}
      <tspan x={f.label.x} dy={`${ALTURA_LINHA}`} class="fatia-pct" class:destaque={f.nome === nomeDestacado}>{f.pct}%</tspan>
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
  .pizza path,
  .pizza text {
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .fatia-texto {
    fill: #fff;
  }
  .fatia-nome {
    font-size: 4.2px;
    font-weight: 400;
    fill: var(--surface-muted);
  }
  .fatia-nome.destaque {
    font-weight: 600;
    fill: #fff;
  }
  .fatia-pct {
    font-size: 4.2px;
    font-weight: 400;
    fill: var(--surface-muted);
    opacity: 0.75;
  }
  .fatia-pct.destaque {
    font-weight: 700;
    fill: #fff;
  }
  .fatia-linha {
    stroke-width: 0.6;
  }
  .fatia-clicavel {
    cursor: pointer;
  }
  .seg-texto {
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 0.5px;
    stroke-linejoin: round;
  }
  .seg-valor {
    font-size: 3.6px;
    font-weight: 800;
  }
  .seg-pct {
    font-size: 2.4px;
    font-weight: 600;
  }
  .centro-valor {
    font-size: 15px;
    font-weight: 700;
    fill: var(--surface-fg);
  }
  .centro-label {
    font-size: 5.5px;
    font-weight: 400;
    fill: var(--surface-muted);
  }
</style>
