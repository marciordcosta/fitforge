<script lang="ts">
  import { navigate, voltar, router } from "../../lib/router.svelte";
  import { toISODate, parseISODate } from "../../lib/dates";
  import ActionSheet, { type AcaoSheet } from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import PieChart from "../../components/PieChart.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import {
    listMusculos,
    listTreinos,
    listExercicios,
    getTreino,
    getVolumeRealizadoBruto,
    getUltimoRegistro,
    updateSeriesCountTreinoExercicio,
    removerTreinoExercicio,
    atualizarOrdemTreinoExercicios,
    adicionarTreinoExercicio,
    correspondeBusca,
    textoBuscavelExercicio,
    DIAS_SEMANA_ABREV,
    abreviarMusculo,
    type Musculo,
    type TreinoComExercicios,
    type Exercicio,
  } from "../../lib/treinoApi";

  let aba = $state<"planejado" | "realizado">("planejado");
  let musculos = $state<Musculo[]>([]);
  let treinos = $state<TreinoComExercicios[]>([]);
  let todosExercicios = $state<Exercicio[]>([]);

  let mesBase = $state(new Date());
  let linhasRealizadoMes = $state<{ data: string; musculo_id: string; series_equivalentes: number }[]>([]);
  let carregandoRealizado = $state(false);
  let carregouRealizadoAlgumaVez = $state(false);

  /** Rotinas com dia informado sobem pro topo, ordenadas pelo dia mais próximo; sem dia, mantém a ordenação manual (mesma lógica da tela inicial de Treino). */
  function ordenarPorDia(lista: TreinoComExercicios[]): TreinoComExercicios[] {
    const hoje = new Date().getDay();
    const comDia = lista
      .filter((t) => t.dia_semana != null)
      .sort((a, b) => ((a.dia_semana! - hoje + 7) % 7) - ((b.dia_semana! - hoje + 7) % 7));
    const semDia = lista.filter((t) => t.dia_semana == null);
    return [...comDia, ...semDia];
  }

  async function carregarBase() {
    const [musculosCarregados, treinosCarregados, exerciciosCarregados] = await Promise.all([
      listMusculos(),
      listTreinos(),
      listExercicios(),
    ]);
    musculos = musculosCarregados;
    treinos = ordenarPorDia(treinosCarregados);
    todosExercicios = exerciciosCarregados;
    await carregarRealizado();
  }

  void carregarBase();

  /** 1 série conta 1 para cada músculo trabalhado no exercício, sem ponderar por papel/peso — usado só na grade semanal (quantidade por dia), que fica de fora do modo de contribuição de propósito. */
  function contarSeriesPorMusculo(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries) continue;
      for (const m of ex.exercicio?.musculos ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries);
      }
    }
    return mapa;
  }

  /** Modo de contribuição: cada série soma peso_contribuicao (0.25 a 1) pra cada músculo que
   * trabalha — igual à Distribuição Semanal — em vez de contar a série inteira pra todo mundo.
   * Um músculo secundário (ex: tríceps no supino, peso 0.25) aparece proporcional ao quanto ele
   * realmente participa, não como se tivesse recebido o mesmo estímulo do músculo primário. Sem
   * normalizar pra somar 1 (o primário mantém quase o valor cheio); a soma por músculo pode ficar
   * abaixo do total de séries da rotina, mas não mais inflada como na contagem bruta. */
  function contarSeriesPorMusculoPonderado(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries) continue;
      for (const m of ex.exercicio?.musculos ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
      }
    }
    return mapa;
  }

  /** Números do modo de contribuição costumam vir com decimais (0.25, 4.3...) — arredonda pro
   * 0.5 mais próximo pra não mostrar frações estranhas tipo 0.3, e mostra inteiro quando cai redondo. */
  function formatValor(valor: number): string {
    const arred = Math.round(valor * 2) / 2;
    return Number.isInteger(arred) ? String(arred) : arred.toFixed(1);
  }

  /**
   * Cor por faixa do percentual ACUMULADO (regra 80/20 — corte em 20%/50%), com margem
   * de tolerância pra não trocar de cor por pouca diferença perto do corte. A lista já
   * vem ordenada do músculo mais dominante pro menos — o acumulado soma na ordem, então
   * mostra visualmente quantos músculos concentram a maior parte do volume da rotina.
   * Faixa B alargada (20-50, não 20-30): com poucos músculos por rotina, um salto de um
   * músculo pro outro costuma passar de 10 pontos — numa janela estreita, o acumulado
   * pula direto de A pra C sem nunca cair em B.
   */
  const CORTE_A = 20;
  const CORTE_B = 50;
  const MARGEM_FAIXA = 5;
  const CORES_FAIXA = { a: "#60a5fa", b: "#fbbf24", c: "#f87171" };

  function corPorFaixa(acumulado: number): string {
    if (acumulado <= CORTE_A + MARGEM_FAIXA) return CORES_FAIXA.a;
    if (acumulado <= CORTE_B + MARGEM_FAIXA) return CORES_FAIXA.b;
    return CORES_FAIXA.c;
  }

  interface Partes {
    a: number;
    b: number;
    c: number;
  }

  function partesVazias(): Partes {
    return { a: 0, b: 0, c: 0 };
  }

  function somarPartes(...listas: Partes[]): Partes {
    return listas.reduce((acc, p) => ({ a: acc.a + p.a, b: acc.b + p.b, c: acc.c + p.c }), partesVazias());
  }

  function partesParaSegmentos(p: Partes): { valor: number; cor: string }[] {
    return [
      { valor: p.a, cor: CORES_FAIXA.a },
      { valor: p.b, cor: CORES_FAIXA.b },
      { valor: p.c, cor: CORES_FAIXA.c },
    ];
  }

  /**
   * Classifica cada série da rotina pela POSIÇÃO no treino (não pelo músculo) — a fadiga
   * acumula ao longo do treino, então uma série no início vale mais que uma no fim. Usa a
   * mesma regra 80/20 (corPorFaixa) sobre o percentual acumulado de séries já feitas na
   * ordem dos exercícios. Modo de contribuição: cada série soma peso_contribuicao (não 1
   * inteiro) pra cada músculo que ela trabalha, igual contarSeriesPorMusculoPonderado — as
   * partes de cada músculo somam o mesmo total ponderado dele.
   */
  function contarSeriesPorFaixaDePosicao(treino: TreinoComExercicios): Map<string, Partes> {
    const exerciciosOrdenados = treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
    const totalSeries = exerciciosOrdenados.reduce((acc, ex) => acc + ex.series.length, 0);
    const mapa = new Map<string, Partes>();
    if (!totalSeries) return mapa;

    let posicao = 0;
    for (const ex of exerciciosOrdenados) {
      const musculosEx = ex.exercicio?.musculos ?? [];
      for (let s = 0; s < ex.series.length; s++) {
        posicao += 1;
        const cor = corPorFaixa((posicao / totalSeries) * 100);
        for (const m of musculosEx) {
          const atual = mapa.get(m.musculo_id) ?? partesVazias();
          if (cor === CORES_FAIXA.a) atual.a += m.peso_contribuicao;
          else if (cor === CORES_FAIXA.b) atual.b += m.peso_contribuicao;
          else atual.c += m.peso_contribuicao;
          mapa.set(m.musculo_id, atual);
        }
      }
    }
    return mapa;
  }

  /**
   * Distribuição estática de cada rotina (sem acompanhamento ao vivo — isso fica só no
   * card semanal). Modo de contribuição: cada série soma peso_contribuicao pra cada
   * músculo que o exercício trabalha (mesma regra do gráfico/anel), não a série inteira —
   * um músculo secundário aparece proporcional ao quanto participa, não como se tivesse
   * o mesmo estímulo do primário. A barra é dividida nas faixas A/B/C por POSIÇÃO no
   * treino (contarSeriesPorFaixaDePosicao) — não pela dominância do músculo.
   */
  interface LinhaRotina {
    chave: string;
    nome: string;
    valor: number;
    pct: number;
    partes: Partes;
    musculo: Musculo | null;
    subItens: { musculo: Musculo; valor: number; partes: Partes }[] | null;
  }

  const distribuicaoPorTreino = $derived.by(() => {
    return treinos.map((t) => {
      const totalSeries = t.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
      const mapaValor = contarSeriesPorMusculoPonderado(t);
      const mapaFaixaPosicao = contarSeriesPorFaixaDePosicao(t);
      const bruto = musculos
        .map((m) => ({
          musculo: m,
          valor: mapaValor.get(m.id) ?? 0,
          partes: mapaFaixaPosicao.get(m.id) ?? partesVazias(),
        }))
        .filter((item) => item.valor > 0);

      const porGrupo = new Map<string, { nome: string; itens: typeof bruto }>();
      const avulsos: typeof bruto = [];
      for (const item of bruto) {
        const agrupamento = item.musculo.agrupamento;
        if (agrupamento) {
          const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
          grupo.itens.push(item);
          porGrupo.set(agrupamento.id, grupo);
        } else {
          avulsos.push(item);
        }
      }

      const base: Omit<LinhaRotina, "pct">[] = [];
      for (const [id, grupo] of porGrupo) {
        base.push({
          chave: id,
          nome: grupo.nome,
          valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
          partes: somarPartes(...grupo.itens.map((i) => i.partes)),
          musculo: null,
          subItens: grupo.itens,
        });
      }
      for (const item of avulsos) {
        base.push({
          chave: item.musculo.id,
          nome: item.musculo.nome,
          valor: item.valor,
          partes: item.partes,
          musculo: item.musculo,
          subItens: null,
        });
      }
      base.sort((a, b) => b.valor - a.valor);

      const lista: LinhaRotina[] = base.map((item) => ({
        ...item,
        pct: totalSeries > 0 ? (item.valor / totalSeries) * 100 : 0,
      }));
      return { treino: t, lista };
    });
  });

  /** Rotinas cujo card está ordenado por fadiga (clicou no nome) em vez de quantidade de séries. */
  let treinosOrdenadosPorFadiga = $state<Set<string>>(new Set());

  function alternarOrdemFadiga(treinoId: string): void {
    const copia = new Set(treinosOrdenadosPorFadiga);
    if (copia.has(treinoId)) copia.delete(treinoId);
    else copia.add(treinoId);
    treinosOrdenadosPorFadiga = copia;
  }

  /** Média ponderada da faixa de fadiga (A=0, B=1, C=2) das séries do músculo — quanto menor,
   * mais séries dele caíram no início do treino (menos fadiga acumulada, melhor estímulo). */
  function scoreFadiga(linha: { valor: number; partes: Partes }): number {
    return linha.valor > 0 ? (linha.partes.b + linha.partes.c * 2) / linha.valor : 0;
  }

  function ordenarPorMelhorEstimulo<T extends { valor: number; partes: Partes; subItens: { valor: number; partes: Partes }[] | null }>(
    lista: T[],
  ): T[] {
    return lista
      .map((item) => (item.subItens ? { ...item, subItens: item.subItens.slice().sort((a, b) => scoreFadiga(a) - scoreFadiga(b)) } : item))
      .sort((a, b) => scoreFadiga(a) - scoreFadiga(b));
  }

  const totaisSemanais = $derived.by(() => {
    let exercicios = 0;
    let series = 0;
    for (const t of treinos) {
      exercicios += t.exercicios.length;
      series += t.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
    }
    return { exercicios, series };
  });

  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

  let mostrarGradeSemanal = $state(false);
  /** null = mostra todos os músculos; caso contrário, restringe a grade a esses ids (série clicada ou rotina do card). */
  let filtroMusculosGrade = $state<Set<string> | null>(null);

  function abrirGradeSemanal(musculoIds: string[] | null): void {
    filtroMusculosGrade = musculoIds ? new Set(musculoIds) : null;
    mostrarGradeSemanal = true;
  }

  /** Grade semanal: uma coluna por dia (seg→dom), com a rotina daquele dia (ou descanso) e as séries por músculo. */
  const gradeSemanal = $derived.by(() => {
    const colunas = ORDEM_DIAS.map((dia) => {
      const treino = treinos.find((t) => t.dia_semana === dia) ?? null;
      return {
        dia,
        treinoId: treino?.id ?? null,
        treinoNome: treino?.nome_treino ?? null,
        mapa: treino ? contarSeriesPorMusculo(treino) : new Map<string, number>(),
      };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [musculoId, valor] of col.mapa) {
        totais.set(musculoId, (totais.get(musculoId) ?? 0) + valor);
      }
    }

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => (totais.get(b.id) ?? 0) - (totais.get(a.id) ?? 0))
      .map((m) => ({ musculo: m, valores: colunas.map((col) => col.mapa.get(m.id) ?? 0) }));

    return { colunas, linhas };
  });

  /** Distribuição semanal (todas as rotinas somadas), ponderada pelo peso de contribuição parametrizado de cada músculo. */
  /** Faixas A/B/C por DOMINÂNCIA acumulada (20/30/50 do total de séries da semana, ordenado do
   * músculo mais forte pro mais fraco) — mesma regra do anel semanal (coresAbcAcumulado), não por
   * posição no treino: a semana não tem uma sequência única de fadiga como uma rotina tem. Cada
   * músculo recebe uma cor só (não se divide entre faixas), igual ao anel. */
  function contarSeriesPorFaixaDominanciaSemanal(): Map<string, Partes> {
    const mapa = new Map<string, number>();
    for (const t of treinos) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    const itens = Array.from(mapa.entries())
      .map(([musculo_id, valor]) => ({ musculo_id, valor }))
      .sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((acc, i) => acc + i.valor, 0);
    let acumulado = 0;
    const resultado = new Map<string, Partes>();
    for (const item of itens) {
      const pct = total > 0 ? (item.valor / total) * 100 : 0;
      acumulado += pct;
      const cor = corPorFaixa(acumulado);
      const p = partesVazias();
      if (cor === CORES_FAIXA.a) p.a = item.valor;
      else if (cor === CORES_FAIXA.b) p.b = item.valor;
      else p.c = item.valor;
      resultado.set(item.musculo_id, p);
    }
    return resultado;
  }

  const distribuicaoSemanal = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const t of treinos) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    const partesPorMusculo = contarSeriesPorFaixaDominanciaSemanal();
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round(mapa.get(m.id) ?? 0), partes: partesPorMusculo.get(m.id) ?? partesVazias() }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  interface LinhaSemanal {
    chave: string;
    nome: string;
    valor: number;
    partes: Partes;
    /** Preenchido só quando a linha é um músculo avulso (sem agrupamento) — usado pra abrir os exercícios dele. */
    musculo: Musculo | null;
    /** null = músculo avulso; senão, os músculos que compõem o total do grupo. */
    subItens: { musculo: Musculo; valor: number; partes: Partes }[] | null;
  }

  let gruposExpandidos = $state<Set<string>>(new Set());

  function alternarGrupo(chave: string): void {
    const copia = new Set(gruposExpandidos);
    if (copia.has(chave)) copia.delete(chave);
    else copia.add(chave);
    gruposExpandidos = copia;
  }

  /** Junta na Distribuição Semanal os músculos que têm o mesmo agrupamento (ex: Deltoide
   * Anterior/Lateral/Posterior somados em "Deltoide") — os músculos separados continuam
   * disponíveis expandindo o grupo. Músculos sem agrupamento ficam como estão. */
  const linhasSemanal = $derived.by(() => {
    const porGrupo = new Map<string, { nome: string; itens: typeof distribuicaoSemanal }>();
    const avulsos: typeof distribuicaoSemanal = [];
    for (const item of distribuicaoSemanal) {
      const agrupamento = item.musculo.agrupamento;
      if (agrupamento) {
        const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
        grupo.itens.push(item);
        porGrupo.set(agrupamento.id, grupo);
      } else {
        avulsos.push(item);
      }
    }

    const linhas: LinhaSemanal[] = [];
    for (const [id, grupo] of porGrupo) {
      linhas.push({
        chave: id,
        nome: grupo.nome,
        valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
        partes: somarPartes(...grupo.itens.map((i) => i.partes)),
        musculo: null,
        subItens: grupo.itens.map((i) => ({ musculo: i.musculo, valor: i.valor, partes: i.partes })),
      });
    }
    for (const item of avulsos) {
      linhas.push({
        chave: item.musculo.id,
        nome: item.musculo.nome,
        valor: item.valor,
        partes: item.partes,
        musculo: item.musculo,
        subItens: null,
      });
    }
    return linhas.sort((a, b) => b.valor - a.valor);
  });

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

  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));
  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);

  async function carregarRealizado() {
    carregandoRealizado = true;
    linhasRealizadoMes = await getVolumeRealizadoBruto(toISODate(mesInicio), toISODate(mesFim));
    carregandoRealizado = false;
    carregouRealizadoAlgumaVez = true;
  }

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregarRealizado();
  }

  function corVolume(v: number): string {
    if (v > 10) return "var(--color-negative)";
    if (v >= 5) return "var(--color-success)";
    return "var(--color-neutral)";
  }

  const SEMANAS_MES = [
    { label: "Semana 1", subtitulo: "01–07", diaIni: 1, diaFim: 7 },
    { label: "Semana 2", subtitulo: "08–14", diaIni: 8, diaFim: 14 },
    { label: "Semana 3", subtitulo: "15–21", diaIni: 15, diaFim: 21 },
    { label: "Semana 4", subtitulo: "22–fim", diaIni: 22, diaFim: 31 },
  ];

  /** Quantas das 4 semanas do mês tiveram ao menos um treino registrado (base pra calcular a média semanal). */
  const semanasComTreino = $derived.by(() => {
    return SEMANAS_MES.filter((sem) =>
      linhasRealizadoMes.some((l) => {
        const dia = parseISODate(l.data).getDate();
        return dia >= sem.diaIni && dia <= sem.diaFim;
      }),
    ).length;
  });

  /** Meta semanal por músculo (mesmo valor de distribuicaoSemanal, só num Map pra achar rápido) — usada pra comparar com o realizado do mês. */
  const metaPorMusculo = $derived(new Map(distribuicaoSemanal.map((item) => [item.musculo.id, item.valor])));

  /** Distribuição realizada no mês: média semanal (soma do mês ÷ semanas com treino), com o peso de contribuição parametrizado. */
  const listaRealizado = $derived.by(() => {
    const divisor = Math.max(semanasComTreino, 1);
    const mapa = new Map<string, number>();
    for (const l of linhasRealizadoMes) {
      mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
    }
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round((mapa.get(m.id) ?? 0) / divisor) }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  interface LinhaRealizado {
    chave: string;
    nome: string;
    valor: number;
    meta: number;
    musculo: Musculo | null;
    subItens: { musculo: Musculo; valor: number; meta: number }[] | null;
  }

  /** Mesmo agrupamento por musculos.agrupamento_id usado na Distribuição Semanal, aplicado ao Realizado. */
  const linhasRealizado = $derived.by(() => {
    const porGrupo = new Map<string, { nome: string; itens: typeof listaRealizado }>();
    const avulsos: typeof listaRealizado = [];
    for (const item of listaRealizado) {
      const agrupamento = item.musculo.agrupamento;
      if (agrupamento) {
        const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
        grupo.itens.push(item);
        porGrupo.set(agrupamento.id, grupo);
      } else {
        avulsos.push(item);
      }
    }

    const linhas: LinhaRealizado[] = [];
    for (const [id, grupo] of porGrupo) {
      linhas.push({
        chave: id,
        nome: grupo.nome,
        valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
        meta: grupo.itens.reduce((acc, i) => acc + (metaPorMusculo.get(i.musculo.id) ?? 0), 0),
        musculo: null,
        subItens: grupo.itens.map((i) => ({
          musculo: i.musculo,
          valor: i.valor,
          meta: metaPorMusculo.get(i.musculo.id) ?? 0,
        })),
      });
    }
    for (const item of avulsos) {
      linhas.push({
        chave: item.musculo.id,
        nome: item.musculo.nome,
        valor: item.valor,
        meta: metaPorMusculo.get(item.musculo.id) ?? 0,
        musculo: item.musculo,
        subItens: null,
      });
    }
    return linhas.sort((a, b) => b.valor - a.valor);
  });

  let mostrarGradeRealizado = $state(false);

  /** Grade do mês: uma coluna por semana (1 a 4), com as séries válidas realizadas por músculo. */
  const gradeRealizado = $derived.by(() => {
    const colunas = SEMANAS_MES.map((sem) => {
      const mapa = new Map<string, number>();
      for (const l of linhasRealizadoMes) {
        const dia = parseISODate(l.data).getDate();
        if (dia >= sem.diaIni && dia <= sem.diaFim) {
          mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
        }
      }
      return { label: sem.label, subtitulo: sem.subtitulo, mapa };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [id, v] of col.mapa) totais.set(id, (totais.get(id) ?? 0) + v);
    }

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => (totais.get(b.id) ?? 0) - (totais.get(a.id) ?? 0))
      .map((m) => ({ musculo: m, valores: colunas.map((c) => Math.round(c.mapa.get(m.id) ?? 0)) }));

    return { colunas, linhas };
  });

  function abrirMenuRealizado(): void {
    modalAberto = {
      titulo: "Realizado",
      opcoes: [
        { label: "Mês", icon: iconGrade, onSelect: () => (mostrarGradeRealizado = true) },
        { label: "Gráfico", icon: iconGrafico, onSelect: () => abrirDetalheRotina(mesLabel, listaRealizado) },
      ],
    };
  }

  // ---------------- Modal: exercícios/rotinas que trabalham um músculo ----------------

  let modalAberto = $state<{
    titulo: string;
    opcoes: AcaoSheet[];
    musculoParaGrade?: Musculo;
  } | null>(null);

  /** Um item por (rotina, exercício) — o mesmo exercício pode aparecer em rotinas diferentes. */
  function exerciciosDoMusculo(
    lista: TreinoComExercicios[],
    musculoId: string,
  ): { exercicioNome: string; treinoId: string; treinoNome: string; series: number }[] {
    const resultado: { exercicioNome: string; treinoId: string; treinoNome: string; series: number }[] = [];
    for (const t of lista) {
      for (const ex of t.exercicios) {
        if (!ex.exercicio) continue;
        if (ex.exercicio.musculos.some((m) => m.musculo_id === musculoId)) {
          resultado.push({ exercicioNome: ex.exercicio.nome, treinoId: t.id, treinoNome: t.nome_treino, series: ex.series.length });
        }
      }
    }
    return resultado;
  }

  function abrirExercicios(lista: TreinoComExercicios[], musculo: Musculo): void {
    modalAberto = {
      titulo: musculo.nome,
      opcoes: exerciciosDoMusculo(lista, musculo.id).map((e) => ({
        label: e.exercicioNome,
        subtitulo: e.treinoNome,
        valor: `${e.series} ${e.series === 1 ? "série" : "séries"}`,
        onSelect: () => navigate(`/treino/rotina/${e.treinoId}`),
      })),
      musculoParaGrade: musculo,
    };
  }

  // ---------------- Modal: exercícios de um músculo dentro de uma rotina específica, com séries editáveis ----------------

  interface ItemMusculoRotina {
    treinoExercicioId: string;
    exercicioId: string;
    exercicioNome: string;
    series: number;
  }

  let modalMusculoRotina = $state<{ treino: TreinoComExercicios; musculo: Musculo; itens: ItemMusculoRotina[] } | null>(null);
  let editandoSerieItem = $state<ItemMusculoRotina | null>(null);
  let salvandoSeries = $state(false);
  let mostrarPickerMusculo = $state(false);
  let buscaPickerMusculo = $state("");
  let adicionandoIdMusculo = $state<string | null>(null);

  function itensMusculoRotina(treino: TreinoComExercicios, musculoId: string): ItemMusculoRotina[] {
    return treino.exercicios
      .filter((te) => te.exercicio?.musculos.some((m) => m.musculo_id === musculoId))
      .map((te) => ({ treinoExercicioId: te.id, exercicioId: te.exercicio_id, exercicioNome: te.exercicio?.nome ?? "", series: te.series.length }));
  }

  function definirModalMusculo(treino: TreinoComExercicios, musculo: Musculo): void {
    modalMusculoRotina = { treino, musculo, itens: itensMusculoRotina(treino, musculo.id) };
  }

  /** Exercícios dessa rotina específica que trabalham o músculo, com o número de séries editável
   * (abre a roleta) — ajustar aqui atualiza a rotina de verdade, as duas telas ficam ligadas.
   * Navega (em vez de só setar estado) pra sair e voltar do detalhe do exercício reabrir o modal. */
  function abrirExerciciosDaRotina(treino: TreinoComExercicios, musculo: Musculo): void {
    navigate(`/treino/distribuicao/rotina/${treino.id}/musculo/${musculo.id}`);
  }

  /** Recarrega a rotina do banco e propaga pro card/lista, pro modal por músculo e pro editor
   * completo (se algum deles estiver aberto pra essa mesma rotina) — mantém tudo ligado. */
  async function refrescarTreinoMusculo(treinoId: string): Promise<void> {
    const atualizado = await getTreino(treinoId);
    if (!atualizado) return;
    treinos = treinos.map((t) => (t.id === treinoId ? atualizado : t));
    if (modalMusculoRotina?.treino.id === treinoId) {
      modalMusculoRotina = {
        treino: atualizado,
        musculo: modalMusculoRotina.musculo,
        itens: itensMusculoRotina(atualizado, modalMusculoRotina.musculo.id),
      };
    }
    if (modalEditorRotina?.id === treinoId) modalEditorRotina = atualizado;
  }

  const opcoesSeries = Array.from({ length: 10 }, (_, i) => ({ valor: i + 1, label: String(i + 1) }));

  async function ajustarSeries(novoNumero: number): Promise<void> {
    if (!editandoSerieItem || !modalMusculoRotina) return;
    const item = editandoSerieItem;
    const treinoId = modalMusculoRotina.treino.id;
    salvandoSeries = true;
    try {
      await updateSeriesCountTreinoExercicio(item.treinoExercicioId, novoNumero);
      await refrescarTreinoMusculo(treinoId);
    } finally {
      salvandoSeries = false;
      editandoSerieItem = null;
    }
  }

  async function removerExercicioMusculo(item: ItemMusculoRotina): Promise<void> {
    if (!modalMusculoRotina) return;
    const treinoId = modalMusculoRotina.treino.id;
    salvandoSeries = true;
    try {
      await removerTreinoExercicio(item.treinoExercicioId);
      await refrescarTreinoMusculo(treinoId);
    } finally {
      salvandoSeries = false;
    }
  }

  /** Abre o picker de exercícios já com o nome do músculo no campo de busca, pra filtrar. */
  function abrirPickerMusculo(): void {
    if (!modalMusculoRotina) return;
    buscaPickerMusculo = modalMusculoRotina.musculo.nome;
    mostrarPickerMusculo = true;
  }

  const opcoesPickerMusculo = $derived(
    todosExercicios.filter(
      (e) =>
        !modalMusculoRotina?.treino.exercicios.some((te) => te.exercicio_id === e.id) &&
        correspondeBusca(textoBuscavelExercicio(e), buscaPickerMusculo),
    ),
  );

  async function adicionarExercicioMusculo(ex: Exercicio): Promise<void> {
    if (!modalMusculoRotina) return;
    const treinoId = modalMusculoRotina.treino.id;
    adicionandoIdMusculo = ex.id;
    try {
      const anterior = await getUltimoRegistro(ex.id);
      await adicionarTreinoExercicio(treinoId, ex.id, 3, anterior);
      await refrescarTreinoMusculo(treinoId);
      mostrarPickerMusculo = false;
      buscaPickerMusculo = "";
    } finally {
      adicionandoIdMusculo = null;
    }
  }

  // ---------------- Modal: edição visual da rotina inteira (add/remover/reordenar exercícios) ----------------

  let modalEditorRotina = $state<TreinoComExercicios | null>(null);
  let editandoSerieEditor = $state<{ treinoExercicioId: string; exercicioNome: string; series: number } | null>(null);
  let salvandoEditor = $state(false);
  let mostrarPickerEditor = $state(false);
  let buscaPickerEditor = $state("");
  let adicionandoIdEditor = $state<string | null>(null);
  let arrastandoIdxEditor = $state<number | null>(null);
  let itemEditorRefs: (HTMLElement | null)[] = [];

  function definirModalEditor(treino: TreinoComExercicios): void {
    modalEditorRotina = treino;
  }

  /** Navega (em vez de só setar estado) pra sair e voltar do detalhe de um exercício reabrir o editor. */
  function abrirEditorRotina(treino: TreinoComExercicios): void {
    navigate(`/treino/distribuicao/rotina/${treino.id}/editor`);
  }

  /** Recarrega a rotina do banco após qualquer alteração e propaga pro card/lista e pro
   * próprio modal do editor — mantém tudo ligado sem precisar de um botão Salvar. */
  async function refrescarTreinoEditor(treinoId: string): Promise<void> {
    const atualizado = await getTreino(treinoId);
    if (!atualizado) return;
    treinos = treinos.map((t) => (t.id === treinoId ? atualizado : t));
    if (modalEditorRotina?.id === treinoId) modalEditorRotina = atualizado;
  }

  async function removerExercicioEditor(treinoExercicioId: string): Promise<void> {
    if (!modalEditorRotina) return;
    const treinoId = modalEditorRotina.id;
    salvandoEditor = true;
    try {
      await removerTreinoExercicio(treinoExercicioId);
      await refrescarTreinoEditor(treinoId);
    } finally {
      salvandoEditor = false;
    }
  }

  function iniciarArrasteEditor(e: PointerEvent, idx: number): void {
    arrastandoIdxEditor = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moverDuranteArrasteEditor(e: PointerEvent): void {
    if (arrastandoIdxEditor === null || !modalEditorRotina) return;
    const y = e.clientY;
    for (let i = 0; i < itemEditorRefs.length; i++) {
      const el = itemEditorRefs[i];
      if (!el || i === arrastandoIdxEditor) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if ((i < arrastandoIdxEditor && y < meio) || (i > arrastandoIdxEditor && y > meio)) {
        const ordenados = modalEditorRotina.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
        const [item] = ordenados.splice(arrastandoIdxEditor, 1);
        ordenados.splice(i, 0, item);
        modalEditorRotina = {
          ...modalEditorRotina,
          exercicios: ordenados.map((te, idx2) => ({ ...te, ordem: idx2 })),
        };
        arrastandoIdxEditor = i;
        break;
      }
    }
  }

  async function finalizarArrasteEditor(): Promise<void> {
    if (arrastandoIdxEditor === null || !modalEditorRotina) {
      arrastandoIdxEditor = null;
      return;
    }
    arrastandoIdxEditor = null;
    const treinoId = modalEditorRotina.id;
    const idsOrdenados = modalEditorRotina.exercicios.slice().sort((a, b) => a.ordem - b.ordem).map((te) => te.id);
    await atualizarOrdemTreinoExercicios(idsOrdenados);
    await refrescarTreinoEditor(treinoId);
  }

  $effect(() => {
    if (arrastandoIdxEditor === null) return;
    window.addEventListener("pointermove", moverDuranteArrasteEditor);
    window.addEventListener("pointerup", finalizarArrasteEditor);
    return () => {
      window.removeEventListener("pointermove", moverDuranteArrasteEditor);
      window.removeEventListener("pointerup", finalizarArrasteEditor);
    };
  });

  const opcoesPickerEditor = $derived(
    todosExercicios.filter(
      (e) => !modalEditorRotina?.exercicios.some((te) => te.exercicio_id === e.id) && correspondeBusca(textoBuscavelExercicio(e), buscaPickerEditor),
    ),
  );

  async function adicionarExercicioEditor(ex: Exercicio): Promise<void> {
    if (!modalEditorRotina) return;
    const treinoId = modalEditorRotina.id;
    adicionandoIdEditor = ex.id;
    try {
      const anterior = await getUltimoRegistro(ex.id);
      await adicionarTreinoExercicio(treinoId, ex.id, 3, anterior);
      await refrescarTreinoEditor(treinoId);
      mostrarPickerEditor = false;
      buscaPickerEditor = "";
    } finally {
      adicionandoIdEditor = null;
    }
  }

  async function ajustarSeriesEditor(novoNumero: number): Promise<void> {
    if (!editandoSerieEditor || !modalEditorRotina) return;
    const item = editandoSerieEditor;
    const treinoId = modalEditorRotina.id;
    salvandoEditor = true;
    try {
      await updateSeriesCountTreinoExercicio(item.treinoExercicioId, novoNumero);
      await refrescarTreinoEditor(treinoId);
    } finally {
      salvandoEditor = false;
      editandoSerieEditor = null;
    }
  }

  /** Abre o gráfico direto (sem passar por menu) quando se entra em
   * /treino/distribuicao/rotina/:id/grafico — usado pela opção "Distribuição" no menu de
   * Visualizar Rotina, e pelo rodapé do card da rotina. "Voltar" do navegador fecha o gráfico
   * e sai dessa rota. */
  const graficoUrlTreino = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/grafico$/);
    if (!m) return null;
    return treinos.find((t) => t.id === m[1]) ?? null;
  });

  $effect(() => {
    if (graficoUrlTreino) abrirGraficoTreino(graficoUrlTreino);
  });

  /** Mesmo padrão do gráfico: reabre o modal de exercícios por músculo ao voltar do detalhe do
   * exercício (ou de qualquer navegação), já que abrirExerciciosDaRotina navega pra essa rota. */
  const musculoUrlContexto = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/musculo\/([^/]+)$/);
    if (!m) return null;
    const treino = treinos.find((t) => t.id === m[1]);
    const musculo = musculos.find((mu) => mu.id === m[2]);
    if (!treino || !musculo) return null;
    return { treino, musculo };
  });

  $effect(() => {
    if (musculoUrlContexto) definirModalMusculo(musculoUrlContexto.treino, musculoUrlContexto.musculo);
  });

  /** Mesmo padrão: reabre o editor completo da rotina ao voltar do detalhe de um exercício. */
  const editorUrlTreino = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/editor$/);
    if (!m) return null;
    return treinos.find((t) => t.id === m[1]) ?? null;
  });

  $effect(() => {
    if (editorUrlTreino) definirModalEditor(editorUrlTreino);
  });

  /** Abre o anel da Distribuição Semanal direto — mesmo padrão do anel por rotina (bar clicável, sem menu). */
  function abrirGraficoSemanal(): void {
    abrirDetalheRotina(
      "Distribuição Semanal",
      distribuicaoSemanal,
      totaisSemanais.series,
      "séries",
      coresAbcAcumulado(distribuicaoSemanal),
    );
  }


  // ---------------- Modal: gráfico de pizza da distribuição de uma rotina ----------------

  interface ItemDetalheRotina {
    musculo: Musculo;
    valor: number;
  }

  let modalDetalheRotina = $state<{
    titulo: string;
    itens: ItemDetalheRotina[];
    centroValor?: number;
    centroLabel?: string;
    cores?: string[];
  } | null>(null);

  function abrirDetalheRotina(
    titulo: string,
    itens: { musculo: Musculo; valor: number }[],
    centroValor?: number,
    centroLabel?: string,
    cores?: string[],
  ): void {
    modalDetalheRotina = { titulo, itens, centroValor, centroLabel, cores };
  }

  /** Cor de cada fatia pela faixa ABC do percentual acumulado (itens já precisam vir
   * ordenados do mais dominante pro menos) — visual discreto pra saber onde cada músculo
   * se enquadra na curva 80/20, sem depender de abrir a lista de rotina pra ver. */
  function coresAbcAcumulado(itens: { valor: number }[]): string[] {
    const total = itens.reduce((acc, i) => acc + i.valor, 0);
    let acumulado = 0;
    return itens.map((i) => {
      const pct = total > 0 ? (i.valor / total) * 100 : 0;
      acumulado += pct;
      return corPorFaixa(acumulado);
    });
  }

  /** Gráfico de uma rotina específica: mesmos dados do card da rotina (distribuicaoPorTreino
   * — série equivalente, agrupamento por agrupamento_id, faixas A/B/C por posição), só que
   * em anel em vez de barras. Sem isso os dois ficavam mostrando números diferentes pro
   * mesmo músculo (um bruto sem agrupar, outro ponderado agrupado). */
  let modalGraficoTreino = $state<{
    titulo: string;
    totalSeries: number;
    porSerie: LinhaRotina[];
  } | null>(null);

  function abrirGraficoTreino(treino: TreinoComExercicios): void {
    const lista = distribuicaoPorTreino.find((d) => d.treino.id === treino.id)?.lista ?? [];
    const totalSeries = treino.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
    modalGraficoTreino = { titulo: treino.nome_treino, totalSeries, porSerie: lista };
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet barraFadiga(partes: Partes, valor: number, onClick: () => void)}
  <div
    class="barra-wrap-fadiga"
    role="button"
    tabindex="0"
    onclick={onClick}
    onkeydown={(e) => e.key === "Enter" && onClick()}
    aria-label="Ver anel de distribuição da rotina"
  >
    <div class="barra-segmentos">
      {#each partesParaSegmentos(partes) as seg (seg.cor)}
        {@const pctSeg = valor > 0 ? (seg.valor / valor) * 100 : 0}
        {#if seg.valor > 0}
          <div class="barra-seg" style={`width: ${pctSeg}%; background: ${seg.cor};`}></div>
        {/if}
      {/each}
    </div>
  </div>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Distribuição Muscular</h1>
    <span class="spacer"></span>
  </div>

  <div class="tabs">
    <button class:active={aba === "planejado"} onclick={() => (aba = "planejado")}>Planejado</button>
    <button class:active={aba === "realizado"} onclick={() => (aba = "realizado")}>Realizado</button>
  </div>

  {#if aba === "planejado"}
    {#if !treinos.length}
      <p class="muted">Nenhuma rotina cadastrada ainda.</p>
    {:else}
      <div class="lista-rotinas">
        <div class="rotina-card">
          <div class="rotina-cabecalho">
            <h2 class="rotina-nome">Distribuição Semanal</h2>
          </div>
          {#if !distribuicaoSemanal.length}
            <p class="muted">Nenhum volume planejado ainda.</p>
          {:else}
            <div class="lista">
              {#each linhasSemanal as linha (linha.chave)}
                {@const aberto = linha.subItens != null && gruposExpandidos.has(linha.chave)}
                <div class="item">
                  {#if linha.subItens}
                    <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(linha.chave)}>
                      <span class="chevron-grupo" class:aberto>›</span>
                      {linha.nome}
                    </button>
                  {:else}
                    <button class="nome-btn" onclick={() => linha.musculo && abrirExercicios(treinos, linha.musculo)}>{linha.nome}</button>
                  {/if}
                  {@render barraFadiga(linha.partes, linha.valor, () => abrirGraficoSemanal())}
                  <span class="valor">{formatValor(linha.valor)}</span>
                </div>
                {#if aberto && linha.subItens}
                  {#each linha.subItens as sub (sub.musculo.id)}
                    <div class="item item-sub">
                      <button class="nome-btn" onclick={() => abrirExercicios(treinos, sub.musculo)}>{sub.musculo.nome}</button>
                      {@render barraFadiga(sub.partes, sub.valor, () => abrirGraficoSemanal())}
                      <span class="valor">{formatValor(sub.valor)}</span>
                    </div>
                  {/each}
                {/if}
              {/each}
            </div>
            <button class="rotina-totais rotina-totais-btn" onclick={() => abrirGradeSemanal(null)}>
              {totaisSemanais.exercicios} {totaisSemanais.exercicios === 1 ? "exercício" : "exercícios"} · {totaisSemanais.series} séries
            </button>
          {/if}
        </div>

        {#each distribuicaoPorTreino as { treino, lista } (treino.id)}
          {@const porFadiga = treinosOrdenadosPorFadiga.has(treino.id)}
          {@const listaExibida = porFadiga ? ordenarPorMelhorEstimulo(lista) : lista}
          <div class="rotina-card">
            <div class="rotina-cabecalho">
              <h2 class="rotina-nome">
                <button
                  class="rotina-nome-btn"
                  class:ativo={porFadiga}
                  onclick={() => alternarOrdemFadiga(treino.id)}
                >{treino.nome_treino}</button>
              </h2>
              {#if treino.dia_semana != null}
                <span class="dia-tag">{DIAS_SEMANA_ABREV[treino.dia_semana]}</span>
              {/if}
            </div>
            {#if !lista.length}
              <p class="muted">Nenhuma série definida ainda.</p>
            {:else}
              <div class="lista">
                {#each listaExibida as linha (linha.chave)}
                  {@const grupoChave = `${treino.id}:${linha.chave}`}
                  {@const aberto = linha.subItens != null && gruposExpandidos.has(grupoChave)}
                  <div class="item">
                    {#if linha.subItens}
                      <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(grupoChave)}>
                        <span class="chevron-grupo" class:aberto>›</span>
                        {linha.nome}
                      </button>
                    {:else}
                      <button class="nome-btn" onclick={() => linha.musculo && abrirExerciciosDaRotina(treino, linha.musculo)}>{linha.nome}</button>
                    {/if}
                    {@render barraFadiga(linha.partes, linha.valor, () => abrirGraficoTreino(treino))}
                    <span class="valor">{formatValor(linha.valor)}</span>
                  </div>
                  {#if aberto && linha.subItens}
                    {#each linha.subItens as sub (sub.musculo.id)}
                      <div class="item item-sub">
                        <button class="nome-btn" onclick={() => abrirExerciciosDaRotina(treino, sub.musculo)}>{sub.musculo.nome}</button>
                        {@render barraFadiga(sub.partes, sub.valor, () => abrirGraficoTreino(treino))}
                        <span class="valor">{formatValor(sub.valor)}</span>
                      </div>
                    {/each}
                  {/if}
                {/each}
              </div>
            {/if}
            <button class="rotina-totais rotina-totais-btn" onclick={() => abrirEditorRotina(treino)}>
              {treino.exercicios.length} {treino.exercicios.length === 1 ? "exercício" : "exercícios"} · {treino.exercicios.reduce(
                (acc, ex) => acc + ex.series.length,
                0,
              )} séries
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="semana-nav">
      <button onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
      <span>{mesLabel}</span>
      <button onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
    </div>

    <div class="rotina-card">
      <div class="rotina-cabecalho">
        <h2 class="rotina-nome">Realizado <span class="dia-tag">(média semanal)</span></h2>
        <button class="icon-btn" onclick={() => abrirMenuRealizado()} aria-label="Mais opções">⋮</button>
      </div>
      {#if carregandoRealizado && !carregouRealizadoAlgumaVez}
        <p class="muted">Carregando…</p>
      {:else if !listaRealizado.length}
        <p class="muted">Nenhum treino registrado nesse mês.</p>
      {:else}
        <div class="lista" class:carregando={carregandoRealizado}>
          {#each linhasRealizado as linha (linha.chave)}
            {@const grupoChave = `realizado:${linha.chave}`}
            {@const aberto = linha.subItens != null && gruposExpandidos.has(grupoChave)}
            <div class="item">
              {#if linha.subItens}
                <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(grupoChave)}>
                  <span class="chevron-grupo" class:aberto>›</span>
                  {linha.nome}
                </button>
              {:else}
                <span class="nome">{linha.nome}</span>
              {/if}
              {#if linha.meta > 0}
                <div class="barra-wrap">
                  <div class="barra" style={`width: ${Math.min((linha.valor / linha.meta) * 100, 100)}%; background: var(--color-neutral);`}></div>
                </div>
                <span class="valor" style="color: var(--color-neutral);">{linha.valor} / {linha.meta}</span>
              {:else}
                <div class="barra-wrap">
                  <div class="barra" style={`width: ${Math.min(linha.valor * 8, 100)}%; background: ${corVolume(linha.valor)};`}></div>
                </div>
                <span class="valor" style={`color: ${corVolume(linha.valor)};`}>{linha.valor}</span>
              {/if}
            </div>
            {#if aberto && linha.subItens}
              {#each linha.subItens as sub (sub.musculo.id)}
                <div class="item item-sub">
                  <span class="nome">{sub.musculo.nome}</span>
                  {#if sub.meta > 0}
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${Math.min((sub.valor / sub.meta) * 100, 100)}%; background: var(--color-neutral);`}></div>
                    </div>
                    <span class="valor" style="color: var(--color-neutral);">{sub.valor} / {sub.meta}</span>
                  {:else}
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${Math.min(sub.valor * 8, 100)}%; background: ${corVolume(sub.valor)};`}></div>
                    </div>
                    <span class="valor" style={`color: ${corVolume(sub.valor)};`}>{sub.valor}</span>
                  {/if}
                </div>
              {/each}
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet iconGrafico()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
{/snippet}
{#snippet iconGrade()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
{/snippet}

{#snippet linkDistribuicao()}
  {#if modalAberto?.musculoParaGrade}
    <button
      class="link-distribuicao"
      onclick={() => abrirGradeSemanal([modalAberto!.musculoParaGrade!.id])}
      aria-label="Ver distribuição na semana"
    >{@render iconGrade()}</button>
  {/if}
{/snippet}

{#snippet voltarGradeSemanal()}
  <button class="grade-voltar" onclick={() => (mostrarGradeSemanal = false)} aria-label="Voltar">{@render iconVoltar()}</button>
{/snippet}

{#if modalAberto}
  <ActionSheet
    titulo={modalAberto.titulo}
    opcoes={modalAberto.opcoes}
    onFechar={() => (modalAberto = null)}
    acaoTitulo={modalAberto.musculoParaGrade ? linkDistribuicao : undefined}
  />
{/if}

{#if mostrarGradeSemanal}
  <Sheet
    titulo="Distribuição na Semana"
    onFechar={() => { mostrarGradeSemanal = false; modalAberto = null; }}
    acaoTitulo={modalAberto ? voltarGradeSemanal : undefined}
    acaoTituloLado="esquerda"
  >
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeSemanal.colunas as col (col.dia)}
              <th>
                <div class="grade-dia" class:com-treino={col.treinoNome != null}>{DIAS_SEMANA_ABREV[col.dia]}</div>
                <div class="grade-rotina-nome">{col.treinoNome ?? "💤"}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeSemanal.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                {@const treinoId = gradeSemanal.colunas[i].treinoId}
                <td class="grade-valor">
                  {#if valor > 0 && treinoId}
                    <button
                      class="grade-valor-caixa grade-valor-link"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                      onclick={() => { mostrarGradeSemanal = false; navigate(`/treino/rotina/${treinoId}`); }}
                    >{valor}</button>
                  {:else if valor > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                    >{valor}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
{/if}

{#if mostrarGradeRealizado}
  <Sheet titulo={`Realizado em ${mesLabel}`} onFechar={() => (mostrarGradeRealizado = false)}>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeRealizado.colunas as col (col.label)}
              <th>
                <div class="grade-dia">{col.label}</div>
                <div class="grade-rotina-nome">{col.subtitulo}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeRealizado.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                <td class="grade-valor">
                  {#if valor > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                    >{valor}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
{/if}

{#if modalDetalheRotina}
  <Sheet titulo={modalDetalheRotina.titulo} onFechar={() => (modalDetalheRotina = null)}>
    <div class="pizza-wrap">
      <PieChart
        dados={modalDetalheRotina.itens.map((i) => ({ nome: i.musculo.nome, valor: i.valor }))}
        cores={modalDetalheRotina.cores}
        centroValor={modalDetalheRotina.centroValor}
        centroLabel={modalDetalheRotina.centroLabel}
      />
    </div>
  </Sheet>
{/if}

{#if modalGraficoTreino}
  <Sheet
    titulo={modalGraficoTreino.titulo}
    onFechar={() => {
      modalGraficoTreino = null;
      if (graficoUrlTreino) window.history.back();
    }}
  >
    <div class="pizza-wrap">
      <PieChart
        dados={modalGraficoTreino.porSerie.map((i) => ({
          nome: i.nome,
          valor: i.valor,
          partes: partesParaSegmentos(i.partes),
        }))}
        centroValor={modalGraficoTreino.totalSeries}
        centroLabel="séries"
      />
    </div>
  </Sheet>
{/if}

{#if modalMusculoRotina}
  <Sheet
    titulo={modalMusculoRotina.musculo.nome}
    onFechar={() => {
      modalMusculoRotina = null;
      if (musculoUrlContexto) window.history.back();
    }}
  >
    {#if !modalMusculoRotina.itens.length}
      <p class="muted">Nenhum exercício encontrado.</p>
    {:else}
      <div class="lista-exercicios-musculo" class:carregando={salvandoSeries}>
        {#each modalMusculoRotina.itens as item (item.treinoExercicioId)}
          <div class="exercicio-musculo-item">
            <button class="remover-circulo" onclick={() => removerExercicioMusculo(item)} aria-label="Remover">−</button>
            <button class="exercicio-musculo-nome" onclick={() => navigate(`/treino/exercicios/${item.exercicioId}`)}>{item.exercicioNome}</button>
            <button class="exercicio-musculo-series" onclick={() => (editandoSerieItem = item)}>
              {item.series} {item.series === 1 ? "série" : "séries"}
            </button>
          </div>
        {/each}
      </div>
    {/if}
    <button class="adicionar-exercicio-musculo-btn" onclick={abrirPickerMusculo}>+ Adicionar Exercício</button>
  </Sheet>
{/if}

{#if mostrarPickerMusculo}
  <div class="tela-editor-rotina">
    <div class="editor-conteudo">
      <div class="header">
        <button
          class="back"
          onclick={() => {
            mostrarPickerMusculo = false;
            buscaPickerMusculo = "";
          }}
          aria-label="Voltar"
        >{@render iconVoltar()}</button>
        <h1>Adicionar Exercício</h1>
        <span class="spacer"></span>
      </div>
      <input class="busca-editor" type="text" placeholder="Procurar exercício" bind:value={buscaPickerMusculo} />
      <ul class="picker-lista-editor">
        {#each opcoesPickerMusculo as ex (ex.id)}
          <li>
            <button class="picker-item-editor" onclick={() => adicionarExercicioMusculo(ex)} disabled={adicionandoIdMusculo === ex.id}>
              {ex.nome}
            </button>
          </li>
        {/each}
        {#if !opcoesPickerMusculo.length}
          <li class="muted-item">Nenhum exercício encontrado.</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}

{#if editandoSerieItem}
  <WheelPicker
    titulo={editandoSerieItem.exercicioNome}
    subtitulo="Número de séries"
    opcoes={opcoesSeries}
    valorAtual={editandoSerieItem.series}
    onSelecionar={(v) => ajustarSeries(v)}
    onFechar={() => (editandoSerieItem = null)}
  />
{/if}

{#if modalEditorRotina}
  <div class="tela-editor-rotina">
    <div class="editor-conteudo">
      <div class="header">
        <button
          class="back"
          onclick={() => {
            modalEditorRotina = null;
            if (editorUrlTreino) window.history.back();
          }}
          aria-label="Voltar"
        >{@render iconVoltar()}</button>
        <h1>{modalEditorRotina.nome_treino}</h1>
        <span class="spacer"></span>
      </div>
      <div class="editor-lista" class:carregando={salvandoEditor}>
        {#each modalEditorRotina.exercicios.slice().sort((a, b) => a.ordem - b.ordem) as te, idx (te.id)}
          <div class="editor-item" class:arrastando={arrastandoIdxEditor === idx} bind:this={itemEditorRefs[idx]}>
            <button class="remover-circulo" onclick={() => removerExercicioEditor(te.id)} aria-label="Remover">−</button>
            <button class="editor-nome" onclick={() => navigate(`/treino/exercicios/${te.exercicio_id}`)}>{te.exercicio?.nome ?? ""}</button>
            <button
              class="exercicio-musculo-series"
              onclick={() =>
                (editandoSerieEditor = { treinoExercicioId: te.id, exercicioNome: te.exercicio?.nome ?? "", series: te.series.length })}
            >{te.series.length} {te.series.length === 1 ? "série" : "séries"}</button>
            <button class="handle-arraste" onpointerdown={(e) => iniciarArrasteEditor(e, idx)} aria-label="Arrastar para reordenar">☰</button>
          </div>
        {/each}
        {#if !modalEditorRotina.exercicios.length}
          <p class="muted">Nenhum exercício ainda.</p>
        {/if}
      </div>
      <button class="adicionar-exercicio-editor-btn" onclick={() => (mostrarPickerEditor = true)}>+ Adicionar Exercício</button>
    </div>
  </div>
{/if}

{#if mostrarPickerEditor}
  <div class="tela-editor-rotina">
    <div class="editor-conteudo">
      <div class="header">
        <button
          class="back"
          onclick={() => {
            mostrarPickerEditor = false;
            buscaPickerEditor = "";
          }}
          aria-label="Voltar"
        >{@render iconVoltar()}</button>
        <h1>Adicionar Exercício</h1>
        <span class="spacer"></span>
      </div>
      <input class="busca-editor" type="text" placeholder="Procurar exercício" bind:value={buscaPickerEditor} />
      <ul class="picker-lista-editor">
        {#each opcoesPickerEditor as ex (ex.id)}
          <li>
            <button class="picker-item-editor" onclick={() => adicionarExercicioEditor(ex)} disabled={adicionandoIdEditor === ex.id}>
              {ex.nome}
            </button>
          </li>
        {/each}
        {#if !opcoesPickerEditor.length}
          <li class="muted-item">Nenhum exercício encontrado.</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}

{#if editandoSerieEditor}
  <WheelPicker
    titulo={editandoSerieEditor.exercicioNome}
    subtitulo="Número de séries"
    opcoes={opcoesSeries}
    valorAtual={editandoSerieEditor.series}
    onSelecionar={(v) => ajustarSeriesEditor(v)}
    onFechar={() => (editandoSerieEditor = null)}
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
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
  }
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .back svg {
    width: 18px;
    height: 18px;
  }
  .spacer {
    width: 36px;
  }
  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .tabs button {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .lista-rotinas {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .rotina-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
  }
  .rotina-cabecalho {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .rotina-cabecalho .rotina-nome {
    flex: 1;
  }
  .rotina-nome {
    font-size: var(--font-size-base);
    margin: 0;
  }
  .rotina-nome-btn {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    cursor: pointer;
  }
  .rotina-nome-btn.ativo {
    color: var(--color-primary);
  }
  .dia-tag {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .icon-btn {
    margin-left: auto;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .semana-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .semana-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    transition: opacity 0.15s;
  }
  .lista.carregando {
    opacity: 0.5;
  }
  .item {
    display: grid;
    grid-template-columns: 100px 1fr 52px;
    align-items: center;
    gap: var(--space-3);
  }
  .item .nome {
    font-size: var(--font-size-sm);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nome-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nome-grupo {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--color-primary);
    font-weight: 700;
  }
  .chevron-grupo {
    display: inline-block;
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .chevron-grupo.aberto {
    transform: rotate(90deg);
  }
  .item-sub {
    padding-left: var(--space-3);
    opacity: 0.85;
  }
  .barra-wrap {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
  }
  .barra {
    position: relative;
    height: 100%;
    border-radius: 6px;
  }
  .barra-wrap-fadiga {
    height: 10px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-border);
  }
  .barra-segmentos {
    display: flex;
    height: 100%;
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-seg {
    height: 100%;
  }
  .item .valor {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .muted {
    color: var(--surface-muted);
  }
  .rotina-totais {
    margin: var(--space-3) 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--surface-border);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .rotina-totais-btn {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-top: 1px solid var(--surface-border);
    padding-top: var(--space-3);
    font-family: inherit;
    cursor: pointer;
  }
  .link-distribuicao {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: var(--color-primary);
    cursor: pointer;
  }
  .link-distribuicao svg {
    width: 20px;
    height: 20px;
  }
  .grade-voltar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }

  .grade-scroll {
    overflow-x: auto;
    padding-bottom: var(--space-3);
  }
  .grade-tabela {
    border-collapse: collapse;
    width: 100%;
  }
  .grade-tabela th,
  .grade-tabela td {
    padding: var(--space-1);
    text-align: center;
    white-space: nowrap;
  }
  .grade-tabela th:not(:first-child),
  .grade-tabela td:not(:first-child) {
    border-left: 1px solid var(--surface-border);
  }
  .grade-dia {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .grade-dia.com-treino {
    color: var(--color-primary);
  }
  .grade-rotina-nome {
    font-size: 11px;
    font-weight: 400;
    color: var(--surface-muted);
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-tabela .grade-col-musculo {
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    position: sticky;
    left: 0;
    background: var(--surface-card);
    padding-left: 0;
    max-width: 68px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-valor-caixa {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .grade-valor-link {
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .grade-tabela tbody tr:not(:last-child) td {
    border-bottom: 1px solid var(--surface-border);
  }
  .pizza-wrap {
    width: 100%;
    max-width: 320px;
    aspect-ratio: 1;
    overflow: hidden;
    margin: var(--space-2) auto 0;
  }
  .lista-exercicios-musculo {
    display: flex;
    flex-direction: column;
    transition: opacity 0.15s;
  }
  .lista-exercicios-musculo.carregando {
    opacity: 0.5;
    pointer-events: none;
  }
  .exercicio-musculo-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .exercicio-musculo-item:last-child {
    border-bottom: none;
  }
  .exercicio-musculo-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base);
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .exercicio-musculo-series {
    flex-shrink: 0;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-sm);
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .adicionar-exercicio-musculo-btn {
    width: 100%;
    margin-top: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .tela-editor-rotina {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 90;
    overflow-y: auto;
  }
  .editor-conteudo {
    max-width: 480px;
    min-height: 100%;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .editor-lista {
    display: flex;
    flex-direction: column;
    flex: 1;
    transition: opacity 0.15s;
  }
  .editor-lista.carregando {
    opacity: 0.5;
    pointer-events: none;
  }
  .editor-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    touch-action: none;
  }
  .editor-item.arrastando {
    background: var(--surface-card);
    opacity: 0.8;
  }
  .editor-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .remover-circulo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .handle-arraste {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    cursor: grab;
    touch-action: none;
    padding: var(--space-2);
  }
  .adicionar-exercicio-editor-btn {
    flex-shrink: 0;
    position: sticky;
    bottom: 0;
    margin-top: var(--space-4);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .busca-editor {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .picker-lista-editor {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .picker-item-editor {
    width: 100%;
    text-align: left;
    padding: var(--space-3) 0;
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .picker-item-editor:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .muted-item {
    color: var(--surface-muted);
    font-size: var(--font-size-base);
  }
</style>
