import { chaveSemana, parseISODate } from "./dates";

/** Progressão de um músculo "lida do gráfico": a mesma conta alimenta o gráfico do modal e o texto
 * Progredindo/Estagnado/Regredindo, então os dois nunca discordam.
 *
 * - Cada exercício vira uma curva semanal do melhor 1RM da semana, em % da primeira semana válida
 *   (100% no começo): parado fica perto de 100%, subir 7% vai a 107%.
 * - A linha ponderada é a média das curvas, pesando cada exercício pelo seu `peso` (o ponderamento:
 *   quanto ele trabalha o músculo).
 * - A reta de tendência (mínimos quadrados) passa pela linha ponderada; o status sai da subida/descida
 *   dela no período, em % — acima de +2% progredindo, abaixo de −2% regredindo. */

export type StatusProgressao = "subindo" | "estavel" | "caindo" | "analise";

export interface ItemProgressao {
  nome: string;
  /** Ponderamento do exercício no músculo. */
  peso: number;
  /** Sessões já filtradas (marcadores/pausa), com o melhor 1RM de cada dia. */
  pontos: { data: string; melhor1rm: number }[];
}

export interface ProgressaoMusculo {
  /** Início (terça) de cada semana, em ordem. */
  semanas: string[];
  /** % do 1RM em relação à primeira semana válida de cada exercício (null = sem registro na semana). */
  curvas: (number | null)[][];
  /** Média ponderada das curvas por semana (null = nenhuma curva com dado). */
  ponderada: (number | null)[];
  /** Valor da reta de tendência em cada semana (null se não dá pra ajustar). */
  reta: (number | null)[];
  /** Quanto a reta sobe/desce no período, em fração (0,05 = +5%); null se há menos de 4 semanas com dado. */
  variacao: number | null;
  status: StatusProgressao | null;
}

const MIN_SEMANAS = 4;
const LIMITE = 0.02;

export function calcularProgressaoMusculo(itens: ItemProgressao[]): ProgressaoMusculo {
  const porSemana = itens.map((it) => {
    const m = new Map<string, number>();
    for (const p of it.pontos) {
      const sem = chaveSemana(parseISODate(p.data));
      m.set(sem, Math.max(m.get(sem) ?? 0, p.melhor1rm));
    }
    return m;
  });
  const semanas = Array.from(new Set(porSemana.flatMap((m) => Array.from(m.keys())))).sort();

  const curvas = porSemana.map((m) => {
    const valores = semanas.map((s) => m.get(s) ?? null);
    const base = valores.find((v): v is number => v != null && v > 0);
    return valores.map((v) => (v == null || base == null ? null : (v / base) * 100));
  });

  const ponderada = semanas.map((_, i) => {
    let soma = 0;
    let pesos = 0;
    itens.forEach((it, k) => {
      const v = curvas[k][i];
      if (v != null && it.peso > 0) {
        soma += v * it.peso;
        pesos += it.peso;
      }
    });
    return pesos > 0 ? soma / pesos : null;
  });

  const pts = ponderada.map((v, x) => ({ x, v })).filter((p): p is { x: number; v: number } => p.v != null);
  let reta: (number | null)[] = semanas.map(() => null);
  let variacao: number | null = null;
  let status: StatusProgressao | null = null;
  if (pts.length >= 2) {
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.v, 0) / pts.length;
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    if (den > 0) {
      const incl = pts.reduce((a, p) => a + (p.x - mx) * (p.v - my), 0) / den;
      reta = semanas.map((_, x) => my + incl * (x - mx));
      if (pts.length >= MIN_SEMANAS && my > 0) {
        const span = pts[pts.length - 1].x - pts[0].x;
        variacao = (incl * span) / my;
        status = variacao > LIMITE ? "subindo" : variacao < -LIMITE ? "caindo" : "estavel";
      } else {
        status = "analise";
      }
    }
  }
  return { semanas, curvas, ponderada, reta, variacao, status };
}
