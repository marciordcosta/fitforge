/** Ação Svelte (`use:limitarDigitos`) pra campos de número inteiro curto, como repetições: só aceita
 * dígitos e corta em `max` (padrão 2) — evita erro de digitação tipo "100" quando era "10". Não dá
 * pra usar `maxlength` em `<input type="number">` (o navegador ignora), por isso a ação: bloqueia
 * letras/ponto/sinal antes de entrar e, se mesmo assim passar do limite (ex: colar "123"), corta o
 * valor e avisa o `bind:value` disparando um novo `input`. */
export function limitarDigitos(node: HTMLInputElement, max = 2) {
  let limite = max;

  function aoAntesDeInserir(e: InputEvent): void {
    if (e.data && /\D/.test(e.data)) e.preventDefault();
  }

  function aoDigitar(): void {
    const limpo = node.value.replace(/\D/g, "").slice(0, limite);
    if (limpo !== node.value) {
      node.value = limpo;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  node.addEventListener("beforeinput", aoAntesDeInserir);
  node.addEventListener("input", aoDigitar);

  return {
    update(novoMax: number = 2) {
      limite = novoMax;
    },
    destroy() {
      node.removeEventListener("beforeinput", aoAntesDeInserir);
      node.removeEventListener("input", aoDigitar);
    },
  };
}
