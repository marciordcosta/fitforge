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

/** Geração por namespace, incrementada a cada invalidação — uma busca que COMEÇOU antes de uma
 * escrita não pode gravar o resultado (anterior à escrita) no cache depois dela. */
const geracoes: Record<string, number> = {};

function marcarAtualizado(namespace: string): void {
  versoes[namespace] = (versoes[namespace] ?? 0) + 1;
}

/** Escreve o valor direto no cache de UMA chave (sem apagar o resto do namespace) e avisa quem
 * observa — usado quando a função de escrita já SABE o novo valor certinho (ex: salvou um objeto
 * de parâmetros inteiro), então não precisa de outra ida à rede só pra reler o que acabou de
 * gravar. Evita o remount caro de invalidarNamespace quando só UMA chave do namespace mudou de
 * verdade (ex: salvarParametrosDistribuicao — não precisa também forçar listTreinos/listMusculos
 * a rebuscar, já que esses não mudaram). */
export async function atualizarCache<T>(chave: string, valor: T): Promise<void> {
  const namespace = chave.split(":")[0];
  const db = await getDb();
  await db.put("cache", { valor, salvoEm: Date.now() }, chave);
  marcarAtualizado(namespace);
}

/** Chamado pelas funções de escrita (`*Api.ts`) depois de uma mutação bem-sucedida —
 * sem isso, um `comCache()` logo em seguida (ex: o `carregar()` de sempre, chamado
 * de novo após salvar) devolvia o valor em cache de ANTES da escrita na hora, e só
 * mostrava o dado novo depois que a revalidação em segundo plano terminasse (ou, na
 * prática, só depois de atualizar a página inteira). Apaga tudo daquele namespace —
 * mais simples e seguro que tentar acertar a chave exata de cada função afetada — e
 * já bump a versão, pra quem estiver observando recarregar também. */
export async function invalidarNamespace(namespace: string): Promise<void> {
  const db = await getDb();
  geracoes[namespace] = (geracoes[namespace] ?? 0) + 1;
  limparRecentes(`${namespace}:`);
  for (const k of [...buscasEmAndamento.keys()]) if (k.startsWith(`rede:${namespace}:`) || k.startsWith(`${namespace}:rede:`)) buscasEmAndamento.delete(k);
  const chaves = await db.getAllKeys("cache");
  const doNamespace = chaves.filter((c) => c.startsWith(`${namespace}:`));
  await Promise.all(doNamespace.map((c) => db.delete("cache", c)));
  marcarAtualizado(namespace);
}

/** Igual invalidarNamespace, mas só apaga as chaves que começam com algum dos `prefixos` — pra uma
 * escrita que só afeta algumas leituras (ex: lançar um alimento só muda o diário do dia e o saldo
 * acumulado, não as metas), o resto do cache continua valendo e a tela seguinte abre na hora em vez
 * de refazer todas as consultas. Também bumpa a versão do namespace pra quem observa recarregar. */
export async function invalidarChaves(namespace: string, prefixos: string[]): Promise<void> {
  const db = await getDb();
  geracoes[namespace] = (geracoes[namespace] ?? 0) + 1;
  for (const k of [...buscasEmAndamento.keys()]) if (prefixos.some((p) => k.startsWith(`rede:${p}`))) buscasEmAndamento.delete(k);
  const chaves = await db.getAllKeys("cache");
  await Promise.all(chaves.filter((c) => prefixos.some((p) => c.startsWith(p))).map((c) => db.delete("cache", c)));
  marcarAtualizado(namespace);
}

/** Stale-while-revalidate genérico: devolve o valor em cache na hora (se existir) e
 * busca fresco em paralelo, atualizando o cache e o contador de versão do
 * namespace quando a busca terminar. Sem cache local e offline, rejeita com uma
 * mensagem clara em vez de travar esperando uma rede que não vai responder.
 *
 * `chave` inclui o namespace como prefixo (ex: "treino:listTreinos") — é dela que
 * o namespace é extraído pra saber qual contador de versão incrementar. */
/** Buscas de rede em andamento por chave de cache — chamadas simultâneas pra mesma chave (muito
 * comum: várias abas/telas montadas no boot pedindo o mesmo "peso completo", "meta" etc.)
 * compartilham UMA ida à rede em vez de cada uma disparar a sua. Some ao terminar (nunca guarda
 * valor velho: só junta quem pediu enquanto a mesma busca ainda estava no ar). */
