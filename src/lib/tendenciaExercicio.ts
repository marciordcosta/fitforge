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
export function pontosParaTendencia<T extends { data: string }>(
  pontos: T[],
  marcadores: MarcadorExercicio[] | undefined,
  opcoes: { semJanela?: boolean } = {},
): T[] {
  const datasDesconsiderar = new Set((marcadores ?? []).filter((m) => m.tipo === "desconsiderar").map((m) => m.data));
  const marcadoresReiniciar = (marcadores ?? []).filter((m) => m.tipo === "reiniciar");
  const ultimaDataReiniciar = marcadoresReiniciar.length ? marcadoresReiniciar[marcadoresReiniciar.length - 1].data : null;
  // A pausa é medida entre sessões de verdade (lista completa, antes de "desconsiderar" tirar dias).
  const cortePausa = dataCortePorPausa(
    pontos.map((p) => p.data),
    lerPausaReiniciarSemanas(),
    toISODate(new Date()),
  );
  // `semJanela`: o relatório já recorta o próprio período, então a janela (contada a partir de hoje) não entra.
  const semanasJanela = opcoes.semJanela ? 0 : lerJanelaProgressaoSemanas();
  const corteJanela = semanasJanela > 0 ? somarDias(toISODate(new Date()), -7 * semanasJanela) : null;
  if (!datasDesconsiderar.size && ultimaDataReiniciar == null && cortePausa == null && corteJanela == null) return pontos;
  const corte = [ultimaDataReiniciar, cortePausa, corteJanela].filter((d): d is string => d != null).sort().pop() ?? null;
  return pontos.filter((p) => !datasDesconsiderar.has(p.data) && (corte == null || p.data >= corte));
}

/** Reta de tendência (mínimos quadrados) do gráfico de um exercício. Ajusta sobre TODAS as sessões
 * que contam (`validas`, do histórico inteiro — a mesma base do status Progredindo/Estagnado/Regredindo,
 * com x = ordem da sessão), não só as que o filtro de registros do gráfico mostra: assim a reta e o
 * status concordam em qualquer filtro de visualização. Devolve o valor da reta nas datas VISÍVEIS que
 * contam (`null` nas demais; a linha liga os pontos), ou tudo `null` com menos de 2 sessões válidas. */
export function retaDeTendencia(
  todas: { data: string; valor: number | null }[],
  validas: Set<string>,
  datasVisiveis: string[],
): (number | null)[] {
  const vazio = datasVisiveis.map(() => null);
  const pts: { data: string; x: number; y: number }[] = [];
  for (const t of todas) {
    if (t.valor != null && validas.has(t.data)) pts.push({ data: t.data, x: pts.length, y: t.valor });
  }
  if (pts.length < 2) return vazio;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (den === 0) return vazio;
  const incl = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den;
  const porData = new Map(pts.map((p) => [p.data, my + incl * (p.x - mx)]));
  return datasVisiveis.map((d) => porData.get(d) ?? null);
}

/** Mínimo de sessões válidas pra dar resultado (com 2 ou 3 fica "em análise"). */
export const MIN_SESSOES_TENDENCIA = 4;

/** Tendência do exercício como uma linha de gráfico: ajusta a reta (mínimos quadrados) pelo 1RM de
 * TODAS as sessões válidas e devolve quanto ela sobe ou desce do primeiro ao último ponto, em % do 1RM
 * médio. Uma sessão fora da curva pesa pouco; null se há menos de MIN_SESSOES_TENDENCIA sessões. */
export function variacaoExercicio(pontos: { melhor1rm: number }[]): number | null {
  const n = pontos.length;
  if (n < MIN_SESSOES_TENDENCIA) return null;
  const mediaX = (n - 1) / 2;
  const mediaY = pontos.reduce((acc, p) => acc + p.melhor1rm, 0) / n;
  if (mediaY <= 0) return null;
  let num = 0;
  let den = 0;
  pontos.forEach((p, x) => {
    num += (x - mediaX) * (p.melhor1rm - mediaY);
    den += (x - mediaX) ** 2;
  });
  return ((num / den) * (n - 1)) / mediaY;
}

export type TendenciaStatus = "subindo" | "estavel" | "caindo" | "analise";

/** Tendência em texto: null com menos de 2 sessões; "analise" com 2 ou 3; senão pela inclinação da reta (±2%). */
export function classificarTendencia(pontos: { melhor1rm: number }[]): TendenciaStatus | null {
  if (pontos.length < 2) return null;
  const v = variacaoExercicio(pontos);
  if (v == null) return "analise";
  if (v > 0.02) return "subindo";
  if (v < -0.02) return "caindo";
  return "estavel";
}
