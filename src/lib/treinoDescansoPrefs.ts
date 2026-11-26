/** Preferência do cronômetro de descanso do treino ao vivo — guardada no próprio aparelho
 * (localStorage), igual às demais preferências de exibição. Lida tanto pela tela do treino
 * (TreinoLog.svelte) quanto pela barra minimizada (TreinoMinimizado.svelte) e escrita em
 * Treino > Parametrização.
 *
 * "regressivo" (padrão, como sempre foi): ao chegar em 0:00 o cronômetro continua visível contando o
 * atraso em negativo (-0:05, -0:06…) até pular ou iniciar outro descanso. "zerar": ao chegar em
 * 0:00 o cronômetro encerra e some sozinho (o aviso de descanso terminado continua tocando). */
export type FimDoDescanso = "regressivo" | "zerar";

const CHAVE_FIM_DO_DESCANSO = "fitforge_treino_fim_do_descanso";

export function lerFimDoDescanso(): FimDoDescanso {
  try {
    return localStorage.getItem(CHAVE_FIM_DO_DESCANSO) === "zerar" ? "zerar" : "regressivo";
  } catch {
    return "regressivo";
  }
}

export function gravarFimDoDescanso(valor: FimDoDescanso): void {
  try {
    localStorage.setItem(CHAVE_FIM_DO_DESCANSO, valor);
  } catch {
    // sem localStorage: a preferência só não persiste
  }
}
