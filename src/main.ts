import { mount } from 'svelte'
import './styles/tokens.css'
import App from './App.svelte'

if ('serviceWorker' in navigator) {
  const CHAVE_RECARREGADO = 'fitforge_sw_recarregado'
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    try {
      if (sessionStorage.getItem(CHAVE_RECARREGADO)) return
      sessionStorage.setItem(CHAVE_RECARREGADO, '1')
    } catch {
      // localStorage/sessionStorage indisponível (ex: modo privado) — recarrega mesmo assim, sem trava-loop.
    }
    window.location.reload()
  })
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
