import { Network } from "@capacitor/network";
import { Capacitor } from "@capacitor/core";

/** Sinal reativo de conectividade — usado pelo comCache() (cache.ts) pra decidir se
 * tenta revalidar, e pelo syncEngine.ts pra saber quando drenar a fila. Dentro do
 * app nativo (Capacitor) usa o plugin @capacitor/network, que é mais confiável que
 * o navigator.onLine do WebView (que às vezes acusa "online" só por estar
 * conectado ao wifi, sem internet de verdade). No PWA/navegador comum, cai pros
 * eventos padrão de online/offline. */

let estaOnline = $state(true);

const ouvintes = new Set<() => void>();

function notificar(): void {
  for (const cb of ouvintes) cb();
}

if (Capacitor.isNativePlatform()) {
  void Network.getStatus().then((status) => {
    estaOnline = status.connected;
  });
  void Network.addListener("networkStatusChange", (status) => {
    const ficouOnline = status.connected && !estaOnline;
    estaOnline = status.connected;
    if (ficouOnline) notificar();
  });
} else if (typeof window !== "undefined") {
  estaOnline = navigator.onLine;
  window.addEventListener("online", () => {
    estaOnline = true;
    notificar();
  });
  window.addEventListener("offline", () => {
    estaOnline = false;
  });
}

export const conectividade = {
  get online(): boolean {
    return estaOnline;
  },
};

/** Chamado (pelo syncEngine) quando a conexão volta — não dispara na primeira
 * carga, só nas transições offline -> online. */
export function aoFicarOnline(cb: () => void): void {
  ouvintes.add(cb);
}
