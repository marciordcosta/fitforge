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

export interface RascunhoEditorRotina {
  treinoId: string;
  treino: TreinoComExercicios;
  baseline: BaselineEditorRotina;
  sujo: boolean;
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
