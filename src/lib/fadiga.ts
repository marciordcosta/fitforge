import type { ParametrosDistribuicao, TreinoComExercicios } from "./treinoApi";

/** Faixas de fadiga acumulada (A = fresco, B = meio, C = mais fadigado) pela posição da
 * série dentro da sessão — heurística de priorização 80/20, não modela fadiga fisiológica
 * real. Compartilhado entre DistribuicaoMusculos.svelte (barras de edição) e Rotinas.svelte
 * (anel de progresso da Home), pra colorir os dois do mesmo jeito. */
export interface Partes {
  a: number;
  b: number;
  c: number;
}

export function partesVazias(): Partes {
  return { a: 0, b: 0, c: 0 };
}

export function somarPartes(...listas: Partes[]): Partes {
  return listas.reduce((acc, p) => ({ a: acc.a + p.a, b: acc.b + p.b, c: acc.c + p.c }), partesVazias());
}

export const CORES_FAIXA = { a: "#60a5fa", b: "#fbbf24", c: "#f87171" };

export function partesParaSegmentos(p: Partes): { valor: number; cor: string }[] {
  return [
    { valor: p.a, cor: CORES_FAIXA.a },
    { valor: p.b, cor: CORES_FAIXA.b },
    { valor: p.c, cor: CORES_FAIXA.c },
  ];
}

/** Faixa A/B/C pela posição RELATIVA da série na sessão (% do total de séries do treino,
 * não nº absoluto) — corte configurável em Parametrização (fadigaFasesCorteA/B, em %). */
export function faixaPorPosicaoRelativa(posicao: number, totalSeries: number, p: ParametrosDistribuicao): "a" | "b" | "c" {
  const percentual = totalSeries > 0 ? (posicao / totalSeries) * 100 : 100;
  if (percentual <= p.fadigaFasesCorteA) return "a";
  if (percentual <= p.fadigaFasesCorteB) return "b";
  return "c";
}

/**
 * Classifica cada série da rotina pela POSIÇÃO no treino (não pelo músculo) — serve pra
 * priorização 80/20 (ver faixaPorPosicaoRelativa), não pra medir fadiga real. Modo de
 * contribuição: cada série soma peso_contribuicao (não 1 inteiro) pra cada músculo que ela
 * trabalha — as partes de cada músculo somam o mesmo total ponderado dele.
 */
export function contarSeriesPorFaixaDePosicao(
  treino: TreinoComExercicios,
  parametrosDistribuicao: ParametrosDistribuicao,
): Map<string, Partes> {
  const exerciciosOrdenados = treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
  const totalSeries = exerciciosOrdenados.reduce((soma, ex) => soma + ex.series.length, 0);
  const mapa = new Map<string, Partes>();

  let posicao = 0;
  for (const ex of exerciciosOrdenados) {
    const musculosEx = ex.exercicio?.musculos ?? [];
    for (let s = 0; s < ex.series.length; s++) {
      posicao += 1;
      const faixa = faixaPorPosicaoRelativa(posicao, totalSeries, parametrosDistribuicao);
      for (const m of musculosEx) {
        const atual = mapa.get(m.musculo_id) ?? partesVazias();
        if (faixa === "a") atual.a += m.peso_contribuicao;
        else if (faixa === "b") atual.b += m.peso_contribuicao;
        else atual.c += m.peso_contribuicao;
        mapa.set(m.musculo_id, atual);
      }
    }
  }
  return mapa;
}

/** Partes (A/B/C por posição no treino) de cada músculo, somadas entre TODAS as rotinas de
 * uma lista: cada rotina já classifica suas próprias séries pela posição dela mesma
 * (contarSeriesPorFaixaDePosicao) — aqui só soma isso músculo a músculo entre as rotinas. */
export function partesFadigaSemanal(
  treinosLista: TreinoComExercicios[],
  parametrosDistribuicao: ParametrosDistribuicao,
): Map<string, Partes> {
  const mapa = new Map<string, Partes>();
  for (const t of treinosLista) {
    for (const [musculoId, partes] of contarSeriesPorFaixaDePosicao(t, parametrosDistribuicao)) {
      mapa.set(musculoId, somarPartes(mapa.get(musculoId) ?? partesVazias(), partes));
    }
  }
  return mapa;
}
