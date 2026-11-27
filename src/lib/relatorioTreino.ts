import type { ClasseVolumeSemanal, MarcadorExercicio } from "./treinoApi";
import { chaveSemana, parseISODate, somarDias } from "./dates";
import { calcularProgressaoMusculo, type StatusProgressao } from "./progressaoMusculo";
import { classificarTendencia, pontosParaTendencia, variacaoExercicio, type TendenciaStatus } from "./tendenciaExercicio";

/** Monta o modelo do relatório de decisão do Treino (aba Realizado → PDF): tudo que decide "mudo o
 * foco? aumento ou diminuo séries? ajusto exercícios?" num período escolhido. Só cálculo — a tela
 * levanta os dados e relatorioPdf.ts desenha. Sem esforço percebido (RIR/RPE) nem sono: o app não
 * tem, e o relatório avisa que "estagnado" pode ser falta de intensidade. */

export interface EntradaRelatorio {
  inicio: string;
  fim: string;
  geradoEm: string;
  musculos: { id: string; nome: string; grupo: string | null }[];
  /** Volume realizado ponderado (séries equivalentes) por dia e músculo, já no período. */
  volume: { data: string; musculoId: string; series: number }[];
  /** Planejado semanal (ponderado) por músculo. */
  metaSemanal: Map<string, number>;
  /** Distribuição semanal planejada (todas as rotinas somadas), nas três leituras da tela de Distribuição:
   * total (bruto), ponderado e acumulado (ponderado descontado pela posição na rotina). */
  planejadoSemanal: { id: string; total: number; ponderado: number; acumulado: number }[];
  /** Grade da Distribuição Semanal: uma coluna por dia (seg a dom) com a rotina do dia e as séries
   * ponderadas planejadas por músculo naquele dia. */
  gradeSemanal: { dias: { rotulo: string; rotina: string | null }[]; porMusculo: Map<string, number[]> };
  classificar: (musculoId: string, seriesSemana: number) => ClasseVolumeSemanal;
  exercicios: {
    id: string;
    nome: string;
    musculoPrincipalId: string | null;
    contribuicoes: { musculoId: string; peso: number }[];
    /** Séries planejadas (somadas nas rotinas) — base do ponderamento no músculo. */
    series: number;
    pontos: { data: string; melhor1rm: number }[];
    marcadores: MarcadorExercicio[];
  }[];
  /** % do volume planejado de cada músculo que cai no bloco C (fim do treino); null se a fadiga está desligada. */
  fimDoTreino: Map<string, number> | null;
  sessoes: { realizadas: number; planejadasPorSemana: number };
  /** Calorias do período, só informativo (null = sem dados da dieta). */
  calorias: { mediaKcal: number | null; diasRegistrados: number; diasPeriodo: number; metaMediaKcal: number | null } | null;
  peso: {
    pontos: { data: string; peso: number }[];
    mediaMovel: { data: string; peso: number }[];
    meta: Map<string, number | null>;
  };
}

export type CurvaABC = "A" | "B" | "C";

/** Curva ABC relativa à média: o volume de cada músculo contra a média dos músculos treinados (volume
 * total ÷ nº de músculos com volume). A = 125% da média ou mais (prioridade), B = de 60% a 125%,
 * C = abaixo de 60% (secundário). Funciona mesmo quando o volume é parecido entre vários músculos,
 * onde uma regra de Pareto (acumulado) deixaria quase todos em A. */
export const CORTE_CURVA_A = 1.25;
export const CORTE_CURVA_B = 0.6;

export function curvaPorRazaoDaMedia(razao: number): CurvaABC {
  if (razao >= CORTE_CURVA_A) return "A";
  if (razao >= CORTE_CURVA_B) return "B";
  return "C";
}

export interface LinhaMusculoRelatorio {
  id: string;
  nome: string;
  grupo: string | null;
  mediaSemanal: number;
  planejado: number;
  /** Distribuição semanal planejada do músculo (todas as rotinas): total bruto, ponderado e acumulado. */
  planTotal: number;
  planPond: number;
  planAcum: number;
  /** Realizado contra o planejado ponderado, em % (null sem planejado). */
  deltaPct: number | null;
  /** % do volume total semanal realizado (todos os músculos). */
  pctTotal: number;
  /** Curva ABC do volume realizado (null sem volume). */
  curva: CurvaABC | null;
  /** Curva ABC do volume planejado (prioridade pretendida). */
  curvaPlanejada: CurvaABC | null;
  classe: ClasseVolumeSemanal;
  frequenciaSemanal: number;
  porSemana: number[];
  progressao: StatusProgressao | null;
  variacaoPct: number | null;
  fimDoTreinoPct: number | null;
  acao: string;
  prioridade: number;
}

