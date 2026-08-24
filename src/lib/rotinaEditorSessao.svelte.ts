/**
 * Estado da edição de rotina em andamento, guardado fora do componente para
 * sobreviver a navegações (ex: ir ver/editar um exercício e voltar) e também
 * a recarregamentos de página (persistido no localStorage) — só é limpo
 * quando o usuário salva ou descarta explicitamente.
 */

const CHAVE_STORAGE = "fitforge_rotina_editor_ativo";

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

interface EstadoPersistido {
  atual: SessaoEdicaoRotina | null;
  original: string | null;
}

function carregarDoStorage(): EstadoPersistido {
  if (typeof localStorage === "undefined") return { atual: null, original: null };
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? (JSON.parse(bruto) as EstadoPersistido) : { atual: null, original: null };
  } catch {
    return { atual: null, original: null };
  }
}

const inicial = carregarDoStorage();

let atual = $state<SessaoEdicaoRotina | null>(inicial.atual);
/** Snapshot (JSON) do estado original, pra saber se algo mudou de verdade antes de perguntar se quer descartar. */
let original = $state<string | null>(inicial.original);

if (typeof localStorage !== "undefined") {
  $effect.root(() => {
    $effect(() => {
      if (atual) {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ atual, original }));
      } else {
        localStorage.removeItem(CHAVE_STORAGE);
      }
    });
  });
}

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
