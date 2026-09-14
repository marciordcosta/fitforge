/**
 * Notificação flutuante simples (canto inferior, some sozinha) — usada pra confirmar ações rápidas
 * como "Salvo", sem precisar de um alert/modal bloqueando a tela. Um único store global (montado
 * uma vez em App.svelte via <Toast />) em vez de estado local repetido em cada tela.
 */
let mensagem = $state<string | null>(null);
let timeoutId: ReturnType<typeof setTimeout> | undefined;

export function mostrarToast(texto: string, duracaoMs = 2000): void {
  mensagem = texto;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => (mensagem = null), duracaoMs);
}

export const toast = {
  get mensagem(): string | null {
    return mensagem;
  },
};
