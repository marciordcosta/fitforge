let path = $state(window.location.pathname);
let profundidade = 0;

window.addEventListener("popstate", () => {
  path = window.location.pathname;
  if (profundidade > 0) profundidade--;
});

export function navigate(to: string): void {
  if (to !== window.location.pathname) {
    window.history.pushState({}, "", to);
    profundidade++;
  }
  path = to;
}

/** Volta pra tela anterior de verdade quando houve navegação dentro do
 * app; se a tela foi aberta direto (deep link, recarregar a página),
 * não há histórico pra voltar e usa o destino padrão informado. */
export function voltar(padrao: string): void {
  if (profundidade > 0) {
    window.history.back();
  } else {
    navigate(padrao);
  }
}

export const router = {
  get path() {
    return path;
  },
  navigate,
  voltar,
};
