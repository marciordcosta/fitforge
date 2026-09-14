import { registrarGuardaSaida, limparGuardaSaida } from "./router.svelte";

/**
 * Conecta o dirty-check de uma tela (função `estaSujo`, já existente em cada tela — ex:
 * `editorSujo`, `temAlteracoes()`) ao voltar FÍSICO/gesto, além do botão de voltar do app (que
 * cada tela já intercepta por conta própria). Uso típico dentro do <script> de uma tela:
 *
 *   const guarda = criarGuardaSaida(() => sujo);
 *   // no ConfirmDialog de "descartar alterações?" que já existe pro botão do app:
 *   function aoConfirmarDescarte() {
 *     mostrarConfirmDoBotao = false;
 *     guarda.resolverSaida(() => voltar("/pai"));
 *   }
 *   function aoCancelarDialogo() {
 *     mostrarConfirmDoBotao = false;
 *     guarda.cancelar();
 *   }
 *   // template: {#if mostrarConfirmDoBotao || guarda.confirmando} <ConfirmDialog .../> {/if}
 *
 * Se salvar (em vez de descartar) também deve fechar a tela, chame `voltar(...)`/`fecharLocal`
 * dentro do próprio `resolverSaida(fecharLocal)` depois de persistir — o mesmo `fecharLocal` serve
 * pros dois casos (veio do botão, ou veio do voltar físico).
 */
export function criarGuardaSaida(estaSujo: () => boolean) {
  let confirmando = $state(false);
  let prosseguirPendente: (() => void) | null = null;
  /** true depois que resolverSaida decide sair de vez — nunca mais rearma daí em diante, mesmo
   * que estaSujo() volte a "true" nesse meio-tempo (ex: a própria tela limpa o rascunho/sessão
   * antes de navegar, o que costuma zerar um "original" e fazer o dirty-check reagir como se
   * tivesse alteração de novo — sem essa trava, o alerta reaparecia bem na hora de sair depois de
   * salvar com sucesso). */
  let saindo = false;

  function armar(): void {
    if (saindo) return;
    registrarGuardaSaida((prosseguir) => {
      prosseguirPendente = prosseguir;
      confirmando = true;
    });
  }

  // Sem cleanup no unmount de propósito: um unmount fora do fluxo de voltar já guardado (ex:
  // trocar de aba pela navegação inferior enquanto essa tela está suja) não deve disparar um
  // window.history.back() por conta própria — isso navegaria o usuário pra longe de onde ele
  // acabou de escolher ir. As chamadas explícitas de cada tela (limpar o dirty-flag antes de
  // resolverSaida) já desarmam o degrau no fluxo normal.
  $effect(() => {
    if (!saindo && estaSujo()) armar();
    else limparGuardaSaida();
  });

  return {
    /** true quando o voltar físico foi interceptado e o alerta precisa aparecer. */
    get confirmando() {
      return confirmando;
    },
    /** Usuário cancelou o alerta (quer continuar editando) — não sai. Rearma na hora: o $effect só
     * reagiria a uma mudança de `estaSujo()`, que aqui não mudou (continua sujo). */
    cancelar(): void {
      confirmando = false;
      prosseguirPendente = null;
      if (estaSujo()) armar();
    },
    /** Usuário confirmou (salvar ou descartar) — `fecharLocal` deve fazer o que o botão de voltar
     * do app já faz (persistir se for o caso, e navegar) quando o alerta NÃO veio do voltar físico;
     * quando veio de lá, libera o voltar físico pendente em vez de navegar de novo por conta
     * própria (senão navegaria duas vezes). Chame só DEPOIS de já ter limpado o dirty-flag local,
     * senão o degrau de proteção seria religado por engano no meio do caminho. */
    resolverSaida(fecharLocal: () => void): void {
      confirmando = false;
      saindo = true;
      const p = prosseguirPendente;
      prosseguirPendente = null;
      if (p) {
        p();
      } else {
        // Ainda pode estar armado (o $effect que desarma sozinho só roda depois deste tick) —
        // desarma na mão antes de navegar, senão o primeiro passo do voltar só consumiria o
        // degrau de proteção (mesma URL) em vez de sair de verdade.
        limparGuardaSaida();
        fecharLocal();
      }
    },
  };
}