const buscasEmAndamento = new Map<string, Promise<unknown>>();

/** Mesma ideia pra leituras SEM cache persistente (ex: perfil da dieta, parâmetros): quem chamar
 * a mesma `chave` enquanto a primeira ainda está pendente recebe a mesma promessa. Não guarda nada
 * depois de resolver, então nunca devolve dado desatualizado após uma escrita. */
/** Valores já resolvidos de leituras "quentes" (chave -> valor + validade), mantidos só na memória
 * por alguns segundos pra telas que se abrem em sequência (Diário -> refeição -> voltar) não
 * refazerem as mesmas consultas. Nunca vira dado desatualizado após uma escrita do app: o cliente
 * do Supabase (supabase.ts) chama limparRecentes() a cada gravação bem-sucedida. */
const recentes = new Map<string, { valor: unknown; expira: number }>();
let geracaoRecentes = 0;

/** Esquece os valores recentes (todos, ou só os de chave começando com `prefixo`). Uma leitura que
 * já estava no ar quando isso é chamado não grava o resultado (pode ser anterior à escrita). */
export function limparRecentes(prefixo?: string): void {
  geracaoRecentes++;
  if (!prefixo) {
    recentes.clear();
    return;
  }
  for (const k of [...recentes.keys()]) if (k.startsWith(prefixo)) recentes.delete(k);
}

export function compartilharEmAndamento<T>(chave: string, buscar: () => Promise<T>, ttlMs = 0): Promise<T> {
  if (ttlMs > 0) {
    const recente = recentes.get(chave);
    if (recente && recente.expira > Date.now()) return Promise.resolve(structuredClone(recente.valor) as T);
  }
  const existente = buscasEmAndamento.get(chave) as Promise<T> | undefined;
  if (existente) return existente;
  const geracaoInicial = geracaoRecentes;
  const promessa = buscar()
    .then((valor) => {
      // Guarda uma cópia: quem recebe o valor original pode (e costuma) mutá-lo — o estado reativo do
      // Svelte escreve direto no objeto — e isso não pode vazar pro próximo que ler do cache.
      if (ttlMs > 0 && geracaoInicial === geracaoRecentes) recentes.set(chave, { valor: structuredClone(valor), expira: Date.now() + ttlMs });
      return valor;
    })
    .finally(() => {
      if (buscasEmAndamento.get(chave) === promessa) buscasEmAndamento.delete(chave);
    });
  buscasEmAndamento.set(chave, promessa);
  return promessa;
}

export async function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
  const namespace = chave.split(":")[0];
  const db = await getDb();
  const emCache = await db.get("cache", chave);

  async function revalidar(avisarMudanca: boolean): Promise<T> {
    const geracaoInicial = geracoes[namespace] ?? 0;
    const valor = await compartilharEmAndamento(`rede:${chave}`, buscar);
    if ((geracoes[namespace] ?? 0) !== geracaoInicial) return valor;
    // Só marca o namespace como "mudou" quando o conteúdo de fato mudou (e só quando havia um
    // valor em cache ANTES, mostrado na hora pra quem chamou — ver avisarMudanca) — sem isso, um
    // componente que observasse a versão pra recarregar entraria em loop: toda recarga revalida,
    // toda revalidação bumpava a versão, e o bump disparava outra recarga, pra sempre, mesmo
    // quando o dado voltou idêntico (o caso comum). Bumpar também no caso SEM cache prévio (ex:
    // logo após invalidarNamespace apagar tudo) duplicava o aviso: quem invalidou já bumpou uma
    // vez, e cada busca "a frio" das várias chaves daquele namespace bumpava de novo, cada uma em
    // instante diferente — um efeito reativo observando a versão reconstruía a tela várias vezes
    // seguidas (relatado como "tela tremendo" ao salvar um peso novo).
    if (avisarMudanca && JSON.stringify(valor) !== JSON.stringify(emCache?.valor)) {
      marcarAtualizado(namespace);
    }
    await db.put("cache", { valor, salvoEm: Date.now() }, chave);
    return valor;
  }

  if (emCache) {
    void revalidar(true).catch(() => {
      // Offline ou erro de rede durante a revalidação em segundo plano — o valor em
      // cache continua valendo, não há nada pra fazer aqui.
    });
    return emCache.valor as T;
  }

  if (!conectividade.online) {
    throw new Error("Sem conexão e sem dado salvo localmente ainda.");
  }

  return revalidar(false);
}
