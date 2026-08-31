<script lang="ts">
  import { navigate, voltar, router } from "../../lib/router.svelte";
  import { toISODate, parseISODate } from "../../lib/dates";
  import ActionSheet, { type AcaoSheet } from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import PieChart from "../../components/PieChart.svelte";
  import { treinoLogSessao } from "../../lib/treinoLogSessao.svelte";
  import {
    listMusculos,
    listTreinos,
    getVolumeRealizadoBruto,
    DIAS_SEMANA_ABREV,
    abreviarMusculo,
    distribuicaoMusculosExercicio,
    type Musculo,
    type TreinoComExercicios,
  } from "../../lib/treinoApi";

  let aba = $state<"planejado" | "realizado">("planejado");
  let musculos = $state<Musculo[]>([]);
  let treinos = $state<TreinoComExercicios[]>([]);

  let mesBase = $state(new Date());
  let linhasRealizadoMes = $state<{ data: string; musculo_id: string; series_equivalentes: number }[]>([]);
  let carregandoRealizado = $state(false);
  let carregouRealizadoAlgumaVez = $state(false);
  let feitoPorMusculoSemana = $state<Map<string, number>>(new Map());

  /** Semana ancorada em segunda-feira (exceção proposital, igual à tela inicial de Treino — o resto do app usa terça, ver inicioSemana em dates.ts). Vai virar parametrizável. */
  function segundaISO(): string {
    const hoje = new Date();
    const delta = (hoje.getDay() + 6) % 7;
    return toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - delta));
  }

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
    const [musculosCarregados, treinosCarregados] = await Promise.all([listMusculos(), listTreinos()]);
    musculos = musculosCarregados;
    treinos = ordenarPorDia(treinosCarregados);
    const hojeIso = toISODate(new Date());
    const [, volumeSemana] = await Promise.all([carregarRealizado(), getVolumeRealizadoBruto(segundaISO(), hojeIso)]);
    const mapa = new Map<string, number>();
    for (const l of volumeSemana) {
      mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
    }
    feitoPorMusculoSemana = mapa;
  }

  void carregarBase();

  /** 1 série conta 1 para cada músculo trabalhado no exercício, sem ponderar por papel/peso (visão da sessão, não semanal). */
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

  /**
   * Série equivalente por músculo — o peso_contribuicao de cada exercício é normalizado
   * (dividido pela soma dos pesos daquele exercício) antes de multiplicar pela série, então
   * cada série sempre soma exatamente 1 no total, dividida entre os músculos que ela
   * trabalha. Ex: supino com peito 1 / tríceps 0.5 / deltoide 0.5 (soma 2) — 1 série vira
   * 0,5 série de peito + 0,25 de tríceps + 0,25 de deltoide. Assim a soma de todos os
   * músculos bate exatamente com o total de séries da rotina.
   */
  function contarSeriesEquivalentesPorMusculo(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries || !ex.exercicio) continue;
      // Mesma normalização por exercício usada na tela de Exercícios e no detalhe do
      // exercício (distribuicaoMusculosExercicio) — só multiplica o % pelas séries daqui.
      for (const m of distribuicaoMusculosExercicio(ex.exercicio)) {
        const parte = (m.pct / 100) * numSeries;
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + parte);
      }
    }
    return mapa;
  }

  /**
   * Cor por faixa do percentual ACUMULADO (regra 80/20 — corte em 20%/30%), com margem
   * de tolerância pra não trocar de cor por pouca diferença perto do corte. A lista já
   * vem ordenada do músculo mais dominante pro menos — o acumulado soma na ordem, então
   * mostra visualmente quantos músculos concentram a maior parte do volume da rotina.
   */
  const CORTE_A = 20;
  const CORTE_B = 30;
  const MARGEM_FAIXA = 5;
  const CORES_FAIXA = { a: "#60a5fa", b: "#fbbf24", c: "#f87171" };

  function corPorFaixa(acumulado: number): string {
    if (acumulado <= CORTE_A + MARGEM_FAIXA) return CORES_FAIXA.a;
    if (acumulado <= CORTE_B + MARGEM_FAIXA) return CORES_FAIXA.b;
    return CORES_FAIXA.c;
  }

  /**
   * Distribuição estática de cada rotina (sem acompanhamento ao vivo — isso fica só no
   * card semanal). A barra/percentual/cor usam a série equivalente (ver
   * contarSeriesEquivalentesPorMusculo, soma bate com o total de séries da rotina); o
   * número exibido ao lado é a contagem bruta (1 série válida por músculo que ela
   * trabalha), mais fácil de ler que um valor fracionado.
   */
  interface LinhaRotina {
    chave: string;
    nome: string;
    valor: number;
    contagem: number;
    pct: number;
    cor: string;
    musculo: Musculo | null;
    subItens: { musculo: Musculo; valor: number; contagem: number }[] | null;
  }

  const distribuicaoPorTreino = $derived.by(() => {
    return treinos.map((t) => {
      const totalSeries = t.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
      const mapaEquivalente = contarSeriesEquivalentesPorMusculo(t);
      const mapaBruto = contarSeriesPorMusculo(t);
      const bruto = musculos
        .map((m) => ({ musculo: m, valor: mapaEquivalente.get(m.id) ?? 0, contagem: mapaBruto.get(m.id) ?? 0 }))
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

      const base: Omit<LinhaRotina, "pct" | "cor">[] = [];
      for (const [id, grupo] of porGrupo) {
        base.push({
          chave: id,
          nome: grupo.nome,
          valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
          contagem: grupo.itens.reduce((acc, i) => acc + i.contagem, 0),
          musculo: null,
          subItens: grupo.itens,
        });
      }
      for (const item of avulsos) {
        base.push({
          chave: item.musculo.id,
          nome: item.musculo.nome,
          valor: item.valor,
          contagem: item.contagem,
          musculo: item.musculo,
          subItens: null,
        });
      }
      base.sort((a, b) => b.valor - a.valor);

      let acumulado = 0;
      const lista: LinhaRotina[] = base.map((item) => {
        const pct = totalSeries > 0 ? (item.valor / totalSeries) * 100 : 0;
        acumulado += pct;
        return { ...item, pct, cor: corPorFaixa(acumulado) };
      });
      return { treino: t, lista };
    });
  });

  /**
   * Séries já marcadas como concluídas na sessão ao vivo (treinoLogSessao), contadas por músculo.
   * ponderado=true usa o peso_contribuicao (pra somar junto com o card semanal, que é ponderado);
   * ponderado=false é a contagem bruta (pra comparar com o volume da própria rotina, também bruto).
   */
  function contarFeitoAoVivo(treino: TreinoComExercicios, ponderado: boolean): Map<string, number> {
    const musculosPorExercicio = new Map(treino.exercicios.map((ex) => [ex.exercicio_id, ex.exercicio?.musculos ?? []]));
    const mapa = new Map<string, number>();
    for (const exSessao of treinoLogSessao.atual?.sessao ?? []) {
      const concluidas = exSessao.sets.filter((s) => s.concluida).length;
      if (!concluidas) continue;
      for (const m of musculosPorExercicio.get(exSessao.exercicio_id) ?? []) {
        const incremento = ponderado ? concluidas * m.peso_contribuicao : concluidas;
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + incremento);
      }
    }
    return mapa;
  }

  /** Card semanal ao vivo: soma o que já está salvo (treino_registros dessa semana) com o que ainda está sendo feito agora na sessão ativa, se houver — só reinicia na virada da semana (segunda). */
  const feitoPorMusculoSemanaAoVivo = $derived.by(() => {
    const sessaoTreino = treinos.find((t) => t.id === treinoLogSessao.atual?.treinoId);
    if (!sessaoTreino) return feitoPorMusculoSemana;
    const mapa = new Map(feitoPorMusculoSemana);
    for (const [musculoId, valor] of contarFeitoAoVivo(sessaoTreino, true)) {
      mapa.set(musculoId, (mapa.get(musculoId) ?? 0) + valor);
    }
    return mapa;
  });

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
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round(mapa.get(m.id) ?? 0) }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  interface LinhaSemanal {
    chave: string;
    nome: string;
    valor: number;
    feito: number;
    /** Preenchido só quando a linha é um músculo avulso (sem agrupamento) — usado pra abrir os exercícios dele. */
    musculo: Musculo | null;
    /** null = músculo avulso; senão, os músculos que compõem o total do grupo. */
    subItens: { musculo: Musculo; valor: number; feito: number }[] | null;
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
        feito: grupo.itens.reduce((acc, i) => acc + (feitoPorMusculoSemanaAoVivo.get(i.musculo.id) ?? 0), 0),
        musculo: null,
        subItens: grupo.itens.map((i) => ({
          musculo: i.musculo,
          valor: i.valor,
          feito: feitoPorMusculoSemanaAoVivo.get(i.musculo.id) ?? 0,
        })),
      });
    }
    for (const item of avulsos) {
      linhas.push({
        chave: item.musculo.id,
        nome: item.musculo.nome,
        valor: item.valor,
        feito: feitoPorMusculoSemanaAoVivo.get(item.musculo.id) ?? 0,
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

  function abrirMenuCardRotina(treino: TreinoComExercicios): void {
    navigate(`/treino/distribuicao/rotina/${treino.id}`);
  }

  /** Deriva do path pra que "voltar" do navegador feche o menu, ou reabra ao voltar de "Editar Rotina". */
  const rotinaMenuUrl = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)$/);
    if (!m) return null;
    return treinos.find((t) => t.id === m[1]) ?? null;
  });

  const rotinaMenuOpcoes = $derived.by((): AcaoSheet[] => {
    if (!rotinaMenuUrl) return [];
    return [
      { label: "Editar Rotina", icon: iconEditar, onSelect: () => navigate(`/treino/rotina/${rotinaMenuUrl!.id}`) },
      { label: "Visualizar Gráfico", icon: iconGrafico, onSelect: () => abrirGraficoTreino(rotinaMenuUrl!) },
    ];
  });

  function abrirMenuSemanal(): void {
    modalAberto = {
      titulo: "Distribuição Semanal",
      opcoes: [
        { label: "Semana", icon: iconGrade, onSelect: () => abrirGradeSemanal(null) },
        {
          label: "Gráfico",
          icon: iconGrafico,
          onSelect: () =>
            abrirDetalheRotina(
              "Distribuição Semanal",
              distribuicaoSemanal,
              totaisSemanais.series,
              "séries",
              coresAbcAcumulado(distribuicaoSemanal),
            ),
        },
      ],
    };
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

  /** Gráfico de uma rotina específica: anel com o total literal de séries da rotina no
   * centro por padrão (sem nada selecionado). Ao selecionar uma fatia, o centro passa a
   * mostrar a contagem bruta daquele músculo (1 série conta pra cada músculo envolvido).
   * O trabalho ponderado por peso_contribuicao já aparece na Distribuição Semanal — aqui
   * é só pra ver rápido onde está o foco da rotina. */
  let modalGraficoTreino = $state<{
    titulo: string;
    totalSeries: number;
    porSerie: ItemDetalheRotina[];
    cores: string[];
  } | null>(null);

  function abrirGraficoTreino(treino: TreinoComExercicios): void {
    const mapaBruto = contarSeriesPorMusculo(treino);
    const porSerie = musculos
      .map((m) => ({ musculo: m, valor: mapaBruto.get(m.id) ?? 0 }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    const totalSeries = treino.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
    modalGraficoTreino = { titulo: treino.nome_treino, totalSeries, porSerie, cores: coresAbcAcumulado(porSerie) };
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
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
                {@const corSemanal = treinoLogSessao.atual != null ? "var(--color-success)" : corVolume(linha.valor)}
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
                  <div class="barra-wrap">
                    <div class="barra" style={`width: ${Math.min((linha.feito / linha.valor) * 100, 100)}%; background: ${corSemanal};`}></div>
                  </div>
                  <button
                    class="valor-btn"
                    style={`color: ${corSemanal};`}
                    onclick={() =>
                      abrirGradeSemanal(linha.subItens ? linha.subItens.map((s) => s.musculo.id) : [linha.chave])}
                  >{linha.feito.toFixed(0)} / {linha.valor}</button>
                </div>
                {#if aberto && linha.subItens}
                  {#each linha.subItens as sub (sub.musculo.id)}
                    {@const corSub = treinoLogSessao.atual != null ? "var(--color-success)" : corVolume(sub.valor)}
                    <div class="item item-sub">
                      <button class="nome-btn" onclick={() => abrirExercicios(treinos, sub.musculo)}>{sub.musculo.nome}</button>
                      <div class="barra-wrap">
                        <div class="barra" style={`width: ${Math.min((sub.feito / sub.valor) * 100, 100)}%; background: ${corSub};`}></div>
                      </div>
                      <button class="valor-btn" style={`color: ${corSub};`} onclick={() => abrirGradeSemanal([sub.musculo.id])}>{sub.feito.toFixed(0)} / {sub.valor}</button>
                    </div>
                  {/each}
                {/if}
              {/each}
            </div>
            <button class="rotina-totais rotina-totais-btn" onclick={() => abrirMenuSemanal()}>
              {totaisSemanais.exercicios} {totaisSemanais.exercicios === 1 ? "exercício" : "exercícios"} · {totaisSemanais.series} séries
            </button>
          {/if}
        </div>

        {#each distribuicaoPorTreino as { treino, lista } (treino.id)}
          <div class="rotina-card">
            <div class="rotina-cabecalho">
              <h2 class="rotina-nome">{treino.nome_treino}</h2>
              {#if treino.dia_semana != null}
                <span class="dia-tag">{DIAS_SEMANA_ABREV[treino.dia_semana]}</span>
              {/if}
            </div>
            {#if !lista.length}
              <p class="muted">Nenhuma série definida ainda.</p>
            {:else}
              <div class="lista">
                {#each lista as linha (linha.chave)}
                  {@const grupoChave = `${treino.id}:${linha.chave}`}
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
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${linha.pct}%; background: ${linha.cor};`}>
                        <span class="barra-pct">{linha.pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <span class="valor">{linha.contagem}</span>
                  </div>
                  {#if aberto && linha.subItens}
                    {#each linha.subItens as sub (sub.musculo.id)}
                      <div class="item item-sub">
                        <span class="nome">{sub.musculo.nome}</span>
                        <div class="barra-wrap">
                          <div
                            class="barra"
                            style={`width: ${linha.valor > 0 ? (sub.valor / linha.valor) * 100 : 0}%; background: ${linha.cor};`}
                          ></div>
                        </div>
                        <span class="valor">{sub.contagem}</span>
                      </div>
                    {/each}
                  {/if}
                {/each}
              </div>
            {/if}
            <button class="rotina-totais rotina-totais-btn" onclick={() => abrirMenuCardRotina(treino)}>
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

{#snippet iconEditar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
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

{#if rotinaMenuUrl}
  <ActionSheet titulo={rotinaMenuUrl.nome_treino} opcoes={rotinaMenuOpcoes} onFechar={() => window.history.back()} />
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
  <Sheet titulo={modalGraficoTreino.titulo} onFechar={() => (modalGraficoTreino = null)}>
    <div class="pizza-wrap">
      <PieChart
        dados={modalGraficoTreino.porSerie.map((i) => ({ nome: i.musculo.nome, valor: i.valor }))}
        cores={modalGraficoTreino.cores}
        centroValor={modalGraficoTreino.totalSeries}
        centroLabel="séries"
      />
    </div>
  </Sheet>
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
  .nome-btn,
  .valor-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .nome-btn {
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .valor-btn {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
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
  .barra-pct {
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: var(--space-1);
    font-size: 10px;
    font-weight: 600;
    color: var(--surface-muted);
    white-space: nowrap;
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
</style>