export interface LinhaGradeRelatorio {
  nome: string;
  grupo: string | null;
  porDia: number[];
  total: number;
  classe: ClasseVolumeSemanal;
}

export interface LinhaExercicioRelatorio {
  nome: string;
  musculo: string;
  sessoes: number;
  /** Sessões que contam na leitura (depois de reinícios/pausas). */
  sessoesValidas: number;
  rmInicio: number | null;
  rmFim: number | null;
  variacaoPct: number | null;
  status: TendenciaStatus | null;
  ultima: string | null;
}

export interface ModeloRelatorio {
  inicio: string;
  fim: string;
  geradoEm: string;
  semanas: { chave: string; rotulo: string }[];
  semanasComTreino: number;
  sessoes: { realizadas: number; planejadas: number };
  calorias: EntradaRelatorio["calorias"];
  peso: {
    inicio: number | null;
    fim: number | null;
    variacaoKg: number | null;
    kgPorSemana: number | null;
    metaFim: number | null;
    pontos: { data: string; peso: number }[];
    mediaMovel: { data: string; peso: number }[];
    meta: { data: string; valor: number }[];
  };
  musculos: LinhaMusculoRelatorio[];
  /** Distribuição Semanal (grade da aba Planejado): séries ponderadas planejadas por dia e músculo. */
  grade: { dias: { rotulo: string; rotina: string | null }[]; linhas: LinhaGradeRelatorio[] };
  decisoes: string[];
  exercicios: LinhaExercicioRelatorio[];
  alertas: string[];
  grupos: { nome: string; mediaSemanal: number; pctTotal: number; planejado: number }[];
  marcadores: { data: string; exercicio: string; tipo: string; observacao: string }[];
}

export const NOME_CLASSE: Record<ClasseVolumeSemanal, string> = {
  insuficiente: "Abaixo",
  manutencao: "Manutenção",
  moderado: "Moderado",
  foco: "Foco",
  excessivo: "Acima",
};

export const NOME_PROGRESSAO: Record<StatusProgressao, string> = {
  subindo: "Progredindo",
  estavel: "Estagnado",
  caindo: "Regredindo",
  analise: "Em análise",
};

/** Cruza volume x tendência (mesma lógica dos avisos da tela de distribuição) numa ação e numa
 * prioridade (maior = olhar primeiro). */
