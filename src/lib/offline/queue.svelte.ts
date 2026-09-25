import { getDb, type ItemFila } from "./db";

/** Fila durável de mutações pendentes de sincronização — usada quando uma escrita
 * não pode ir direto pro Supabase (offline, ou a tentativa online falhou por erro
 * de rede). Uma função não é serializável, só o nome dela: cada `*Api.ts` que quer
 * participar registra suas funções de escrita uma vez, no boot, com
 * registrarOperacao(); o syncEngine.ts só conhece a `chave` guardada na fila e
 * procura a função correspondente nesse registry na hora de rodar. */

const registry = new Map<string, (...args: unknown[]) => Promise<void>>();

export function registrarOperacao(chave: string, fn: (...args: unknown[]) => Promise<void>): void {
  registry.set(chave, fn);
}

export function operacaoRegistrada(chave: string): ((...args: unknown[]) => Promise<void>) | undefined {
  return registry.get(chave);
}

let pendentes = $state(0);

export const filaSincronizacao = {
  get pendentes(): number {
    return pendentes;
  },
};

async function atualizarContador(): Promise<void> {
  const db = await getDb();
  pendentes = await db.count("fila");
}

void atualizarContador();

/** Guarda uma mutação pra rodar depois. `args` precisa ser serializável — quem
 * chama é responsável por converter tipos como Map antes (ex:
 * Array.from(map.entries())) e desfazer a conversão dentro da própria função
 * registrada. */
export async function enfileirar(chave: string, args: unknown[], descricao: string): Promise<void> {
  const db = await getDb();
  const item: ItemFila = {
    id: crypto.randomUUID(),
    chave,
    args,
    descricao,
    criadoEm: Date.now(),
    tentativas: 0,
  };
  await db.put("fila", item);
  await atualizarContador();
}

export async function listarFila(): Promise<ItemFila[]> {
  const db = await getDb();
  return db.getAll("fila");
}

export async function removerDaFila(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("fila", id);
  await atualizarContador();
}

export async function incrementarTentativas(item: ItemFila): Promise<void> {
  const db = await getDb();
  await db.put("fila", { ...item, tentativas: item.tentativas + 1 });
}
