<script lang="ts">
  import { router, navigate } from "./lib/router.svelte";
  import { auth, logout } from "./lib/auth.svelte";
  import { treinoLogSessao } from "./lib/treinoLogSessao.svelte";
  import BottomNav from "./components/BottomNav.svelte";
  import TreinoMinimizado from "./components/TreinoMinimizado.svelte";
  import Toast from "./components/Toast.svelte";
  import Login from "./routes/login/Login.svelte";
  import Home from "./routes/Home.svelte";
  import HomeParametrizacao from "./routes/home/HomeParametrizacao.svelte";
  import Treino from "./routes/treino/Treino.svelte";
  import Peso from "./routes/peso/Peso.svelte";
  import Dieta from "./routes/dieta/Dieta.svelte";
  import Fotos from "./routes/fotos/Fotos.svelte";

  /** As 5 abas principais ficam sempre montadas (escondidas via `hidden`, nunca destruídas) assim
   * que o usuário loga — cada uma carrega seus dados uma única vez (no boot, em paralelo) e trocar
   * de aba depois disso é instantâneo, sem refetch nem tela de "Carregando…" a cada troca. */
  const abaAtiva = $derived.by(() => {
    if (router.path.startsWith("/treino")) return "treino";
    if (router.path.startsWith("/peso")) return "peso";
    if (router.path.startsWith("/dieta")) return "dieta";
    if (router.path.startsWith("/fotos")) return "fotos";
    if (router.path === "/inicio/configurar") return "configurar";
    return "home";
  });

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
  <div hidden={abaAtiva !== "home"}><Home /></div>
  <div hidden={abaAtiva !== "treino"}><Treino /></div>
  <div hidden={abaAtiva !== "peso"}><Peso /></div>
  <div hidden={abaAtiva !== "dieta"}><Dieta /></div>
  <div hidden={abaAtiva !== "fotos"}><Fotos /></div>
  {#if abaAtiva === "configurar"}
    <HomeParametrizacao />
  {/if}
  {#if !router.path.startsWith("/treino/log/") && !router.path.startsWith("/fotos/comparar/")}
    {#if treinoLogSessao.atual}
      <TreinoMinimizado />
    {/if}
    <BottomNav />
  {/if}
  <Toast />
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
