<script lang="ts">
  import { untrack } from "svelte";
  import { router, navigate } from "./lib/router.svelte";
  import { auth, logout } from "./lib/auth.svelte";
  import { treinoLogSessao } from "./lib/treinoLogSessao.svelte";
  import { iniciarSyncEngine, configurarAvisoFalha } from "./lib/offline/syncEngine";
  import { filaSincronizacao } from "./lib/offline/queue.svelte";
  import { mostrarToast } from "./lib/toast.svelte";
  import BottomNav from "./components/BottomNav.svelte";
  import TreinoMinimizado from "./components/TreinoMinimizado.svelte";
  import TreinoTopoFixo from "./components/TreinoTopoFixo.svelte";
  import Toast from "./components/Toast.svelte";
  import Login from "./routes/login/Login.svelte";
  import RedefinirSenha from "./routes/login/RedefinirSenha.svelte";
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

  /** Direção da última troca de aba (frente = indo pra direita na ordem do BottomNav, tras = pra
   * esquerda) — só pra animação de entrada saber de que lado deslizar, ver `.aba-entrada-*` no
   * template/estilo. `abaAnterior` é uma variável comum (não $state) de propósito: só serve de
   * "memória" pro efeito comparar, não precisa disparar re-render sozinha. */
  let abaAnterior = untrack(() => abaAtiva);
  let direcaoTransicaoAba = $state<"frente" | "tras">("frente");
  $effect(() => {
    const atual = abaAtiva;
    const idxAtual = ABAS_SWIPE.findIndex((a) => a.chave === atual);
    const idxAnterior = ABAS_SWIPE.findIndex((a) => a.chave === abaAnterior);
    if (idxAtual !== -1 && idxAnterior !== -1 && idxAtual !== idxAnterior) {
      direcaoTransicaoAba = idxAtual > idxAnterior ? "frente" : "tras";
    }
    abaAnterior = atual;
  });

  // Fila de sincronização (offline/queue.ts): drena sozinha quando a conexão volta — ver
  // lib/offline/syncEngine.ts. Uma operação que falha de verdade (não por falta de rede)
  // depois de várias tentativas avisa aqui, num toast simples.
  configurarAvisoFalha((descricao, erro) => {
    mostrarToast(`Não sincronizou: ${descricao} — ${erro.message}`, 5000);
  });
  iniciarSyncEngine();

  let blockedAlertShown = false;

  $effect(() => {
    if (auth.loading) return;

    if (auth.user && !auth.isAllowed) {
      if (!blockedAlertShown) {
        blockedAlertShown = true;
        alert("[debug] Acesso não autorizado. user=" + JSON.stringify(auth.user?.email) + " isAllowed=" + auth.isAllowed);
        void logout().then(() => navigate("/login"));
      }
      return;
    }

    if (!auth.user) {
      // TEMPORÁRIO — diagnóstico do login com Google (ver conversa).
      alert("[debug] auth.user está vazio aqui. router.path=" + router.path);
      if (router.path !== "/login") navigate("/login");
      return;
    }

    if (router.path === "/login") navigate("/");
  });
</script>

{#if auth.loading}
  <div class="loading">Carregando…</div>
{:else if auth.emRecuperacao}
  <RedefinirSenha />
{:else if router.path === "/login"}
  <Login />
{:else if auth.user && auth.isAllowed}
  {#if mostrarFlutuantes && treinoLogSessao.atual}
    <TreinoTopoFixo />
  {/if}
  <div hidden={abaAtiva !== "home"} class="aba-entrada aba-entrada-{direcaoTransicaoAba}"><Home /></div>
  <div hidden={abaAtiva !== "treino"} class="aba-entrada aba-entrada-{direcaoTransicaoAba}"><Treino /></div>
  <div hidden={abaAtiva !== "peso"} class="aba-entrada aba-entrada-{direcaoTransicaoAba}"><Peso /></div>
  <div hidden={abaAtiva !== "dieta"} class="aba-entrada aba-entrada-{direcaoTransicaoAba}"><Dieta /></div>
  <div hidden={abaAtiva !== "fotos"} class="aba-entrada aba-entrada-{direcaoTransicaoAba}"><Fotos /></div>
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
  {#if filaSincronizacao.pendentes > 0}
    <div class="pendente-sync" role="status">
      {filaSincronizacao.pendentes} {filaSincronizacao.pendentes === 1 ? "alteração" : "alterações"} não sincronizada{filaSincronizacao.pendentes === 1 ? "" : "s"}
    </div>
  {/if}
  <Toast />
{/if}

<style>
  /* display:none -> visível reinicia animation do zero sozinho (diferente de transition, que não
     roda em toggle de display) — é o que faz a troca de aba parecer suave em vez do corte seco de
     antes, sem precisar manter as duas abas montadas lado a lado (o de saída só some, sem animar). */
  .aba-entrada-frente {
    animation: aba-entra-frente 220ms ease-out;
  }
  .aba-entrada-tras {
    animation: aba-entra-tras 220ms ease-out;
  }
  @keyframes aba-entra-frente {
    from {
      opacity: 0;
      transform: translateX(18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes aba-entra-tras {
    from {
      opacity: 0;
      transform: translateX(-18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
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
  .pendente-sync {
    position: fixed;
    left: 50%;
    bottom: calc(var(--bottom-nav-height, 0px) + var(--space-4) + 44px);
    transform: translateX(-50%);
    background: var(--surface-card);
    color: var(--surface-muted);
    border: 1px solid var(--surface-border);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
    font-size: 12px;
    font-weight: 600;
    z-index: 399;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
