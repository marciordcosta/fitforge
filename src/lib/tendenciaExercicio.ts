import type { MarcadorExercicio } from "./treinoApi";
import { toISODate, somarDias } from "./dates";
import { lerPausaReiniciarSemanas, dataCortePorPausa, lerJanelaProgressaoSemanas } from "./treinoProgressaoPrefs";

/** Aplica à lista de sessões de um exercício tudo que decide o que CONTA na leitura de progresso
 * (status e reta de tendência dos gráficos):
 * - marcador "desconsiderar": esse dia some só da conta (continua no histórico/gráfico);
 * - marcador "reiniciar": corta tudo ANTES do mais recente desse tipo (ex: troca de equipamento);
 * - "apenas_marcar": sem efeito, só visual;
 * - "Reiniciar progressão após pausa" (Parametrização): corta antes de uma pausa de N semanas e,
 *   se o último treino já passou do prazo, a conta fica em branco até voltar a treinar;
 * - "Janela da progressão" (Parametrização): só as últimas N semanas, a partir de hoje.
 * Vale o corte mais recente. Sem nenhum desses, devolve a lista inteira. */
export function pontosParaTendencia<T extends { data: string }>(pontos: T[], marcadores: MarcadorExercicio[] | undefined): T[] {
  const datasDesconsiderar = new Set((marcadores ?? []).filter((m) => m.tipo === "desconsiderar").map((m) => m.data));
  const marcadoresReiniciar = (marcadores ?? []).filter((m) => m.tipo === "reiniciar");
  const ultimaDataReiniciar = marcadoresReiniciar.length ? marcadoresReiniciar[marcadoresReiniciar.length - 1].data : null;
  // A pausa é medida entre sessões de verdade (lista completa, antes de "desconsiderar" tirar dias).
  const cortePausa = dataCortePorPausa(
    pontos.map((p) => p.data),
    lerPausaReiniciarSemanas(),
    toISODate(new Date()),
  );
  const semanasJanela = lerJanelaProgressaoSemanas();
  const corteJanela = semanasJanela > 0 ? somarDias(toISODate(new Date()), -7 * semanasJanela) : null;
  if (!datasDesconsiderar.size && ultimaDataReiniciar == null && cortePausa == null && corteJanela == null) return pontos;
  const corte = [ultimaDataReiniciar, cortePausa, corteJanela].filter((d): d is string => d != null).sort().pop() ?? null;
  return pontos.filter((p) => !datasDesconsiderar.has(p.data) && (corte == null || p.data >= corte));
}

/** Reta de tendência (mínimos quadrados) pelos pontos de um gráfico de linha. `valores[i]` é o valor
 * plotado na data `datas[i]`; só entram na reta as datas em `validas` (as que contam na leitura de
 * progresso). Devolve o valor da reta em cada ponto, `null` fora do trecho válido (a reta vai da
 * primeira à última data válida) — ou tudo `null` com menos de 2 pontos válidos. */
export function retaDeTendencia(datas: string[], valores: (number | null)[], validas: Set<string>): (number | null)[] {
  const vazio = datas.map(() => null);
  const pts: { x: number; y: number }[] = [];
  datas.forEach((d, x) => {
    const v = valores[x];
    if (v != null && validas.has(d)) pts.push({ x, y: v });
  });
  if (pts.length < 2) return vazio;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (den === 0) return vazio;
  const incl = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den;
  const ini = pts[0].x;
  const fim = pts[pts.length - 1].x;
  return datas.map((_, x) => (x >= ini && x <= fim ? my + incl * (x - mx) : null));
}
