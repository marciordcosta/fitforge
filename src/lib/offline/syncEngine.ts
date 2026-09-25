import { aoFicarOnline, conectividade } from "./connectivity.svelte";
import { listarFila, removerDaFila, incrementarTentativas, operacaoRegistrada } from "./queue.svelte";

const MAX_TENTATIVAS = 5;

/** Alerta usado quando uma operação falha de verdade (não por estar offline) depois
 * de várias tentativas — injetado por quem inicializa o syncEngine (App.svelte),
 * pra não criar uma dependência de UI dentro de lib/offline. */
let avisarFalha: ((descricao: string, erro: Error) => void) | null = null;

export function configurarAvisoFalha(cb: (descricao: string, erro: Error) => void): void {
  avisarFalha = cb;
}

let drenando = false;

/** Roda a fila em ordem (FIFO). Para na primeira falha de rede (assume que caiu a
 * conexão de novo e espera o próximo "ficar online" tentar tudo de novo); uma
 * falha que não é de rede (ex: validação do servidor) fica marcada com mais uma
 * tentativa e a fila continua pras próximas entradas, já que essa em especial
 * provavelmente vai continuar falhando até alguém olhar. */
export async function drenarFila(): Promise<void> {
  if (drenando) return;
  drenando = true;
  try {
    const itens = await listarFila();
    for (const item of itens) {
      if (!conectividade.online) return;
      const fn = operacaoRegistrada(item.chave);
      if (!fn) {
        // Operação desconhecida (ex: versão antiga do app enfileirou algo que essa
        // versão não registra mais) — não há como rodar, remove pra não travar a
        // fila pra sempre.
        await removerDaFila(item.id);
        continue;
      }
      try {
        await fn(...item.args);
        await removerDaFila(item.id);
      } catch (e) {
        if (!conectividade.online) return;
        if (item.tentativas + 1 >= MAX_TENTATIVAS) {
          avisarFalha?.(item.descricao, e as Error);
          await removerDaFila(item.id);
        } else {
          await incrementarTentativas(item);
        }
      }
    }
  } finally {
    drenando = false;
  }
}

export function iniciarSyncEngine(): void {
  if (conectividade.online) void drenarFila();
  aoFicarOnline(() => void drenarFila());
}
