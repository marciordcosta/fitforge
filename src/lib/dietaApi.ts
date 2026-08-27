import { supabase } from "./supabase";
import { auth } from "./auth.svelte";
import { DIAS_SEMANA_ABREV } from "./treinoApi";
import { getPesoMedioAtual } from "./pesoApi";
import { parseISODate } from "./dates";

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

/** Divide o termo em palavras e aplica um ilike por palavra (AND) — acha o nome com as palavras em qualquer ordem. */
function porPalavras<T>(builder: T, coluna: string, termo: string): T {
  const palavras = termo.trim().split(/\s+/).filter(Boolean);
  return palavras.reduce(
    (b, p) => (b as unknown as { ilike: (c: string, v: string) => T }).ilike(coluna, `%${p}%`),
    builder,
  );
}

export async function buscarAlimentos(query: string): Promise<Alimento[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await porPalavras(
    supabase.from("alimentos").select(ALIMENTO_SELECT),
    "nome",
    termo,
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

export async function criarAlimentoManual(input: AlimentoManualInput): Promise<void> {
  const { error } = await supabase.from("alimentos").insert({
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
  });
  if (error) throw error;
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

/** Cria um alimento a partir de um produto escaneado (Open Food Facts) — valores sempre por 100g, como a API fornece. */
export async function criarAlimentoOpenFoodFacts(input: AlimentoOpenFoodFactsInput): Promise<string> {
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
  /** Prato vinculado (dieta_receitas) que serve como meta de macros/calorias dessa refeição, se houver. */
  metaReceitaId: string | null;
  metaCalorias: number | null;
  metaProteinaG: number | null;
  metaGorduraG: number | null;
  metaCarboidratoG: number | null;
}

const REFEICAO_MODELO_SELECT =
  "id, nome, meta_receita_id, meta_receita:dieta_receitas!meta_receita_id(itens:dieta_receita_itens(quantidade, alimento:alimentos(porcao_padrao_qtd, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g)))";

interface ItemReceitaBruto {
  quantidade: number;
  alimento: {
    porcao_padrao_qtd: number;
    calorias_por_porcao: number;
    proteina_g: number;
    gordura_g: number;
    carboidrato_g: number;
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
      };
    },
    { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
  );
}

function mapRefeicaoModelo(l: Record<string, unknown>): RefeicaoModelo {
  const metaReceita = l.meta_receita as { itens: ItemReceitaBruto[] } | null;
  const base = { id: l.id as string, nome: l.nome as string, metaReceitaId: l.meta_receita_id as string | null };
  if (!metaReceita) {
    return { ...base, metaCalorias: null, metaProteinaG: null, metaGorduraG: null, metaCarboidratoG: null };
  }
  const totais = somarTotaisItensReceita(metaReceita.itens ?? []);
  return {
    ...base,
    metaCalorias: round1(totais.calorias),
    metaProteinaG: round1(totais.proteinaG),
    metaGorduraG: round1(totais.gorduraG),
    metaCarboidratoG: round1(totais.carboidratoG),
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

/** Meta de macros/calorias da refeição do catálogo com esse nome (via prato vinculado), ou null se não achar/sem prato. */
export async function getMetaRefeicaoPorNome(nome: string): Promise<MetasDiarias | null> {
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .select(REFEICAO_MODELO_SELECT)
    .eq("nome", nome)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const modelo = mapRefeicaoModelo(data as Record<string, unknown>);
  if (modelo.metaCalorias == null) return null;
  return {
    calorias: modelo.metaCalorias,
    proteinaG: modelo.metaProteinaG!,
    gorduraG: modelo.metaGorduraG!,
    carboidratoG: modelo.metaCarboidratoG!,
  };
}

/** Id do prato vinculado como meta da refeição do catálogo com esse nome, ou null — select enxuto, sem os totais. */
export async function getMetaReceitaIdPorNome(nome: string): Promise<string | null> {
  const { data, error } = await supabase.from("dieta_refeicoes_modelo").select("meta_receita_id").eq("nome", nome).maybeSingle();
  if (error) throw error;
  return data?.meta_receita_id ?? null;
}

export async function vincularMetaReceita(modeloId: string, receitaId: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ meta_receita_id: receitaId }).eq("id", modeloId);
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
  metaReceitaId: string;
  metaCalorias: number;
  metaProteinaG: number;
  metaGorduraG: number;
  metaCarboidratoG: number;
}

const META_DIA_MODELO_SELECT =
  "modelo_id, dia_semana, meta_receita_id, meta_receita:dieta_receitas!meta_receita_id(itens:dieta_receita_itens(quantidade, alimento:alimentos(porcao_padrao_qtd, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g)))";

/** Todas as metas por dia já configuradas (qualquer refeição, qualquer dia) — ausência de linha pra um (modelo, dia) usa o meta_receita_id global como fallback. */
export async function listMetasDiaModelo(): Promise<MetaDiaModelo[]> {
  const { data, error } = await supabase.from("dieta_refeicoes_modelo_meta_dia").select(META_DIA_MODELO_SELECT);
  if (error) throw error;
  return (data ?? []).map((l) => {
    const linha = l as Record<string, unknown>;
    const metaReceita = linha.meta_receita as { itens: ItemReceitaBruto[] } | null;
    const totais = somarTotaisItensReceita(metaReceita?.itens ?? []);
    return {
      modeloId: linha.modelo_id as string,
      diaSemana: linha.dia_semana as number,
      metaReceitaId: linha.meta_receita_id as string,
      metaCalorias: round1(totais.calorias),
      metaProteinaG: round1(totais.proteinaG),
      metaGorduraG: round1(totais.gorduraG),
      metaCarboidratoG: round1(totais.carboidratoG),
    };
  });
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

export async function criarRefeicaoModelo(nome: string): Promise<string> {
  const { count, error: erroCount } = await supabase
    .from("dieta_refeicoes_modelo")
    .select("id", { count: "exact", head: true });
  if (erroCount) throw erroCount;
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .insert({ user_id: uid(), nome, ordem: count ?? 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function atualizarRefeicaoModelo(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ nome }).eq("id", id);
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
}

/** Ordena pelo mesmo critério de "Gerenciar Refeições" (por nome) — refeições avulsas, sem nome no catálogo, ficam no fim, na ordem em que foram criadas. */
export async function getRefeicoesDoDia(data: string): Promise<RefeicaoDia[]> {
  const [linhasRes, catalogo] = await Promise.all([
    supabase.from("dieta_refeicoes_dia").select("id, nome, data").eq("data", data).order("created_at", { ascending: true }),
    listRefeicoesModelo(),
  ]);
  if (linhasRes.error) throw linhasRes.error;
  const ordemPorNome = new Map(catalogo.map((m, i) => [m.nome, i]));
  return [...(linhasRes.data ?? [])].sort(
    (a, b) => (ordemPorNome.get(a.nome) ?? Infinity) - (ordemPorNome.get(b.nome) ?? Infinity),
  );
}

/** Se o dia ainda não tem nenhuma refeição, cria uma pra cada item do catálogo (as refeições "padrão" de todo dia) e retorna a lista já pronta. */
export async function garantirRefeicoesPadraoDoDia(data: string): Promise<RefeicaoDia[]> {
  const existentes = await getRefeicoesDoDia(data);
  if (existentes.length) return existentes;
  const catalogo = await listRefeicoesModelo();
  if (!catalogo.length) return existentes;
  await Promise.all(catalogo.map((m) => criarRefeicaoDia(data, m.nome)));
  return getRefeicoesDoDia(data);
}

export async function getRefeicaoDia(id: string): Promise<RefeicaoDia | null> {
  const { data, error } = await supabase.from("dieta_refeicoes_dia").select("id, nome, data").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function criarRefeicaoDia(data: string, nome: string): Promise<string> {
  const { data: linha, error } = await supabase
    .from("dieta_refeicoes_dia")
    .insert({ user_id: uid(), data, nome })
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

/** Se existe alguma outra refeição com esse mesmo nome (outro dia) que já teve algum alimento lançado — usado pra habilitar "Copiar de"/"Copiar para". */
export async function refeicaoTemHistorico(nome: string, excluirId: string): Promise<boolean> {
  const { data: outras, error: errOutras } = await supabase
    .from("dieta_refeicoes_dia")
    .select("id")
    .eq("nome", nome)
    .neq("id", excluirId);
  if (errOutras) throw errOutras;
  const ids = (outras ?? []).map((r) => r.id);
  if (!ids.length) return false;
  const { data: itens, error: errItens } = await supabase
    .from("diario_alimentos")
    .select("id")
    .in("refeicao_id", ids)
    .limit(1);
  if (errItens) throw errItens;
  return (itens ?? []).length > 0;
}

/** Copia todos os itens de uma refeição pra outra (já existente), preservando quantidade/unidade/macros congelados. */
export async function copiarItensEntreRefeicoes(origemId: string, destinoId: string): Promise<void> {
  const [itens, destino] = await Promise.all([getItensDaRefeicao(origemId), getRefeicaoDia(destinoId)]);
  if (!itens.length) return;
  if (!destino) throw new Error("Refeição de destino não encontrada.");
  const linhas = itens.map((it) => ({
    user_id: uid(),
    alimento_id: it.alimentoId,
    data: destino.data,
    refeicao_id: destinoId,
    quantidade: it.quantidade,
    unidade: it.unidade,
    calorias: it.calorias,
    proteina_g: it.proteinaG,
    gordura_g: it.gorduraG,
    carboidrato_g: it.carboidratoG,
  }));
  const { error } = await supabase.from("diario_alimentos").insert(linhas);
  if (error) throw error;
}

/** Copia um único item lançado pra outra refeição (mesma quantidade/macros congelados), sem mexer no item de origem. */
export async function copiarItemEntreRefeicoes(itemId: string, destinoRefeicaoId: string): Promise<void> {
  const [item, destino] = await Promise.all([getItemDiario(itemId), getRefeicaoDia(destinoRefeicaoId)]);
  if (!item) throw new Error("Item não encontrado.");
  if (!destino) throw new Error("Refeição de destino não encontrada.");
  const { error } = await supabase.from("diario_alimentos").insert({
    user_id: uid(),
    alimento_id: item.alimentoId,
    data: destino.data,
    refeicao_id: destinoRefeicaoId,
    quantidade: item.quantidade,
    unidade: item.unidade,
    calorias: item.calorias,
    proteina_g: item.proteinaG,
    gordura_g: item.gorduraG,
    carboidrato_g: item.carboidratoG,
  });
  if (error) throw error;
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
  };
}

const ITEM_DIARIO_SELECT =
  "id, alimento_id, refeicao_id, quantidade, unidade, calorias, proteina_g, gordura_g, carboidrato_g, created_at, alimento:alimentos(nome)";

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
  });
  if (error) throw error;
}

export async function atualizarItemDiario(id: string, alimento: Alimento, quantidade: number, refeicaoId: string): Promise<void> {
  const fator = quantidade / alimento.porcaoPadraoQtd;
  const { error } = await supabase
    .from("diario_alimentos")
    .update({
      quantidade,
      unidade: alimento.porcaoPadraoUnidade,
      refeicao_id: refeicaoId,
      calorias: round1(alimento.caloriasPorPorcao * fator),
      proteina_g: round1(alimento.proteinaG * fator),
      gordura_g: round1(alimento.gorduraG * fator),
      carboidrato_g: round1(alimento.carboidratoG * fator),
    })
    .eq("id", id);
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

const METAS_PADRAO: MetasDiarias = { calorias: 2000, proteinaG: 165, gorduraG: 56, carboidratoG: 223 };

export async function getMetasDiarias(): Promise<MetasDiarias> {
  const { data, error } = await supabase
    .from("dieta_perfil")
    .select("peso_atual, meta_calorias, proteina_g_kg, gordura_g_kg, carboidrato_g_kg")
    .maybeSingle();
  if (error) throw error;
  if (!data) return METAS_PADRAO;
  return {
    calorias: data.meta_calorias,
    proteinaG: data.proteina_g_kg * data.peso_atual,
    gorduraG: data.gordura_g_kg * data.peso_atual,
    carboidratoG: data.carboidrato_g_kg * data.peso_atual,
  };
}

// ---------------- Parâmetros (min/máx editáveis em Parametrização, por peso ou por calorias do dia) ----------------

export interface DefinicaoParametro {
  chave: string;
  categoria: string;
  label: string;
  unidade: string;
  /** peso: valor é por kg de peso corporal. calorias: valor é % das calorias do dia (convertido pra gramas via kcal/g do nutriente). */
  base: "peso" | "calorias";
  /** kcal por grama do nutriente — só usado quando base é "calorias", pra converter % em gramas. */
  kcalPorGrama?: number;
  /** Parâmetro só de piso (ex: calorias mínimas) — sem campo de máximo na tela. */
  somenteMinimo: boolean;
  /** Parâmetro só de teto (ex: gordura saturada) — sem campo de mínimo na tela, mínimo fica travado em 0. */
  somenteMaximo?: boolean;
}

export const DEFINICOES_PARAMETROS: DefinicaoParametro[] = [
  { chave: "calorias", categoria: "Calorias", label: "Calorias mínimas", unidade: "kcal/kg", base: "peso", somenteMinimo: true },
  { chave: "proteina", categoria: "Macronutrientes", label: "Proteína", unidade: "g/kg", base: "peso", somenteMinimo: false },
  { chave: "gordura", categoria: "Macronutrientes", label: "Gordura", unidade: "g/kg", base: "peso", somenteMinimo: false },
  { chave: "carboidrato", categoria: "Macronutrientes", label: "Carboidrato", unidade: "g/kg", base: "peso", somenteMinimo: false },
  { chave: "fibras", categoria: "Metas de Consumo", label: "Fibras", unidade: "%", base: "calorias", kcalPorGrama: 4, somenteMinimo: false },
  { chave: "gordura_saturada", categoria: "Metas de Consumo", label: "Gordura Saturada", unidade: "%", base: "calorias", kcalPorGrama: 9, somenteMinimo: false, somenteMaximo: true },
  { chave: "agua", categoria: "Metas de Consumo", label: "Água", unidade: "L/kg", base: "peso", somenteMinimo: false },
];

export interface LimiteParametro {
  min: number;
  max: number;
}

/**
 * Valores de hoje, usados como padrão pra qualquer chave sem linha salva ainda. Fibras
 * (5,6% ≈ 14g a cada 1000 kcal, usando 4 kcal/g) e Gordura Saturada (teto de 10% das
 * calorias do dia, diretriz comum de OMS/AHA) são % das calorias; os demais são por kg de peso.
 */
export const PARAMETROS_PADRAO: Record<string, LimiteParametro> = {
  calorias: { min: 20, max: 20 },
  proteina: { min: 1, max: 3 },
  gordura: { min: 0.5, max: 1.5 },
  carboidrato: { min: 1, max: 10 },
  fibras: { min: 5.6, max: 5.6 },
  gordura_saturada: { min: 0, max: 10 },
  agua: { min: 0.05, max: 0.05 },
};

/** Converte um valor de parâmetro (g/kg, L/kg ou % das calorias, conforme `def.base`) em gramas (ou litros, pra água). */
export function gramasDoParametro(def: DefinicaoParametro, valor: number, pesoAtual: number, caloriasCalc: number): number {
  if (def.base === "peso") return valor * pesoAtual;
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

/** Perfil de metas editável na tela de Gerenciar (aba Calorias) — ratios em g/kg, não em gramas fixas. */
export interface PerfilDietaEditavel {
  pesoAtual: number;
  metaCalorias: number;
  proteinaGKg: number;
  gorduraGKg: number;
  carboidratoGKg: number;
}

const PERFIL_PADRAO: PerfilDietaEditavel = {
  pesoAtual: 76,
  metaCalorias: 2000,
  proteinaGKg: 2.17,
  gorduraGKg: 0.66,
  carboidratoGKg: 2.93,
};

export async function getPerfilDietaEditavel(): Promise<PerfilDietaEditavel> {
  const { data, error } = await supabase
    .from("dieta_perfil")
    .select("peso_atual, meta_calorias, proteina_g_kg, gordura_g_kg, carboidrato_g_kg")
    .maybeSingle();
  if (error) throw error;
  if (!data) return PERFIL_PADRAO;
  return {
    pesoAtual: data.peso_atual,
    metaCalorias: data.meta_calorias,
    proteinaGKg: data.proteina_g_kg,
    gorduraGKg: data.gordura_g_kg,
    carboidratoGKg: data.carboidrato_g_kg,
  };
}

export async function salvarPerfilDieta(input: {
  pesoAtual: number;
  metaCalorias: number;
  proteinaGKg: number;
  gorduraGKg: number;
  carboidratoGKg: number;
  fibrasG: number;
  aguaL: number;
}): Promise<void> {
  const { error } = await supabase.from("dieta_perfil").upsert(
    {
      user_id: uid(),
      peso_atual: input.pesoAtual,
      meta_calorias: input.metaCalorias,
      proteina_g_kg: input.proteinaGKg,
      gordura_g_kg: input.gorduraGKg,
      carboidrato_g_kg: input.carboidratoGKg,
      fibras_g: input.fibrasG,
      agua_l: input.aguaL,
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
 * Sempre precisa sobrar pelo menos 1 dia automático, e nenhum valor (manual ou automático)
 * pode ficar abaixo do piso mínimo.
 */
export function resolverDistribuicao(metaCalorias: number, manuais: Map<number, number>, minimo: number): CaloriasPorDia[] {
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6];
  const diasAuto = todosOsDias.filter((d) => !manuais.has(d));
  if (diasAuto.length === 0) {
    throw new Error("Pelo menos 1 dia da semana precisa ficar automático pra fechar a meta.");
  }
  for (const [dia, valor] of manuais) {
    if (valor < minimo) {
      throw new Error(
        `${DIAS_SEMANA_ABREV[dia]} ficaria com ${Math.round(valor)} kcal, abaixo do mínimo de ${Math.round(minimo)} kcal.`,
      );
    }
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
}

export async function getCaloriasDiaManuais(): Promise<Map<number, CaloriasDiaManual>> {
  const { data, error } = await supabase
    .from("dieta_calorias_dia")
    .select("dia_semana, calorias, proteina_g, gordura_g, carboidrato_g");
  if (error) throw error;
  return new Map(
    (data ?? []).map((l) => [
      l.dia_semana as number,
      {
        calorias: l.calorias as number,
        proteinaG: (l.proteina_g as number | null) ?? 0,
        gorduraG: (l.gordura_g as number | null) ?? 0,
        carboidratoG: (l.carboidrato_g as number | null) ?? 0,
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

/** Carboidrato do dia: mesma fórmula usada pra fechar a meta de calorias, só trocando a meta pela calorias daquele dia. */
export function carboidratoGDoDia(caloriasDoDia: number, proteinaG: number, gorduraG: number): number {
  return Math.max(0, Math.round((caloriasDoDia - 4 * proteinaG - 9 * gorduraG) / 4));
}

/**
 * Meta de macros/calorias efetiva pra uma data específica — respeita o modo Fixa/Ondulatória.
 * Em Fixa, é a mesma meta global de sempre (getMetasDiarias). Em Ondulatória, resolve o dia da
 * semana dessa data: proteína é sempre o valor global atual (constante, nunca varia por dia,
 * nem em dias travados manualmente); a gordura é redistribuída entre os dias automáticos (dias
 * manuais "gastam" da meta semanal, o resto divide igual entre os automáticos — distribuirValorPorDia);
 * o carboidrato é sempre calculado por cima pra fechar a meta de calorias daquele dia (automático
 * ou manual) com a proteína/gordura vigentes — assim, se a proteína global mudar, todo dia manual
 * recalcula o carboidrato na hora pra manter a calorias travada daquele dia, sem precisar regravar
 * nada. Mesma lógica usada em Gerenciar > Refeições.
 */
export async function getMetasDoDia(data: string): Promise<MetasDiarias> {
  const modo = await getModoCalorias();
  if (modo === "fixa") return getMetasDiarias();

  const [perfil, pesoMedio, manuais, parametros] = await Promise.all([
    getPerfilDietaEditavel(),
    getPesoMedioAtual(),
    getCaloriasDiaManuais(),
    getParametros(),
  ]);
  const pesoAtual = pesoMedio ?? perfil.pesoAtual;
  const proteinaG = Math.round(perfil.proteinaGKg * pesoAtual);
  const gorduraG = Math.round(perfil.gorduraGKg * pesoAtual);
  const carboidratoG = Math.round(perfil.carboidratoGKg * pesoAtual);
  const caloriasMedia = Math.round(4 * proteinaG + 9 * gorduraG + 4 * carboidratoG);
  const minimo = (parametros.get("calorias")?.min ?? PARAMETROS_PADRAO.calorias.min) * pesoAtual;
  const manuaisCalorias = new Map([...manuais].map(([dia, v]) => [dia, v.calorias]));

  const diaSemana = parseISODate(data).getDay();
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
}

export interface Receita extends ReceitaResumo {
  itens: ReceitaItem[];
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
  };
}

export async function buscarReceitas(query: string): Promise<ReceitaResumo[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await porPalavras(supabase.from("dieta_receitas").select(RECEITA_RESUMO_SELECT), "nome", termo)
    .order("nome", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((l) => mapReceitaResumo(l as unknown as Record<string, unknown>));
}

export async function listReceitas(limite = 50): Promise<ReceitaResumo[]> {
  const { data, error } = await supabase
    .from("dieta_receitas")
    .select(RECEITA_RESUMO_SELECT)
    .order("nome", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((l) => mapReceitaResumo(l as unknown as Record<string, unknown>));
}

export async function getReceita(id: string): Promise<Receita | null> {
  const [receitaRes, itensRes] = await Promise.all([
    supabase.from("dieta_receitas").select("id, nome").eq("id", id).maybeSingle(),
    supabase
      .from("dieta_receita_itens")
      .select(
        "id, alimento_id, quantidade, ordem, alimento:alimentos(nome, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g)",
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
    calorias: round1(itens.reduce((acc, it) => acc + it.calorias, 0)),
    itens,
  };
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
  }));
  const { error } = await supabase.from("diario_alimentos").insert(linhas);
  if (error) throw error;
}
