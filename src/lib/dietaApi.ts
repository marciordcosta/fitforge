import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

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
}

export async function listRefeicoesModelo(): Promise<RefeicaoModelo[]> {
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .select("id, nome")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function criarRefeicaoModelo(nome: string): Promise<string> {
  const { data, error } = await supabase
    .from("dieta_refeicoes_modelo")
    .insert({ user_id: uid(), nome })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function atualizarRefeicaoModelo(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").update({ nome }).eq("id", id);
  if (error) throw error;
}

export async function excluirRefeicaoModelo(id: string): Promise<void> {
  const { error } = await supabase.from("dieta_refeicoes_modelo").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Refeições do dia (dinâmicas, nomeadas pelo usuário) ----------------

export interface RefeicaoDia {
  id: string;
  nome: string;
  data: string;
}

export async function getRefeicoesDoDia(data: string): Promise<RefeicaoDia[]> {
  const { data: linhas, error } = await supabase
    .from("dieta_refeicoes_dia")
    .select("id, nome, data")
    .eq("data", data)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return linhas ?? [];
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

export async function removerItemDiario(id: string): Promise<void> {
  const { error } = await supabase.from("diario_alimentos").delete().eq("id", id);
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

// ---------------- Receitas (combo reutilizável de vários alimentos já cadastrados) ----------------

export interface ReceitaResumo {
  id: string;
  nome: string;
}

export interface ReceitaItem {
  alimentoId: string;
  nome: string;
  quantidade: number;
  unidade: string;
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
  const fator = (l.quantidade as number) / (a.porcao_padrao_qtd as number);
  return {
    alimentoId: l.alimento_id as string,
    nome: a.nome as string,
    quantidade: l.quantidade as number,
    unidade: a.porcao_padrao_unidade as string,
    calorias: round1((a.calorias_por_porcao as number) * fator),
    proteinaG: round1((a.proteina_g as number) * fator),
    gorduraG: round1((a.gordura_g as number) * fator),
    carboidratoG: round1((a.carboidrato_g as number) * fator),
  };
}

export async function buscarReceitas(query: string): Promise<ReceitaResumo[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await porPalavras(supabase.from("dieta_receitas").select("id, nome"), "nome", termo)
    .order("nome", { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function listReceitas(limite = 50): Promise<ReceitaResumo[]> {
  const { data, error } = await supabase
    .from("dieta_receitas")
    .select("id, nome")
    .order("nome", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

export async function getReceita(id: string): Promise<Receita | null> {
  const [receitaRes, itensRes] = await Promise.all([
    supabase.from("dieta_receitas").select("id, nome").eq("id", id).maybeSingle(),
    supabase
      .from("dieta_receita_itens")
      .select(
        "alimento_id, quantidade, ordem, alimento:alimentos(nome, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g)",
      )
      .eq("receita_id", id)
      .order("ordem", { ascending: true }),
  ]);
  if (receitaRes.error) throw receitaRes.error;
  if (itensRes.error) throw itensRes.error;
  if (!receitaRes.data) return null;
  return {
    id: receitaRes.data.id,
    nome: receitaRes.data.nome,
    itens: (itensRes.data ?? []).map((l) => mapReceitaItem(l as Record<string, unknown>)),
  };
}

export async function criarReceita(nome: string, itens: { alimentoId: string; quantidade: number }[]): Promise<string> {
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
