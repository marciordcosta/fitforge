import type { RecordesExercicio } from "./treinoApi";

/**
 * Estado da sessão de treino ao vivo, guardado fora do componente para
 * sobreviver a navegações (ex: ir ver/editar um exercício e voltar) e
 * também a recarregamentos de página (persistido no localStorage) — o
 * cronômetro e as séries continuam de onde pararam. Só é limpo quando o
 * usuário conclui ou descarta o treino explicitamente.
 */

const CHAVE_STORAGE = "fitforge_treino_ativo";

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

function carregarDoStorage(): SessaoTreinoAtiva | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? (JSON.parse(bruto) as SessaoTreinoAtiva) : null;
  } catch {
    return null;
  }
}

let atual = $state<SessaoTreinoAtiva | null>(carregarDoStorage());

if (typeof localStorage !== "undefined") {
  $effect.root(() => {
    $effect(() => {
      if (atual) {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(atual));
      } else {
        localStorage.removeItem(CHAVE_STORAGE);
      }
    });
  });
}

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
