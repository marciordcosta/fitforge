/** Opções de descanso em segundos, de 15 em 15s, de 1min a 5min. */
export const OPCOES_DESCANSO = Array.from({ length: 17 }, (_, i) => 60 + i * 15);

export function formatMinSeg(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return s === 0 ? `${m}min` : `${m}min${s}`;
}
