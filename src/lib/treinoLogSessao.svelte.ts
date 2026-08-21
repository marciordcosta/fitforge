import type { RecordesExercicio } from "./treinoApi";

/**
 * Estado da sessão de treino ao vivo, guardado fora do componente para
 * sobreviver a navegações (ex: ir ver/editar um exercício e voltar) — o
 * cronômetro e as séries continuam de onde pararam. Só é limpo quando o
 * usuário conclui ou descarta o treino explicitamente.
 */

export interface SetSessao {
  serie: number;
  peso: number | null;
  repeticoes: number | null;
  concluida: boolean;
  anteriorPeso: number | null;
  anteriorReps: number | null;
  pesoAlvo: number | null;
  repMin: number | null;
  repMax: number | null;
  prPeso: boolean;
  prPesoDelta: number | null;
  pr1rm: boolean;
  pr1rmDelta: number | null;
  prVolume: boolean;
  prVolumeDelta: number | null;
}

export interface ExercicioSessao {
  treino_exercicio_id: string;
  exercicio_id: string;
  nome: string;
  descanso_seg: number | null;
  observacao: string | null;
  sets: SetSessao[];
  descansoAte: number | null;
  descansoNotificado: boolean;
  recordes: RecordesExercicio;
}

export interface SessaoTreinoAtiva {
  treinoId: string;
  nomeTreino: string;
  inicio: number;
  sessao: ExercicioSessao[];
  houveAlteracaoEstrutura: boolean;
}

let atual = $state<SessaoTreinoAtiva | null>(null);

export const treinoLogSessao = {
  get atual(): SessaoTreinoAtiva | null {
    return atual;
  },
  iniciar(dados: SessaoTreinoAtiva): void {
    atual = dados;
  },
  limpar(): void {
    atual = null;
  },
};
