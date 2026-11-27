import {
  getVolumeRealizadoBruto,
  getRegistrosPorTreinoDesde,
  getHistoricoExercicio,
  listMarcadoresExercicio,
  classificarVolumeSemanal,
  janelaDoMusculo,
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

  // grade da distribuição semanal: um dia por coluna (seg a dom), séries totais por músculo (o total da semana, ponderado, vem de planejadoSemanal)
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
  const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const porMusculoGrade = new Map<string, number[]>();
  ORDEM_DIAS.forEach((dia, col) => {
    const doDia = treinos.filter((t) => t.dia_semana === dia);
    for (const t of doDia) {
      for (const te of t.exercicios) {
        const n = te.series.length;
        if (!n) continue;
        for (const m of te.exercicio?.musculos ?? []) {
          if (!(Number(m.peso_contribuicao) > 0)) continue;
          const linha = porMusculoGrade.get(m.musculo_id) ?? ORDEM_DIAS.map(() => 0);
          // Séries TOTAIS no dia: 1 por série pra cada músculo que o exercício toca (sem ponderar).
          linha[col] += n;
          porMusculoGrade.set(m.musculo_id, linha);
        }
      }
    }
  });
  const gradeSemanal = {
    dias: ORDEM_DIAS.map((dia) => ({
      rotulo: NOMES_DIAS[dia],
      rotina: treinos.filter((t) => t.dia_semana === dia).map((t) => t.nome_treino).join(" + ") || null,
    })),
    porMusculo: porMusculoGrade,
  };

  // rotinas atuais, na ordem da semana (seg a dom, sem dia por último), com os músculos que cada uma trabalha
  // (mesma leitura do card da rotina: séries totais, ponderadas e acumuladas)
  const posicaoDia = (d: number | null) => (d == null ? 99 : ORDEM_DIAS.indexOf(d));
  const rotinas = [...treinos]
    .sort((a, b) => posicaoDia(a.dia_semana) - posicaoDia(b.dia_semana) || a.ordem - b.ordem)
    .map((t) => {
      const porMusculo = new Map<string, { total: number; pond: number }>();
      const exerciciosOrdenados = [...t.exercicios].sort((a, b) => a.ordem - b.ordem);
      for (const te of exerciciosOrdenados) {
        const n = te.series.length;
        if (!n) continue;
        for (const m of te.exercicio?.musculos ?? []) {
          const peso = Number(m.peso_contribuicao);
          if (!(peso > 0)) continue;
          const atual = porMusculo.get(m.musculo_id) ?? { total: 0, pond: 0 };
          atual.total += n;
          atual.pond += n * peso;
          porMusculo.set(m.musculo_id, atual);
        }
      }
      const partes = partesFadigaSemanal([t], parametros);
      return {
        nome: t.nome_treino,
        dia: t.dia_semana != null ? NOMES_DIAS[t.dia_semana] : null,
        totalSeries: t.exercicios.reduce((acc, te) => acc + te.series.length, 0),
        numExercicios: t.exercicios.length,
        exercicios: exerciciosOrdenados.map((te) => ({ nome: te.exercicio?.nome ?? "", series: te.series.length })),
        musculos: Array.from(porMusculo.entries())
          .map(([id, v]) => {
            const p = partes.get(id);
            return {
              nome: musculoPorId.get(id)?.nome ?? "",
              total: v.total,
              pond: v.pond,
              acum: parametros.fadigaAtiva && p ? p.a + p.b * 0.7 + p.c * 0.4 : null,
            };
          })
          .sort((a, b) => b.pond - a.pond || a.nome.localeCompare(b.nome)),
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
    gradeSemanal,
    rotinas,
    janela: (musculoId) => janelaDoMusculo(musculoPorId.get(musculoId)),
    classificar: (musculoId, serie) => classificarVolumeSemanal(serie, janelaDoMusculo(musculoPorId.get(musculoId))),
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
