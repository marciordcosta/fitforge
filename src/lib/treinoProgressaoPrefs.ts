/** Preferência da conta de tendência de progressão/regressão dos exercícios (Treino >
 * Parametrização) — guardada só no aparelho (localStorage), como as demais preferências de exibição.
 *
 * `pausaReiniciarSemanas` > 0 liga o "reiniciar" automático: depois de uma pausa de N semanas ou mais
 * (entre duas sessões do mesmo exercício, ou do último treino dele até hoje), a conta ignora o que
 * veio antes da pausa — quem fica um tempo sem fazer o exercício costuma voltar com carga menor, e
 * isso não é regressão de verdade. 0 (padrão) = desligado. */

const CHAVE_PAUSA_REINICIAR = "fitforge_treino_pausa_reiniciar_semanas";

export function lerPausaReiniciarSemanas(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_PAUSA_REINICIAR));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function gravarPausaReiniciarSemanas(semanas: number): void {
  try {
    localStorage.setItem(CHAVE_PAUSA_REINICIAR, String(Math.max(0, Math.floor(semanas) || 0)));
  } catch {
    // sem localStorage: a preferência só não persiste
  }
}

const MS_DIA = 86_400_000;

/** Dias inteiros entre duas datas ISO (YYYY-MM-DD). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / MS_DIA);
}

/** Data a partir da qual a conta de tendência vale, pela regra de pausa: a data da primeira sessão
 * depois da ÚLTIMA pausa de `semanas` semanas ou mais entre sessões seguidas. Se o último treino foi há
 * `semanas` semanas ou mais (contando até `hoje`), nada vale mais: devolve uma data depois de hoje, que
 * corta tudo. `null` = regra desligada ou sem pausa (nada a cortar). `datas` em ordem crescente. */
export function dataCortePorPausa(datas: string[], semanas: number, hoje: string): string | null {
  if (semanas <= 0 || !datas.length) return null;
  const limite = semanas * 7;
  if (diasEntre(datas[datas.length - 1], hoje) >= limite) return "9999-12-31";
  let corte: string | null = null;
  for (let i = 1; i < datas.length; i++) {
    if (diasEntre(datas[i - 1], datas[i]) >= limite) corte = datas[i];
  }
  return corte;
}
