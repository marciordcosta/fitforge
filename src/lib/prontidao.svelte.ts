/**
 * Carregamento inicial ÚNICO do app: as 4 abas principais ficam sempre montadas (App.svelte) e
 * cada uma busca os seus dados ao montar. Cada aba registra aqui as buscas iniciais
 * (aguardarCarga); o App mostra UMA tela de "Carregando…" até todas terminarem (ou até o limite de
 * segurança) e só então libera o app — assim, depois disso, trocar de aba nunca mostra
 * "carregando" nem pula. Uma vez liberado, nunca volta a travar (recargas futuras são silenciosas).
 */
const LIMITE_MS = 10_000;

let pendentes = $state(0);
let montado = $state(false);
let liberado = $state(false);

/** Registra uma busca inicial de aba. Erros não travam a liberação (cada aba trata o seu próprio). */
export function aguardarCarga(p: Promise<unknown>): void {
  if (liberado) return;
  pendentes++;
  void p
    .catch(() => {})
    .finally(() => {
      pendentes--;
    });
}

/** Chamado pelo App depois que todas as abas montaram (e já registraram suas buscas). */
export function marcarAbasMontadas(): void {
  montado = true;
  setTimeout(() => {
    liberado = true;
  }, LIMITE_MS);
}

export const prontidao = {
  get pronto(): boolean {
    return liberado || (montado && pendentes === 0);
  },
};

$effect.root(() => {
  $effect(() => {
    if (montado && pendentes === 0) liberado = true;
  });
});
