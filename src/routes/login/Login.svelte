<script lang="ts">
  import Card from "../../components/Card.svelte";
  import Button from "../../components/Button.svelte";
  import { supabase } from "../../lib/supabase";
  import { ALLOWED_EMAILS } from "../../lib/auth.svelte";
  import { navigate } from "../../lib/router.svelte";

  let email = $state("");
  let senha = $state("");
  let loading = $state(false);

  async function loginEmail(event: SubmitEvent) {
    event.preventDefault();

    if (!ALLOWED_EMAILS.includes(email)) {
      alert("Acesso não autorizado.");
      return;
    }

    loading = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    loading = false;

    if (error) {
      alert("Login inválido: " + error.message);
      return;
    }
    navigate("/");
  }

  async function loginGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });
  }
</script>

<div class="login-page">
  <div class="login-container">
    <h1>fitforge</h1>
    <Card>
      <form onsubmit={loginEmail}>
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autocomplete="email"
          bind:value={email}
        />
        <input
          type="password"
          placeholder="Senha"
          aria-label="Senha"
          autocomplete="current-password"
          bind:value={senha}
        />
        <Button type="submit" disabled={loading}>Entrar</Button>
      </form>
      <div class="divider">ou</div>
      <Button variant="secondary" onclick={loginGoogle}>Entrar com Google</Button>
    </Card>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-container {
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
  .divider {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin: var(--space-2) 0;
  }
</style>
