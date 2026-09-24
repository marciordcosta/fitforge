/** Opções de descanso em segundos, de 30 em 30s, de 2min a 5min. */
export const OPCOES_DESCANSO = Array.from({ length: 7 }, (_, i) => 120 + i * 30);

export function formatMinSeg(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return s === 0 ? `${m}min` : `${m}min${s}`;
}

/** Duração de um treino (histórico), sem exibir segundos — "45min" ou "1h15". */
export function formatDuracaoTreino(segundos: number): string {
  const totalMin = Math.round(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}
