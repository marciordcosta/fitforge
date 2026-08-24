import { mount } from 'svelte'
import './styles/tokens.css'
import App from './App.svelte'

if ('serviceWorker' in navigator) {
  let recarregado = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregado) return
    recarregado = true
    window.location.reload()
  })
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
