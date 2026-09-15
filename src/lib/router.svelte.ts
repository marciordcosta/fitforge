let path = $state(window.location.pathname);
let profundidade = 0;

/** Tela atual pode registrar aqui que tem alteração pendente — usado tanto pelo botão de voltar
 * do app (que já checa isso por conta própria antes de chamar voltar()) quanto pelo gesto/botão
 * físico de voltar do celular, via popstate, que sem isso não tem como ser interceptado. Ver
 * registrarGuardaSaida/limparGuardaSaida. */
let guardaSaida: ((prosseguir: () => void) => void) | null = null;
let guardaArmada = false;

window.addEventListener("popstate", () => {
  if (guardaArmada && guardaSaida) {
    guardaArmada = false;
    if (profundidade > 0) profundidade--;
    const guarda = guardaSaida;
    guardaSaida = null;
    guarda(() => window.history.back());
    return;
  }
  path = window.location.pathname;
  if (profundidade > 0) profundidade--;
});

export function navigate(to: string): void {
  if (to !== window.location.pathname) {
    window.history.pushState({}, "", to);
    profundidade++;
  }
  // Sempre a partir do que o navegador realmente resolveu (só o caminho, sem query) — usar `to`
  // direto aqui deixava sobrar "?query" grudado no path quando `to` incluía uma, quebrando o
  // casamento de rota por segmentos nas telas que leem router.path.
  path = window.location.pathname;
}

/** Volta pra tela anterior de verdade quando houve navegação dentro do
 * app; se a tela foi aberta direto (deep link, recarregar a página, PWA
 * retomada numa rota funda), não há histórico REAL pra voltar — mas o
 * navegador pode muito bem ter uma entrada antiga (de antes desse reload)
 * logo abaixo da atual. Usar navigate() (pushState) aqui empilhava o
 * destino padrão POR CIMA dessa entrada antiga em vez de substituí-la:
 * o próximo voltar físico ou de outra tela caía de volta nela, gerando um
 * loop entre as duas telas que nunca chega no verdadeiro destino anterior.
 * replaceState troca a URL sem crescer a pilha, então isso não acontece. */
export function voltar(padrao: string): void {
  if (profundidade > 0) {
    window.history.back();
  } else if (padrao !== window.location.pathname) {
    window.history.replaceState({}, "", padrao);
    path = window.location.pathname;
  }
}

/** Tela com alteração pendente chama isso pra também proteger o voltar FÍSICO/gesto (não só o
 * botão de voltar do app, que cada tela já guarda por conta própria antes de chamar voltar()).
 * Empilha um degrau extra no histórico (mesma URL, invisível) que absorve o PRÓXIMO voltar físico
 * em vez de sair de verdade — `mostrarAlerta` decide o que fazer (normalmente: mostrar o mesmo
 * ConfirmDialog de salvar/descartar já usado no botão do app) e recebe `prosseguir`, que deve ser
 * chamado quando o usuário confirmar (só então o voltar físico realmente acontece). */
export function registrarGuardaSaida(mostrarAlerta: (prosseguir: () => void) => void): void {
  guardaSaida = mostrarAlerta;
  if (!guardaArmada) {
    window.history.pushState({}, "", window.location.pathname);
    profundidade++;
    guardaArmada = true;
  }
}

/** Tela ficou limpa (salvou, ou o próprio botão de voltar do app já tratou a saída) — desempilha
 * o degrau sem navegar de verdade: cai na mesma URL, o popstate normal só ajusta profundidade. */
export function limparGuardaSaida(): void {
  guardaSaida = null;
  if (guardaArmada) {
    guardaArmada = false;
    window.history.back();
  }
}

export const router = {
  get path() {
    return path;
  },
  navigate,
  voltar,
};
