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
  /** Data -> nome da rotina executada nesse dia (treino_registros), pro nome pequeno no calendário. */
  let diasComTreino = $state<Map<string, string>>(new Map());
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
  /** Dia da semana (0=dom..6=sáb) -> nome da rotina agendada — usado pro nome pequeno no
   * calendário mesmo em dias sem treino_registro ainda (ex: hoje ou um dia futuro do mês). */
  let diasSemanaComRotina = $state<Map<number, string>>(new Map());

  /** "diário" = peso bruto de cada dia; "média" = média móvel dos últimos 7 dias em cada dia (padrão de mercado — MacroFactor, Trendweight etc.), padrão do app. */
  let modoGrafico = $state<"diario" | "media">("diario");

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
  }

  async function carregarRotinasAgendadas() {
    const treinos = await listTreinos();
    const mapa = new Map<number, string>();
    for (const t of treinos) {
      if (t.dia_semana != null && !mapa.has(t.dia_semana)) mapa.set(t.dia_semana, t.nome_treino);
    }
    diasSemanaComRotina = mapa;
  }

  void carregarRotinasAgendadas();

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
    diasComTreino = new Map(listaTreinos.map((t) => [t.data, t.treinoNome]));
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

  /** Arrastar a grade do calendário pros lados troca de mês — sem pointer capture, pra não
   * atrapalhar o toque numa célula (abrirDia): sem arrasto de verdade, o pointerup acontece bem
   * perto do pointerdown e nenhum trocarMes é chamado. */
  let arrasteMesInicioX = $state<number | null>(null);

  function iniciarArrasteMes(e: PointerEvent): void {
    arrasteMesInicioX = e.clientX;
  }

  function finalizarArrasteMes(e: PointerEvent): void {
    if (arrasteMesInicioX == null) return;
    const delta = e.clientX - arrasteMesInicioX;
    arrasteMesInicioX = null;
    const LIMIAR_ARRASTE = 50;
    if (delta > LIMIAR_ARRASTE) trocarMes(-1);
    else if (delta < -LIMIAR_ARRASTE) trocarMes(1);
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
    const lista: ({ dia: number; iso: string; peso: number | null; nomeTreino: string | null } | null)[] = [];
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null);
    for (let dia = 1; dia <= totalDias; dia++) {
      const data = new Date(mesBase.getFullYear(), mesBase.getMonth(), dia);
      const iso = toISODate(data);
      const nomeTreino = diasComTreino.get(iso) ?? diasSemanaComRotina.get(data.getDay()) ?? null;
      lista.push({ dia, iso, peso: pesosPorData.get(iso) ?? null, nomeTreino });
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

  function formatPeso(valor: number): string {
    return valor.toFixed(1).replace(".", ",");
  }

  /** Último peso bruto registrado (não a média) — pesosGraficoBruto sempre busca até hoje,
   * independente do período/zoom escolhido no gráfico. */
  const pesoAtualTexto = $derived.by(() => {
    if (!pesosGraficoBruto.length) return "—";
    const ultimo = [...pesosGraficoBruto].sort((a, b) => b.data.localeCompare(a.data))[0];
    return `${formatPeso(ultimo.peso)} kg`;
  });

  /** Média móvel dos últimos 7 dias mais recente — mesmo cálculo do gráfico em modo "média". */
  const mediaAtualTexto = $derived.by(() => {
    if (!mediaMovelGrafico.length) return "—";
    return `${formatPeso(mediaMovelGrafico[mediaMovelGrafico.length - 1].peso)} kg`;
  });

  /** Peso médio alvo pra semana que vem: projeta a média móvel mais recente pelo % semanal da
   * meta (a meta em si já é sempre semanal — ver PesoMeta.percentual). Manutenção já é um peso
   * fixo, não precisa projetar. */
  const metaSemanalTexto = $derived.by(() => {
    if (!meta) return "Sem meta";
    if (meta.tipo === "manutencao") return meta.pesoManutencao != null ? `${formatPeso(meta.pesoManutencao)} kg` : "Sem meta";
    if (meta.percentual == null) return "Sem meta";
    const base = mediaMovelGrafico[mediaMovelGrafico.length - 1]?.peso;
    if (base == null) return "Sem meta";
    return `${formatPeso(base * (1 + meta.percentual / 100))} kg`;
  });

  /** A meta é sempre semanal e parte da média móvel do primeiro dia visível, nunca do peso bruto de um dia só. */
  const pesoInicialMedia = $derived.by(() => mediaMovelGrafico[0]?.peso ?? null);

  /** Peso esperado pela meta em cada dia plotado, sempre projetado a partir da média móvel do primeiro dia visível, usando os dias corridos reais entre cada ponto e esse primeiro dia (não o tamanho nominal do filtro). */
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
   * Linha reta de meta: da média móvel do primeiro dia até o peso-alvo do último ponto.
   * Reaproveita o mesmo valor de metaAlvoPorPonto (em vez de recalcular a partir do tamanho
   * nominal do filtro) pra garantir que a linha sempre bata com os rótulos por ponto — mesmo
   * quando os dados visíveis não cobrem o período inteiro do filtro selecionado.
   */
  const metaLinha = $derived.by(() => {
    const alvos = metaAlvoPorPonto;
    if (!meta || !alvos || !alvos.length || pontosGrafico.length < 2 || pesoInicialMedia == null) return null;
    const pesoAlvo = alvos[alvos.length - 1];
    const linha = new Array<number | null>(pontosGrafico.length).fill(null);
    linha[0] = meta.tipo === "manutencao" ? pesoAlvo : pesoInicialMedia;
    linha[linha.length - 1] = pesoAlvo;
    return linha;
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

  /** Só mostra os detalhes por ponto (%, valor da meta, pontos marcados na linha) com até 1 mês
   * de período — em filtros maiores vira poluição visual (dezenas de rótulos/pontos
   * sobrepostos). Acima disso a linha fica só a linha, mais fina e sem pontos. */
  const detalhesPorPonto = $derived(periodo.dias != null && periodo.dias <= 30);

  /** Datas do eixo: no máximo 8, sempre em intervalos iguais — diferente de pontosComRotulo (que
   * rotula a cada 7 dias e cresce sem limite em períodos muito longos, tipo "Tudo" com anos de
   * dados). */
  const pontosComData = $derived.by((): boolean[] | null => {
    const total = pontosGrafico.length;
    if (!total) return null;
    if (total <= 8) return pontosGrafico.map(() => true);
    const passo = (total - 1) / 7;
    const indices = new Set(Array.from({ length: 8 }, (_, i) => Math.round(i * passo)));
    return pontosGrafico.map((_, i) => indices.has(i));
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
      const alvos = metaAlvoPorPonto;
      const pontos = c.getDatasetMeta(0).data;
      const escalaY = c.scales.y;
      const { ctx } = c;
      if (!pontos.length) return;
      ctx.save();
      ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (!detalhesPorPonto) {
        // Filtro longo: sem rótulo por ponto (poluía), mas mantém o valor inicial e final de
        // cada linha (peso/média em branco, meta em vermelho), pra não perder a referência.
        const extremos = pontos.length > 1 ? [0, pontos.length - 1] : [0];
        for (const i of extremos) {
          const ponto = pontos[i];
          const p = pontosGrafico[i];
          if (!ponto || !p) continue;
          const yPeso = ponto.y - 11;
          ctx.fillStyle = "#fff";
          ctx.fillText(formatPeso(p.peso), ponto.x, yPeso);
          const alvo = alvos?.[i];
          if (alvo != null && escalaY) {
            const yLinha = escalaY.getPixelForValue(alvo) - 9;
            if (Math.abs(yLinha - yPeso) < 12) continue;
            ctx.fillStyle = COR_TREINO;
            ctx.fillText(alvo.toFixed(1), ponto.x, yLinha);
          }
        }
        ctx.restore();
        return;
      }

      const diffs = diffMetaPorPonto;
      const rotulo = pontosComRotulo;
      pontos.forEach((ponto, i) => {
        if (rotulo && !rotulo[i]) return;
        const diff = diffs?.[i];
        const yDiff = ponto.y - 11;
        if (diff != null) {
          ctx.fillStyle = "#fff";
          const texto = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
          ctx.fillText(texto, ponto.x, yDiff);
        }
        // Só o último ponto da linha reta da meta ganha o rótulo com o valor (76.3kg) — um
        // número em cada ponto poluía o gráfico, já que a linha é reta e o valor de cada ponto
        // intermediário já dá pra inferir visualmente.
        if (i !== pontos.length - 1) return;
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
      const rotulo = pontosComData;
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
            pointRadius: detalhesPorPonto ? 3 : 0,
            borderWidth: detalhesPorPonto ? 3 : 1.5,
          },
          ...(metaLinha
            ? [
                {
                  data: metaLinha,
                  borderColor: COR_META,
                  backgroundColor: COR_META,
                  borderDash: [6, 4],
                  borderWidth: detalhesPorPonto ? 2 : 1,
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
          y: {
            ticks: {
              color: "#9aa0ab",
              font: { size: 10 },
              // Uma linha sim, outra não — todo gridline continua desenhado, só o número (usa
              // a formatação padrão do Chart.js pra não divergir do que já tinha) fica de fora.
              callback(valor, indice) {
                return indice % 2 === 0 ? this.getLabelForValue(valor as number) : "";
              },
            },
            grid: { color: "rgba(255, 255, 255, 0.08)" },
          },
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
{#snippet iconEngrenagem()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
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

  <div class="quick-actions">
    <button
      class="quick-card quick-card-btn"
      class:quick-card-ativo={modoGrafico === "diario"}
      onclick={() => selecionarModoGrafico("diario")}
    >
      <span class="quick-card-label">Peso atual</span>
      <span class="quick-card-valor">{pesoAtualTexto}</span>
    </button>
    <button
      class="quick-card quick-card-btn"
      class:quick-card-ativo={modoGrafico === "media"}
      onclick={() => selecionarModoGrafico("media")}
    >
      <span class="quick-card-label">Média atual</span>
      <span class="quick-card-valor">{mediaAtualTexto}</span>
    </button>
    <button
      class="quick-card quick-card-btn"
      class:quick-card-ativo-meta={metaVisivel}
      onclick={alternarMetaVisivel}
      aria-label={metaVisivel ? "Ocultar meta no gráfico" : "Mostrar meta no gráfico"}
    >
      <span class="quick-card-label">Meta semanal</span>
      <span class="quick-card-valor">{metaSemanalTexto}</span>
    </button>
    <button class="quick-card quick-card-btn" onclick={() => (mostrarEscolhaMeta = true)}>
      <span class="quick-card-label">Configurações</span>
      {@render iconEngrenagem()}
    </button>
  </div>

  <div class="mes-nav">
    <button class="mes-nav-icone" onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
    <span>{mesLabel}</span>
    <button class="mes-nav-icone" onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
  </div>

  <div
    class="mes-swipe"
    role="presentation"
    onpointerdown={iniciarArrasteMes}
    onpointerup={finalizarArrasteMes}
    onpointercancel={() => (arrasteMesInicioX = null)}
  >
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
            {@const ehHoje = cel.iso === hojeISO()}
            {@const temTreino = cel.nomeTreino != null}
            <button class="celula" class:com-peso={cel.peso != null} onclick={() => abrirDia(cel.iso)}>
              <span
                class="dia-numero"
                class:dia-numero-treino={temTreino}
                class:dia-numero-hoje={!temTreino && ehHoje}
                class:muted={!temTreino && !ehHoje && cel.peso == null}
              >{cel.dia}</span>
              {#if cel.peso != null}
                <span class="peso-valor">{cel.peso}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
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
    {pontosComData}
    {detalhesPorPonto}
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
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-card {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
  }
  .quick-card-valor {
    font-size: var(--font-size-sm);
    font-weight: 700;
    white-space: nowrap;
  }
  .quick-card-label {
    font-size: 11px;
    font-weight: 400;
    color: var(--surface-muted);
    white-space: nowrap;
  }
  .quick-card-btn {
    font-family: inherit;
    cursor: pointer;
  }
  .quick-card-ativo .quick-card-valor {
    color: var(--color-primary);
  }
  .quick-card-ativo-meta .quick-card-valor {
    color: var(--color-negative);
  }
  .quick-card-btn :global(svg) {
    width: 20px;
    height: 20px;
    color: #fff;
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
  .mes-nav-icone {
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .mes-swipe {
    touch-action: pan-y;
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
  .dia-numero.dia-numero-hoje {
    color: var(--color-primary);
  }
  /* Tem treino (agendado nesse dia da semana ou já registrado): número vermelho — vale mais que
     "hoje" (que só é primária quando não tem treino nenhum). O nome da rotina fica só no modal
     do dia (PesoDiaSheet), não aqui — poluía demais o card. */
  .dia-numero.dia-numero-treino {
    color: var(--color-negative);
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
