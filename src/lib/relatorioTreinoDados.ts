import {
  getVolumeRealizadoBruto,
  getRegistrosPorTreinoDesde,
  getHistoricoExercicio,
  listMarcadoresExercicio,
  classificarVolumeSemanal,
  type Musculo,
  type TreinoComExercicios,
  type ParametrosDistribuicao,
  type MarcadorExercicio,
} from "./treinoApi";
import { getPesosDoPeriodo, listMetaHistorico, calcularMediaMovelSerie, calcularLinhaMetaPorDia } from "./pesoApi";
import { partesFadigaSemanal } from "./fadiga";
import { getResumoCaloriasPeriodo } from "./dietaApi";
import { hojeISO } from "./dates";
import { montarRelatorio, type ModeloRelatorio } from "./relatorioTreino";

/** Levanta os dados de um período (volume realizado, sessões, peso e meta) e junta com o que a tela
 * de Distribuição já tem carregado (rotinas, músculos, metas planejadas, histórico/marcadores dos
 * exercícios) pra montar o modelo do relatório. Histórico/marcadores que faltarem são buscados. */
export async function levantarRelatorio(args: {
  inicio: string;
  fim: string;
  musculos: Musculo[];
  treinos: TreinoComExercicios[];
  metaSemanal: Map<string, number>;
  parametros: ParametrosDistribuicao;
  parametrosParaMusculo: (m: Musculo | null | undefined) => ParametrosDistribuicao;
  historico: Map<string, { data: string; melhor1rm: number }[]>;
  marcadores: Map<string, MarcadorExercicio[]>;
}): Promise<ModeloRelatorio> {
  const { inicio, fim, musculos, treinos, metaSemanal, parametros } = args;
  const musculoPorId = new Map(musculos.map((m) => [m.id, m]));

  // exercícios das rotinas (somando as séries planejadas quando aparecem em mais de uma)
  const agregados = new Map<string, { id: string; nome: string; series: number; contribuicoes: { musculoId: string; peso: number }[] }>();
  for (const t of treinos) {
    for (const te of t.exercicios) {
      const atual = agregados.get(te.exercicio_id);
      if (atual) {
        atual.series += te.series.length;
        continue;
      }
      agregados.set(te.exercicio_id, {
        id: te.exercicio_id,
        nome: te.exercicio?.nome ?? "",
        series: te.series.length,
        contribuicoes: (te.exercicio?.musculos ?? []).map((m) => ({ musculoId: m.musculo_id, peso: Number(m.peso_contribuicao) })),
      });
    }
  }

  const [volume, registros, pesosTodos, metaHistorico, calorias, ...historicos] = await Promise.all([
    getVolumeRealizadoBruto(inicio, fim),
    getRegistrosPorTreinoDesde(inicio),
    getPesosDoPeriodo("1900-01-01", fim > hojeISO() ? fim : hojeISO()),
    listMetaHistorico(),
    // Informativo: se a dieta falhar, o relatório sai sem as calorias.
    getResumoCaloriasPeriodo(inicio, fim).catch(() => null),
    ...Array.from(agregados.keys()).map(async (id) => {
      const pontos = args.historico.get(id) ?? (await getHistoricoExercicio(id));
      const marcs = args.marcadores.get(id) ?? (await listMarcadoresExercicio(id));
      return { id, pontos, marcs };
    }),
  ]);
  const histPorId = new Map(historicos.map((h) => [h.id, h]));

  const exercicios = Array.from(agregados.values()).map((x) => {
    const principal = [...x.contribuicoes].sort((a, b) => b.peso - a.peso)[0];
    const h = histPorId.get(x.id);
    return {
      ...x,
      musculoPrincipalId: principal?.musculoId ?? null,
      pontos: h?.pontos ?? [],
      marcadores: h?.marcs ?? [],
    };
  });

  // sessões realizadas = dias distintos de treino por rotina dentro do período
  const sessoes = new Set(registros.filter((r) => r.data >= inicio && r.data <= fim).map((r) => `${r.treino_id}|${r.data}`));

  // fim do treino: % do volume planejado de cada músculo que cai no bloco C
  let fimDoTreino: Map<string, number> | null = null;
  if (parametros.fadigaAtiva) {
    fimDoTreino = new Map();
    for (const [id, p] of partesFadigaSemanal(treinos, parametros)) {
      const total = p.a + p.b + p.c;
      if (total > 0) fimDoTreino.set(id, p.c / total);
    }
  }

  // distribuição semanal planejada: total (1 por série e músculo tocado), ponderado (peso de contribuição)
  // e acumulado (ponderado descontado pela posição na rotina; sem desconto se a fadiga está desligada)
  const totalPorMusculo = new Map<string, number>();
  const pondPorMusculo = new Map<string, number>();
  for (const t of treinos) {
    for (const te of t.exercicios) {
      const n = te.series.length;
      if (!n) continue;
      for (const m of te.exercicio?.musculos ?? []) {
        totalPorMusculo.set(m.musculo_id, (totalPorMusculo.get(m.musculo_id) ?? 0) + n);
        pondPorMusculo.set(m.musculo_id, (pondPorMusculo.get(m.musculo_id) ?? 0) + n * Number(m.peso_contribuicao));
      }
    }
  }
  const partesSemana = partesFadigaSemanal(treinos, parametros);
  const planejadoSemanal = musculos.map((m) => {
    const p = partesSemana.get(m.id);
    return {
      id: m.id,
      total: totalPorMusculo.get(m.id) ?? 0,
      ponderado: pondPorMusculo.get(m.id) ?? 0,
      acumulado: p ? p.a + p.b * 0.7 + p.c * 0.4 : 0,
    };
  });

  const ordenados = [...pesosTodos].sort((a, b) => a.data.localeCompare(b.data));

  return montarRelatorio({
    inicio,
    fim,
    geradoEm: hojeISO(),
    musculos: musculos.map((m) => ({ id: m.id, nome: m.nome, grupo: m.agrupamento?.nome ?? null })),
    volume: volume.map((l) => ({ data: l.data, musculoId: l.musculo_id, series: Number(l.series_equivalentes) })),
    metaSemanal,
    planejadoSemanal,
    classificar: (musculoId, serie) => classificarVolumeSemanal(serie, args.parametrosParaMusculo(musculoPorId.get(musculoId))),
    exercicios,
    fimDoTreino,
    sessoes: { realizadas: sessoes.size, planejadasPorSemana: treinos.length },
    calorias,
    peso: {
      pontos: ordenados,
      mediaMovel: calcularMediaMovelSerie(ordenados),
      meta: calcularLinhaMetaPorDia(ordenados, metaHistorico),
    },
  });
}
