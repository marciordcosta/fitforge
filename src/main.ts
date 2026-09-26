import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import App from './App.svelte'

// O service worker (registerType: 'autoUpdate') baixa e ativa versões novas sozinho em
// segundo plano, mas isso NÃO troca o JS que já está rodando na aba/WebView aberta -- só a
// próxima navegação/reload pega o bundle novo. Num SPA que nunca navega de verdade (e no apk
// nativo, cujo processo pode ficar vivo por dias sem ser morto), isso deixava o app preso
// numa versão antiga indefinidamente mesmo com o site em produção já atualizado -- causa raiz
// dos vários "ainda não atualizou" ao longo do desenvolvimento. Aqui: assim que o novo
// service worker assume o controle, recarrega a página sozinho; e ao voltar pro app depois de
// deixar em segundo plano, força uma checagem por atualização.
if ("serviceWorker" in navigator) {
  let recarregando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recarregando) return;
    recarregando = true;
    window.location.reload();
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update();
    });
  },
});

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
