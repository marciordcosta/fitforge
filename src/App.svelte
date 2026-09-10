<script lang="ts">
  import { router, navigate } from "./lib/router.svelte";
  import { auth, logout } from "./lib/auth.svelte";
  import { treinoLogSessao } from "./lib/treinoLogSessao.svelte";
  import BottomNav from "./components/BottomNav.svelte";
  import TreinoMinimizado from "./components/TreinoMinimizado.svelte";
  import Login from "./routes/login/Login.svelte";
  import Home from "./routes/Home.svelte";
  import Placeholder from "./routes/Placeholder.svelte";

  const sectionTitles: Record<string, string> = {
    "/treino": "Treino",
  };

  let blockedAlertShown = false;

  $effect(() => {
    if (auth.loading) return;

    if (auth.user && !auth.isAllowed) {
      if (!blockedAlertShown) {
        blockedAlertShown = true;
        alert("Acesso não autorizado.");
        void logout().then(() => navigate("/login"));
      }
      return;
    }

    if (!auth.user) {
      if (router.path !== "/login") navigate("/login");
      return;
    }

    if (router.path === "/login") navigate("/");
  });
</script>

{#if auth.loading}
  <div class="loading">Carregando…</div>
{:else if router.path === "/login"}
  <Login />
{:else if auth.user && auth.isAllowed}
  {#if router.path === "/"}
    <Home />
  {:else if router.path === "/inicio/configurar"}
    {#await import("./routes/home/HomeParametrizacao.svelte")}
      <div class="loading">Carregando…</div>
    {:then { default: HomeParametrizacao }}
      <HomeParametrizacao />
    {/await}
  {:else if router.path.startsWith("/treino")}
    {#await import("./routes/treino/Treino.svelte")}
      <div class="loading">Carregando…</div>
    {:then { default: Treino }}
      <Treino />
    {/await}
  {:else if router.path.startsWith("/peso")}
    {#await import("./routes/peso/Peso.svelte")}
      <div class="loading">Carregando…</div>
    {:then { default: Peso }}
      <Peso />
    {/await}
  {:else if router.path.startsWith("/dieta")}
    {#await import("./routes/dieta/Dieta.svelte")}
      <div class="loading">Carregando…</div>
    {:then { default: Dieta }}
      <Dieta />
    {/await}
  {:else if router.path.startsWith("/fotos")}
    {#await import("./routes/fotos/Fotos.svelte")}
      <div class="loading">Carregando…</div>
    {:then { default: Fotos }}
      <Fotos />
    {/await}
  {:else if sectionTitles[router.path]}
    <Placeholder titulo={sectionTitles[router.path]} />
  {:else}
    <Home />
  {/if}
  {#if !router.path.startsWith("/treino/log/") && !router.path.startsWith("/fotos/comparar/")}
    {#if treinoLogSessao.atual}
      <TreinoMinimizado />
    {/if}
    <BottomNav />
  {/if}
{/if}

<style>
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
  }
</style>
