import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

function uid(): string {
  const id = auth.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

export type Refeicao = "cafe_da_manha" | "almoco" | "jantar" | "lanche";

export const REFEICOES: { valor: Refeicao; label: string }[] = [
  { valor: "cafe_da_manha", label: "Café da Manhã" },
  { valor: "almoco", label: "Almoço" },
  { valor: "jantar", label: "Jantar" },
  { valor: "lanche", label: "Lanche" },
];

export function labelRefeicao(refeicao: Refeicao): string {
  return REFEICOES.find((r) => r.valor === refeicao)?.label ?? refeicao;
}

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
  fonte: FonteAlimento;
}

const ALIMENTO_SELECT =
  "id, nome, marca, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g, fonte";

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
    fonte: a.fonte as FonteAlimento,
  };
}

export async function buscarAlimentos(query: string): Promise<Alimento[]> {
  const termo = query.trim();
  if (!termo) return [];
  const { data, error } = await supabase
    .from("alimentos")
    .select(ALIMENTO_SELECT)
    .ilike("nome", `%${termo}%`)
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

export interface ItemDiario {
  id: string;
  alimentoId: string;
  nome: string;
  refeicao: Refeicao;
  quantidade: number;
  unidade: string;
  calorias: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
}

export async function getDiarioDoDia(data: string): Promise<ItemDiario[]> {
  const { data: linhas, error } = await supabase
    .from("diario_alimentos")
    .select(
      "id, alimento_id, refeicao, quantidade, unidade, calorias, proteina_g, gordura_g, carboidrato_g, created_at, alimento:alimentos(nome)",
    )
    .eq("data", data)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (linhas ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    alimentoId: l.alimento_id as string,
    nome: ((l.alimento as { nome: string } | null)?.nome) ?? "",
    refeicao: l.refeicao as Refeicao,
    quantidade: l.quantidade as number,
    unidade: l.unidade as string,
    calorias: l.calorias as number,
    proteinaG: l.proteina_g as number,
    gorduraG: l.gordura_g as number,
    carboidratoG: l.carboidrato_g as number,
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function adicionarItemDiario(input: {
  alimento: Alimento;
  data: string;
  refeicao: Refeicao;
  quantidade: number;
}): Promise<void> {
  const fator = input.quantidade / input.alimento.porcaoPadraoQtd;
  const { error } = await supabase.from("diario_alimentos").insert({
    user_id: uid(),
    alimento_id: input.alimento.id,
    data: input.data,
    refeicao: input.refeicao,
    quantidade: input.quantidade,
    unidade: input.alimento.porcaoPadraoUnidade,
    calorias: round1(input.alimento.caloriasPorPorcao * fator),
    proteina_g: round1(input.alimento.proteinaG * fator),
    gordura_g: round1(input.alimento.gorduraG * fator),
    carboidrato_g: round1(input.alimento.carboidratoG * fator),
  });
  if (error) throw error;
}

export async function removerItemDiario(id: string): Promise<void> {
  const { error } = await supabase.from("diario_alimentos").delete().eq("id", id);
  if (error) throw error;
}

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
  const { data, error } = await supabase
    .from("dieta_receitas")
    .select("id, nome")
    .ilike("nome", `%${termo}%`)
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
export async function adicionarReceitaAoDiario(receitaId: string, data: string, refeicao: Refeicao): Promise<void> {
  const receita = await getReceita(receitaId);
  if (!receita) throw new Error("Refeição não encontrada.");
  const linhas = receita.itens.map((it) => ({
    user_id: uid(),
    alimento_id: it.alimentoId,
    data,
    refeicao,
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
