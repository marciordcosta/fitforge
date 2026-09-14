import { registrarGuardaSaida, limparGuardaSaida } from "./router.svelte";

/**
 * Conecta o dirty-check de uma tela (função `estaSujo`, já existente em cada tela — ex:
 * `editorSujo`, `temAlteracoes()`) ao voltar FÍSICO/gesto, além do botão de voltar do app (que
 * cada tela já intercepta por conta própria). Uso típico dentro do <script> de uma tela:
 *
 *   const guarda = criarGuardaSaida(() => sujo);
 *   // no ConfirmDialog de "descartar alterações?" que já existe pro botão do app:
 *   function aoDescartar() { guarda.resolverDescarte(() => voltar("/pai")); }
 *   function aoCancelarDialogo() { guarda.cancelar(); }
 *   // template: {#if confirmandoSaida || guarda.confirmando} <ConfirmDialog .../> {/if}
 */
export function criarGuardaSaida(estaSujo: () => boolean) {
  let confirmando = $state(false);
  let prosseguirPendente: (() => void) | null = null;

  $effect(() => {
    if (estaSujo()) {
      registrarGuardaSaida((prosseguir) => {
        prosseguirPendente = prosseguir;
        confirmando = true;
      });
    } else {
      limparGuardaSaida();
    }
    return () => limparGuardaSaida();
  });

  return {
    /** true quando o voltar físico foi interceptado e o alerta precisa aparecer. */
    get confirmando() {
      return confirmando;
    },
    /** Usuário cancelou o alerta (quer continuar editando) — não sai, o degrau de proteção
     * já foi religado automaticamente (limparGuardaSaida + $effect rearmam sozinhos). */
    cancelar(): void {
      confirmando = false;
      prosseguirPendente = null;
    },
    /** Usuário confirmou (salvar ou descartar) — chama `fecharLocal` (o mesmo fechamento que o
     * botão de voltar do app já usa) quando o alerta não veio do voltar físico, ou libera o voltar
     * físico pendente quando veio de lá. */
    resolverSaida(fecharLocal: () => void): void {
      confirmando = false;
      const p = prosseguirPendente;
      prosseguirPendente = null;
      if (p) p();
      else fecharLocal();
    },
  };
}
