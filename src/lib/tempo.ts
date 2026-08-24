/** Opções de descanso em segundos, de 30 em 30s, de 2min a 5min. */
export const OPCOES_DESCANSO = Array.from({ length: 7 }, (_, i) => 120 + i * 30);

export function formatMinSeg(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return s === 0 ? `${m}min` : `${m}min${s}`;
}
