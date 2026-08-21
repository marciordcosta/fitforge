/**
 * Estado da edição de rotina em andamento, guardado fora do componente para
 * sobreviver a navegações (ex: ir ver/editar um exercício e voltar) — só é
 * limpo quando o usuário salva ou descarta explicitamente.
 */

export interface LinhaSerie {
  serie: number;
  peso_alvo: number | null;
  rep_min: number | null;
  rep_max: number | null;
}

export interface Linha {
  exercicio_id: string;
  nome: string;
  descanso_seg: number | null;
  observacao: string | null;
  series: LinhaSerie[];
}

export interface SessaoEdicaoRotina {
  treinoId: string | null;
  nomeTreino: string;
  diaSemana: number | null;
  linhas: Linha[];
}

let atual = $state<SessaoEdicaoRotina | null>(null);
/** Snapshot (JSON) do estado original, pra saber se algo mudou de verdade antes de perguntar se quer descartar. */
let original = $state<string | null>(null);

export const rotinaEditorSessao = {
  get atual(): SessaoEdicaoRotina | null {
    return atual;
  },
  get original(): string | null {
    return original;
  },
  iniciar(dados: SessaoEdicaoRotina): void {
    atual = dados;
  },
  definirOriginal(snapshot: string): void {
    original = snapshot;
  },
  limpar(): void {
    atual = null;
    original = null;
  },
};
