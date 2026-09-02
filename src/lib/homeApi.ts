import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

function uid(): string {
  const id = auth.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

export type HomeCardTipo = "peso_atual" | "proximo_treino" | "calorias_dia" | "refeicoes_dia";

export interface HomeCardDefinicao {
  tipo: HomeCardTipo;
  titulo: string;
  descricao: string;
}

/** Catálogo de cards disponíveis pra Início — a ordem aqui é a ordem padrão do primeiro acesso. */
export const CATALOGO_CARDS: HomeCardDefinicao[] = [
  { tipo: "peso_atual", titulo: "Peso atual", descricao: "Média móvel, peso do dia e dias pro objetivo" },
  { tipo: "proximo_treino", titulo: "Próximo treino", descricao: "Rotina agendada pra hoje" },
  { tipo: "calorias_dia", titulo: "Calorias do dia", descricao: "Consumido vs. meta" },
  { tipo: "refeicoes_dia", titulo: "Refeições do dia", descricao: "Quantas já foram registradas" },
];

const TIPOS_VALIDOS = new Set<string>(CATALOGO_CARDS.map((c) => c.tipo));

/** Ordem/seleção ativa de cards da Início. Sem nenhuma linha salva ainda (primeiro acesso) — todos os cards, na ordem do catálogo. */
export async function getLayoutHome(): Promise<HomeCardTipo[]> {
  const { data, error } = await supabase
    .from("home_cards")
    .select("tipo, ordem")
    .eq("user_id", uid())
    .order("ordem", { ascending: true });
  if (error) throw error;
  if (!data.length) return CATALOGO_CARDS.map((c) => c.tipo);
  return data.map((d) => d.tipo as HomeCardTipo).filter((t) => TIPOS_VALIDOS.has(t));
}

/** Substitui a lista inteira (ordem = posição no array) — mais simples que diffs, a tabela é só preferência de UI. */
export async function salvarLayoutHome(tipos: HomeCardTipo[]): Promise<void> {
  const userId = uid();
  const { error: delErro } = await supabase.from("home_cards").delete().eq("user_id", userId);
  if (delErro) throw delErro;
  if (!tipos.length) return;
  const { error } = await supabase.from("home_cards").insert(tipos.map((tipo, i) => ({ user_id: userId, tipo, ordem: i })));
  if (error) throw error;
}