export function acaoSugerida(classe: ClasseVolumeSemanal, status: StatusProgressao | null): { texto: string; prioridade: number } {
  if (status == null || status === "analise") return { texto: "Dados insuficientes: manter e reavaliar", prioridade: 1 };
  if (classe === "insuficiente") {
    return status === "subindo"
      ? { texto: "Abaixo da manutenção, mas respondendo: subir um pouco as séries", prioridade: 3 }
      : { texto: "Aumentar séries (abaixo da manutenção)", prioridade: 5 };
  }
  if (classe === "manutencao") {
    if (status === "subindo") return { texto: "Manter", prioridade: 0 };
    if (status === "estavel") return { texto: "Testar mais séries", prioridade: 4 };
    return { texto: "Regredindo no volume de manutenção: revisar exercícios e recuperação", prioridade: 4 };
  }
  if (classe === "excessivo") {
    if (status === "subindo") return { texto: "Manter, mas monitorar (acima do foco)", prioridade: 1 };
    return { texto: "Reduzir séries (acima do foco, sem resposta)", prioridade: 5 };
  }
  // moderado / foco
  if (status === "subindo") return { texto: "Manter", prioridade: 0 };
  if (status === "estavel") return { texto: "Sem resposta nesse volume: variar exercício/ordem ou reduzir", prioridade: 4 };
  return { texto: "Considerar reduzir séries e checar recuperação", prioridade: 5 };
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function rotuloSemana(chave: string): string {
  const d = parseISODate(chave);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function montarRelatorio(e: EntradaRelatorio): ModeloRelatorio {
  // ---- semanas do período (início = terça, mesma convenção do app) ----
  const semanasChaves: string[] = [];
  for (let d = e.inicio; d <= e.fim; d = somarDias(d, 1)) {
    const k = chaveSemana(parseISODate(d));
    if (!semanasChaves.includes(k)) semanasChaves.push(k);
  }

  const volumePorMusculoSemana = new Map<string, Map<string, number>>();
  const diasPorMusculoSemana = new Map<string, Map<string, Set<string>>>();
  const semanasComVolume = new Set<string>();
  for (const l of e.volume) {
    if (l.data < e.inicio || l.data > e.fim) continue;
    const sem = chaveSemana(parseISODate(l.data));
    semanasComVolume.add(sem);
    const m = volumePorMusculoSemana.get(l.musculoId) ?? new Map<string, number>();
    m.set(sem, (m.get(sem) ?? 0) + Number(l.series));
    volumePorMusculoSemana.set(l.musculoId, m);
    const dm = diasPorMusculoSemana.get(l.musculoId) ?? new Map<string, Set<string>>();
    const ds = dm.get(sem) ?? new Set<string>();
    ds.add(l.data);
    dm.set(sem, ds);
    diasPorMusculoSemana.set(l.musculoId, dm);
  }
  const semanasComTreino = semanasComVolume.size;
  // Colunas: do primeiro ao último ffim de semana com treino (semanas parciais vazias nas pontas do
  // período não viram uma coluna "zerada" enganosa; semanas puladas no meio continuam aparecendo).
  const comVolume = semanasChaves.map((k) => semanasComVolume.has(k));
  const primeira = comVolume.indexOf(true);
  const ultima = comVolume.lastIndexOf(true);
  const chavesColunas = primeira >= 0 ? semanasChaves.slice(primeira, ultima + 1) : semanasChaves;
  const semanas = chavesColunas.map((chave) => ({ chave, rotulo: rotuloSemana(chave) }));
  const divisor = Math.max(semanasComTreino, 1);

  const nomeMusculo = new Map(e.musculos.map((m) => [m.id, m.nome]));

  // ---- por exercício: pontos do período, já com marcadores/pausa (sem a janela de hoje) ----
  const pontosDoPeriodo = (pts: { data: string; melhor1rm: number }[]) => pts.filter((p) => p.data >= e.inicio && p.data <= e.fim);
  const validosPorExercicio = new Map(
    e.exercicios.map((x) => [x.id, pontosParaTendencia(pontosDoPeriodo(x.pontos), x.marcadores, { semJanela: true })]),
  );

  const planPorMusculo = new Map(e.planejadoSemanal.map((l) => [l.id, l]));

  // ---- por músculo ----
  const linhas: LinhaMusculoRelatorio[] = [];
  for (const m of e.musculos) {
    const porSem = volumePorMusculoSemana.get(m.id);
    const total = porSem ? Array.from(porSem.values()).reduce((a, v) => a + v, 0) : 0;
    const planejado = e.metaSemanal.get(m.id) ?? 0;
    const plan = planPorMusculo.get(m.id);
    if (total <= 0 && planejado <= 0) continue;
    const media = total / divisor;
    const mediaArred = Math.round(media * 2) / 2;
    const classe = e.classificar(m.id, mediaArred);

    const dm = diasPorMusculoSemana.get(m.id);
    const freq = dm ? Array.from(dm.values()).reduce((a, s) => a + s.size, 0) / divisor : 0;

    const itens = e.exercicios
      .map((x) => ({ x, c: x.contribuicoes.find((c) => c.musculoId === m.id) }))
      .filter((p) => p.c)
      .map(({ x, c }) => ({ nome: x.nome, peso: x.series * (c?.peso ?? 0), pontos: validosPorExercicio.get(x.id) ?? [] }));
    const prog = itens.length ? calcularProgressaoMusculo(itens) : null;
    const status = prog?.status ?? null;
    const { texto, prioridade } = acaoSugerida(classe, status);

    linhas.push({
      id: m.id,
      nome: m.nome,
      grupo: m.grupo,
      mediaSemanal: r1(media),
      planejado: r1(planejado),
      planTotal: r1(plan?.total ?? 0),
      planPond: r1(plan?.ponderado ?? 0),
      planAcum: r1(plan?.acumulado ?? 0),
      deltaPct: (plan?.ponderado ?? 0) > 0 ? Math.round(((media - (plan?.ponderado ?? 0)) / (plan?.ponderado ?? 1)) * 100) : null,
      pctTotal: 0,
      curva: null,
      curvaPlanejada: null,
      classe,
      frequenciaSemanal: r1(freq),
      porSemana: chavesColunas.map((k) => r1(porSem?.get(k) ?? 0)),
      progressao: status,
      variacaoPct: prog?.variacao != null ? Math.round(prog.variacao * 1000) / 10 : null,
      fimDoTreinoPct: e.fimDoTreino?.get(m.id) != null ? Math.round((e.fimDoTreino.get(m.id) ?? 0) * 100) : null,
      acao: texto,
      prioridade,
    });
  }
  linhas.sort((a, b) => b.mediaSemanal - a.mediaSemanal);

  // ---- curva ABC relativa à média (volume realizado) e a mesma conta sobre o planejado ----
  const musculosComVolume = linhas.filter((l) => l.mediaSemanal > 0);
  const totalReal = musculosComVolume.reduce((a, l) => a + l.mediaSemanal, 0);
  const mediaReal = musculosComVolume.length ? totalReal / musculosComVolume.length : 0;
  for (const l of musculosComVolume) {
    l.curva = curvaPorRazaoDaMedia(l.mediaSemanal / mediaReal);
    l.pctTotal = Math.round((l.mediaSemanal / totalReal) * 100);
  }
  const comPlano = linhas.filter((l) => l.planejado > 0);
  const mediaPlano = comPlano.length ? comPlano.reduce((a, l) => a + l.planejado, 0) / comPlano.length : 0;
  for (const l of comPlano) l.curvaPlanejada = curvaPorRazaoDaMedia(l.planejado / mediaPlano);

  // ---- grade da distribuição semanal (planejado, por dia) ----
  const grupoPorMusculo = new Map(e.musculos.map((m) => [m.id, m.grupo]));
  const linhasGrade: LinhaGradeRelatorio[] = [];
  for (const [id, porDia] of e.gradeSemanal.porMusculo) {
    const total = porDia.reduce((a, v) => a + v, 0);
    if (total <= 0) continue;
    linhasGrade.push({
      nome: nomeMusculo.get(id) ?? "",
      grupo: grupoPorMusculo.get(id) ?? null,
      porDia: porDia.map(r1),
      total: r1(total),
      classe: e.classificar(id, Math.round(total * 2) / 2),
    });
  }
  linhasGrade.sort((a, b) => b.total - a.total);

  // ---- decisões (as mais urgentes) ----
  const decisoes = [...linhas]
    .filter((l) => l.prioridade >= 3)
    .sort((a, b) => b.prioridade - a.prioridade || b.mediaSemanal - a.mediaSemanal)
    .slice(0, 5)
    .map((l) => `${l.nome}: ${l.acao}`);

  // ---- exercícios ----
  const exercicios: LinhaExercicioRelatorio[] = e.exercicios
    .map((x) => {
      const doPeriodo = pontosDoPeriodo(x.pontos);
      const validos = validosPorExercicio.get(x.id) ?? [];
      const v = variacaoExercicio(validos);
      return {
        nome: x.nome,
        musculo: x.musculoPrincipalId ? (nomeMusculo.get(x.musculoPrincipalId) ?? "") : "",
        sessoes: doPeriodo.length,
        sessoesValidas: validos.length,
        rmInicio: doPeriodo.length ? r1(doPeriodo[0].melhor1rm) : null,
        rmFim: doPeriodo.length ? r1(doPeriodo[doPeriodo.length - 1].melhor1rm) : null,
        variacaoPct: v != null ? Math.round(v * 1000) / 10 : null,
        status: classificarTendencia(validos),
        ultima: doPeriodo.length ? doPeriodo[doPeriodo.length - 1].data : null,
      };
    })
    .sort((a, b) => a.musculo.localeCompare(b.musculo) || a.nome.localeCompare(b.nome));

  // ---- alertas ----
  const alertas: string[] = [];
  for (const l of linhas) {
    if (l.progressao === "caindo") alertas.push(`${l.nome} está regredindo (${l.variacaoPct != null ? String(l.variacaoPct).replace(".", ",") + "%" : "tendência negativa"}).`);
  }
  for (const l of linhas) {
    if (l.planejado > 0 && l.mediaSemanal < l.planejado * 0.75) {
      alertas.push(`${l.nome}: realizado ${l.mediaSemanal} séries/semana contra ${l.planejado} planejadas.`);
    }
  }
  for (const l of linhas) {
    if (l.curva && l.curvaPlanejada && l.curva !== l.curvaPlanejada) {
      alertas.push(`${l.nome}: curva ${l.curva} no realizado e ${l.curvaPlanejada} no planejado (a prioridade na prática desviou do plano).`);
    }
  }
  for (const x of exercicios) {
    if (x.sessoes === 0) alertas.push(`${x.nome}: sem registro no período.`);
    else if (x.status === "estavel" && x.sessoesValidas >= 6) alertas.push(`${x.nome}: estagnado em ${x.sessoesValidas} sessões (candidato a ajuste ou troca).`);
    else if (x.status === "caindo") alertas.push(`${x.nome}: 1RM em queda no período (${String(x.variacaoPct).replace(".", ",")}%).`);
  }
  const emAnalise = exercicios.filter((x) => x.status === "analise" || (x.sessoes > 0 && x.sessoes < 4)).length;
  if (emAnalise) alertas.push(`${emAnalise} exercício(s) com poucas sessões no período: a leitura de progresso ainda é preliminar.`);

  // ---- grupos ----
  const porGrupo = new Map<string, { media: number; plan: number }>();
  for (const l of linhas) {
    const g = l.grupo ?? "Sem grupo";
    const atual = porGrupo.get(g) ?? { media: 0, plan: 0 };
    atual.media += l.mediaSemanal;
    atual.plan += l.planejado;
    porGrupo.set(g, atual);
  }
  const totalMedia = Array.from(porGrupo.values()).reduce((a, g) => a + g.media, 0) || 1;
  const grupos = Array.from(porGrupo.entries())
    .map(([nome, g]) => ({ nome, mediaSemanal: r1(g.media), pctTotal: Math.round((g.media / totalMedia) * 100), planejado: r1(g.plan) }))
    .sort((a, b) => b.mediaSemanal - a.mediaSemanal);

  // ---- marcadores do período ----
  const marcadores = e.exercicios
    .flatMap((x) =>
      x.marcadores
        .filter((m) => m.data >= e.inicio && m.data <= e.fim)
        .map((m) => ({ data: m.data, exercicio: x.nome, tipo: m.tipo, observacao: m.observacao })),
    )
    .sort((a, b) => a.data.localeCompare(b.data));

  // ---- peso ----
  const pesos = e.peso.pontos.filter((p) => p.data >= e.inicio && p.data <= e.fim).sort((a, b) => a.data.localeCompare(b.data));
  const mm = e.peso.mediaMovel.filter((p) => p.data >= e.inicio && p.data <= e.fim).sort((a, b) => a.data.localeCompare(b.data));
  const metaPts = Array.from(e.peso.meta.entries())
    .filter(([d, v]) => v != null && d >= e.inicio && d <= e.fim)
    .map(([data, valor]) => ({ data, valor: valor as number }))
    .sort((a, b) => a.data.localeCompare(b.data));
  const pInicio = mm.length ? mm[0].peso : null;
  const pFim = mm.length ? mm[mm.length - 1].peso : null;
  let kgPorSemana: number | null = null;
  if (mm.length >= 2) {
    const dias = (parseISODate(mm[mm.length - 1].data).getTime() - parseISODate(mm[0].data).getTime()) / 86_400_000;
    if (dias >= 7) kgPorSemana = ((mm[mm.length - 1].peso - mm[0].peso) / dias) * 7;
  }

  return {
    inicio: e.inicio,
    fim: e.fim,
    geradoEm: e.geradoEm,
    semanas,
    semanasComTreino,
    sessoes: { realizadas: e.sessoes.realizadas, planejadas: Math.round(e.sessoes.planejadasPorSemana * semanas.length) },
    calorias: e.calorias,
    peso: {
      inicio: pInicio != null ? r1(pInicio) : null,
      fim: pFim != null ? r1(pFim) : null,
      variacaoKg: pInicio != null && pFim != null ? Math.round((pFim - pInicio) * 100) / 100 : null,
      kgPorSemana: kgPorSemana != null ? Math.round(kgPorSemana * 100) / 100 : null,
      metaFim: metaPts.length ? r1(metaPts[metaPts.length - 1].valor) : null,
      pontos: pesos,
      mediaMovel: mm,
      meta: metaPts,
    },
    musculos: linhas,
    grade: { dias: e.gradeSemanal.dias, linhas: linhasGrade },
    decisoes,
    exercicios,
    alertas,
    grupos,
    marcadores,
  };
}
