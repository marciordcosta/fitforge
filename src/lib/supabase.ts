import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { invalidarChaves, limparRecentes } from "./offline/cache.svelte";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. Copie .env.example para .env e preencha.",
  );
}

/** Listas guardadas no aparelho (comCache) que dependem de cada tabela: uma gravação na tabela
 * apaga essas listas antes de a resposta voltar pra quem gravou — a próxima leitura já vem certa. */
const LISTAS_POR_TABELA: Record<string, { namespace: string; prefixos: string[] }> = {
  exercicios: { namespace: "treino", prefixos: ["treino:listExercicios"] },
  exercicio_musculos: { namespace: "treino", prefixos: ["treino:listExercicios", "treino:listPadroes"] },
  musculos: { namespace: "treino", prefixos: ["treino:listExercicios", "treino:listPadroes", "treino:listMusculos"] },
  agrupamentos_musculares: { namespace: "treino", prefixos: ["treino:listAgrupamentos", "treino:listMusculos"] },
  padroes_movimento: { namespace: "treino", prefixos: ["treino:listExercicios", "treino:listPadroes"] },
  padrao_movimento_musculos: { namespace: "treino", prefixos: ["treino:listPadroes"] },
  treinos: { namespace: "treino", prefixos: ["treino:listTreinos"] },
  treino_exercicios: { namespace: "treino", prefixos: ["treino:listTreinos"] },
  treino_exercicio_series: { namespace: "treino", prefixos: ["treino:listTreinos"] },
};

/** Toda gravação bem-sucedida no banco (POST/PATCH/PUT/DELETE em /rest/v1/) esvazia os valores
 * "recentes" em memória (ver compartilharEmAndamento) — assim leituras guardadas por alguns segundos
 * nunca mostram dado de antes de uma escrita, mesmo de funções que não invalidam o cache. Gravar
 * itens do diário só afeta as leituras dos itens por refeição; qualquer outra tabela limpa tudo. */
const fetchComLimpeza: typeof fetch = async (entrada, init) => {
  const resposta = await fetch(entrada, init);
  const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
  if (resposta.ok && metodo !== "GET" && metodo !== "HEAD") {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    const m = url.match(/\/rest\/v1\/([^?/]+)/);
    if (m) {
      limparRecentes(m[1] === "diario_alimentos" ? "dieta:rede:itensRefeicao:" : undefined);
      const lista = LISTAS_POR_TABELA[m[1]];
      if (lista) await invalidarChaves(lista.namespace, lista.prefixos);
    }
  }
  return resposta;
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchComLimpeza },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
