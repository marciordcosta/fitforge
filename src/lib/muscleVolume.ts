import { chaveSemana, parseISODate } from "./dates";

export interface VolumeBruto {
  data: string;
  musculo_id: string;
  series_equivalentes: number;
}

/**
 * Agrega linhas brutas (uma por data+músculo, já somadas por dia na view SQL)
 * em totais por músculo para o intervalo dado, arredondando só uma vez aqui —
 * nunca antes, por exercício ou por dia isoladamente (era o bug do app antigo).
 */
export function agregarPorMusculo(linhas: VolumeBruto[]): Map<string, number> {
  const somas = new Map<string, number>();
  for (const l of linhas) {
    somas.set(l.musculo_id, (somas.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
  }
  const arredondado = new Map<string, number>();
  for (const [musculoId, total] of somas.entries()) {
    arredondado.set(musculoId, Math.round(total));
  }
  return arredondado;
}

/** Agrupa linhas brutas por semana (chave = data de início, terça-feira). */
export function agruparPorSemana(linhas: VolumeBruto[]): Map<string, VolumeBruto[]> {
  const porSemana = new Map<string, VolumeBruto[]>();
  for (const l of linhas) {
    const chave = chaveSemana(parseISODate(l.data));
    const lista = porSemana.get(chave) ?? [];
    lista.push(l);
    porSemana.set(chave, lista);
  }
  return porSemana;
}
