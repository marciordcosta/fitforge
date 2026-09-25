<script lang="ts">
  import Card from "../../components/Card.svelte";
  import Button from "../../components/Button.svelte";
  import { supabase } from "../../lib/supabase";
  import { auth } from "../../lib/auth.svelte";

  let senha = $state("");
  let confirmarSenha = $state("");
  let salvando = $state(false);
  let erro = $state<string | null>(null);

  async function salvar(event: SubmitEvent) {
    event.preventDefault();
    erro = null;

    if (senha.length < 6) {
      erro = "A senha precisa ter pelo menos 6 caracteres.";
      return;
    }
    if (senha !== confirmarSenha) {
      erro = "As senhas não são iguais.";
      return;
    }

    salvando = true;
    const { error } = await supabase.auth.updateUser({ password: senha });
    salvando = false;

    if (error) {
      erro = error.message;
      return;
    }
    auth.concluirRecuperacao();
  }
</script>

<div class="pagina">
  <div class="container">
    <h1>Nova senha</h1>
    <Card>
      <form onsubmit={salvar}>
        <input
          type="password"
          placeholder="Nova senha"
          aria-label="Nova senha"
          autocomplete="new-password"
          bind:value={senha}
        />
        <input
          type="password"
          placeholder="Confirmar nova senha"
          aria-label="Confirmar nova senha"
          autocomplete="new-password"
          bind:value={confirmarSenha}
        />
        {#if erro}
          <p class="erro">{erro}</p>
        {/if}
        <Button type="submit" disabled={salvando}>Salvar senha</Button>
      </form>
    </Card>
  </div>
</div>

<style>
  .pagina {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    width: 100%;
    max-width: 380px;
    padding: var(--space-5);
  }
  h1 {
    text-align: center;
    margin-bottom: var(--space-5);
    font-size: 26px;
    font-weight: 600;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  input:focus {
    border-color: var(--color-primary);
    outline: none;
  }
  .erro {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-sm);
  }
</style>
