<script lang="ts">
  import { router, navigate } from "./lib/router.svelte";
  import { auth, logout } from "./lib/auth.svelte";
  import { treinoLogSessao } from "./lib/treinoLogSessao.svelte";
  import BottomNav from "./components/BottomNav.svelte";
  import TreinoMinimizado from "./components/TreinoMinimizado.svelte";
  import TreinoTopoFixo from "./components/TreinoTopoFixo.svelte";
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

  /** As telas fora da rotina ao vivo / comparação de fotos (essas duas já são cheias e cuidam do
   * próprio topo) — usado tanto pelo TreinoTopoFixo (antes das abas, ver template) quanto pelo
   * TreinoMinimizado/BottomNav logo abaixo. */
  const mostrarFlutuantes = $derived(
    !router.path.startsWith("/treino/log/") && !router.path.startsWith("/fotos/comparar/"),
  );

  /** Arrastar a partir da borda esquerda/direita da tela troca de módulo (mesma ordem do
   * BottomNav). Só nas bordas (não na tela inteira) de propósito: uma faixa fininha com
   * touch-action: pan-y garante que o gesto sempre dispara (mesma técnica já usada no calendário
   * de Peso e no histórico de treino, que funcionam) sem precisar desativar a rolagem horizontal
   * nativa de nada mais no app (miniaturas de foto, anéis de macro/músculo etc. continuam intactos,
   * já que a faixa de swipe nem os alcança). */
  const ABAS_SWIPE: { chave: string; caminho: string }[] = [
    { chave: "home", caminho: "/" },
    { chave: "peso", caminho: "/peso" },
    { chave: "dieta", caminho: "/dieta" },
    { chave: "treino", caminho: "/treino" },
    { chave: "fotos", caminho: "/fotos" },
  ];
  const LIMIAR_SWIPE_ABAS_PX = 50;

  let swipeAbasInicioX: number | null = null;

  function iniciarSwipeAbas(e: PointerEvent): void {
    swipeAbasInicioX = e.clientX;
  }

  function finalizarSwipeAbas(e: PointerEvent): void {
    if (swipeAbasInicioX == null) return;
    const dx = e.clientX - swipeAbasInicioX;
    swipeAbasInicioX = null;
    if (Math.abs(dx) < LIMIAR_SWIPE_ABAS_PX) return;
    const indiceAtual = ABAS_SWIPE.findIndex((a) => a.chave === abaAtiva);
    if (indiceAtual === -1) return;
    const proximo = dx < 0 ? indiceAtual + 1 : indiceAtual - 1;
    if (proximo < 0 || proximo >= ABAS_SWIPE.length) return;
    navigate(ABAS_SWIPE[proximo].caminho);
  }

  function cancelarSwipeAbas(): void {
    swipeAbasInicioX = null;
  }

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
  {#if mostrarFlutuantes && treinoLogSessao.atual}
    <TreinoTopoFixo />
  {/if}
  <div hidden={abaAtiva !== "home"}><Home /></div>
  <div hidden={abaAtiva !== "treino"}><Treino /></div>
  <div hidden={abaAtiva !== "peso"}><Peso /></div>
  <div hidden={abaAtiva !== "dieta"}><Dieta /></div>
  <div hidden={abaAtiva !== "fotos"}><Fotos /></div>
  {#if abaAtiva === "configurar"}
    <HomeParametrizacao />
  {/if}
  {#if mostrarFlutuantes}
    {#if treinoLogSessao.atual}
      <TreinoMinimizado />
    {/if}
    <div
      class="swipe-borda esquerda"
      role="presentation"
      onpointerdown={iniciarSwipeAbas}
      onpointerup={finalizarSwipeAbas}
      onpointercancel={cancelarSwipeAbas}
    ></div>
    <div
      class="swipe-borda direita"
      role="presentation"
      onpointerdown={iniciarSwipeAbas}
      onpointerup={finalizarSwipeAbas}
      onpointercancel={cancelarSwipeAbas}
    ></div>
    <BottomNav />
  {/if}
  <Toast />
{/if}

<style>
  .swipe-borda {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 24px;
    z-index: 45;
    touch-action: pan-y;
  }
  .swipe-borda.esquerda {
    left: 0;
  }
  .swipe-borda.direita {
    right: 0;
  }
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
  }
</style>
