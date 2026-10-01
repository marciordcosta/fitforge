<script lang="ts">
  import { Chart } from "chart.js/auto";
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { navigate, router, voltar } from "../../lib/router.svelte";
  import { toISODate, parseISODate, hojeISO } from "../../lib/dates";
  import {
    getPesosDoPeriodo,
    getMeta,
    listMetaHistorico,
    getDiasParaObjetivo,
    formatDiasObjetivo,
    getUltimoPeso,
    getPesoMedioAtual,
    calcularMediaMovelSerie,
    calcularLinhaMetaPorDia,
    calcularMetaFimSemanaPorDia,
    getObservacaoMeta,
    getDiasComFoto,
    type PesoRegistro,
    type PesoMeta,
    type PesoMetaHistorico,
  } from "../../lib/pesoApi";
  import { getDiasComTreino, listTreinos, DIAS_SEMANA_ABREV } from "../../lib/treinoApi";
  import PesoDiaSheet from "./PesoDiaSheet.svelte";
  import PesoMetaFormSheet from "./PesoMetaFormSheet.svelte";
  import PesoGraficoTelaCheia from "./PesoGraficoTelaCheia.svelte";
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
  /** Dias do mês visível com pelo menos uma foto de acompanhamento — só marca o indicador na
   * grade, as imagens em si só carregam ao abrir o dia. */
  let diasComFoto = $state<Set<string>>(new Set());
  /** Dia da semana -> nome da rotina agendada (independente de ter sido feita) — só usado pra
   * destacar dias FUTUROS com rotina prevista; dias passados/hoje sem registro real não usam isso,
   * o destaque de treino "some" se o dia passar sem ninguém ter registrado o treino. */
  let treinoPorDiaSemana = $state<Map<number, string>>(new Map());
  let loading = $state(true);

  async function carregarRotinaSemana() {
    try {
      const treinos = await listTreinos();
      treinoPorDiaSemana = new Map(
        treinos.filter((t) => t.dia_semana != null).map((t) => [t.dia_semana as number, t.nome_treino]),
      );
    } catch {
      // informativo — sem isso só deixa de destacar dias futuros, calendário continua funcionando
    }
  }

  void carregarRotinaSemana();

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
  /** Data -> nome da rotina, pro tooltip do gráfico (mesma info de diasComTreino, mas escopada ao período do gráfico). */
  let diasComTreinoNomeGrafico = $state<Map<string, string>>(new Map());
  let loadingGrafico = $state(true);
  let mostrarFiltro = $state(false);
  let mostrarGraficoCheio = $state(false);

  /** "diário" = peso bruto de cada dia; "média" = média móvel dos últimos 7 dias em cada dia (padrão de mercado — MacroFactor, Trendweight etc.). Qual dos dois abre por padrão é configurável
   * em "Meta" > "Visualização padrão do gráfico" (PesoMetaFormSheet.svelte), guardado direto no
   * dispositivo (mesma chave lida ali). */
  const CHAVE_MODO_GRAFICO_PADRAO = "fitforge_peso_modo_grafico_padrao";
  let modoGrafico = $state<"diario" | "media">(
    typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_MODO_GRAFICO_PADRAO) === "media" ? "media" : "diario",
  );

  function selecionarModoGrafico(m: "diario" | "media") {
    modoGrafico = m;
  }

  /** "Mostrar detalhes" (Meta > Parametrização do gráfico) — marcado (padrão) mantém o
   * comportamento de sempre (detalhesPorPonto decide sozinho pelo período); desmarcado força só a
   * linha (peso e meta), sem rótulo nenhum, não importa o período. Diferente de
   * CHAVE_MODO_GRAFICO_PADRAO (que só semeia o estado inicial, de propósito): essa regra vale pra
   * CADA cálculo enquanto a tela de Peso estiver aberta, então precisa ser $state e relida quando
   * o modal de Meta fecha — senão mudar a config não refletia até recarregar a página inteira. */
  const CHAVE_MOSTRAR_DETALHES = "fitforge_peso_mostrar_detalhes";
  function lerMostrarDetalhesPref(): boolean {
    return typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_MOSTRAR_DETALHES) !== "false" : true;
  }
  let mostrarDetalhesPref = $state(lerMostrarDetalhesPref());

  /** "Acumulada" (padrão) ou "Média" pro card "Variação" — ver Meta > Parametrização do gráfico.
   * Mesmo motivo de mostrarDetalhesPref: $state, relida ao fechar o modal de Meta. */
  const CHAVE_TIPO_VARIACAO = "fitforge_peso_tipo_variacao";
  function lerTipoVariacaoPref(): "acumulada" | "media" {
    return typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_TIPO_VARIACAO) === "media" ? "media" : "acumulada";
  }
  let tipoVariacaoPref = $state<"acumulada" | "media">(lerTipoVariacaoPref());

  let meta = $state<PesoMeta | null>(null);
  let metaHistorico = $state<PesoMetaHistorico[]>([]);
  let mostrarFormMeta = $state(false);
  /** "X dias/meses para o objetivo" — só existe pra meta percentual (ver getDiasParaObjetivo). */
  let textoObjetivo = $state<string | null>(null);

  const CHAVE_META_VISIVEL = "fitforge_peso_meta_visivel";
  let metaVisivel = $state(typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_META_VISIVEL) === "1" : false);

  function alternarMetaVisivel() {
    metaVisivel = !metaVisivel;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CHAVE_META_VISIVEL, metaVisivel ? "1" : "0");
    }
  }

  /** Igual à Home: sempre o histórico completo, independente do período/filtro escolhido no
   * gráfico — sem isso, um intervalo sem se pesar maior que o filtro selecionado (ex: 20 dias sem
   * registro com o filtro "1 semana" ativo) deixava esses 3 cards em branco mesmo com histórico
   * disponível, divergindo da Home com os mesmos dados. */
  let ultimoPeso = $state<number | null>(null);
  let pesoMedioAtual = $state<number | null>(null);

  /** Histórico COMPLETO de peso (independente do período/filtro escolhido no gráfico) — usado só
   * pra trilhar a âncora da linha de meta (metaAlvoPorPonto). Sem isso, a âncora só enxergava o
   * que estava visível no filtro (ex: "1 semana"), então reancorava sempre bem no início da janela
   * visível — e como o primeiro marco semanal cai perto do fim de uma janela de 7 dias, a linha
   * "saltava" pro peso atual quase toda vez que a tela abria. */
  let pesosCompletos = $state<PesoRegistro[]>([]);

  /** Observação de "ajustar rota" (ver getObservacaoMeta em pesoApi.ts) — quando a média real
   * desvia além do ritmo máximo tolerado, pra qualquer lado. */
  let observacaoMeta = $state<{ desvioPct: number; direcao: "acima" | "abaixo" } | null>(null);

  async function carregarMeta() {
    const [metaCarregada, historico, dias, ultimo, media, pesosTudo, observacao] = await Promise.all([
      getMeta(),
      listMetaHistorico(),
      getDiasParaObjetivo(),
      getUltimoPeso(),
      getPesoMedioAtual(),
      getPesosDoPeriodo("1900-01-01", hojeISO()),
      getObservacaoMeta(),
    ]);
    meta = metaCarregada;
    metaHistorico = historico;
    textoObjetivo = dias != null ? `${formatDiasObjetivo(dias)} para o objetivo` : null;
    ultimoPeso = ultimo;
    pesoMedioAtual = media;
    pesosCompletos = pesosTudo;
    observacaoMeta = observacao;
  }

  void carregarMeta();

  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);
  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));

  async function carregar() {
    loading = true;
    const dataInicio = toISODate(mesInicio);
    const dataFim = toISODate(mesFim);
    const [listaPesos, listaTreinos, diasFoto] = await Promise.all([
      getPesosDoPeriodo(dataInicio, dataFim),
      getDiasComTreino(dataInicio, dataFim),
      getDiasComFoto(dataInicio, dataFim),
    ]);
    pesos = listaPesos;
    diasComTreino = new Map(listaTreinos.map((t) => [t.data, t.treinoNome]));
    diasComFoto = diasFoto;
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
    diasComTreinoNomeGrafico = new Map(listaTreinos.map((t) => [t.data, t.treinoNome]));
    loadingGrafico = false;
  }

  void carregarGrafico();

  /** Sentido da última troca de mês (1 = avançou, -1 = voltou) — só pra animação da grade saber
   * de que lado deslizar (ver `direcaoMes` no template). */
  let direcaoMes = $state(1);

  function trocarMes(delta: number) {
    direcaoMes = delta;
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
    const lista: ({ dia: number; iso: string; peso: number | null; nomeTreino: string | null; temFoto: boolean } | null)[] = [];
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null);
    const hoje = hojeISO();
    for (let dia = 1; dia <= totalDias; dia++) {
      const data = new Date(mesBase.getFullYear(), mesBase.getMonth(), dia);
      const iso = toISODate(data);
      const nomeTreino = diasComTreino.get(iso) ?? (iso > hoje ? (treinoPorDiaSemana.get(data.getDay()) ?? null) : null);
      lista.push({ dia, iso, peso: pesosPorData.get(iso) ?? null, nomeTreino, temFoto: diasComFoto.has(iso) });
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
    calcularMediaMovelSerie(pesosGraficoBruto).filter((p) => p.data >= dataInicioGrafico),
  );

  /** Pontos efetivamente plotados no gráfico principal, conforme o modo escolhido — mesmas datas nos dois modos, só muda se o peso é bruto ou suavizado. */
  const pontosGrafico = $derived.by(() => (modoGrafico === "media" ? mediaMovelGrafico : pesosGrafico));

  function formatPeso(valor: number): string {
    return valor.toFixed(1).replace(".", ",");
  }

  /** Último peso bruto registrado — histórico completo (ver ultimoPeso acima), não limitado ao
   * período/filtro do gráfico. */
  const pesoAtualTexto = $derived(ultimoPeso != null ? `${formatPeso(ultimoPeso)} kg` : "—");

  /** Card "Peso média": móvel dos últimos 7 dias (histórico completo, mesmo critério de sempre). */
  const mediaAtualTexto = $derived(pesoMedioAtual != null ? `${formatPeso(pesoMedioAtual)} kg` : "—");
  const mediaAtualLabel = "Média diária";

  /** "Meta Semanal" por dia — fonte única compartilhada com o card (calcularLinhaMetaPorDia em
   * pesoApi.ts). Roda sobre TODO o histórico (`pesosCompletos`), não sobre o período visível —
   * senão a linha reiniciava sempre no primeiro dia visível do filtro escolhido. */
  const metaAlvoCompletoPorData = $derived.by(() => {
    if (!metaHistorico.length || !pesosCompletos.length) return null;
    return calcularLinhaMetaPorDia(pesosCompletos, metaHistorico);
  });

  /** Valor exibido no card "Meta semanal": o ALVO FINAL da semana vigente (pra onde a linha está
   * indo), não o ponto de hoje nela — diferente de metaAlvoCompletoPorData, que interpola o
   * caminho até lá pro gráfico. */
  const metaSemanalValor = $derived.by(() => {
    if (!metaHistorico.length || !pesosCompletos.length) return null;
    const mapa = calcularMetaFimSemanaPorDia(pesosCompletos, metaHistorico);
    if (!mapa.size) return null;
    const datas = Array.from(mapa.keys()).sort();
    const ultima = datas[datas.length - 1];
    return ultima != null ? (mapa.get(ultima) ?? null) : null;
  });

  /** Valor exibido no card "Meta semanal": ritmo da meta ATUAL em cima da média real de hoje —
   * independente do histórico usado no gráfico, sempre reflete a meta vigente agora. */
  const metaSemanalTexto = $derived.by(() => {
    if (!meta) return "Sem meta";
    if (meta.tipo === "manutencao") return meta.pesoAlvo != null ? `${formatPeso(meta.pesoAlvo)} kg` : "Sem meta";
    return metaSemanalValor != null ? `${formatPeso(metaSemanalValor)} kg` : "Sem meta";
  });

  /** "Acumulada" (padrão) = direto do primeiro pro último registro do período inteiro.
   * "Média" = o período quebrado em blocos de 7 dias (a partir do registro mais antigo), a
   * variação % calculada DENTRO de cada bloco (mesma conta de "Acumulada", só que por semana) e
   * depois a média simples dessas variações semanais — configurável em Meta > Parametrização do
   * gráfico. Blocos com menos de 2 registros não entram na média (nada pra comparar). */
  function variacaoPct(primeiro: number, ultimo: number): number | null {
    if (primeiro === 0) return null;
    return ((ultimo - primeiro) / primeiro) * 100;
  }

  function variacaoMediaSemanal(pontos: PesoRegistro[]): number | null {
    if (!pontos.length) return null;
    const blocos: PesoRegistro[][] = [];
    let atual: PesoRegistro[] = [];
    let inicioBloco = pontos[0].data;
    for (const p of pontos) {
      if (Math.round((parseISODate(p.data).getTime() - parseISODate(inicioBloco).getTime()) / 86_400_000) >= 7) {
        if (atual.length) blocos.push(atual);
        atual = [];
        inicioBloco = p.data;
      }
      atual.push(p);
    }
    if (atual.length) blocos.push(atual);

    const variacoes = blocos
      .filter((b) => b.length >= 2)
      .map((b) => variacaoPct(b[0].peso, b[b.length - 1].peso))
      .filter((v): v is number => v != null);
    if (!variacoes.length) return null;
    return variacoes.reduce((acc, v) => acc + v, 0) / variacoes.length;
  }

  /** Variação % de peso no período do filtro aplicado no gráfico (periodo) — sempre a partir dos
   * pesos reais registrados, independente do modo diário/média escolhido pro desenho da linha.
   * null sem pelo menos 2 registros no período. */
  const variacaoPeriodo = $derived.by(() => {
    if (pesosGrafico.length < 2) return null;
    if (tipoVariacaoPref === "media") return variacaoMediaSemanal(pesosGrafico);
    return variacaoPct(pesosGrafico[0].peso, pesosGrafico[pesosGrafico.length - 1].peso);
  });
  const variacaoPeriodoTexto = $derived(
    variacaoPeriodo == null ? "—" : `${variacaoPeriodo > 0 ? "+" : ""}${variacaoPeriodo.toFixed(1).replace(".", ",")}%`,
  );

  /** Recorte de metaAlvoCompletoPorData pros dias efetivamente exibidos no período/filtro
   * escolhido — mesma ordem/tamanho de mediaMovelGrafico, pra alinhar com pontosGrafico. */
  const metaAlvoPorPonto = $derived.by(() => {
    const mapa = metaAlvoCompletoPorData;
    if (!mapa || !mediaMovelGrafico.length) return null;
    return mediaMovelGrafico.map((p) => mapa.get(p.data) ?? null);
  });

  /** Linha da meta no gráfico: o histórico real ponto a ponto (metaAlvoPorPonto), sem simplificar
   * pra uma reta — as quebras/curvas refletem mudanças reais de meta ao longo do tempo. */
  const metaLinha = $derived.by(() => {
    const alvos = metaVisivel ? metaAlvoPorPonto : null;
    if (!alvos || !alvos.length || pontosGrafico.length < 2 || alvos.length !== pontosGrafico.length) return null;
    return alvos;
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

  /** Só mostra os detalhes por ponto (%, valor da meta) com até 1 mês de período — em filtros
   * maiores vira poluição visual (dezenas de rótulos sobrepostos). Acima disso a linha fica só a
   * linha, mais fina. Também desliga de vez (qualquer período) se "Mostrar detalhes" estiver
   * desmarcado em Meta > Parametrização do gráfico. */
  const detalhesPorPonto = $derived(mostrarDetalhesPref && periodo.dias != null && periodo.dias <= 30);

  /** As bolinhas em cada ponto da linha só valem a pena em "1 semana" — com mais dias os pontos
   * ficam próximos demais e a linha vira uma sequência de bolinhas coladas, sem definição. Acima
   * de 1 semana, só a linha (sem ponto nenhum). */
  const mostrarPontos = $derived(periodo.dias != null && periodo.dias <= 7);

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
    const alvos = metaVisivel ? metaAlvoPorPonto : null;
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
      const alvos = metaVisivel ? metaAlvoPorPonto : null;
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
        } else {
          // Sem meta ativa (ou sem meta cadastrada) não há o que comparar em % — mostra o peso
          // real do ponto (bruto ou média, conforme o modo selecionado) em vez de nada.
          const p = pontosGrafico[i];
          if (p) {
            ctx.fillStyle = "#fff";
            ctx.fillText(formatPeso(p.peso), ponto.x, yDiff);
          }
        }
        // Dia da semana embaixo do próprio ponto — só no filtro "1 semana" (mostrarPontos), onde
        // há espaço de sobra entre os 7 pontos; em filtros maiores viraria poluição visual. Trava
        // no fundo da área do gráfico pra nunca sobrepor a data do eixo (pluginDatasEixo), que
        // desenha um pouco abaixo dela.
        if (mostrarPontos) {
          const p = pontosGrafico[i];
          if (p) {
            const yDia = Math.min(ponto.y + 13, c.chartArea.bottom - 4);
            ctx.fillStyle = "#9aa0ab";
            ctx.fillText(DIAS_SEMANA_ABREV[parseISODate(p.data).getDay()], ponto.x, yDia);
          }
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
            pointRadius: mostrarPontos ? 3 : 0,
            // Espessura fixa em todos os filtros — só as bolinhas (mostrarPontos) diferenciam o
            // semanal dos demais. Valor é o meio-termo entre o que era "detalhado" (3) e "liso"
            // (1.5) antes de virar fixo.
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
        layout: { padding: { top: 28, bottom: 22, left: 10, right: 14 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (ctx) => `${formatPeso(ctx.parsed.y ?? 0)} kg`,
              afterLabel: (ctx) => {
                const ponto = pontos[ctx.dataIndex];
                const nomeTreino = ponto ? diasComTreinoNomeGrafico.get(ponto.data) : undefined;
                return nomeTreino ? `Treino: ${nomeTreino}` : undefined;
              },
            },
          },
        },
        scales: {
          x: { display: false },
          y: {
            // Só no filtro "1 semana" (mostrarPontos): reserva uma folga abaixo do menor valor,
            // senão o ponto mais baixo ficava colado na base da área do gráfico, sem espaço pro
            // dia da semana embaixo dele — mesmo com o clamp, o texto saía quase em cima da data
            // do eixo (pluginDatasEixo), ilegível.
            grace: mostrarPontos ? "12%" : undefined,
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
    // O prazo do objetivo é projetado da última média — precisa recalcular a cada peso novo.
    void carregarMeta();
  }

  function aoSalvarMeta() {
    void carregarMeta();
  }
</script>

{#snippet iconMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  </svg>
{/snippet}
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
{#snippet iconFotoMini()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="7" width="13" height="13" rx="2" />
    <path d="M4 14V6a2 2 0 0 1 2-2h8" />
  </svg>
{/snippet}
{#snippet iconExpandir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Peso <span class="modo-label">{textoObjetivo ?? (modoGrafico === "media" ? "Média" : "Diário")}</span></h1>
    <div class="header-acoes">
      <button class="icon-btn" onclick={() => (mostrarFormMeta = true)} aria-label="Configurar meta">
        {@render iconMeta()}
      </button>
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
    <div class="chart-toolbar">
      <button class="icone-topo" onclick={() => (mostrarGraficoCheio = true)} aria-label="Ver gráfico em tela cheia">
        {@render iconExpandir()}
      </button>
    </div>
    <div class="chart-wrap">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}

  <div class="quick-actions">
    <button
      class="quick-card quick-card-btn"
      class:quick-card-ativo={modoGrafico === "diario"}
      onclick={() => selecionarModoGrafico("diario")}
    >
      <span class="quick-card-label">Últ. registro</span>
      <span class="quick-card-valor">{pesoAtualTexto}</span>
    </button>
    <button
      class="quick-card quick-card-btn"
      class:quick-card-ativo={modoGrafico === "media"}
      onclick={() => selecionarModoGrafico("media")}
    >
      <span class="quick-card-label">{mediaAtualLabel}</span>
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
    <div class="quick-card">
      <span class="quick-card-label">Variação</span>
      <span class="quick-card-valor">{variacaoPeriodoTexto}</span>
    </div>
  </div>

  {#if observacaoMeta}
    <button class="observacao-meta" onclick={() => (mostrarFormMeta = true)}>
      Sua média está {observacaoMeta.direcao === "acima" ? "acima" : "abaixo"} do ritmo máximo configurado ({Math.abs(observacaoMeta.desvioPct).toFixed(1)}%) — hora de ajustar a rota (dieta, treino, cardio).
    </button>
  {/if}

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
      {#key mesLabel}
        <div
          class="grade"
          in:fly={{ x: direcaoMes * 32, duration: 220, easing: cubicOut }}
          out:fly={{ x: direcaoMes * -32, duration: 160, easing: cubicOut }}
        >
        {#each celulas as cel, i (i)}
          {#if cel === null}
            <div class="celula vazia"></div>
          {:else}
            {@const ehHoje = cel.iso === hojeISO()}
            {@const temTreino = cel.nomeTreino != null}
            <button class="celula" class:com-peso={cel.peso != null} onclick={() => abrirDia(cel.iso)}>
              {#if cel.temFoto}
                <span class="foto-indicador" aria-hidden="true">{@render iconFotoMini()}</span>
              {/if}
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
      {/key}
    {/if}
  </div>
</div>

{#if diaSelecionado !== null}
  <PesoDiaSheet data={diaSelecionado} onFechar={() => voltar("/peso")} onSalvo={aoSalvar} />
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

{#if mostrarFormMeta}
  <PesoMetaFormSheet
    onFechar={() => {
      mostrarFormMeta = false;
      mostrarDetalhesPref = lerMostrarDetalhesPref();
      tipoVariacaoPref = lerTipoVariacaoPref();
    }}
    onSalvo={aoSalvarMeta}
  />
{/if}

{#if mostrarGraficoCheio}
  <PesoGraficoTelaCheia
    {pontosGrafico}
    {diasComTreinoGrafico}
    {diasComTreinoNomeGrafico}
    modo={modoGrafico}
    {metaLinha}
    {diffMetaPorPonto}
    metaAlvoPorPonto={metaVisivel ? metaAlvoPorPonto : null}
    {pontosComData}
    {detalhesPorPonto}
    {mostrarPontos}
    onFechar={() => (mostrarGraficoCheio = false)}
  />
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: max(var(--space-4), env(safe-area-inset-top, 0px));
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
  .chart-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-2);
  }
  .icone-topo {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--surface-card);
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .icone-topo svg {
    width: 15px;
    height: 15px;
  }
  .chart-wrap {
    position: relative;
    display: block;
    width: 100%;
    height: 220px;
    margin-bottom: var(--space-5);
  }
  .modo-label {
    font-size: 12px;
    font-weight: 400;
    color: var(--surface-muted);
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }
  .observacao-meta {
    display: block;
    width: 100%;
    margin: 0 0 var(--space-6);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-negative);
    background: var(--surface-card);
    color: var(--color-negative);
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    line-height: 1.4;
    cursor: pointer;
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
    overflow: hidden;
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
  .foto-indicador {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 10px;
    height: 10px;
    color: var(--surface-muted);
    opacity: 0.9;
  }
  .foto-indicador svg {
    width: 100%;
    height: 100%;
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
