/** Preferências de exibição do gráfico de Peso (Meta > Parametrização do gráfico) — guardadas
 * direto no dispositivo (localStorage), sem relação com a meta em si. Centralizadas aqui porque
 * são lidas/escritas tanto pelo formulário (PesoMetaFormSheet.svelte) quanto pelos dois lugares
 * que desenham o gráfico (Peso.svelte e PesoGraficoTelaCheia.svelte) — evita repetir a mesma
 * chave/lógica de leitura em 3 arquivos (e divergir por engano).
 *
 * Os 4 booleanos abaixo só valem quando o filtro de período atual está marcado em
 * filtrosAplicados (ver FILTROS_PERIODO_OPCOES) — fora dos filtros marcados, nenhum dos 4
 * aparece, não importa o estado do checkbox. */

export type FiltroPeriodo = "7d" | "1m" | "3m" | "6m" | "1a" | "tudo";

export const FILTROS_PERIODO_OPCOES: { valor: FiltroPeriodo; label: string }[] = [
  { valor: "7d", label: "1 semana" },
  { valor: "1m", label: "1 mês" },
  { valor: "3m", label: "3 meses" },
  { valor: "6m", label: "6 meses" },
  { valor: "1a", label: "1 ano" },
  { valor: "tudo", label: "Tudo" },
];

const CHAVE_DIA_SEMANA = "fitforge_peso_grafico_dia_semana";
const CHAVE_PESO_VARIACAO = "fitforge_peso_grafico_peso_variacao";
const CHAVE_INFORMAR_TREINO = "fitforge_peso_grafico_informar_treino";
const CHAVE_DESTACAR_REGISTRO = "fitforge_peso_grafico_destacar_registro";
const CHAVE_FILTROS_APLICADOS = "fitforge_peso_grafico_filtros_aplicados";

function lerBool(chave: string, padrao: boolean): boolean {
  if (typeof localStorage === "undefined") return padrao;
  const v = localStorage.getItem(chave);
  return v == null ? padrao : v === "true";
}
function gravarBool(chave: string, valor: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(chave, String(valor));
}

/** "Adicionar dia da semana no gráfico" — texto (Qui, Sex...) embaixo de cada ponto. */
export function lerMostrarDiaSemana(): boolean {
  return lerBool(CHAVE_DIA_SEMANA, true);
}
export function gravarMostrarDiaSemana(v: boolean): void {
  gravarBool(CHAVE_DIA_SEMANA, v);
}

/** "Adicionar peso/variação no gráfico" — valor (kg ou %) em cima de cada ponto, mais o valor da
 * meta no fim da linha vermelha. Desmarcado, mantém só o primeiro/último valor de cada linha. */
export function lerMostrarPesoVariacao(): boolean {
  return lerBool(CHAVE_PESO_VARIACAO, true);
}
export function gravarMostrarPesoVariacao(v: boolean): void {
  gravarBool(CHAVE_PESO_VARIACAO, v);
}

/** "Informar treino no gráfico" — destaque de cor (COR_TREINO em vez de COR_PESO) no ponto dos
 * dias com treino registrado, só no modo "Diário". */
export function lerInformarTreino(): boolean {
  return lerBool(CHAVE_INFORMAR_TREINO, true);
}
export function gravarInformarTreino(v: boolean): void {
  gravarBool(CHAVE_INFORMAR_TREINO, v);
}

/** "Destacar registro (ponto) no gráfico" — a bolinha em cada ponto da linha. */
export function lerDestacarRegistro(): boolean {
  return lerBool(CHAVE_DESTACAR_REGISTRO, true);
}
export function gravarDestacarRegistro(v: boolean): void {
  gravarBool(CHAVE_DESTACAR_REGISTRO, v);
}

/** Filtros de período (Peso.svelte) em que os 4 itens acima podem aparecer — fora deles, nenhum
 * aparece, mesmo marcado. Padrão: "1 semana" e "1 mês" (cobre o que já era automático antes de
 * virar configurável). */
const FILTROS_PADRAO: FiltroPeriodo[] = ["7d", "1m"];

export function lerFiltrosAplicados(): Set<FiltroPeriodo> {
  if (typeof localStorage === "undefined") return new Set(FILTROS_PADRAO);
  const bruto = localStorage.getItem(CHAVE_FILTROS_APLICADOS);
  if (!bruto) return new Set(FILTROS_PADRAO);
  try {
    return new Set(JSON.parse(bruto) as FiltroPeriodo[]);
  } catch {
    return new Set(FILTROS_PADRAO);
  }
}
export function gravarFiltrosAplicados(filtros: Set<FiltroPeriodo>): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_FILTROS_APLICADOS, JSON.stringify([...filtros]));
}
