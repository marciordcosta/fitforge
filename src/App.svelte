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

  /** Arrastar a tela pros lados troca de módulo (mesma ordem do BottomNav) — só entre os 5
   * módulos principais, não em sub-telas (ex: dentro de um exercício ou de uma rotina). */
  const ABAS_SWIPE: { chave: string; caminho: string }[] = [
    { chave: "home", caminho: "/" },
    { chave: "peso", caminho: "/peso" },
    { chave: "dieta", caminho: "/dieta" },
    { chave: "treino", caminho: "/treino" },
    { chave: "fotos", caminho: "/fotos" },
  ];
  const LIMIAR_SWIPE_ABAS_PX = 70;
  /** Se moveu mais que isso na vertical, foi rolagem da página, não um swipe de trocar de módulo. */
  const LIMIAR_VERTICAL_CANCELA_SWIPE_ABAS_PX = 60;

  let swipeAbasInicioX: number | null = null;
  let swipeAbasInicioY: number | null = null;

  /** Não inicia o swipe de módulo se o toque começou numa superfície que já tem seu próprio
   * arrasto/rolagem horizontal — em vez de listar cada tela manualmente, reaproveita convenções já
   * existentes: `touch-action: none|pan-y` é como todo arrasto horizontal próprio do app (o
   * calendário de Peso, o visualizador de fotos) já se marca pra desativar o gesto nativo do
   * navegador; e qualquer faixa com `overflow-x: auto/scroll` que realmente role (miniaturas de
   * foto, anéis de macro etc.) também bloqueia. Sheets/diálogos abertos por cima também bloqueiam,
   * senão um swipe passando por cima deles trocaria de módulo com o modal ainda aberto. */
  function alvoBloqueiaSwipeAbas(alvo: EventTarget | null): boolean {
    let el = alvo instanceof Element ? alvo : null;
    while (el && el !== document.body) {
      if (el instanceof HTMLElement) {
        const estilo = getComputedStyle(el);
        if (estilo.touchAction === "none" || estilo.touchAction === "pan-y") return true;
        if ((estilo.overflowX === "auto" || estilo.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) {
          return true;
        }
        if (
          el.classList.contains("sheet-overlay") ||
          el.classList.contains("confirm-overlay") ||
          el.classList.contains("alert-overlay")
        ) {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function aoPointerDownAbas(e: PointerEvent): void {
    // Mesma condição que já esconde BottomNav/TreinoMinimizado (rotina ao vivo, comparação de
    // fotos): nessas telas cheias, um swipe lateral não deve trocar de módulo escondido atrás.
    if (!mostrarFlutuantes) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (alvoBloqueiaSwipeAbas(e.target)) {
      swipeAbasInicioX = null;
      swipeAbasInicioY = null;
      return;
    }
    swipeAbasInicioX = e.clientX;
    swipeAbasInicioY = e.clientY;
  }

  function aoPointerUpAbas(e: PointerEvent): void {
    if (swipeAbasInicioX == null || swipeAbasInicioY == null) return;
    const dx = e.clientX - swipeAbasInicioX;
    const dy = e.clientY - swipeAbasInicioY;
    swipeAbasInicioX = null;
    swipeAbasInicioY = null;
    if (Math.abs(dy) > LIMIAR_VERTICAL_CANCELA_SWIPE_ABAS_PX) return;
    if (Math.abs(dx) < LIMIAR_SWIPE_ABAS_PX) return;
    const indiceAtual = ABAS_SWIPE.findIndex((a) => a.chave === abaAtiva);
    if (indiceAtual === -1) return;
    const proximo = dx < 0 ? indiceAtual + 1 : indiceAtual - 1;
    if (proximo < 0 || proximo >= ABAS_SWIPE.length) return;
    navigate(ABAS_SWIPE[proximo].caminho);
  }

  function aoPointerCancelAbas(): void {
    swipeAbasInicioX = null;
    swipeAbasInicioY = null;
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
  <div
    class="abas-swipe"
    role="presentation"
    onpointerdown={aoPointerDownAbas}
    onpointerup={aoPointerUpAbas}
    onpointercancel={aoPointerCancelAbas}
  >
    <div hidden={abaAtiva !== "home"}><Home /></div>
    <div hidden={abaAtiva !== "treino"}><Treino /></div>
    <div hidden={abaAtiva !== "peso"}><Peso /></div>
    <div hidden={abaAtiva !== "dieta"}><Dieta /></div>
    <div hidden={abaAtiva !== "fotos"}><Fotos /></div>
  </div>
  {#if abaAtiva === "configurar"}
    <HomeParametrizacao />
  {/if}
  {#if mostrarFlutuantes}
    {#if treinoLogSessao.atual}
      <TreinoMinimizado />
    {/if}
    <BottomNav />
  {/if}
  <Toast />
{/if}

<style>
  .abas-swipe {
    display: contents;
  }
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
  }
</style>
