import { getDb } from "./db";
import { conectividade } from "./connectivity.svelte";

/** Contadores de versão por namespace (ex: "treino", "dieta"), incrementados toda
 * vez que um comCache() daquele namespace revalida com sucesso — generaliza o
 * padrão que já existia só pra dieta em dietaInvalidacao.svelte.ts. Componentes que
 * já renderizaram um valor em cache observam a versão do namespace certo num
 * $effect e recarregam sozinhos quando ela muda (mesmo padrão de
 * DiarioAlimentar.svelte). */
const versoes = $state<Record<string, number>>({});

export const cacheInvalidacao = {
  versao(namespace: string): number {
    return versoes[namespace] ?? 0;
  },
};

function marcarAtualizado(namespace: string): void {
  versoes[namespace] = (versoes[namespace] ?? 0) + 1;
}

/** Stale-while-revalidate genérico: devolve o valor em cache na hora (se existir) e
 * busca fresco em paralelo, atualizando o cache e o contador de versão do
 * namespace quando a busca terminar. Sem cache local e offline, rejeita com uma
 * mensagem clara em vez de travar esperando uma rede que não vai responder.
 *
 * `chave` inclui o namespace como prefixo (ex: "treino:listTreinos") — é dela que
 * o namespace é extraído pra saber qual contador de versão incrementar. */
export async function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
  const namespace = chave.split(":")[0];
  const db = await getDb();
  const emCache = await db.get("cache", chave);

  async function revalidar(): Promise<T> {
    const valor = await buscar();
    // Só marca o namespace como "mudou" quando o conteúdo de fato mudou — sem isso,
    // um componente que observasse a versão pra recarregar entraria em loop: toda
    // recarga revalida, toda revalidação bumpava a versão, e o bump disparava outra
    // recarga, pra sempre, mesmo quando o dado voltou idêntico (o caso comum).
    if (JSON.stringify(valor) !== JSON.stringify(emCache?.valor)) {
      marcarAtualizado(namespace);
    }
    await db.put("cache", { valor, salvoEm: Date.now() }, chave);
    return valor;
  }

  if (emCache) {
    void revalidar().catch(() => {
      // Offline ou erro de rede durante a revalidação em segundo plano — o valor em
      // cache continua valendo, não há nada pra fazer aqui.
    });
    return emCache.valor as T;
  }

  if (!conectividade.online) {
    throw new Error("Sem conexão e sem dado salvo localmente ainda.");
  }

  return revalidar();
}
