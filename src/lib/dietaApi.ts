import { supabase } from "./supabase";
import { auth } from "./auth.svelte";
import { DIAS_SEMANA_ABREV, segundaDaSemana } from "./treinoApi";
import { getPesoMedioAtual, getMeta, getTaxaVariacaoSemanal } from "./pesoApi";
import { parseISODate, somarDias } from "./dates";
import { marcarDietaDesatualizada } from "./dietaInvalidacao.svelte";

function uid(): string {
  const id = auth.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------- Alimentos ----------------

export type FonteAlimento = "manual" | "taco" | "openfoodfacts";

export interface Alimento {
  id: string;
  nome: string;
  marca: string | null;
  porcaoPadraoQtd: number;
  porcaoPadraoUnidade: string;
  caloriasPorPorcao: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number | null;
  gorduraSaturadaG: number | null;
  gorduraInsaturadaG: number | null;
  fonte: FonteAlimento;
  codigoBarras: string | null;
}

const ALIMENTO_SELECT =
  "id, nome, marca, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g, fibra_g, gordura_saturada_g, gordura_insaturada_g, fonte, codigo_barras";

function mapAlimento(a: Record<string, unknown>): Alimento {
  return {
    id: a.id as string,
    nome: a.nome as string,
    marca: a.marca as string | null,
    porcaoPadraoQtd: a.porcao_padrao_qtd as number,
    porcaoPadraoUnidade: a.porcao_padrao_unidade as string,
    caloriasPorPorcao: a.calorias_por_porcao as number,
    proteinaG: a.proteina_g as number,
    gorduraG: a.gordura_g as number,
    carboidratoG: a.carboidrato_g as number,
    fibraG: a.fibra_g as number | null,
    gorduraSaturadaG: a.gordura_saturada_g as number | null,
    gorduraInsaturadaG: a.gordura_insaturada_g as number | null,
    fonte: a.fonte as FonteAlimento,
    codigoBarras: a.codigo_barras as string | null,
  };
}

/** Remove acentos ("á" -> "a", "ç" -> "c" etc.) pra busca não depender de digitar acento certo. */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Divide o termo em palavras e aplica um ilike por palavra (AND) — acha o nome com as palavras em qualquer ordem. */
function porPalavras<T>(builder: T, coluna: string, termo: string): T {
  const palavras = termo.trim().split(/\s+/).filter(Boolean);
  return palavras.reduce(
    (b, p) => (b as unknown as { ilike: (c: string, v: string) => T }).ilike(coluna, `%${p}%`),
    builder,
  );
}

/** Igual porPalavras, mas cada palavra pode bater no nome OU na marca (ex: "goiabinha mais leve"
 * acha um alimento chamado "Goiabinha" da marca "Mais Leve") — cada palavra vira um OR entre as
 * duas colunas, e as palavras entre si continuam em AND. */
function porPalavrasNomeOuMarca<T>(builder: T, colunaNome: string, termo: string): T {
  const palavras = termo.trim().split(/\s+/).filter(Boolean);
  return palavras.reduce(
    (b, p) => (b as unknown as { or: (v: string) => T }).or(`${colunaNome}.ilike.%${p}%,marca.ilike.%${p}%`),
    builder,
  );
}

/** Busca ignorando acento e maiúsculas — compara contra `nome_normalizado` (minúsculo, sem acento,
 * mantido em dia por trigger no banco) em vez da coluna `nome` bruta. Também busca pela marca (essa
 * sem normalização de acento — marca costuma vir sem acento e não tem uma coluna normalizada). */
export async function buscarAlimentos(query: string): Promise<Alimento[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await porPalavrasNomeOuMarca(
    supabase.from("alimentos").select(ALIMENTO_SELECT).eq("oculta", false),
    "nome_normalizado",
    semAcento(termo.toLowerCase()),
  )
    .order("nome", { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map(mapAlimento);
}

/** Lista inicial pra tela de catálogo (sem termo de busca ainda) — as primeiras N por ordem alfabética. */
export async function listAlimentos(limite = 50): Promise<Alimento[]> {
  const { data, error } = await supabase
    .from("alimentos")
    .select(ALIMENTO_SELECT)
    .eq("oculta", false)
    .order("nome", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(mapAlimento);
}

export async function getAlimento(id: string): Promise<Alimento | null> {
  const { data, error } = await supabase.from("alimentos").select(ALIMENTO_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapAlimento(data) : null;
}

export interface AlimentoManualInput {
  nome: string;
  marca: string | null;
  porcaoPadraoQtd: number;
  porcaoPadraoUnidade: string;
  caloriasPorPorcao: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number | null;
  gorduraSaturadaG: number | null;
  gorduraInsaturadaG: number | null;
}

/** `oculta` (padrão false) marca um alimento criado só pra uso pontual numa refeição — não fica
 * salvo no catálogo geral (some de listAlimentos/buscarAlimentos), mas continua acessível pelo id
 * de quem já lançou ele no diário. Retorna o id criado, pra já lançar direto na refeição. */
export async function criarAlimentoManual(input: AlimentoManualInput, oculta = false): Promise<string> {
  const { data, error } = await supabase
    .from("alimentos")
    .insert({
      user_id: uid(),
      nome: input.nome,
      marca: input.marca,
      porcao_padrao_qtd: input.porcaoPadraoQtd,
      porcao_padrao_unidade: input.porcaoPadraoUnidade,
      calorias_por_porcao: input.caloriasPorPorcao,
      proteina_g: input.proteinaG,
      gordura_g: input.gorduraG,
      carboidrato_g: input.carboidratoG,
      fibra_g: input.fibraG,
      gordura_saturada_g: input.gorduraSaturadaG,
      gordura_insaturada_g: input.gorduraInsaturadaG,
      fonte: "manual",
      oculta,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function atualizarAlimentoManual(id: string, input: AlimentoManualInput): Promise<void> {
  const { error } = await supabase
    .from("alimentos")
    .update({
      nome: input.nome,
      marca: input.marca,
      porcao_padrao_qtd: input.porcaoPadraoQtd,
      porcao_padrao_unidade: input.porcaoPadraoUnidade,
      calorias_por_porcao: input.caloriasPorPorcao,
      proteina_g: input.proteinaG,
      gordura_g: input.gorduraG,
      carboidrato_g: input.carboidratoG,
      fibra_g: input.fibraG,
      gordura_saturada_g: input.gorduraSaturadaG,
      gordura_insaturada_g: input.gorduraInsaturadaG,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Cria uma cópia editável de qualquer alimento (mesmo de fonte TACO/OpenFoodFacts) — a cópia é sempre "manual". */
export async function duplicarAlimento(alimento: Alimento): Promise<string> {
  const { data, error } = await supabase
    .from("alimentos")
    .insert({
      user_id: uid(),
      nome: `${alimento.nome} (cópia)`,
      marca: alimento.marca,
      porcao_padrao_qtd: alimento.porcaoPadraoQtd,
      porcao_padrao_unidade: alimento.porcaoPadraoUnidade,
      calorias_por_porcao: alimento.caloriasPorPorcao,
      proteina_g: alimento.proteinaG,
      gordura_g: alimento.gorduraG,
      carboidrato_g: alimento.carboidratoG,
      fibra_g: alimento.fibraG,
      gordura_saturada_g: alimento.gorduraSaturadaG,
      gordura_insaturada_g: alimento.gorduraInsaturadaG,
      fonte: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Só o nome — usado pelo toque no nome no detalhamento do alimento, sem precisar abrir o
 * formulário completo de edição (esse continua restrito a alimentos manuais). */
export async function renomearAlimento(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("alimentos").update({ nome }).eq("id", id);
  if (error) throw error;
}

export async function excluirAlimento(id: string): Promise<void> {
  const { error } = await supabase.from("alimentos").delete().eq("id", id);
  if (error) throw error;
}

/** Acha um alimento já cadastrado (por qualquer usuário) com esse código de barras — evita duplicar o mesmo produto ao reescanear. */
export async function getAlimentoPorCodigoBarras(codigo: string): Promise<Alimento | null> {
  const { data, error } = await supabase
    .from("alimentos")
    .select(ALIMENTO_SELECT)
    .eq("codigo_barras", codigo)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAlimento(data) : null;
}

export interface AlimentoOpenFoodFactsInput {
  nome: string;
  marca: string | null;
  caloriasPorPorcao: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number | null;
  gorduraSaturadaG: number | null;
  gorduraInsaturadaG: number | null;
  codigoBarras: string;
}

/** Cria um alimento a partir de um produto escaneado (Open Food Facts) — valores sempre por 100g,
 * como a API fornece. `oculta` (padrão false) marca um alimento só pra uso pontual numa refeição
 * — a busca por código de barras continua achando ele normalmente, só some do catálogo geral. */
export async function criarAlimentoOpenFoodFacts(input: AlimentoOpenFoodFactsInput, oculta = false): Promise<string> {
  const { data, error } = await supabase
    .from("alimentos")
    .insert({
      user_id: uid(),
      nome: input.nome,
      marca: input.marca,
      porcao_padrao_qtd: 100,
      porcao_padrao_unidade: "g",
      calorias_por_porcao: input.caloriasPorPorcao,
      proteina_g: input.proteinaG,
      gordura_g: input.gorduraG,
      carboidrato_g: input.carboidratoG,
      fibra_g: input.fibraG,
      gordura_saturada_g: input.gorduraSaturadaG,
      gordura_insaturada_g: input.gorduraInsaturadaG,
      codigo_barras: input.codigoBarras,
      fonte: "openfoodfacts",
      oculta,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// ---------------- Catálogo de refeições (nomes reutilizáveis, gerenciáveis pelo usuário) ----------------

export interface RefeicaoModelo {
  id: string;
  nome: string;
  /** Receita privada (oculta) com os alimentos dessa refeição, se o usuário tiver adicionado algum
   * — só serve pra lançar automaticamente no diário do dia (garantirRefeicoesPadraoLancadas), não
   * tem mais relação com o número da meta abaixo. */
  metaReceitaId: string | null;
  metaReceitaOculta: boolean;
  /** Meta de calorias/macros dessa refeição — número direto (editado pela roda tripla), não mais
   * somado de uma receita. Calorias é sempre derivada dos 3 macros (4p + 9g + 4c). */
  metaCalorias: number | null;
  metaProteinaG: number | null;
  metaGorduraG: number | null;
  metaCarboidratoG: number | null;
}

const REFEICAO_MODELO_SELECT =
  "id, nome, meta_receita_id, meta_proteina_g, meta_gordura_g, meta_carboidrato_g, meta_receita:dieta_receitas!meta_receita_id(oculta)";

interface ItemReceitaBruto {
  quantidade: number;
  alimento: {
    porcao_padrao_qtd: number;
    calorias_por_porcao: number;
    proteina_g: number;
    gordura_g: number;
    carboidrato_g: number;
    fibra_g: number | null;
    gordura_saturada_g: number | null;
  } | null;
}

function somarTotaisItensReceita(itens: ItemReceitaBruto[]) {
  return itens.reduce(
    (acc, it) => {
      if (!it.alimento) return acc;
      const fator = it.quantidade / it.alimento.porcao_padrao_qtd;
      return {
        calorias: acc.calorias + it.alimento.calorias_por_porcao * fator,
        proteinaG: acc.proteinaG + it.alimento.proteina_g * fator,
        gorduraG: acc.gorduraG + it.alimento.gordura_g * fator,
        carboidratoG: acc.carboidratoG + it.alimento.carboidrato_g * fator,
        fibraG: acc.fibraG + (it.alimento.fibra_g ?? 0) * fator,
        gorduraSaturadaG: acc.gorduraSaturadaG + (it.alimento.gordura_saturada_g ?? 0) * fator,
      };
    },
    { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0, fibraG: 0, gorduraSaturadaG: 0 },
  );
}

/** Calorias sempre derivadas dos 3 macros — mesma fórmula usada na meta diária (caloriasCalc). Null
 * quando os 3 macros estão null (nenhuma meta configurada pra essa refeição). */
function calcularMetaCalorias(proteinaG: number | null, gorduraG: number | null, carboidratoG: number | null): number | null {
  if (proteinaG == null && gorduraG == null && carboidratoG == null) return null;
  return round1(4 * (proteinaG ?? 0) + 9 * (gorduraG ?? 0) + 4 * (carboidratoG ?? 0));
}

function mapRefeicaoModelo(l: Record<string, unknown>): RefeicaoModelo {
  const metaReceita = l.meta_receita as { oculta: boolean } | null;
  const proteinaG = l.meta_proteina_g as number | null;
  const gorduraG = l.meta_gordura_g as number | null;
  const carboidratoG = l.meta_carboidrato_g as number | null;
  return {
    id: l.id as string,
    nome: l.nome as string,
    metaReceitaId: l.meta_receita_id as string | null,
    metaReceitaOculta: metaReceita?.oculta ?? false,
    metaCalorias: calcularMetaCalorias(proteinaG, gorduraG, carboidratoG),
    metaProteinaG: proteinaG,
    metaGorduraG: gorduraG,
    metaCarboidratoG: carboidratoG,
  };
}

/** Lista o catálogo já na ordem escolhida pelo usuário (arrastar na tela de Gerenciar Refeições). */
export async function listRefeicoesModelo(): Promise<RefeicaoModelo[]> {
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .select(REFEICAO_MODELO_SELECT)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((l) => mapRefeicaoModelo(l as Record<string, unknown>));
}

/** Meta de macros/calorias da refeição do catálogo com esse nome (via prato vinculado), ou null se não achar/sem prato.
 * `.limit(1)` em vez de `.maybeSingle()` — nomes deveriam ser únicos no catálogo, mas isso não é
 * garantido no banco; se algum dia existir duplicata, usa a primeira em vez de quebrar a tela
 * inteira com "multiple rows returned". */
/** Meta de uma refeição do catálogo pelo nome, pra um dia específico — respeita o override do dia
 * da semana (Ondulatória) quando `data` é informada. Se essa refeição for a automática (última da
 * lista efetiva desse dia), a meta é AO VIVO: a diária menos o que já foi realmente consumido nas
 * OUTRAS refeições desse dia (consumo real, não a meta configurada delas) — mesmo cálculo do
 * Diário. Sem `data`, ignora overrides por dia e a automática (usa só a meta global do catálogo). */
/** Nome sozinho não identifica uma refeição de forma única: desde que passou a ser permitido
 * reaproveitar o mesmo nome em grupos de dias diferentes da Ondulatória (ex: "Lanche" em Lower1 e
 * outro "Lanche" independente em Upper1), duas linhas de dieta_refeicoes_modelo podem ter o mesmo
 * nome — por isso, quando `data` é informada, a busca é restrita à lista EFETIVA daquele dia da
 * semana (resolverCatalogoEfetivoDoDia), não ao catálogo inteiro sem filtro. */
export async function getMetaRefeicaoPorNome(nome: string, data?: string): Promise<MetasDiarias | null> {
  let modelo: RefeicaoModelo | null;
  if (data != null) {
    const diaSemana = parseISODate(data).getDay();
    const [catalogo, modelosPorDia] = await Promise.all([listRefeicoesModelo(), listRefeicoesModeloDia()]);
    modelo = resolverCatalogoEfetivoDoDia(diaSemana, catalogo, modelosPorDia).find((m) => m.nome === nome) ?? null;
  } else {
    const { data: linhas, error } = await supabase
      .from("dieta_refeicoes_modelo")
      .select(REFEICAO_MODELO_SELECT)
      .eq("nome", nome)
      .limit(1);
    if (error) throw error;
    const linha = linhas?.[0];
    modelo = linha ? mapRefeicaoModelo(linha as Record<string, unknown>) : null;
  }
  if (!modelo) return null;

  if (data != null) {
    const diaSemana = parseISODate(data).getDay();
    const contexto = await getContextoMetaCatalogo(modelo.id, [diaSemana]);
    if (contexto.ehUltima) {
      const [refeicoesHoje, itensHoje] = await Promise.all([getRefeicoesDoDia(data), getDiarioDoDia(data)]);
      const atual = refeicoesHoje.find((r) => r.nome === nome);
      const outrasIds = new Set(refeicoesHoje.filter((r) => r.id !== atual?.id).map((r) => r.id));
      const consumidoOutras = itensHoje
        .filter((i) => outrasIds.has(i.refeicaoId))
        .reduce(
          (acc, i) => ({
            calorias: acc.calorias + i.calorias,
            proteinaG: acc.proteinaG + i.proteinaG,
            gorduraG: acc.gorduraG + i.gorduraG,
            carboidratoG: acc.carboidratoG + i.carboidratoG,
          }),
          { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
        );
      return {
        calorias: Math.max(0, contexto.metaDiaria.calorias - consumidoOutras.calorias),
        proteinaG: Math.max(0, contexto.metaDiaria.proteinaG - consumidoOutras.proteinaG),
        gorduraG: Math.max(0, contexto.metaDiaria.gorduraG - consumidoOutras.gorduraG),
        carboidratoG: Math.max(0, contexto.metaDiaria.carboidratoG - consumidoOutras.carboidratoG),
      };
    }
    const metasDia = await listMetasDiaModelo();
    const override = metasDia.find((m) => m.modeloId === modelo.id && m.diaSemana === diaSemana);
    const calorias = override?.metaCalorias ?? modelo.metaCalorias;
    if (calorias == null) return null;
    return {
      calorias,
      proteinaG: override?.metaProteinaG ?? modelo.metaProteinaG ?? 0,
      gorduraG: override?.metaGorduraG ?? modelo.metaGorduraG ?? 0,
      carboidratoG: override?.metaCarboidratoG ?? modelo.metaCarboidratoG ?? 0,
    };
  }

  if (modelo.metaCalorias == null) return null;
  return {
    calorias: modelo.metaCalorias,
    proteinaG: modelo.metaProteinaG!,
    gorduraG: modelo.metaGorduraG!,
    carboidratoG: modelo.metaCarboidratoG!,
  };
}

export async function vincularMetaReceita(modeloId: string, receitaId: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ meta_receita_id: receitaId }).eq("id", modeloId);
  if (error) throw error;
}

/** Remove a meta global (Fixa) dessa refeição do catálogo — a receita em si não é tocada, só o vínculo. */
export async function desvincularMetaReceita(modeloId: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ meta_receita_id: null }).eq("id", modeloId);
  if (error) throw error;
}

/** Remove a meta por dia (Ondulatória) desses dias — a receita em si não é tocada, só o vínculo; os dias voltam a usar o meta_receita_id global como fallback. */
export async function removerMetaReceitaDias(modeloId: string, diasSemana: number[]): Promise<void> {
  const { error } = await supabase
    .from("dieta_refeicoes_modelo_meta_dia")
    .delete()
    .eq("modelo_id", modeloId)
    .in("dia_semana", diasSemana);
  if (error) throw error;
}

/** Se essa receita é o prato padrão de alguma refeição do catálogo (global ou por dia) — usado pra esconder "Adicionar à refeição" ao visualizá-la nesse papel. */
export async function receitaEhMetaDeRefeicao(receitaId: string): Promise<boolean> {
  const [global, porDia] = await Promise.all([
    supabase.from("dieta_refeicoes_modelo").select("id").eq("meta_receita_id", receitaId).limit(1),
    supabase.from("dieta_refeicoes_modelo_meta_dia").select("modelo_id").eq("meta_receita_id", receitaId).limit(1),
  ]);
  if (global.error) throw global.error;
  if (porDia.error) throw porDia.error;
  return (global.data?.length ?? 0) > 0 || (porDia.data?.length ?? 0) > 0;
}

/** Meta de macros/calorias de uma refeição do catálogo específica de um dia da semana (modo Ondulatória). */
export interface MetaDiaModelo {
  modeloId: string;
  diaSemana: number;
  /** Nulo = esse grupo de dias usa o nome global do modelo (dieta_refeicoes_modelo.nome) — só
   * preenchido quando o usuário renomeia a refeição especificamente pra esses dias. */
  nome: string | null;
  metaReceitaId: string | null;
  metaReceitaOculta: boolean;
  metaCalorias: number | null;
  metaProteinaG: number | null;
  metaGorduraG: number | null;
  metaCarboidratoG: number | null;
}

const META_DIA_MODELO_SELECT =
  "modelo_id, dia_semana, nome, meta_receita_id, meta_proteina_g, meta_gordura_g, meta_carboidrato_g, meta_receita:dieta_receitas!meta_receita_id(oculta)";

/** Todas as metas por dia já configuradas (qualquer refeição, qualquer dia) — ausência de linha pra um (modelo, dia) usa o meta_receita_id/meta numérica/nome global como fallback. */
export async function listMetasDiaModelo(): Promise<MetaDiaModelo[]> {
  const { data, error } = await supabase.from("dieta_refeicoes_modelo_meta_dia").select(META_DIA_MODELO_SELECT);
  if (error) throw error;
  return (data ?? []).map((l) => {
    const linha = l as Record<string, unknown>;
    const metaReceita = linha.meta_receita as { oculta: boolean } | null;
    const proteinaG = linha.meta_proteina_g as number | null;
    const gorduraG = linha.meta_gordura_g as number | null;
    const carboidratoG = linha.meta_carboidrato_g as number | null;
    return {
      modeloId: linha.modelo_id as string,
      diaSemana: linha.dia_semana as number,
      nome: linha.nome as string | null,
      metaReceitaId: linha.meta_receita_id as string | null,
      metaReceitaOculta: metaReceita?.oculta ?? false,
      metaCalorias: calcularMetaCalorias(proteinaG, gorduraG, carboidratoG),
      metaProteinaG: proteinaG,
      metaGorduraG: gorduraG,
      metaCarboidratoG: carboidratoG,
    };
  });
}

/** Renomeia a refeição só pra esses dias (Ondulatória) — o modelo global e outros grupos de dias
 * não são afetados. `nome` vazio/null volta a usar o nome global (remove o override, não grava
 * string vazia). */
export async function salvarNomeRefeicaoDias(modeloId: string, diasSemana: number[], nome: string): Promise<void> {
  const nomeTrim = nome.trim();
  const { error } = await supabase.from("dieta_refeicoes_modelo_meta_dia").upsert(
    diasSemana.map((diaSemana) => ({
      user_id: uid(),
      modelo_id: modeloId,
      dia_semana: diaSemana,
      nome: nomeTrim || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,modelo_id,dia_semana" },
  );
  if (error) throw error;
}

/** Vincula o mesmo prato como meta pra todos os dias informados de uma vez — um grupo de dias com a mesma meta de calorias sempre compartilha a mesma composição de refeições. */
export async function vincularMetaReceitaDias(modeloId: string, diasSemana: number[], receitaId: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo_meta_dia").upsert(
    diasSemana.map((diaSemana) => ({
      user_id: uid(),
      modelo_id: modeloId,
      dia_semana: diaSemana,
      meta_receita_id: receitaId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,modelo_id,dia_semana" },
  );
  if (error) throw error;
}

/** Meta numérica global (Fixa) de uma refeição — proteína/gordura/carboidrato em gramas; calorias é
 * sempre derivada (calcularMetaCalorias). Passar null nos 3 campos limpa a meta. */
export async function salvarMetaNumericaRefeicao(
  modeloId: string,
  proteinaG: number | null,
  gorduraG: number | null,
  carboidratoG: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("dieta_refeicoes_modelo")
    .update({ meta_proteina_g: proteinaG, meta_gordura_g: gorduraG, meta_carboidrato_g: carboidratoG })
    .eq("id", modeloId);
  if (error) throw error;
}

/** Mesma coisa, mas só pros dias informados (Ondulatória) — não mexe no meta_receita_id (lista de
 * alimentos) que já estiver salvo pra esses dias, upsert só grava as colunas passadas aqui. */
export async function salvarMetaNumericaRefeicaoDias(
  modeloId: string,
  diasSemana: number[],
  proteinaG: number | null,
  gorduraG: number | null,
  carboidratoG: number | null,
): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo_meta_dia").upsert(
    diasSemana.map((diaSemana) => ({
      user_id: uid(),
      modelo_id: modeloId,
      dia_semana: diaSemana,
      meta_proteina_g: proteinaG,
      meta_gordura_g: gorduraG,
      meta_carboidrato_g: carboidratoG,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,modelo_id,dia_semana" },
  );
  if (error) throw error;
}

export interface ContextoMetaCatalogo {
  /** Essa é a última refeição do catálogo (Fixa) ou do grupo de dias (Ondulatória) — sua meta é
   * sempre a sobra do dia (metaDiaria - disponivel de todas as outras), não editável na roda
   * tripla; só a lista de alimentos e o nome continuam editáveis. */
  ehUltima: boolean;
  /** Meta diária efetiva (Fixa: global; Ondulatória: a desse dia da semana). */
  metaDiaria: MetasDiarias;
  /** O que sobra pra essa refeição depois de descontar todas as OUTRAS (exceto a última/automática
   * e exceto ela mesma): se `ehUltima`, é a meta automática dela; senão, é o teto que ela pode
   * usar sem deixar a última com sobra negativa. */
  disponivel: { calorias: number; proteinaG: number; gorduraG: number; carboidratoG: number };
}

/** Resolve o contexto de "última refeição automática" pra roda tripla de uma refeição do
 * catálogo — usado por DietaRefeicaoMetaEditar pra saber se deve travar a edição manual (é a
 * última) e, em qualquer caso, até quanto essa refeição pode usar da meta diária sem faltar pra
 * última. `diasSemana` presente = grupo da Ondulatória (usa a ordem/meta desse dia); ausente =
 * catálogo Fixa (ordem/meta globais). */
export async function getContextoMetaCatalogo(modeloId: string, diasSemana?: number[]): Promise<ContextoMetaCatalogo> {
  const [modelos, metasDiaModelo, modelosPorDia] = await Promise.all([
    listRefeicoesModelo(),
    listMetasDiaModelo(),
    listRefeicoesModeloDia(),
  ]);

  type Macros = { calorias: number; proteinaG: number; gorduraG: number; carboidratoG: number };
  let siblings: RefeicaoModelo[];
  let metaDiaria: MetasDiarias;
  let macrosDe: (m: RefeicaoModelo) => Macros;

  if (diasSemana?.length) {
    const dia = diasSemana[0];
    const linhas = modelosPorDia.filter((r) => r.diaSemana === dia);
    const porId = new Map(modelos.map((m) => [m.id, m]));
    siblings = linhas.length
      ? linhas
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((r) => porId.get(r.modeloId))
          .filter((m): m is RefeicaoModelo => m != null)
      : modelos;
    metaDiaria = await getMetasDoDiaSemana(dia);
    const overridePorModelo = new Map(metasDiaModelo.filter((m) => m.diaSemana === dia).map((m) => [m.modeloId, m]));
    macrosDe = (m) => {
      const o = overridePorModelo.get(m.id);
      return {
        calorias: o?.metaCalorias ?? m.metaCalorias ?? 0,
        proteinaG: o?.metaProteinaG ?? m.metaProteinaG ?? 0,
        gorduraG: o?.metaGorduraG ?? m.metaGorduraG ?? 0,
        carboidratoG: o?.metaCarboidratoG ?? m.metaCarboidratoG ?? 0,
      };
    };
  } else {
    siblings = modelos;
    metaDiaria = await getMetasDiarias();
    macrosDe = (m) => ({
      calorias: m.metaCalorias ?? 0,
      proteinaG: m.metaProteinaG ?? 0,
      gorduraG: m.metaGorduraG ?? 0,
      carboidratoG: m.metaCarboidratoG ?? 0,
    });
  }

  const ultima = siblings[siblings.length - 1] ?? null;
  const ehUltima = ultima?.id === modeloId;
  const outras = siblings.filter((m) => m.id !== modeloId && m.id !== ultima?.id);
  const somaOutras = outras.reduce(
    (acc, m) => {
      const v = macrosDe(m);
      return {
        calorias: acc.calorias + v.calorias,
        proteinaG: acc.proteinaG + v.proteinaG,
        gorduraG: acc.gorduraG + v.gorduraG,
        carboidratoG: acc.carboidratoG + v.carboidratoG,
      };
    },
    { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
  );

  return {
    ehUltima,
    metaDiaria,
    disponivel: {
      calorias: metaDiaria.calorias - somaOutras.calorias,
      proteinaG: metaDiaria.proteinaG - somaOutras.proteinaG,
      gorduraG: metaDiaria.gorduraG - somaOutras.gorduraG,
      carboidratoG: metaDiaria.carboidratoG - somaOutras.carboidratoG,
    },
  };
}

/** Nome duplicado no catálogo quebra buscas por nome (getMetaRefeicaoPorNome e afins, usadas
 * pra achar a meta de uma refeição do dia) — sem esse checagem, criar/renomear pra um nome já
 * existente gera duas refeições indistinguíveis por nome no catálogo. */
/** Sem `diasSemana`: nome único em todo o catálogo (usado ao criar/renomear pro modo Fixa, ou uma
 * refeição nova que entra em TODOS os grupos da Ondulatória de uma vez). Com `diasSemana`: só
 * bloqueia se algum desses dias específicos já tem uma refeição com esse nome na lista efetiva
 * dele — permite reaproveitar o mesmo nome em dias/grupos diferentes (ex: "Lanche" em Lower1 e
 * outro "Lanche", independente, em Upper1). */
async function existeNomeRefeicaoModelo(nome: string, idParaIgnorar?: string, diasSemana?: number[]): Promise<boolean> {
  if (diasSemana?.length) {
    const [catalogo, modelosPorDia] = await Promise.all([listRefeicoesModelo(), listRefeicoesModeloDia()]);
    return diasSemana.some((dia) =>
      resolverCatalogoEfetivoDoDia(dia, catalogo, modelosPorDia).some(
        (m) => m.id !== idParaIgnorar && m.nome.toLowerCase() === nome.toLowerCase(),
      ),
    );
  }
  let query = supabase.from("dieta_refeicoes_modelo").select("id").eq("user_id", uid()).ilike("nome", nome).limit(1);
  if (idParaIgnorar) query = query.neq("id", idParaIgnorar);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function criarRefeicaoModelo(nome: string, diasSemana?: number[]): Promise<string> {
  const nomeTrim = nome.trim();
  if (await existeNomeRefeicaoModelo(nomeTrim, undefined, diasSemana)) {
    throw new Error(`Já existe uma refeição chamada "${nomeTrim}"${diasSemana?.length ? " nesse dia" : ""}.`);
  }
  const { count, error: erroCount } = await supabase
    .from("dieta_refeicoes_modelo")
    .select("id", { count: "exact", head: true });
  if (erroCount) throw erroCount;
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .insert({ user_id: uid(), nome: nomeTrim, ordem: count ?? 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function atualizarRefeicaoModelo(id: string, nome: string): Promise<void> {
  const nomeTrim = nome.trim();
  if (await existeNomeRefeicaoModelo(nomeTrim, id)) throw new Error(`Já existe uma refeição chamada "${nomeTrim}".`);
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ nome: nomeTrim }).eq("id", id);
  if (error) throw error;
}

/** Salva a nova ordem (arrastar-e-soltar) — ids já na ordem final desejada. */
export async function reordenarRefeicoesModelo(ids: string[]): Promise<void> {
  const resultados = await Promise.all(
    ids.map((id, i) => supabase.from("dieta_refeicoes_modelo").update({ ordem: i }).eq("id", id)),
  );
  const comErro = resultados.find((r) => r.error);
  if (comErro?.error) throw comErro.error;
}

export async function excluirRefeicaoModelo(id: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").delete().eq("id", id);
  if (error) throw error;
}

/** Remove essa refeição da lista de UM dia da semana específico (Ondulatória) — se esse dia ainda
 * não tinha uma lista própria (usava o catálogo global inteiro por padrão), grava uma lista
 * explícita agora, mesmo comportamento do botão "Excluir" já usado em Gerenciar Refeições. A
 * refeição em si (linha de dieta_refeicoes_modelo) não é apagada, só deixa de aparecer nesse dia —
 * outros dias que ainda a incluem não são afetados. */
export async function removerRefeicaoDoDia(diaSemana: number, modeloId: string): Promise<void> {
  const [catalogo, modelosPorDia] = await Promise.all([listRefeicoesModelo(), listRefeicoesModeloDia()]);
  const efetivo = resolverCatalogoEfetivoDoDia(diaSemana, catalogo, modelosPorDia);
  const novaLista = efetivo.filter((m) => m.id !== modeloId).map((m) => m.id);
  await definirRefeicoesDoDia(diaSemana, novaLista);
}

/** Quais refeições do catálogo aparecem num dia da semana específico (modo Ondulatória), e em que ordem. */
export interface RefeicaoModeloDia {
  modeloId: string;
  diaSemana: number;
  ordem: number;
}

/** Ausência de qualquer linha pra um dia = esse dia ainda usa o catálogo global inteiro, na ordem global. */
export async function listRefeicoesModeloDia(): Promise<RefeicaoModeloDia[]> {
  const { data, error } = await supabase.from("dieta_refeicoes_modelo_dia").select("modelo_id, dia_semana, ordem");
  if (error) throw error;
  return (data ?? []).map((l) => ({ modeloId: l.modelo_id as string, diaSemana: l.dia_semana as number, ordem: l.ordem as number }));
}

/**
 * Substitui de uma vez a lista inteira de refeições de um dia da semana — cobre adicionar,
 * remover e reordenar com uma única operação: quem chama sempre manda a lista final completa,
 * já na ordem desejada.
 */
export async function definirRefeicoesDoDia(diaSemana: number, modeloIds: string[]): Promise<void> {
  const { error: errDel } = await supabase
    .from("dieta_refeicoes_modelo_dia")
    .delete()
    .eq("user_id", uid())
    .eq("dia_semana", diaSemana);
  if (errDel) throw errDel;
  if (!modeloIds.length) return;
  const { error: errIns } = await supabase.from("dieta_refeicoes_modelo_dia").insert(
    modeloIds.map((modeloId, i) => ({
      user_id: uid(),
      modelo_id: modeloId,
      dia_semana: diaSemana,
      ordem: i,
      updated_at: new Date().toISOString(),
    })),
  );
  if (errIns) throw errIns;
}

// ---------------- Refeições do dia (dinâmicas, nomeadas pelo usuário) ----------------

export interface RefeicaoDia {
  id: string;
  nome: string;
  data: string;
  ordem: number;
}

/** Lista efetiva do catálogo pra esse dia da semana (Ondulatória): usa a lista/ordem específica
 * desse grupo de dias se houver (só as refeições incluídas nela); senão cai pro catálogo global
 * inteiro, na ordem global — mesma resolução de modelosDoDia em Gerenciar > Refeições. */
function resolverCatalogoEfetivoDoDia(
  diaSemana: number,
  catalogo: RefeicaoModelo[],
  modelosPorDia: RefeicaoModeloDia[],
): RefeicaoModelo[] {
  const linhasDoDia = modelosPorDia.filter((r) => r.diaSemana === diaSemana);
  if (!linhasDoDia.length) return catalogo;
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  return linhasDoDia
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((r) => porId.get(r.modeloId))
    .filter((m): m is RefeicaoModelo => !!m);
}

/** Ordem própria de cada refeição DENTRO DO DIA (coluna `ordem`, arrastar/setas na Home) — fixada
 * na criação (catálogo entra na posição do catálogo nesse momento; avulsa entra no fim) e livre
 * pra reordenar depois, sem nunca mexer no catálogo/padrão configurado. */
export async function getRefeicoesDoDia(data: string): Promise<RefeicaoDia[]> {
  const { data: linhas, error } = await supabase
    .from("dieta_refeicoes_dia")
    .select("id, nome, data, ordem")
    .eq("data", data)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return linhas ?? [];
}

/** Salva a nova ordem das refeições de um dia (arrastar/setas na Home) — só esse dia; nunca
 * reordena o catálogo/padrão configurado em Gerenciar Refeições. */
export async function reordenarRefeicoesDoDia(idsOrdenados: string[]): Promise<void> {
  const resultados = await Promise.all(
    idsOrdenados.map((id, i) => supabase.from("dieta_refeicoes_dia").update({ ordem: i }).eq("id", id)),
  );
  const comErro = resultados.find((r) => r.error);
  if (comErro?.error) throw comErro.error;
}

/** Chamadas concorrentes pra mesma data (ex: a Início e o Diário carregando ao mesmo tempo na
 * abertura do app) compartilham a MESMA promessa em vez de cada uma ler "existe alguma refeição?"
 * e decidir criar por conta própria — sem isso, as duas podiam ler "nenhuma ainda" ao mesmo tempo
 * (antes de qualquer uma ter inserido linha nenhuma) e cada uma criar o conjunto inteiro do
 * catálogo, duplicando toda refeição do dia. Só protege dentro da mesma aba/sessão do navegador
 * (não duas abas abertas ao mesmo tempo), mas é exatamente o caso que a Início (sempre montada)
 * cria em praticamente todo carregamento da tela de Dieta. */
const garantirRefeicoesPadraoEmAndamento = new Map<string, Promise<RefeicaoDia[]>>();

export async function garantirRefeicoesPadraoDoDia(data: string): Promise<RefeicaoDia[]> {
  const emAndamento = garantirRefeicoesPadraoEmAndamento.get(data);
  if (emAndamento) return emAndamento;
  const promessa = garantirRefeicoesPadraoDoDiaImpl(data).finally(() => {
    garantirRefeicoesPadraoEmAndamento.delete(data);
  });
  garantirRefeicoesPadraoEmAndamento.set(data, promessa);
  return promessa;
}

/** Se o dia ainda não tem nenhuma refeição, cria uma pra cada item do catálogo efetivo desse dia
 * da semana (respeitando a lista específica da Ondulatória, se houver) e retorna a lista já pronta.
 * Se já tiver refeições mas alguma foi criada antes de existir uma lista específica pro dia (ou de
 * uma mudança na Ondulatória, ou porque a refeição foi renomeada/excluída no catálogo depois) e não
 * pertence mais à lista efetiva de hoje, remove — só quando ainda está vazia, nunca uma que já tem
 * alimento lançado; nesse caso a linha órfã (nome antigo) fica, mas nunca é a que aparece pro
 * usuário editar/ver dados errados, porque `garantirRefeicoesPadraoDoDiaImpl` sempre recria a
 * versão atual do catálogo em seguida. */
async function garantirRefeicoesPadraoDoDiaImpl(data: string): Promise<RefeicaoDia[]> {
  const existentes = await getRefeicoesDoDia(data);
  const diaSemana = parseISODate(data).getDay();
  const [catalogo, modelosPorDia] = await Promise.all([listRefeicoesModelo(), listRefeicoesModeloDia()]);
  const catalogoEfetivo = resolverCatalogoEfetivoDoDia(diaSemana, catalogo, modelosPorDia);

  if (existentes.length) {
    const nomesEfetivos = new Set(catalogoEfetivo.map((m) => m.nome));
    // Antes só removia se o nome antigo ainda existisse EM ALGUM LUGAR do catálogo (outro dia,
    // outra Ondulatória) — uma refeição RENOMEADA no catálogo some de lá por completo, então essa
    // trava nunca pegava esse caso: a linha do dia ficava travada pra sempre com o nome/valores de
    // antes do renomear, nunca refletindo a edição feita em Gerenciar Refeições.
    const extras = existentes.filter((r) => !nomesEfetivos.has(r.nome));
    if (extras.length) {
      const itensHoje = await getDiarioDoDia(data);
      const idsComItens = new Set(itensHoje.map((i) => i.refeicaoId));
      const remover = extras.filter((r) => !idsComItens.has(r.id));
      if (remover.length) {
        await Promise.all(remover.map((r) => removerRefeicaoDia(r.id)));
        return getRefeicoesDoDia(data);
      }
    }
    return existentes;
  }

  if (!catalogoEfetivo.length) return existentes;
  await Promise.all(catalogoEfetivo.map((m, i) => criarRefeicaoDia(data, m.nome, i)));
  return getRefeicoesDoDia(data);
}

/** Lança de uma vez só, no diário do dia informado, os itens da lista de alimentos "padrão"
 * dessa refeição (efetiva pro dia da semana — override do dia se houver, senão a global). Ação
 * manual (botão "Refeição Padrão" no Diário): ao contrário do que fazia antes automaticamente,
 * lança mesmo que a refeição já tenha itens hoje — quem decide é o usuário. Retorna `false` sem
 * fazer nada se essa refeição não tiver uma lista de alimentos padrão configurada. */
export async function lancarReceitaPadrao(modeloId: string, diaSemana: number, refeicaoId: string, data: string): Promise<boolean> {
  const [modelos, metasDia] = await Promise.all([listRefeicoesModelo(), listMetasDiaModelo()]);
  const modelo = modelos.find((m) => m.id === modeloId);
  const override = metasDia.find((m) => m.modeloId === modeloId && m.diaSemana === diaSemana);
  const receitaId = override?.metaReceitaId ?? modelo?.metaReceitaId ?? null;
  if (!receitaId) return false;
  const receita = await getReceita(receitaId);
  if (!receita?.itens.length) return false;
  await adicionarReceitaAoDiario(receitaId, data, refeicaoId);
  return true;
}

/** Caminho inverso de lancarReceitaPadrao: substitui a lista de alimentos padrão dessa refeição
 * (efetiva pro dia da semana — override do dia se houver, senão a global; cria uma nova global se
 * ainda não houver nenhuma) pelos itens realmente lançados hoje. Ação manual (botão "Salvar
 * Refeição Padrão" no Diário, quando a refeição já tem algum alimento). */
export async function salvarComoReceitaPadrao(
  modeloId: string,
  nomeModelo: string,
  diaSemana: number,
  itens: { alimentoId: string; quantidade: number }[],
): Promise<void> {
  const [modelos, metasDia] = await Promise.all([listRefeicoesModelo(), listMetasDiaModelo()]);
  const modelo = modelos.find((m) => m.id === modeloId);
  const override = metasDia.find((m) => m.modeloId === modeloId && m.diaSemana === diaSemana);
  const receitaIdEfetiva = override?.metaReceitaId ?? modelo?.metaReceitaId ?? null;
  const receitaId = receitaIdEfetiva ?? (await garantirReceitaPrivadaRefeicao(modeloId, nomeModelo, null));
  const receitaAtual = await getReceita(receitaId);
  if (receitaAtual?.itens.length) {
    await Promise.all(receitaAtual.itens.map((item) => removerItemReceita(item.id)));
  }
  for (const item of itens) {
    await adicionarItemReceita(receitaId, item.alimentoId, item.quantidade);
  }
}

export async function getRefeicaoDia(id: string): Promise<RefeicaoDia | null> {
  const { data, error } = await supabase.from("dieta_refeicoes_dia").select("id, nome, data, ordem").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** `ordem` omitido = entra no fim da lista do dia (avulsa nova, "copiar para"); informado = entra
 * numa posição específica (refeições padrão do catálogo, na hora de montar um dia novo). */
export async function criarRefeicaoDia(data: string, nome: string, ordem?: number): Promise<string> {
  let ordemFinal = ordem;
  if (ordemFinal == null) {
    const { data: existentes, error: ordError } = await supabase
      .from("dieta_refeicoes_dia")
      .select("ordem")
      .eq("data", data)
      .order("ordem", { ascending: false })
      .limit(1);
    if (ordError) throw ordError;
    ordemFinal = existentes?.length ? existentes[0].ordem + 1 : 0;
  }
  const { data: linha, error } = await supabase
    .from("dieta_refeicoes_dia")
    .insert({ user_id: uid(), data, nome, ordem: ordemFinal })
    .select("id")
    .single();
  if (error) throw error;
  return linha.id;
}

export async function removerRefeicaoDia(id: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_dia").delete().eq("id", id);
  if (error) throw error;
}

/** Acha a refeição do usuário com esse nome nesse dia, ou cria uma nova — usada por "copiar para". */
export async function encontrarOuCriarRefeicaoDia(data: string, nome: string): Promise<string> {
  const { data: existente, error } = await supabase
    .from("dieta_refeicoes_dia")
    .select("id")
    .eq("data", data)
    .eq("nome", nome)
    .maybeSingle();
  if (error) throw error;
  if (existente) return existente.id;
  return criarRefeicaoDia(data, nome);
}

/** Guarda a composição atual da refeição como uma Receita reutilizável e buscável (mesmo nome da refeição). */
export async function salvarRefeicaoComoReceita(id: string): Promise<void> {
  const refeicao = await getRefeicaoDia(id);
  if (!refeicao) throw new Error("Refeição não encontrada.");
  const itens = await getItensDaRefeicao(id);
  if (!itens.length) throw new Error("Adicione ao menos um alimento antes de salvar.");
  await criarReceita(
    refeicao.nome,
    itens.map((it) => ({ alimentoId: it.alimentoId, quantidade: it.quantidade })),
  );
}

// ---------------- Diário (itens logados por refeição) ----------------

export interface ItemDiario {
  id: string;
  alimentoId: string;
  nome: string;
  refeicaoId: string;
  quantidade: number;
  unidade: string;
  calorias: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number;
  gorduraSaturadaG: number;
}

function mapItemDiario(l: Record<string, unknown>): ItemDiario {
  return {
    id: l.id as string,
    alimentoId: l.alimento_id as string,
    nome: ((l.alimento as { nome: string } | null)?.nome) ?? "",
    refeicaoId: l.refeicao_id as string,
    quantidade: l.quantidade as number,
    unidade: l.unidade as string,
    calorias: l.calorias as number,
    proteinaG: l.proteina_g as number,
    gorduraG: l.gordura_g as number,
    carboidratoG: l.carboidrato_g as number,
    fibraG: (l.fibra_g as number | null) ?? 0,
    gorduraSaturadaG: (l.gordura_saturada_g as number | null) ?? 0,
  };
}

const ITEM_DIARIO_SELECT =
  "id, alimento_id, refeicao_id, quantidade, unidade, calorias, proteina_g, gordura_g, carboidrato_g, fibra_g, gordura_saturada_g, created_at, alimento:alimentos(nome)";

/** Todos os itens logados num dia, de todas as refeições — usado pra montar a prévia dos cards na tela principal. */
export async function getDiarioDoDia(data: string): Promise<ItemDiario[]> {
  const { data: linhas, error } = await supabase
    .from("diario_alimentos")
    .select(ITEM_DIARIO_SELECT)
    .eq("data", data)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (linhas ?? []).map((l) => mapItemDiario(l as Record<string, unknown>));
}

export async function getItemDiario(id: string): Promise<ItemDiario | null> {
  const { data, error } = await supabase.from("diario_alimentos").select(ITEM_DIARIO_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapItemDiario(data as Record<string, unknown>) : null;
}

export async function getItensDaRefeicao(refeicaoId: string): Promise<ItemDiario[]> {
  const { data: linhas, error } = await supabase
    .from("diario_alimentos")
    .select(ITEM_DIARIO_SELECT)
    .eq("refeicao_id", refeicaoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (linhas ?? []).map((l) => mapItemDiario(l as Record<string, unknown>));
}

export async function adicionarItemDiario(input: {
  alimento: Alimento;
  data: string;
  refeicaoId: string;
  quantidade: number;
}): Promise<void> {
  const fator = input.quantidade / input.alimento.porcaoPadraoQtd;
  const { error } = await supabase.from("diario_alimentos").insert({
    user_id: uid(),
    alimento_id: input.alimento.id,
    data: input.data,
    refeicao_id: input.refeicaoId,
    quantidade: input.quantidade,
    unidade: input.alimento.porcaoPadraoUnidade,
    calorias: round1(input.alimento.caloriasPorPorcao * fator),
    proteina_g: round1(input.alimento.proteinaG * fator),
    gordura_g: round1(input.alimento.gorduraG * fator),
    carboidrato_g: round1(input.alimento.carboidratoG * fator),
    fibra_g: round1((input.alimento.fibraG ?? 0) * fator),
    gordura_saturada_g: round1((input.alimento.gorduraSaturadaG ?? 0) * fator),
  });
  if (error) throw error;
}

/** `alimento` vem sempre com a nutrição ATUAL do catálogo, não a de quando o item foi lançado —
 * recalcular calorias/macros a partir dela só faz sentido quando a quantidade de fato mudou (é a
 * única forma de escalar sem guardar um "valor por grama" separado). Editar só a refeição/dia,
 * mantendo a mesma quantidade, preserva os valores já gravados — senão, corrigir a nutrição de um
 * alimento no catálogo reescrevia silenciosamente o histórico de todo item já logado dele ao ser
 * apenas reaberto e salvo de novo, mesmo sem alterar quantidade nenhuma. */
export async function atualizarItemDiario(
  id: string,
  alimento: Alimento,
  quantidade: number,
  refeicaoId: string,
  quantidadeMudou: boolean,
): Promise<void> {
  const update: Record<string, unknown> = { quantidade, refeicao_id: refeicaoId };
  if (quantidadeMudou) {
    const fator = quantidade / alimento.porcaoPadraoQtd;
    update.unidade = alimento.porcaoPadraoUnidade;
    update.calorias = round1(alimento.caloriasPorPorcao * fator);
    update.proteina_g = round1(alimento.proteinaG * fator);
    update.gordura_g = round1(alimento.gorduraG * fator);
    update.carboidrato_g = round1(alimento.carboidratoG * fator);
    update.fibra_g = round1((alimento.fibraG ?? 0) * fator);
    update.gordura_saturada_g = round1((alimento.gorduraSaturadaG ?? 0) * fator);
  }
  const { error } = await supabase.from("diario_alimentos").update(update).eq("id", id);
  if (error) throw error;
}

/** Move um item já lançado pra outra refeição do mesmo dia, sem mexer em quantidade/macros. */
export async function moverItemDiario(id: string, novaRefeicaoId: string): Promise<void> {
  const { error } = await supabase.from("diario_alimentos").update({ refeicao_id: novaRefeicaoId }).eq("id", id);
  if (error) throw error;
}

export async function removerItemDiario(id: string): Promise<void> {
  const { error } = await supabase.from("diario_alimentos").delete().eq("id", id);
  if (error) throw error;
}

/** Remove todos os itens já lançados nessa refeição — usado por "Substituir refeição" ao puxar a referência padrão. */
export async function removerItensDaRefeicao(refeicaoId: string): Promise<void> {
  const { error } = await supabase.from("diario_alimentos").delete().eq("refeicao_id", refeicaoId);
  if (error) throw error;
}

// ---------------- Metas diárias ----------------

/** Metas diárias (calorias + macros em gramas). Macros vêm de g/kg × peso de referência do perfil. */
export interface MetasDiarias {
  calorias: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
}

/** Resolve as gramas de proteína/gordura respeitando "manter g/kg fixo" (Parametrização) de cada
 * uma: fixo = usa o peso médio ATUAL (a proporção fica parada, as gramas acompanham o peso
 * sozinhas); não fixo (padrão) = usa o peso da última edição salva (perfil.pesoAtual — as gramas
 * ficam paradas, é a proporção que acompanha o peso, só como referência visual). */
async function resolverProteinaGordura(perfil: PerfilDietaEditavel): Promise<{ proteinaG: number; gorduraG: number }> {
  const pesoMedio = perfil.proteinaGkgFixo || perfil.gorduraGkgFixo ? await getPesoMedioAtual() : null;
  const pesoProteina = perfil.proteinaGkgFixo ? (pesoMedio ?? perfil.pesoAtual) : perfil.pesoAtual;
  const pesoGordura = perfil.gorduraGkgFixo ? (pesoMedio ?? perfil.pesoAtual) : perfil.pesoAtual;
  return {
    proteinaG: Math.round(perfil.proteinaGKg * pesoProteina),
    gorduraG: Math.round(perfil.gorduraGKg * pesoGordura),
  };
}

/** Calorias NUNCA mudam sozinhas (só quando editadas e salvas em Gerenciar) — o carboidrato é
 * sempre a "válvula de ajuste" que fecha a meta de calorias com a proteína/gordura vigentes,
 * nunca uma proporção própria independente. */
export async function getMetasDiarias(): Promise<MetasDiarias> {
  const perfil = await getPerfilDietaEditavel();
  const { proteinaG, gorduraG } = await resolverProteinaGordura(perfil);
  return {
    calorias: perfil.metaCalorias,
    proteinaG,
    gorduraG,
    carboidratoG: carboidratoGDoDia(perfil.metaCalorias, proteinaG, gorduraG),
  };
}

// ---------------- Parâmetros (min/máx editáveis em Parametrização, por peso ou por calorias do dia) ----------------

export interface DefinicaoParametro {
  chave: string;
  categoria: string;
  label: string;
  unidade: string;
  /** peso: valor é por kg de peso corporal. calorias: valor é % das calorias do dia (convertido
   * pra gramas via kcal/g do nutriente) — ex: gordura saturada, cuja diretriz é uma fração do
   * total calórico. calorias_por_mil: valor é gramas a cada 1000 kcal, direto — ex: fibras, cuja
   * diretriz nutricional já vem nessa proporção (não faz sentido converter por kcal/g). */
  base: "peso" | "calorias" | "calorias_por_mil";
  /** kcal por grama do nutriente — só usado quando base é "calorias", pra converter % em gramas. */
  kcalPorGrama?: number;
  /** Parâmetro só de piso (ex: calorias mínimas) — sem campo de máximo na tela. */
  somenteMinimo: boolean;
  /** Parâmetro só de teto (ex: gordura saturada) — sem campo de mínimo na tela, mínimo fica travado em 0. */
  somenteMaximo?: boolean;
  /** Um valor só ("Meta"), sem distinção de mínimo/máximo — usado nos parâmetros de Metas de
   * Consumo. min e max são gravados iguais (mesmo valor), pra quem já lê só um dos dois
   * (ex: gordura_saturada.max) continuar funcionando sem mudança. */
  metaUnica?: boolean;
  /** Pra metaUnica: qual campo (min ou max) guarda o valor mostrado/editado — default "min".
   * gordura_saturada usa "max" porque é onde o valor já era gravado (somenteMaximo). */
  campoMeta?: "min" | "max";
}

export const DEFINICOES_PARAMETROS: DefinicaoParametro[] = [
  { chave: "calorias", categoria: "Calorias", label: "Calorias mínimas", unidade: "kcal/kg", base: "peso", somenteMinimo: true },
  { chave: "proteina", categoria: "Macronutrientes", label: "Proteína", unidade: "g/kg", base: "peso", somenteMinimo: false },
  { chave: "gordura", categoria: "Macronutrientes", label: "Gordura", unidade: "g/kg", base: "peso", somenteMinimo: false },
  { chave: "carboidrato", categoria: "Macronutrientes", label: "Carboidrato", unidade: "g/kg", base: "peso", somenteMinimo: false },
  {
    chave: "fibras",
    categoria: "Metas de Consumo",
    label: "Fibras",
    unidade: "g/1000kcal",
    base: "calorias_por_mil",
    somenteMinimo: false,
    metaUnica: true,
  },
  {
    chave: "gordura_saturada",
    categoria: "Metas de Consumo",
    label: "Gordura Saturada",
    unidade: "%",
    base: "calorias",
    kcalPorGrama: 9,
    somenteMinimo: false,
    somenteMaximo: true,
    metaUnica: true,
    campoMeta: "max",
  },
  { chave: "agua", categoria: "Metas de Consumo", label: "Água", unidade: "L/kg", base: "peso", somenteMinimo: false, metaUnica: true },
];

export interface LimiteParametro {
  min: number;
  max: number;
}

/**
 * Valores de hoje, usados como padrão pra qualquer chave sem linha salva ainda. Fibras (14g a
 * cada 1000 kcal, diretriz nutricional direta) e Gordura Saturada (teto de 10% das calorias do
 * dia, diretriz comum de OMS/AHA) são baseadas nas calorias do dia; os demais são por kg de peso.
 */
export const PARAMETROS_PADRAO: Record<string, LimiteParametro> = {
  calorias: { min: 20, max: 20 },
  proteina: { min: 1, max: 3 },
  gordura: { min: 0.5, max: 1.5 },
  carboidrato: { min: 1, max: 10 },
  fibras: { min: 14, max: 14 },
  gordura_saturada: { min: 0, max: 10 },
  agua: { min: 0.05, max: 0.05 },
};

/** Converte um valor de parâmetro (g/kg, L/kg ou % das calorias, conforme `def.base`) em gramas (ou litros, pra água). */
export function gramasDoParametro(def: DefinicaoParametro, valor: number, pesoAtual: number, caloriasCalc: number): number {
  if (def.base === "peso") return valor * pesoAtual;
  if (def.base === "calorias_por_mil") return (valor * caloriasCalc) / 1000;
  return ((valor / 100) * caloriasCalc) / (def.kcalPorGrama ?? 4);
}

export async function getParametros(): Promise<Map<string, LimiteParametro>> {
  const { data, error } = await supabase.from("dieta_parametros").select("chave, min_por_kg, max_por_kg");
  if (error) throw error;
  const mapa = new Map(Object.entries(PARAMETROS_PADRAO).map(([chave, v]) => [chave, { ...v }]));
  for (const l of data ?? []) mapa.set(l.chave as string, { min: l.min_por_kg as number, max: l.max_por_kg as number });
  return mapa;
}

export async function salvarParametro(chave: string, min: number, max: number): Promise<void> {
  const { error } = await supabase.from("dieta_parametros").upsert(
    { user_id: uid(), chave, min_por_kg: min, max_por_kg: max, updated_at: new Date().toISOString() },
    { onConflict: "user_id,chave" },
  );
  if (error) throw error;
}

/** Perfil de metas editável na tela de Gerenciar (aba Calorias) — as GRAMAS são o valor fixo (só
 * mudam quando o usuário edita e salva de novo); proteinaGKg/gorduraGKg/carboidratoGKg gravam a
 * proporção resultante daquela edição (gramas ÷ peso da época), reconstruída sempre com
 * `pesoAtual` (também gravado junto) pra reproduzir as MESMAS gramas depois, não um valor novo. */
export interface PerfilDietaEditavel {
  pesoAtual: number;
  metaCalorias: number;
  proteinaGKg: number;
  gorduraGKg: number;
  carboidratoGKg: number;
  /** "Manter g/kg fixo" (Parametrização) — inverte a regra padrão só pra esse macro: em vez das
   * gramas ficarem fixas, é a proporção g/kg que fica fixa, e as gramas acompanham o peso atual
   * sozinhas. O carboidrato nunca tem esse campo — ele é sempre recalculado pra fechar a meta de
   * calorias (que nunca muda sozinha), absorvendo o efeito desse ajuste. */
  proteinaGkgFixo: boolean;
  gorduraGkgFixo: boolean;
  /** Última vez que meta_calorias mudou de valor de fato (não conta editar só macros mantendo o
   * mesmo total) — usado pra dar carência ao status de aderência à dieta (getStatusAdesaoDieta).
   * null = nunca rastreado (perfil de antes dessa coluna existir, ou nunca mexeu nas calorias). */
  caloriasAjustadasEm: string | null;
}

const PERFIL_PADRAO: PerfilDietaEditavel = {
  pesoAtual: 76,
  metaCalorias: 2000,
  proteinaGKg: 2.17,
  gorduraGKg: 0.66,
  carboidratoGKg: 2.93,
  proteinaGkgFixo: false,
  gorduraGkgFixo: false,
  caloriasAjustadasEm: null,
};

export async function getPerfilDietaEditavel(): Promise<PerfilDietaEditavel> {
  const { data, error } = await supabase
    .from("dieta_perfil")
    .select(
      "peso_atual, meta_calorias, proteina_g_kg, gordura_g_kg, carboidrato_g_kg, proteina_gkg_fixo, gordura_gkg_fixo, calorias_ajustadas_em",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return PERFIL_PADRAO;
  return {
    pesoAtual: data.peso_atual,
    metaCalorias: data.meta_calorias,
    proteinaGKg: data.proteina_g_kg,
    gorduraGKg: data.gordura_g_kg,
    carboidratoGKg: data.carboidrato_g_kg,
    proteinaGkgFixo: data.proteina_gkg_fixo ?? false,
    gorduraGkgFixo: data.gordura_gkg_fixo ?? false,
    caloriasAjustadasEm: data.calorias_ajustadas_em,
  };
}

/** Grava o perfil de metas — se `metaCalorias` mudou de valor de fato (±1 kcal de tolerância)
 * em relação ao que já estava gravado, marca `calorias_ajustadas_em` agora; senão preserva o
 * valor anterior. Cobre o único ponto que grava a meta calórica (aba Calorias do Gerenciar,
 * um só botão "Salvar" pra calorias+macros juntos) sem precisar que quem chama saiba se o
 * usuário editou calorias ou só rebalanceou macros — o que importa é se o alvo calórico final
 * mudou, não qual campo foi digitado. */
export async function salvarPerfilDieta(input: {
  pesoAtual: number;
  metaCalorias: number;
  proteinaGKg: number;
  gorduraGKg: number;
  carboidratoGKg: number;
  proteinaGkgFixo: boolean;
  gorduraGkgFixo: boolean;
  fibrasG: number;
  aguaL: number;
}): Promise<void> {
  const userId = uid();
  const { data: atual } = await supabase
    .from("dieta_perfil")
    .select("meta_calorias, calorias_ajustadas_em")
    .eq("user_id", userId)
    .maybeSingle();
  const mudouCalorias = atual == null || Math.abs(atual.meta_calorias - input.metaCalorias) > 1;
  const caloriasAjustadasEm = mudouCalorias ? new Date().toISOString() : (atual?.calorias_ajustadas_em ?? null);

  const { error } = await supabase.from("dieta_perfil").upsert(
    {
      user_id: userId,
      peso_atual: input.pesoAtual,
      meta_calorias: input.metaCalorias,
      proteina_g_kg: input.proteinaGKg,
      gordura_g_kg: input.gorduraGKg,
      carboidrato_g_kg: input.carboidratoGKg,
      proteina_gkg_fixo: input.proteinaGkgFixo,
      gordura_gkg_fixo: input.gorduraGkgFixo,
      fibras_g: input.fibrasG,
      agua_l: input.aguaL,
      calorias_ajustadas_em: caloriasAjustadasEm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/** Força a janela de carência do status de aderência à dieta a recomeçar agora, sem alterar
 * meta_calorias — escape-hatch pra ajustes que a detecção automática de salvarPerfilDieta não
 * cobre (ex: redistribuição de calorias por dia na Ondulatória, que grava em dieta_calorias_dia,
 * não em meta_calorias). */
export async function reiniciarCalibracaoDieta(): Promise<void> {
  const { error } = await supabase
    .from("dieta_perfil")
    .update({ calorias_ajustadas_em: new Date().toISOString() })
    .eq("user_id", uid());
  if (error) throw error;
}

/** "Manter g/kg fixo" (Parametrização) — editado numa tela separada de Gerenciar > Calorias, que
 * é quem grava o resto do perfil; atualiza só esse campo pra não precisar reenviar peso/macros/
 * calorias que essa tela nem carrega. */
export async function salvarGkgFixo(macro: "proteina" | "gordura", fixo: boolean): Promise<void> {
  const coluna = macro === "proteina" ? "proteina_gkg_fixo" : "gordura_gkg_fixo";
  const { error } = await supabase
    .from("dieta_perfil")
    .update({ [coluna]: fixo })
    .eq("user_id", uid());
  if (error) throw error;
}

export type TipoDieta = "cutting" | "manutencao" | "bulking";

/** Classificação da dieta (aba Calorias, tela de Parâmetros) — guardada junto do resto do
 * perfil (dieta_perfil), mas lida/salva à parte pra quem só precisa desse campo não ter que
 * carregar o PerfilDietaEditavel inteiro. */
export async function getTipoDieta(): Promise<TipoDieta> {
  const { data, error } = await supabase.from("dieta_perfil").select("tipo_dieta").maybeSingle();
  if (error) throw error;
  return (data?.tipo_dieta as TipoDieta | null) ?? "manutencao";
}

export async function salvarTipoDieta(tipo: TipoDieta): Promise<void> {
  const { error } = await supabase
    .from("dieta_perfil")
    .upsert({ user_id: uid(), tipo_dieta: tipo, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/** A que a barra dos cards de refeição (home e detalhe da refeição) corresponde como "100%": a
 * meta daquela refeição (redistribuída) ou a meta diária inteira. */
export type BaseReferenciaRefeicao = "refeicao" | "diaria";

/** Formato do valor mostrado nos cards de refeição da home — cada opção já define sozinha contra
 * qual meta comparar (só o percentual tem variante refeição/diária; resto/acima e a meta em
 * gramas são sempre contra a meta DAQUELA refeição, não têm variante diária). */
export type FormatoValorRefeicao = "percentual_refeicao" | "percentual_diario" | "restante_acima" | "meta_refeicao";

export interface PreferenciasRefeicoesHome {
  barraBase: BaseReferenciaRefeicao;
  valoresFormato: FormatoValorRefeicao;
}

const PREFERENCIAS_REFEICOES_PADRAO: PreferenciasRefeicoesHome = { barraBase: "refeicao", valoresFormato: "restante_acima" };

export async function getPreferenciasRefeicoesHome(): Promise<PreferenciasRefeicoesHome> {
  const { data, error } = await supabase.from("dieta_perfil").select("refeicoes_barra_base, refeicoes_valores_base").maybeSingle();
  if (error) throw error;
  if (!data) return PREFERENCIAS_REFEICOES_PADRAO;
  return {
    barraBase: (data.refeicoes_barra_base as BaseReferenciaRefeicao | null) ?? "refeicao",
    valoresFormato: (data.refeicoes_valores_base as FormatoValorRefeicao | null) ?? "restante_acima",
  };
}

export async function salvarPreferenciasRefeicoesHome(prefs: PreferenciasRefeicoesHome): Promise<void> {
  const { error } = await supabase.from("dieta_perfil").upsert(
    {
      user_id: uid(),
      refeicoes_barra_base: prefs.barraBase,
      refeicoes_valores_base: prefs.valoresFormato,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// ---------------- Distribuição semanal de calorias (Fixa / Ondulatória) ----------------

export interface CaloriasPorDia {
  /** 0-6, 0 = domingo (mesma convenção de Date.getDay() usada em Treino). */
  diaSemana: number;
  calorias: number;
  manual: boolean;
}

/**
 * Calcula os 7 dias a partir dos dias travados manualmente: o que sobra da meta semanal
 * (metaCalorias × 7 − soma dos manuais) é dividido em partes iguais pelos dias automáticos.
 * Se todos os 7 dias já estiverem manuais (ex: blocos nomeados cobrindo a semana inteira), não
 * sobra nenhum automático — só valida o mínimo de cada um e devolve os valores manuais direto.
 * Nenhum valor (manual ou automático) pode ficar abaixo do piso mínimo.
 */
export function resolverDistribuicao(metaCalorias: number, manuais: Map<number, number>, minimo: number): CaloriasPorDia[] {
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6];
  const diasAuto = todosOsDias.filter((d) => !manuais.has(d));
  for (const [dia, valor] of manuais) {
    if (valor < minimo) {
      throw new Error(
        `${DIAS_SEMANA_ABREV[dia]} ficaria com ${Math.round(valor)} kcal, abaixo do mínimo de ${Math.round(minimo)} kcal.`,
      );
    }
  }
  if (diasAuto.length === 0) {
    return todosOsDias.map((dia) => ({ diaSemana: dia, calorias: manuais.get(dia)!, manual: true }));
  }
  const somaManual = [...manuais.values()].reduce((acc, v) => acc + v, 0);
  const restante = metaCalorias * 7 - somaManual;
  const valorAuto = restante / diasAuto.length;
  if (valorAuto < minimo) {
    throw new Error(
      `Isso deixaria os dias automáticos com ${Math.round(valorAuto)} kcal, abaixo do mínimo de ${Math.round(minimo)} kcal.`,
    );
  }
  return todosOsDias.map((dia) =>
    manuais.has(dia)
      ? { diaSemana: dia, calorias: manuais.get(dia)!, manual: true }
      : { diaSemana: dia, calorias: valorAuto, manual: false },
  );
}

export interface DistribuicaoValorDia {
  diaSemana: number;
  valor: number;
  manual: boolean;
}

/**
 * Mesma ideia de resolverDistribuicao, generalizada pra qualquer valor por dia (proteína,
 * gordura em gramas): dias manuais usam o valor travado; dias automáticos dividem igualmente
 * o que sobra da meta semanal (metaPorDia × 7 − soma dos manuais). Não valida mínimo/máximo —
 * quem chama decide se avisa ou bloqueia (nunca deixa a conta sem solução).
 */
export function distribuirValorPorDia(metaPorDia: number, manuais: Map<number, number>): DistribuicaoValorDia[] {
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6];
  const diasAuto = todosOsDias.filter((d) => !manuais.has(d));
  const somaManual = [...manuais.values()].reduce((acc, v) => acc + v, 0);
  const restante = metaPorDia * 7 - somaManual;
  const valorAuto = diasAuto.length > 0 ? Math.max(0, restante / diasAuto.length) : 0;
  return todosOsDias.map((dia) =>
    manuais.has(dia) ? { diaSemana: dia, valor: manuais.get(dia)!, manual: true } : { diaSemana: dia, valor: valorAuto, manual: false },
  );
}

export async function getModoCalorias(): Promise<"fixa" | "ondulatoria"> {
  const { data, error } = await supabase.from("dieta_perfil").select("modo_calorias").maybeSingle();
  if (error) throw error;
  return data?.modo_calorias === "ondulatoria" ? "ondulatoria" : "fixa";
}

/** Composição de um dia travado manualmente na Distribuição Semanal. */
export interface CaloriasDiaManual {
  calorias: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  /** Nome do bloco de dias ao qual esse dia pertence (ex: "Treino A") — null enquanto não foi nomeado. */
  nomeBloco: string | null;
}

export async function getCaloriasDiaManuais(): Promise<Map<number, CaloriasDiaManual>> {
  const { data, error } = await supabase
    .from("dieta_calorias_dia")
    .select("dia_semana, calorias, proteina_g, gordura_g, carboidrato_g, nome_bloco");
  if (error) throw error;
  return new Map(
    (data ?? []).map((l) => [
      l.dia_semana as number,
      {
        calorias: l.calorias as number,
        proteinaG: (l.proteina_g as number | null) ?? 0,
        gorduraG: (l.gordura_g as number | null) ?? 0,
        carboidratoG: (l.carboidrato_g as number | null) ?? 0,
        nomeBloco: (l.nome_bloco as string | null) ?? null,
      },
    ]),
  );
}

/**
 * Trava `dias` na composição de macros informada (calorias calculadas a partir dela) e
 * persiste — `metaCalorias`/`minimo`/`manuaisAtuais` já carregados pelo chamador (evita
 * reconsultar peso/perfil/metas de novo a cada ajuste). Valida com `resolverDistribuicao`
 * antes de gravar (lança se a combinação não fechar a conta).
 */
export async function definirCaloriasDias(
  dias: number[],
  proteinaG: number,
  gorduraG: number,
  carboidratoG: number,
  metaCalorias: number,
  minimo: number,
  manuaisAtuais: Map<number, number>,
  nomeBloco: string | null,
): Promise<void> {
  const calorias = Math.round(4 * proteinaG + 9 * gorduraG + 4 * carboidratoG);
  const manuais = new Map(manuaisAtuais);
  for (const dia of dias) manuais.set(dia, calorias);
  resolverDistribuicao(metaCalorias, manuais, minimo);

  const { error } = await supabase.from("dieta_calorias_dia").upsert(
    dias.map((dia) => ({
      user_id: uid(),
      dia_semana: dia,
      calorias,
      proteina_g: proteinaG,
      gordura_g: gorduraG,
      carboidrato_g: carboidratoG,
      nome_bloco: nomeBloco,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,dia_semana" },
  );
  if (error) throw error;
}

export async function removerCaloriasDia(diaSemana: number): Promise<void> {
  const { error } = await supabase.from("dieta_calorias_dia").delete().eq("user_id", uid()).eq("dia_semana", diaSemana);
  if (error) throw error;
}

export async function definirModoCalorias(modo: "fixa" | "ondulatoria"): Promise<void> {
  const { error } = await supabase
    .from("dieta_perfil")
    .upsert({ user_id: uid(), modo_calorias: modo, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Zera a meta numérica (macros) de TODAS as refeições do catálogo — usado ao trocar pra modo
 * Fixa: nesse modo a lista vira uma só (todo o catálogo junto, sem filtro por dia), então metas
 * pensadas pra dias/grupos diferentes da Ondulatória se somariam incorretamente se mantidas. Zera
 * tanto a meta global quanto os overrides por dia (senão eles "voltam" com valores antigos se o
 * usuário retornar pra Ondulatória depois). A lista de alimentos (meta_receita_id) não é tocada. */
export async function zerarMetasCatalogo(): Promise<void> {
  const [global, porDia] = await Promise.all([
    supabase
      .from("dieta_refeicoes_modelo")
      .update({ meta_proteina_g: null, meta_gordura_g: null, meta_carboidrato_g: null })
      .eq("user_id", uid()),
    supabase
      .from("dieta_refeicoes_modelo_meta_dia")
      .update({ meta_proteina_g: null, meta_gordura_g: null, meta_carboidrato_g: null })
      .eq("user_id", uid()),
  ]);
  if (global.error) throw global.error;
  if (porDia.error) throw porDia.error;
}

/** Carboidrato do dia: mesma fórmula usada pra fechar a meta de calorias, só trocando a meta pela calorias daquele dia. */
export function carboidratoGDoDia(caloriasDoDia: number, proteinaG: number, gorduraG: number): number {
  return Math.max(0, Math.round((caloriasDoDia - 4 * proteinaG - 9 * gorduraG) / 4));
}

// ---------------- Override semanal da Ondulatória (reposicionar as metas de calorias só nessa semana) ----------------

export interface DietaOverrideDia {
  diaSemana: number;
  calorias: number;
  gorduraG: number;
}

/** Overrides de uma semana (identificada pela segunda-feira dela, mesma convenção de
 * segundaDaSemana em treinoApi.ts). Vazio = a semana segue a Ondulatória normal configurada em
 * Parametrização. */
export async function listOverrideSemanaDieta(semanaInicio: string): Promise<DietaOverrideDia[]> {
  const { data, error } = await supabase
    .from("dieta_semana_override")
    .select("dia_semana, calorias, gordura_g")
    .eq("user_id", uid())
    .eq("semana_inicio", semanaInicio);
  if (error) throw error;
  return (data ?? []).map((l) => ({ diaSemana: l.dia_semana as number, calorias: l.calorias as number, gorduraG: l.gordura_g as number }));
}

/** Substitui o override de UMA semana pelos 7 dias informados (reposiciona os mesmos valores de
 * calorias/gordura entre os dias, não inventa valores novos). Lista vazia volta a semana pra
 * Ondulatória normal. */
export async function salvarOverrideSemanaDieta(semanaInicio: string, dias: DietaOverrideDia[]): Promise<void> {
  const usuario = uid();
  const { error: errDel } = await supabase
    .from("dieta_semana_override")
    .delete()
    .eq("user_id", usuario)
    .eq("semana_inicio", semanaInicio);
  if (errDel) throw errDel;
  if (!dias.length) return;
  const { error: errIns } = await supabase.from("dieta_semana_override").insert(
    dias.map((d) => ({ user_id: usuario, semana_inicio: semanaInicio, dia_semana: d.diaSemana, calorias: d.calorias, gordura_g: d.gorduraG })),
  );
  if (errIns) throw errIns;
}

/** Os 7 dias da semana com o perfil (calorias/gordura) que a Ondulatória normal dá hoje pra cada
 * um — ponto de partida pra trocar entre 2 dias sem inventar valor novo. */
export async function perfilSemanalOndulatoria(): Promise<DietaOverrideDia[]> {
  const dias = await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(async (diaSemana) => {
      const meta = await getMetasDoDiaSemana(diaSemana);
      return { diaSemana, calorias: meta.calorias, gorduraG: meta.gorduraG };
    }),
  );
  return dias;
}

/** Troca a meta de calorias/gordura entre 2 dias da semana ATUAL — usado quando uma rotina muda de
 * dia (TreinoMudarDiaSheet) e o usuário confirma que quer trocar a meta de calorias junto. Parte
 * do override já salvo dessa semana (se houver) ou do perfil normal da Ondulatória, troca só os 2
 * dias pedidos e grava — os outros 5 dias continuam exatamente como estavam. */
export async function trocarCaloriasEntreDias(data: string, diaA: number, diaB: number): Promise<void> {
  const semanaInicio = segundaDaSemana(data);
  const existentes = await listOverrideSemanaDieta(semanaInicio);
  const base = existentes.length ? existentes : await perfilSemanalOndulatoria();
  const a = base.find((d) => d.diaSemana === diaA);
  const b = base.find((d) => d.diaSemana === diaB);
  if (!a || !b) return;
  const novaLista = base.map((d) => {
    if (d.diaSemana === diaA) return { ...d, calorias: b.calorias, gorduraG: b.gorduraG };
    if (d.diaSemana === diaB) return { ...d, calorias: a.calorias, gorduraG: a.gorduraG };
    return d;
  });
  await salvarOverrideSemanaDieta(semanaInicio, novaLista);
  marcarDietaDesatualizada();
}

/**
 * Meta de macros/calorias efetiva pra uma data específica — respeita o modo Fixa/Ondulatória.
 * Em Fixa, é a mesma meta global de sempre (getMetasDiarias). Em Ondulatória, primeiro olha se a
 * SEMANA dessa data tem um override salvo (ver salvarOverrideSemanaDieta) — se tiver, usa o
 * perfil (calorias/gordura) reposicionado ali pra esse dia da semana, só valendo pra essa semana.
 * Sem override, resolve o dia da semana dessa data pela Ondulatória normal: proteína é sempre o
 * valor global atual (constante, nunca varia por dia, nem em dias travados manualmente); a
 * gordura é redistribuída entre os dias automáticos (dias manuais "gastam" da meta semanal, o
 * resto divide igual entre os automáticos — distribuirValorPorDia); o carboidrato é sempre
 * calculado por cima pra fechar a meta de calorias daquele dia (automático ou manual, ou do
 * override) com a proteína/gordura vigentes. Mesma lógica usada em Gerenciar > Refeições (exceto
 * o override, que só se aplica a uma data concreta, não a um dia da semana abstrato).
 */
export async function getMetasDoDia(data: string): Promise<MetasDiarias> {
  const modo = await getModoCalorias();
  if (modo === "ondulatoria") {
    const semanaInicio = segundaDaSemana(data);
    const overrides = await listOverrideSemanaDieta(semanaInicio);
    if (overrides.length) {
      const diaSemana = parseISODate(data).getDay();
      const doDia = overrides.find((o) => o.diaSemana === diaSemana);
      if (doDia) {
        const perfil = await getPerfilDietaEditavel();
        const { proteinaG } = await resolverProteinaGordura(perfil);
        return {
          calorias: doDia.calorias,
          proteinaG,
          gorduraG: doDia.gorduraG,
          carboidratoG: carboidratoGDoDia(doDia.calorias, proteinaG, doDia.gorduraG),
        };
      }
    }
  }
  return getMetasDoDiaSemana(parseISODate(data).getDay());
}

/** Mesma resolução de getMetasDoDia, mas recebendo o dia da semana (0-6) diretamente em vez de
 * uma data — útil pra quem só precisa resolver "a meta desse dia da semana" sem ter (ou precisar
 * inventar) uma data concreta, como o editor de meta de uma refeição do catálogo. */
export async function getMetasDoDiaSemana(diaSemana: number): Promise<MetasDiarias> {
  const modo = await getModoCalorias();
  if (modo === "fixa") return getMetasDiarias();

  const [perfil, manuais, parametros] = await Promise.all([
    getPerfilDietaEditavel(),
    getCaloriasDiaManuais(),
    getParametros(),
  ]);
  const { proteinaG, gorduraG } = await resolverProteinaGordura(perfil);
  // Calorias nunca mudam sozinhas: a base semanal pra redistribuir entre os dias é sempre
  // perfil.metaCalorias (o valor salvo), nunca uma soma recalculada a partir das proporções — que
  // podia divergir por arredondamento, ou pelo ajuste de "g/kg fixo" mudando proteína/gordura.
  const caloriasMedia = perfil.metaCalorias;
  const minimo = (parametros.get("calorias")?.min ?? PARAMETROS_PADRAO.calorias.min) * perfil.pesoAtual;
  const manuaisCalorias = new Map([...manuais].map(([dia, v]) => [dia, v.calorias]));

  let diaResolvido: CaloriasPorDia;
  try {
    const dias = resolverDistribuicao(caloriasMedia, manuaisCalorias, minimo);
    diaResolvido = dias.find((d) => d.diaSemana === diaSemana) ?? { diaSemana, calorias: caloriasMedia, manual: false };
  } catch {
    diaResolvido = { diaSemana, calorias: caloriasMedia, manual: manuaisCalorias.has(diaSemana) };
  }

  if (diaResolvido.manual) {
    const dados = manuais.get(diaSemana);
    if (dados) {
      return {
        calorias: dados.calorias,
        proteinaG,
        gorduraG: dados.gorduraG,
        carboidratoG: carboidratoGDoDia(dados.calorias, proteinaG, dados.gorduraG),
      };
    }
  }
  const manuaisGordura = new Map([...manuais].map(([dia, v]) => [dia, v.gorduraG]));
  const gorduraResolvida = distribuirValorPorDia(gorduraG, manuaisGordura).find((d) => d.diaSemana === diaSemana)!.valor;
  return {
    calorias: diaResolvido.calorias,
    proteinaG,
    gorduraG: gorduraResolvida,
    carboidratoG: carboidratoGDoDia(diaResolvido.calorias, proteinaG, gorduraResolvida),
  };
}

// ---------------- Saldo calórico acumulado (Parametrização > Calorias > Acumular calorias) ----------------

export async function getAcumularCalorias(): Promise<{ ativo: boolean; diaReset: number | null }> {
  const { data, error } = await supabase.from("dieta_perfil").select("acumular_calorias, dia_reset_saldo_calorico").maybeSingle();
  if (error) throw error;
  return { ativo: data?.acumular_calorias ?? false, diaReset: (data?.dia_reset_saldo_calorico as number | null) ?? null };
}

export async function salvarAcumularCalorias(ativo: boolean, diaReset: number | null): Promise<void> {
  const { error } = await supabase
    .from("dieta_perfil")
    .upsert(
      { user_id: uid(), acumular_calorias: ativo, dia_reset_saldo_calorico: diaReset, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

/** Deltas de carboidrato (g) já aplicados às refeições NESSA data, por nome de refeição — vazio se
 * o saldo daquele dia ainda não foi diluído. */
export async function getDeltasRefeicaoDoDia(data: string): Promise<Map<string, number>> {
  const { data: linhas, error } = await supabase.from("dieta_saldo_refeicao").select("refeicao_nome, delta_carboidrato_g").eq("data", data);
  if (error) throw error;
  return new Map((linhas ?? []).map((l) => [l.refeicao_nome as string, l.delta_carboidrato_g as number]));
}

/** Substitui de uma vez a diluição inteira de um dia (delete+insert, mesmo padrão do resto do
 * arquivo) — reabrir "Diluir" e salvar de novo troca a distribuição anterior pela nova, nunca soma
 * em cima. Deltas em gramas de CARBOIDRATO (a válvula de ajuste, nunca proteína/gordura); o que não
 * for coberto pela soma dos deltas continua pendente e rola pro dia seguinte sozinho (ver
 * getSaldoCaloricoEntrando). */
export async function salvarDiluicaoSaldo(data: string, deltasCarboidratoG: Map<string, number>): Promise<void> {
  const usuario = uid();
  const { error: delError } = await supabase.from("dieta_saldo_refeicao").delete().eq("user_id", usuario).eq("data", data);
  if (delError) throw delError;
  const linhas = [...deltasCarboidratoG.entries()]
    .filter(([, delta]) => Math.round(delta) !== 0)
    .map(([refeicaoNome, delta]) => ({ user_id: usuario, data, refeicao_nome: refeicaoNome, delta_carboidrato_g: delta }));
  if (linhas.length) {
    const { error } = await supabase.from("dieta_saldo_refeicao").insert(linhas);
    if (error) throw error;
  }
  marcarDietaDesatualizada();
}

/** Total consumido por dia, num intervalo [inicio, fimExclusivo) — uma consulta só em vez de uma
 * por dia, usada pelo cálculo do saldo acumulado (getSaldoCaloricoEntrando). */
async function getCaloriasConsumidasPorDia(inicio: string, fimExclusivo: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("diario_alimentos").select("data, calorias").gte("data", inicio).lt("data", fimExclusivo);
  if (error) throw error;
  const mapa = new Map<string, number>();
  for (const l of data ?? []) mapa.set(l.data as string, (mapa.get(l.data as string) ?? 0) + (l.calorias as number));
  return mapa;
}

/** Total já diluído (kcal, convertido dos deltas de carboidrato) por dia, no mesmo intervalo. */
async function getSaldoDiluidoPorDia(inicio: string, fimExclusivo: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("dieta_saldo_refeicao")
    .select("data, delta_carboidrato_g")
    .gte("data", inicio)
    .lt("data", fimExclusivo);
  if (error) throw error;
  const mapa = new Map<string, number>();
  for (const l of data ?? []) mapa.set(l.data as string, (mapa.get(l.data as string) ?? 0) + (l.delta_carboidrato_g as number) * 4);
  return mapa;
}

/** Igual getSaldoDiluidoPorDia, só que pra UM dia só — usado ao editar o saldo (salvarAjusteSaldoCalorico). */
async function getSaldoDiluidoDoDia(data: string): Promise<number> {
  const mapa = await getSaldoDiluidoPorDia(data, somarDias(data, 1));
  return mapa.get(data) ?? 0;
}

/** Correções manuais (Editar/Excluir no card de saldo) no intervalo — chave é a data a que a
 * correção pertence (ver salvarAjusteSaldoCalorico: sempre o dia ANTERIOR ao dia editado no app). */
async function getAjustesPorDia(inicio: string, fimExclusivo: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("dieta_saldo_ajuste")
    .select("data, saldo_final_kcal")
    .gte("data", inicio)
    .lt("data", fimExclusivo);
  if (error) throw error;
  return new Map((data ?? []).map((l) => [l.data as string, l.saldo_final_kcal as number]));
}

/** Data mais recente <= `data` cujo dia da semana é `diaReset`. */
function diaDeResetMaisRecente(data: string, diaReset: number): string {
  let cursor = data;
  for (let i = 0; i < 7; i++) {
    if (parseISODate(cursor).getDay() === diaReset) return cursor;
    cursor = somarDias(cursor, -1);
  }
  return data;
}

/**
 * Saldo acumulado que ENTRA no dia `data` (antes de qualquer diluição feita nesse próprio dia) —
 * caminha dia a dia desde o dia de reinício mais recente até ontem, somando (meta do dia + o que
 * foi diluído naquele dia − consumido naquele dia). Puramente derivado da meta/consumo/diluição já
 * salvos — nunca fica "desatualizado" se um dia passado for editado depois (mesmo espírito da linha
 * de meta de peso). No próprio dia de reinício o saldo sempre volta a 0. Se um dia no meio do
 * caminho tem uma correção manual (Editar/Excluir — dieta_saldo_ajuste), a soma "salta" pra esse
 * valor naquele ponto e ignora tudo antes dele, continuando a acumular normalmente dali em diante.
 */
export async function getSaldoCaloricoEntrando(data: string): Promise<number> {
  const { ativo, diaReset } = await getAcumularCalorias();
  if (!ativo || diaReset == null) return 0;
  if (parseISODate(data).getDay() === diaReset) return 0;

  const ontem = somarDias(data, -1);
  const inicio = diaDeResetMaisRecente(ontem, diaReset);
  const dias: string[] = [];
  for (let d = inicio; d <= ontem; d = somarDias(d, 1)) dias.push(d);
  if (!dias.length) return 0;

  const [metasPorDia, consumidoPorDia, diluidoPorDia, ajustesPorDia] = await Promise.all([
    Promise.all(dias.map((d) => getMetasDoDia(d))),
    getCaloriasConsumidasPorDia(inicio, data),
    getSaldoDiluidoPorDia(inicio, data),
    getAjustesPorDia(inicio, data),
  ]);

  let saldo = 0;
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const ajuste = ajustesPorDia.get(d);
    if (ajuste != null) {
      saldo = ajuste;
    } else {
      saldo += metasPorDia[i].calorias + (diluidoPorDia.get(d) ?? 0) - (consumidoPorDia.get(d) ?? 0);
    }
  }
  return saldo;
}

/** "Editar"/"Excluir" no card de saldo acumulado: corrige diretamente o saldo PENDENTE mostrado
 * pra `dataReferencia` (o dia do card, hoje normalmente) pra `novoSaldoPendente` (0 no caso de
 * "Excluir" — zera o acumulado). Guardado como o saldo final do dia ANTERIOR (a correção entra na
 * soma de getSaldoCaloricoEntrando um dia antes do que ela afeta), somando de volta o que já foi
 * diluído hoje (que continua valendo, a correção não desfaz uma diluição já feita). */
export async function salvarAjusteSaldoCalorico(dataReferencia: string, novoSaldoPendente: number): Promise<void> {
  const diluidoHoje = await getSaldoDiluidoDoDia(dataReferencia);
  const dataAjuste = somarDias(dataReferencia, -1);
  const { error } = await supabase
    .from("dieta_saldo_ajuste")
    .upsert(
      { user_id: uid(), data: dataAjuste, saldo_final_kcal: novoSaldoPendente + diluidoHoje },
      { onConflict: "user_id,data" },
    );
  if (error) throw error;
  marcarDietaDesatualizada();
}

export type StatusAdesaoDieta = "dentro_do_plano" | "ajustar_calorias" | "calibrando";

/** Compara o ritmo real de variação de peso (getTaxaVariacaoSemanal, pesoApi.ts) com o ritmo
 * esperado pela meta (peso_metas.percentual_min — o ritmo padrão/conservador da banda, sempre
 * semanal). Só avalia depois de ~14 dias do
 * último ajuste real nas calorias (dieta_perfil.calorias_ajustadas_em) — antes disso a média de
 * peso ainda não "enxergou" o ajuste recente, e mostrar um veredito seria enganoso
 * ("calibrando"). Banda de tolerância generosa (40%-160% do ritmo esperado, mesmo sinal) — uma
 * semana de ruído normal não deve disparar "ajustar calorias" à toa. null = sem meta definida ou
 * sem pesagens suficientes pra calcular uma tendência (chip escondido por quem chama). */
export async function getStatusAdesaoDieta(): Promise<StatusAdesaoDieta | null> {
  const [meta, perfil, taxaAtual] = await Promise.all([getMeta(), getPerfilDietaEditavel(), getTaxaVariacaoSemanal()]);
  if (!meta || taxaAtual == null) return null;

  if (perfil.caloriasAjustadasEm) {
    const dias = Math.floor((Date.now() - new Date(perfil.caloriasAjustadasEm).getTime()) / 86_400_000);
    if (dias < 14) return "calibrando";
  }

  if (meta.tipo === "manutencao") {
    return Math.abs(taxaAtual) <= 0.3 ? "dentro_do_plano" : "ajustar_calorias";
  }
  if (meta.percentualMin == null || meta.percentualMin === 0) return null;

  const mediaAtual = await getPesoMedioAtual();
  if (mediaAtual == null) return null;
  const taxaEsperada = mediaAtual * (meta.percentualMin / 100);
  const dentro =
    Math.sign(taxaAtual) === Math.sign(taxaEsperada) &&
    Math.abs(taxaAtual) >= Math.abs(taxaEsperada) * 0.4 &&
    Math.abs(taxaAtual) <= Math.abs(taxaEsperada) * 1.6;
  return dentro ? "dentro_do_plano" : "ajustar_calorias";
}

// ---------------- Receitas (combo reutilizável de vários alimentos já cadastrados) ----------------

export interface ReceitaResumo {
  id: string;
  nome: string;
  calorias: number;
}

const RECEITA_RESUMO_SELECT = "id, nome, itens:dieta_receita_itens(quantidade, alimento:alimentos(porcao_padrao_qtd, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g))";

function mapReceitaResumo(l: Record<string, unknown>): ReceitaResumo {
  const itens = (l.itens as ItemReceitaBruto[]) ?? [];
  return { id: l.id as string, nome: l.nome as string, calorias: round1(somarTotaisItensReceita(itens).calorias) };
}

export interface ReceitaItem {
  id: string;
  alimentoId: string;
  nome: string;
  quantidade: number;
  unidade: string;
  porcaoPadraoQtd: number;
  calorias: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number;
  gorduraSaturadaG: number;
}

export interface Receita extends ReceitaResumo {
  itens: ReceitaItem[];
  /** Lista de alimentos privada de uma refeição do catálogo (ver garantirReceitaPrivadaRefeicao) —
   * não aparece na lista de Receitas nem nas buscas. */
  oculta: boolean;
}

function mapReceitaItem(l: Record<string, unknown>): ReceitaItem {
  const a = l.alimento as Record<string, unknown>;
  const porcaoPadraoQtd = a.porcao_padrao_qtd as number;
  const fator = (l.quantidade as number) / porcaoPadraoQtd;
  return {
    id: l.id as string,
    alimentoId: l.alimento_id as string,
    nome: a.nome as string,
    quantidade: l.quantidade as number,
    unidade: a.porcao_padrao_unidade as string,
    porcaoPadraoQtd,
    calorias: round1((a.calorias_por_porcao as number) * fator),
    proteinaG: round1((a.proteina_g as number) * fator),
    gorduraG: round1((a.gordura_g as number) * fator),
    carboidratoG: round1((a.carboidrato_g as number) * fator),
    fibraG: round1(((a.fibra_g as number | null) ?? 0) * fator),
    gorduraSaturadaG: round1(((a.gordura_saturada_g as number | null) ?? 0) * fator),
  };
}

export async function buscarReceitas(query: string): Promise<ReceitaResumo[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await porPalavras(
    supabase.from("dieta_receitas").select(RECEITA_RESUMO_SELECT).eq("oculta", false),
    "nome",
    termo,
  )
    .order("nome", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((l) => mapReceitaResumo(l as unknown as Record<string, unknown>));
}

export async function listReceitas(limite = 50): Promise<ReceitaResumo[]> {
  const { data, error } = await supabase
    .from("dieta_receitas")
    .select(RECEITA_RESUMO_SELECT)
    .eq("oculta", false)
    .order("nome", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((l) => mapReceitaResumo(l as unknown as Record<string, unknown>));
}

/** Soma de calorias de cada lista de alimentos privada de refeição (dieta_receitas ocultas),
 * carregada de uma vez pra todo o catálogo — usado só pra mostrar "refeição com X cal" no card de
 * Gerenciar Refeições, sem precisar abrir o detalhe (nem repetir a consulta por card). */
export async function getCaloriasReceitas(receitaIds: string[]): Promise<Map<string, number>> {
  if (!receitaIds.length) return new Map();
  const { data, error } = await supabase.from("dieta_receitas").select(RECEITA_RESUMO_SELECT).in("id", receitaIds);
  if (error) throw error;
  return new Map((data ?? []).map((l) => mapReceitaResumo(l as unknown as Record<string, unknown>)).map((r) => [r.id, r.calorias]));
}

export async function getReceita(id: string): Promise<Receita | null> {
  const [receitaRes, itensRes] = await Promise.all([
    supabase.from("dieta_receitas").select("id, nome, oculta").eq("id", id).maybeSingle(),
    supabase
      .from("dieta_receita_itens")
      .select(
        "id, alimento_id, quantidade, ordem, alimento:alimentos(nome, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g, fibra_g, gordura_saturada_g)",
      )
      .eq("receita_id", id)
      .order("ordem", { ascending: true }),
  ]);
  if (receitaRes.error) throw receitaRes.error;
  if (itensRes.error) throw itensRes.error;
  if (!receitaRes.data) return null;
  const itens = (itensRes.data ?? []).map((l) => mapReceitaItem(l as Record<string, unknown>));
  return {
    id: receitaRes.data.id,
    nome: receitaRes.data.nome,
    oculta: (receitaRes.data as { oculta?: boolean }).oculta ?? false,
    calorias: round1(itens.reduce((acc, it) => acc + it.calorias, 0)),
    itens,
  };
}

/** Garante que uma refeição do catálogo (opcionalmente restrita a um grupo de dias, em
 * Ondulatória) tem uma lista de alimentos própria — uma receita oculta, que nunca aparece na
 * lista de Receitas nem em buscas. Se `receitaIdExistente` já vem preenchido (a refeição já tinha
 * uma), só devolve ele; senão cria uma vazia e vincula. */
export async function garantirReceitaPrivadaRefeicao(
  modeloId: string,
  nome: string,
  receitaIdExistente: string | null,
  diasSemana?: number[],
): Promise<string> {
  if (receitaIdExistente) return receitaIdExistente;
  const { data: nova, error } = await supabase.from("dieta_receitas").insert({ user_id: uid(), nome, oculta: true }).select("id").single();
  if (error) throw error;
  const novoId = nova.id as string;
  if (diasSemana?.length) await vincularMetaReceitaDias(modeloId, diasSemana, novoId);
  else await vincularMetaReceita(modeloId, novoId);
  return novoId;
}

export async function atualizarItemReceita(id: string, quantidade: number): Promise<void> {
  const { error } = await supabase.from("dieta_receita_itens").update({ quantidade }).eq("id", id);
  if (error) throw error;
}

export async function removerItemReceita(id: string): Promise<void> {
  const { error } = await supabase.from("dieta_receita_itens").delete().eq("id", id);
  if (error) throw error;
}

export async function adicionarItemReceita(receitaId: string, alimentoId: string, quantidade: number): Promise<void> {
  const { count, error: erroCount } = await supabase
    .from("dieta_receita_itens")
    .select("id", { count: "exact", head: true })
    .eq("receita_id", receitaId);
  if (erroCount) throw erroCount;
  const { error } = await supabase
    .from("dieta_receita_itens")
    .insert({ receita_id: receitaId, alimento_id: alimentoId, quantidade, ordem: count ?? 0 });
  if (error) throw error;
}

export async function criarReceita(nome: string, itens: { alimentoId: string; quantidade: number }[]): Promise<string> {
  const { data: existente, error: erroExistente } = await supabase
    .from("dieta_receitas")
    .select("id")
    .ilike("nome", nome)
    .maybeSingle();
  if (erroExistente) throw erroExistente;
  if (existente) throw new Error(`Já existe uma refeição chamada "${nome}".`);

  const { data: receita, error } = await supabase
    .from("dieta_receitas")
    .insert({ user_id: uid(), nome })
    .select("id")
    .single();
  if (error) throw error;
  const linhas = itens.map((it, i) => ({
    receita_id: receita.id,
    alimento_id: it.alimentoId,
    quantidade: it.quantidade,
    ordem: i,
  }));
  const { error: errorItens } = await supabase.from("dieta_receita_itens").insert(linhas);
  if (errorItens) throw errorItens;
  return receita.id;
}

export async function atualizarReceita(id: string, nome: string): Promise<void> {
  const { data: existente, error: erroExistente } = await supabase
    .from("dieta_receitas")
    .select("id")
    .ilike("nome", nome)
    .neq("id", id)
    .maybeSingle();
  if (erroExistente) throw erroExistente;
  if (existente) throw new Error(`Já existe uma refeição chamada "${nome}".`);

  const { error } = await supabase.from("dieta_receitas").update({ nome }).eq("id", id);
  if (error) throw error;
}

export async function excluirReceita(id: string): Promise<void> {
  const { error } = await supabase.from("dieta_receitas").delete().eq("id", id);
  if (error) throw error;
}

/** Loga todos os itens da receita de uma vez no diário, na mesma refeição/data. */
export async function adicionarReceitaAoDiario(receitaId: string, data: string, refeicaoId: string): Promise<void> {
  const receita = await getReceita(receitaId);
  if (!receita) throw new Error("Refeição não encontrada.");
  const linhas = receita.itens.map((it) => ({
    user_id: uid(),
    alimento_id: it.alimentoId,
    data,
    refeicao_id: refeicaoId,
    quantidade: it.quantidade,
    unidade: it.unidade,
    calorias: it.calorias,
    proteina_g: it.proteinaG,
    gordura_g: it.gorduraG,
    carboidrato_g: it.carboidratoG,
    fibra_g: it.fibraG,
    gordura_saturada_g: it.gorduraSaturadaG,
  }));
  const { error } = await supabase.from("diario_alimentos").insert(linhas);
  if (error) throw error;
}
