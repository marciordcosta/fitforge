import type { TreinoComExercicios } from "./treinoApi";

/**
 * Rascunho do editor completo de rotina (DistribuicaoMusculos.svelte), guardado fora do
 * componente para sobreviver a navegações temporárias pra fora da tela (ex: ver detalhes de um
 * exercício, ou o histórico, e voltar) sem perder o que ainda não foi salvo -- sem isso, sair da
 * rota /treino/distribuicao e voltar recriava o componente do zero, e o editor reabria a partir
 * do que já está salvo no banco, descartando silenciosamente qualquer edição pendente. Só é
 * limpo ao salvar ou descartar o editor explicitamente.
 */

export interface BaselineEditorRotina {
  seriesPorExercicio: Map<string, number>;
  totalPorMusculo: Map<string, number>;
}

/** "Mover"/"Substituir Exercício" (troca) envolvem uma SEGUNDA rotina que não está aberta no
 * editor — fica registrado aqui até Salvar, junto do resto do rascunho, pra também ser
 * descartável. `exercicioSaiTreinoExercicioId` só existe na troca (o exercício que sai de lá pra
 * dar lugar ao que está entrando); ausente no mover simples (a rotina de destino só ganha). */
export interface PendenteMoverTrocar {
  destinoTreinoId: string;
  destinoTreinoNome: string;
  exercicioEntraId: string;
  exercicioEntraNumSeries: number;
  exercicioSaiTreinoExercicioId?: string;
  /** Ordem que o exercício que sai (exercicioSaiTreinoExercicioId) tinha na rotina de destino —
   * só existe na troca; o que entra assume essa mesma posição, no lugar de ir pro fim da lista. */
  destinoOrdem?: number;
}

export interface RascunhoEditorRotina {
  treinoId: string;
  treino: TreinoComExercicios;
  baseline: BaselineEditorRotina;
  sujo: boolean;
  pendentes: PendenteMoverTrocar[];
  /** Dia da semana ANTES de qualquer edição no rascunho — usado ao Salvar pra saber se o dia foi
   * mudado (e só então chamar renameTreino; mudar o dia dentro do editor não grava na hora). */
  diaSemanaOriginal: number | null;
}

let atual = $state<RascunhoEditorRotina | null>(null);

export const treinoEditorRascunho = {
  get atual(): RascunhoEditorRotina | null {
    return atual;
  },
  definir(rascunho: RascunhoEditorRotina): void {
    atual = rascunho;
  },
  limpar(): void {
    atual = null;
  },
};
