<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { navigate, router } from "../../lib/router.svelte";
  import { toISODate, parseISODate, hojeISO } from "../../lib/dates";
  import { getPesosDoPeriodo, getMeta, excluirMeta, type PesoRegistro, type PesoMeta } from "../../lib/pesoApi";
  import { getDiasComTreino, listTreinos } from "../../lib/treinoApi";
  import PesoDiaSheet from "./PesoDiaSheet.svelte";
  import PesoMetaFormSheet from "./PesoMetaFormSheet.svelte";
  import PesoGraficoTelaCheia from "./PesoGraficoTelaCheia.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";

  const COR_PESO = "#5eead4";
  const COR_TREINO = "#f87171";
  const COR_META = "rgba(248, 113, 113, 0.5)";

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

  /** Deriva do path (não de estado local) pra que o botão "voltar" do navegador feche o modal, ou reabra ao voltar de uma tela navegada a partir dele (ex: link "Dia de X"). */
  const diaSelecionado = $derived.by(() => {
    const m = router.path.match(/^\/peso\/dia\/(\d{4}-\d{2}-\d{2})$/);
    return m ? m[1] : null;
  });

  let periodo = $state<Periodo>(PERIODOS[0]);
  /** Inclui 6 dias de "aquecimento" antes do período pedido, só pra a média móvel do primeiro dia visível já ter janela cheia. */
  let pesosGraficoBruto = $state<PesoRegistro[]>([]);
  let dataInicioGrafico = $state("");
  let diasComTreinoGrafico = $state<Set<string>>(new Set());
  let loadingGrafico = $state(true);
  let mostrarFiltro = $state(false);
  let mostrarGraficoCheio = $state(false);
  let hojeTemRotinaAgendada = $state(false);

  /** "diário" = peso bruto de cada dia; "média" = média móvel dos últimos 7 dias em cada dia (padrão de mercado — MacroFactor, Trendweight etc.), padrão do app. */
  let modoGrafico = $state<"diario" | "media">("media");

  /** Um ponto por dia com peso registrado; a média móvel usa os até 7 dias anteriores (calendário, não semana fechada). */
  function calcularMediaMovel(lista: PesoRegistro[]): PesoRegistro[] {
    const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    return ordenada.map((p) => {
      const d = parseISODate(p.data);
      const limite = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
      const janela = ordenada.filter((q) => q.data >= limite && q.data <= p.data);
      const media = janela.reduce((acc, q) => acc + q.peso, 0) / janela.length;
      return { data: p.data, peso: media };
    });
  }

  function selecionarModoGrafico(m: "diario" | "media") {
    modoGrafico = m;
    if (m === "diario" && periodo.valor !== PERIODOS[0].valor) {
      periodo = PERIODOS[0];
      void carregarGrafico();
    }
  }

  function alternarModoGrafico() {
    selecionarModoGrafico(modoGrafico === "diario" ? "media" : "diario");
  }

  async function carregarRotinaHoje() {
    const treinos = await listTreinos();
    const diaSemanaHoje = new Date().getDay();
    hojeTemRotinaAgendada = treinos.some((t) => t.dia_semana === diaSemanaHoje);
  }

  void carregarRotinaHoje();

  let meta = $state<PesoMeta | null>(null);
  let mostrarEscolhaMeta = $state(false);
  let metaEtapa = $state<"ganho" | "perda" | "manutencao" | null>(null);

  const CHAVE_META_VISIVEL = "fitforge_peso_meta_visivel";
  let metaVisivel = $state(typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_META_VISIVEL) !== "0" : true);

  function alternarMetaVisivel() {
    metaVisivel = !metaVisivel;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CHAVE_META_VISIVEL, metaVisivel ? "1" : "0");
    }
  }

  async function carregarMeta() {
    meta = await getMeta();
  }

  void carregarMeta();

  const metaAtiva = $derived.by((): "ganho" | "perda" | "manutencao" | null => {
    if (!meta) return null;
    if (meta.tipo === "manutencao") return "manutencao";
    if (meta.percentual == null) return null;
    return meta.percentual > 0 ? "ganho" : "perda";
  });

  function valorMeta(tipo: "ganho" | "perda" | "manutencao"): string | undefined {
    if (metaAtiva !== tipo || !meta) return undefined;
    if (tipo === "manutencao") return meta.pesoManutencao != null ? `${meta.pesoManutencao}kg` : undefined;
    return meta.percentual != null ? `${Math.abs(meta.percentual)}%` : undefined;
  }

  async function limparMeta() {
    await excluirMeta();
    await carregarMeta();
  }

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
    // Busca 6 dias a mais antes do início pedido, só pra a média móvel do primeiro dia visível já ter janela cheia.
    const dataInicioBusca =
      periodo.dias == null ? dataInicio : toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - periodo.dias - 6));
    const dataFim = hojeISO();
    const [listaPesos, listaTreinos] = await Promise.all([
      getPesosDoPeriodo(dataInicioBusca, dataFim),
      getDiasComTreino(dataInicio, dataFim),
    ]);
    pesosGraficoBruto = listaPesos;
    dataInicioGrafico = dataInicio;
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

  function selecionarPeriodoPorValor(valor: string) {
    const p = PERIODOS.find((item) => item.valor === valor);
    if (p) selecionarPeriodo(p);
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

  function dataExibicao(p: PesoRegistro): string {
    return p.data;
  }

  /** Um dia com peso registrado dentro do período pedido (sem o "aquecimento" usado só pra a média móvel ter janela cheia). */
  const pesosGrafico = $derived.by(() => pesosGraficoBruto.filter((p) => p.data >= dataInicioGrafico));

  /** Média móvel dos últimos 7 dias em cada dia do período, calculada com o "aquecimento" pra o primeiro ponto já ter janela cheia quando possível. */
  const mediaMovelGrafico = $derived.by(() =>
    calcularMediaMovel(pesosGraficoBruto).filter((p) => p.data >= dataInicioGrafico),
  );

  /** Pontos efetivamente plotados no gráfico principal, conforme o modo escolhido — mesmas datas nos dois modos, só muda se o peso é bruto ou suavizado. */
  const pontosGrafico = $derived.by(() => (modoGrafico === "media" ? mediaMovelGrafico : pesosGrafico));

  /** A meta é sempre semanal e parte da média móvel do primeiro dia visível, nunca do peso bruto de um dia só. */
  const pesoInicialMedia = $derived.by(() => mediaMovelGrafico[0]?.peso ?? null);

  /** Linha reta de meta: da média móvel do primeiro dia até o peso-alvo calculado (percentual semanal composto, ou flat na manutenção). */
  const metaLinha = $derived.by(() => {
    if (!meta || !metaVisivel || pontosGrafico.length < 2 || pesoInicialMedia == null) return null;
    let pesoAlvo: number;
    if (meta.tipo === "manutencao") {
      if (meta.pesoManutencao == null) return null;
      pesoAlvo = meta.pesoManutencao;
    } else {
      if (meta.percentual == null) return null;
      let dias = periodo.dias;
      if (dias == null) {
        const primeira = parseISODate(pesosGrafico[0].data);
        const ultima = parseISODate(pesosGrafico[pesosGrafico.length - 1].data);
        dias = Math.max(1, Math.round((ultima.getTime() - primeira.getTime()) / 86400000));
      }
      const semanas = dias / 7;
      pesoAlvo = pesoInicialMedia * Math.pow(1 + meta.percentual / 100, semanas);
    }
    const linha = new Array<number | null>(pontosGrafico.length).fill(null);
    linha[0] = meta.tipo === "manutencao" ? pesoAlvo : pesoInicialMedia;
    linha[linha.length - 1] = pesoAlvo;
    return linha;
  });

  /** Peso esperado pela meta em cada dia plotado, sempre projetado a partir da média móvel do primeiro dia visível. */
  const metaAlvoPorPonto = $derived.by(() => {
    if (!meta || !metaVisivel || !mediaMovelGrafico.length || pesoInicialMedia == null) return null;
    if (meta.tipo === "manutencao") {
      if (meta.pesoManutencao == null) return null;
      const alvo = meta.pesoManutencao;
      return mediaMovelGrafico.map(() => alvo);
    }
    if (meta.percentual == null) return null;
    const percentual = meta.percentual;
    const dataInicial = parseISODate(mediaMovelGrafico[0].data);
    return mediaMovelGrafico.map((p) => {
      const diasDecorridos = Math.round((parseISODate(p.data).getTime() - dataInicial.getTime()) / 86400000);
      return pesoInicialMedia * Math.pow(1 + percentual / 100, diasDecorridos / 7);
    });
  });

  /**
   * Com mais de 7 dias no período, rotular todo ponto fica poluído (nos dois modos, já que ambos tem
   * um ponto por dia agora). Nesse caso, rotula a cada 7 pontos, contando de trás pra frente a partir
   * do mais recente — janela móvel, não semana de calendário fechada, pra sempre incluir o ponto mais
   * recente e manter o espaçamento uniforme independente de onde os dados começam. Com até 7 dias,
   * anota todo ponto normalmente.
   */
  const pontosComRotulo = $derived.by((): boolean[] | null => {
    if (!pontosGrafico.length) return null;
    if (periodo.valor === PERIODOS[0].valor || pontosGrafico.length <= 7) return pontosGrafico.map(() => true);
    const total = pontosGrafico.length;
    return pontosGrafico.map((_, i) => (total - 1 - i) % 7 === 0);
  });

  /**
   * Diferença % de cada dia rotulado em relação ao peso esperado pela meta naquela mesma data.
   * Compara sempre o valor efetivamente plotado (bruto no modo diário, média no modo média), pra
   * o sinal do rótulo bater com a posição visual do ponto em relação à linha da meta.
   */
  const diffMetaPorPonto = $derived.by(() => {
    const alvos = metaAlvoPorPonto;
    const rotulo = pontosComRotulo;
    const pontos = pontosGrafico;
    if (!alvos || !rotulo || !pontos.length) return null;
    return pontos.map((p, i) => {
      const alvo = alvos[i];
      if (!rotulo[i] || alvo == null) return null;
      return ((p.peso - alvo) / alvo) * 100;
    });
  });

  const pluginRotulosMeta = {
    id: "rotulosMeta",
    afterDatasetsDraw(c: Chart) {
      const diffs = diffMetaPorPonto;
      const alvos = metaAlvoPorPonto;
      const rotulo = pontosComRotulo;
      const pontos = c.getDatasetMeta(0).data;
      const escalaY = c.scales.y;
      const { ctx } = c;
      ctx.save();
      ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      pontos.forEach((ponto, i) => {
        if (rotulo && !rotulo[i]) return;
        const diff = diffs?.[i];
        const yDiff = ponto.y - 11;
        if (diff != null) {
          ctx.fillStyle = "#fff";
          const texto = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
          ctx.fillText(texto, ponto.x, yDiff);
        }
        const alvo = alvos?.[i];
        if (alvo != null && escalaY) {
          const yLinha = escalaY.getPixelForValue(alvo) - 9;
          // Perto demais do rótulo do peso real (ex: primeiro ponto, onde a meta parte do mesmo valor) — pula pra não sobrepor.
          if (diff != null && Math.abs(yLinha - yDiff) < 12) return;
          ctx.fillStyle = COR_TREINO;
          ctx.fillText(alvo.toFixed(1), ponto.x, yLinha);
        }
      });
      ctx.restore();
    },
  };

  const pluginDatasEixo = {
    id: "datasEixo",
    afterDatasetsDraw(c: Chart) {
      const pontosDados = pontosGrafico;
      const rotulo = pontosComRotulo;
      const pontos = c.getDatasetMeta(0).data;
      const y = c.chartArea.bottom + 11;
      const { ctx } = c;
      ctx.save();
      ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#9aa0ab";
      pontos.forEach((ponto, i) => {
        if (rotulo && !rotulo[i]) return;
        const p = pontosDados[i];
        if (!p) return;
        ctx.fillText(formatDataCurta(dataExibicao(p)), ponto.x, y);
      });
      ctx.restore();
    },
  };

  let canvas = $state<HTMLCanvasElement | undefined>();
  let chart: Chart | null = null;

  function desenharGrafico() {
    if (!canvas) return;
    chart?.destroy();
    chart = null;
    const pontos = pontosGrafico;
    if (!pontos.length) return;
    const corPonto = (data: string) => (modoGrafico === "diario" && diasComTreinoGrafico.has(data) ? COR_TREINO : COR_PESO);
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pontos.map((p) => formatDataCurta(p.data)),
        datasets: [
          {
            data: pontos.map((p) => p.peso),
            borderColor: COR_PESO,
            backgroundColor: COR_PESO,
            pointBackgroundColor: pontos.map((p) => corPonto(p.data)),
            pointBorderColor: pontos.map((p) => corPonto(p.data)),
            tension: 0.3,
            pointRadius: 3,
          },
          ...(metaLinha
            ? [
                {
                  data: metaLinha,
                  borderColor: COR_META,
                  backgroundColor: COR_META,
                  borderDash: [6, 4],
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
        layout: { padding: { top: 14, bottom: 22, left: 10, right: 14 } },
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { ticks: { color: "#9aa0ab", font: { size: 10 } }, grid: { color: "rgba(255, 255, 255, 0.08)" } },
        },
      },
      plugins: [pluginRotulosMeta, pluginDatasEixo],
    });
  }

  $effect(() => {
    if (!loadingGrafico) desenharGrafico();
  });

  function abrirDia(iso: string) {
    navigate(`/peso/dia/${iso}`);
  }

  function abrirAdicionar() {
    navigate(`/peso/dia/${hojeISO()}`);
  }

  function aoSalvar() {
    void carregar();
    void carregarGrafico();
  }

  function aoSalvarMeta() {
    void carregarMeta();
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
{#snippet iconMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="2" />
  </svg>
{/snippet}
{#snippet iconGanho()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="14 7 21 7 21 14" />
  </svg>
{/snippet}
{#snippet iconPerda()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 7 9 13 13 9 21 17" />
    <polyline points="21 10 21 17 14 17" />
  </svg>
{/snippet}
{#snippet iconManutencao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="9" x2="19" y2="9" />
    <line x1="5" y1="15" x2="19" y2="15" />
  </svg>
{/snippet}
{#snippet iconLimparMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
{/snippet}
{#snippet iconAlternarModo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
{/snippet}
{#snippet iconToggleMetaGrafico()}
  <button
    class="toggle-meta-grafico"
    style={`color: ${metaVisivel ? COR_TREINO : "#fff"};`}
    onclick={alternarMetaVisivel}
    aria-label={metaVisivel ? "Ocultar meta no gráfico" : "Mostrar meta no gráfico"}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18.7 8L14 12.7l-3-3L7 14" />
    </svg>
  </button>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Peso <span class="modo-label">{modoGrafico === "media" ? "Média" : "Diário"}</span></h1>
    <div class="header-acoes">
      <button class="icon-btn" onclick={() => (mostrarFiltro = true)} aria-label="Filtro de período">
        {@render iconFiltro()}
      </button>
      <button class="icon-btn" onclick={() => (mostrarEscolhaMeta = true)} aria-label="Meta">
        {@render iconMeta()}
      </button>
      <button
        class="icon-btn"
        class:destaque={modoGrafico === "diario"}
        onclick={alternarModoGrafico}
        aria-label="Alternar modo do gráfico"
      >
        {@render iconAlternarModo()}
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
    <button class="chart-wrap" onclick={() => (mostrarGraficoCheio = true)} aria-label="Ver gráfico em tela cheia">
      <canvas bind:this={canvas}></canvas>
    </button>
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
            {#if cel.iso !== hojeISO() && cel.temTreino}
              <span class="marcador-treino" aria-hidden="true"></span>
            {/if}
            <span class="dia-numero-wrap">
              <span class="dia-numero" class:muted={cel.peso == null}>{cel.dia}</span>
              {#if cel.iso === hojeISO()}
                {#if cel.temTreino}
                  <span class="marcador-hoje com-treino sem-pulso" aria-hidden="true"></span>
                {:else if hojeTemRotinaAgendada}
                  <span class="marcador-hoje com-treino" aria-hidden="true"></span>
                {:else if cel.peso == null}
                  <span class="marcador-hoje" aria-hidden="true"></span>
                {/if}
              {/if}
            </span>
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
  <PesoDiaSheet data={diaSelecionado} onFechar={() => window.history.back()} onSalvo={aoSalvar} />
{/if}

{#if mostrarFiltro}
  <WheelPicker
    titulo="Período do gráfico"
    opcoes={PERIODOS.map((p) => ({ valor: p.valor, label: p.label }))}
    valorAtual={periodo.valor}
    onSelecionar={selecionarPeriodoPorValor}
    onFechar={() => (mostrarFiltro = false)}
  />
{/if}

{#if mostrarEscolhaMeta}
  <ActionSheet
    titulo="Meta"
    onFechar={() => (mostrarEscolhaMeta = false)}
    acaoTitulo={iconToggleMetaGrafico}
    opcoes={[
      {
        label: "Ganho",
        icon: iconGanho,
        valor: valorMeta("ganho"),
        disabled: metaAtiva != null && metaAtiva !== "ganho",
        onSelect: () => (metaEtapa = "ganho"),
      },
      {
        label: "Perda",
        icon: iconPerda,
        valor: valorMeta("perda"),
        disabled: metaAtiva != null && metaAtiva !== "perda",
        onSelect: () => (metaEtapa = "perda"),
      },
      {
        label: "Manutenção",
        icon: iconManutencao,
        valor: valorMeta("manutencao"),
        disabled: metaAtiva != null && metaAtiva !== "manutencao",
        onSelect: () => (metaEtapa = "manutencao"),
      },
      { label: "Limpar Metas", icon: iconLimparMeta, destructive: true, manterAberto: true, onSelect: () => limparMeta() },
    ]}
  />
{/if}

{#if metaEtapa !== null}
  <PesoMetaFormSheet tipo={metaEtapa} onFechar={() => (metaEtapa = null)} onSalvo={aoSalvarMeta} />
{/if}

{#if mostrarGraficoCheio}
  <PesoGraficoTelaCheia
    {pontosGrafico}
    {diasComTreinoGrafico}
    modo={modoGrafico}
    {metaLinha}
    {diffMetaPorPonto}
    {metaAlvoPorPonto}
    {pontosComRotulo}
    onFechar={() => (mostrarGraficoCheio = false)}
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
  .icon-btn.destaque {
    color: var(--color-primary);
  }
  .toggle-meta-grafico {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    cursor: pointer;
  }
  .toggle-meta-grafico svg {
    width: 20px;
    height: 20px;
  }
  .chart-wrap {
    position: relative;
    display: block;
    width: 100%;
    height: 220px;
    margin-bottom: var(--space-5);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .modo-label {
    font-size: 12px;
    font-weight: 400;
    color: var(--surface-muted);
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
  .dia-numero-wrap {
    position: relative;
    display: inline-flex;
  }
  .marcador-hoje {
    position: absolute;
    top: -2px;
    right: -7px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-primary);
    animation: pulso-hoje 1.6s ease-in-out infinite;
  }
  .marcador-hoje.com-treino {
    background: #f87171;
  }
  .marcador-hoje.sem-pulso {
    animation: none;
  }
  @keyframes pulso-hoje {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.45;
      transform: scale(1.6);
    }
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
