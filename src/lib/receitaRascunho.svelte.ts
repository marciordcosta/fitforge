import type { Alimento } from "./dietaApi";

export interface ItemRascunho {
  alimento: Alimento;
  quantidade: number;
}

/**
 * Estado da refeição (receita) sendo montada/editada — vive fora do componente pra sobreviver
 * à navegação até as telas de Alimentos/Scanear e voltar com os itens já escolhidos.
 * `contexto` identifica a sessão de edição ("nova" pra Nova Refeição, ou o id da receita sendo
 * editada) — sempre que um item é adicionado com um contexto diferente do atual, o rascunho
 * anterior (de uma sessão abandonada sem salvar) é descartado automaticamente antes.
 */
export const receitaRascunho = $state({ nome: "", itens: [] as ItemRascunho[], contexto: null as string | null });

export function definirContexto(contexto: string) {
  if (receitaRascunho.contexto !== contexto) {
    receitaRascunho.nome = "";
    receitaRascunho.itens = [];
    receitaRascunho.contexto = contexto;
  }
}

export function adicionarAoRascunho(alimento: Alimento, quantidade: number = alimento.porcaoPadraoQtd) {
  receitaRascunho.itens.push({ alimento, quantidade });
}

export function removerDoRascunho(index: number) {
  receitaRascunho.itens.splice(index, 1);
}

export function limparRascunho() {
  receitaRascunho.nome = "";
  receitaRascunho.itens = [];
  receitaRascunho.contexto = null;
}
