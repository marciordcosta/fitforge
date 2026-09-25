import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Banco IndexedDB único do app, com 2 stores: `cache` (resultado das funções de
 * leitura, chave/valor genérico — ver cache.ts) e `fila` (mutações pendentes de
 * sincronização — ver queue.ts). Um só banco pros dois porque ambos existem pelo
 * mesmo motivo (o app funcionar sem rede) e não há necessidade de separá-los. */

export interface ItemFila {
  id: string;
  chave: string;
  args: unknown[];
  descricao: string;
  criadoEm: number;
  tentativas: number;
}

interface FitforgeDB extends DBSchema {
  cache: {
    key: string;
    value: { valor: unknown; salvoEm: number };
  };
  fila: {
    key: string;
    value: ItemFila;
  };
}

let dbPromise: Promise<IDBPDatabase<FitforgeDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<FitforgeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FitforgeDB>("fitforge", 1, {
      upgrade(db) {
        db.createObjectStore("cache");
        db.createObjectStore("fila", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}
