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
        const o0 = ponto(R, 0);
        const o1 = ponto(R, 179.99);
        const o2 = ponto(R, 359.98);
        const i0 = ponto(R_INTERNO, 0);
        const i1 = ponto(R_INTERNO, 179.99);
        const i2 = ponto(R_INTERNO, 359.98);
        path = `M ${o0.x} ${o0.y} A ${R} ${R} 0 1 1 ${o1.x} ${o1.y} A ${R} ${R} 0 1 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_INTERNO} ${R_INTERNO} 0 1 0 ${i1.x} ${i1.y} A ${R_INTERNO} ${R_INTERNO} 0 1 0 ${i0.x} ${i0.y} Z`;
      } else {
        const o0 = ponto(R, inicio);
        const o1 = ponto(R, fim);
        const i0 = ponto(R_INTERNO, inicio);
        const i1 = ponto(R_INTERNO, fim);
        const largeArc = angulo > 180 ? 1 : 0;
        path = `M ${o0.x} ${o0.y} A ${R} ${R} 0 ${largeArc} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${R_INTERNO} ${R_INTERNO} 0 ${largeArc} 0 ${i0.x} ${i0.y} Z`;
      }

      const meio = (inicio + fim) / 2;
      const cor = cores?.[i] ?? PALETA[i % PALETA.length];
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
        path,
        cor,
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
    return { valor: f ? f.valor : centroValor, label: centroLabel };
  });
</script>

<svg bind:this={svgEl} viewBox="0 0 100 100" class="pizza" role="img" aria-label="Distribuição muscular">
  {#each fatias as f (f.nome)}
    <path
      d={f.path}
      fill={f.cor}
      opacity={nomeDestacado && f.nome !== nomeDestacado ? 0.35 : 1}
      class="fatia-clicavel"
      role="button"
      tabindex={0}
      onclick={() => aoClicarFatia(f)}
      onkeydown={(e) => e.key === "Enter" && aoClicarFatia(f)}
    />
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
      style={`stroke: ${f.cor}; opacity: ${nomeDestacado && f.nome !== nomeDestacado ? 0.35 : 1};`}
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
