import type { Alimento } from "./dietaApi";

export interface ItemRascunho {
  alimento: Alimento;
  quantidade: number;
}

/**
 * Estado da refeição (receita) sendo montada em "Nova Refeição" — vive fora do componente pra
 * sobreviver à navegação até as telas de Alimentos/Scanear e voltar com os itens já escolhidos.
 * Quem inicia um novo rascunho (o botão "Criar" da lista de refeições) é responsável por limpar.
 */
export const receitaRascunho = $state({ nome: "", itens: [] as ItemRascunho[] });

export function adicionarAoRascunho(alimento: Alimento, quantidade: number = alimento.porcaoPadraoQtd) {
  receitaRascunho.itens.push({ alimento, quantidade });
}

export function removerDoRascunho(index: number) {
  receitaRascunho.itens.splice(index, 1);
}

export function limparRascunho() {
  receitaRascunho.nome = "";
  receitaRascunho.itens = [];
}
