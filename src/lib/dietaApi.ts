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
}

const ALIMENTO_SELECT =
  "id, nome, marca, porcao_padrao_qtd, porcao_padrao_unidade, calorias_por_porcao, proteina_g, gordura_g, carboidrato_g";

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

export async function criarAlimentoManual(input: {
  nome: string;
  marca: string | null;
  porcaoPadraoQtd: number;
  porcaoPadraoUnidade: string;
  caloriasPorPorcao: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
}): Promise<void> {
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
