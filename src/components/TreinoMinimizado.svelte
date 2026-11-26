<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { treinoLogSessao } from "../lib/treinoLogSessao.svelte";
  import { lerFimDoDescanso } from "../lib/treinoDescansoPrefs";

  /** onAbrir: usado quando essa barra aparece por cima de uma subtela da própria rotina ao vivo
   * (ex: o picker de exercícios), que cobre a lista mas não navega de verdade pra fora da rota —
   * nesse caso "abrir a rotina" é só fechar essa subtela, não um navigate (já se está na rota).
   * zIndex: sobrescreve o z-index padrão (60, calibrado pra ficar abaixo de Sheet/ActionSheet em
   * uso normal) só quando precisa ficar por cima de telas cheias específicas mais altas.
   * comBottomNav: false quando a tela por trás é cheia e não tem o <BottomNav> do app (essas
   * mesmas subtelas) — sem isso a barra ficava flutuando acima do rodapé de verdade, deixando um
   * vão vazio embaixo dela onde não existe navegação nenhuma pra reservar espaço. */
  let { onAbrir, zIndex, comBottomNav = true }: { onAbrir?: () => void; zIndex?: number; comBottomNav?: boolean } =
    $props();

  function abrirRotina(): void {
    if (onAbrir) onAbrir();
    else navigate(`/treino/log/${treinoLogSessao.atual!.treinoId}`);
  }

  let agora = $state(Date.now());
  const timerId = setInterval(() => (agora = Date.now()), 1000);
  /** setInterval fica suspenso com a tela apagada/app em segundo plano — sem isso, "agora" fica
   * preso no valor de antes e o cronômetro/anel mostra um tempo errado por um tempo ao voltar,
   * até o próximo tick corrigir sozinho (mesmo ajuste já feito em TreinoLog.svelte). */
  function resincronizarAoVoltar(): void {
    if (!document.hidden) agora = Date.now();
  }
  document.addEventListener("visibilitychange", resincronizarAoVoltar);
  window.addEventListener("focus", resincronizarAoVoltar);
  window.addEventListener("pageshow", resincronizarAoVoltar);
  $effect(() => () => {
    clearInterval(timerId);
    document.removeEventListener("visibilitychange", resincronizarAoVoltar);
    window.removeEventListener("focus", resincronizarAoVoltar);
    window.removeEventListener("pageshow", resincronizarAoVoltar);
  });

  function formatMMSS(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /** Igual a formatMMSS, mas mostra o sinal de negativo quando o descanso já passou do tempo. */
  function formatMMSSAssinado(segundos: number): string {
    return segundos < 0 ? `-${formatMMSS(-segundos)}` : formatMMSS(segundos);
  }

  /** Exclusividade do descanso: nunca mostra a duração total da rotina (isso já fica fixo no
   * TreinoTopoFixo) — sem isso, um bug de resincronização ao apagar/reacender a tela podia fazer
   * esse indicador "confundir" os dois cronômetros e mostrar o tempo errado. Sem descanso ativo,
   * o indicador simplesmente some (ver `{#if info}` no template). */
  const info = $derived.by(() => {
    const atual = treinoLogSessao.atual;
    if (!atual) return null;

    /** Mesma regra do cronômetro na tela ao vivo: continua marcando "Descanso" mesmo depois de
     * zerar (contando o atraso em negativo) até pular ou iniciar outro descanso. */
    const descansando =
      atual.sessao.find((ex) => ex.descansoAte && ex.descansoAte > agora) ??
      (lerFimDoDescanso() === "zerar" ? undefined : atual.sessao.find((ex) => ex.descansoAte != null));
    if (!descansando) return null;

    const restante = Math.ceil((descansando.descansoAte! - agora) / 1000);
    const inicioDescanso = descansando.descansoInicioEm ?? descansando.descansoAte!;
    const totalDescanso = descansando.descansoAte! - inicioDescanso;
    const progresso = totalDescanso > 0 ? Math.min(Math.max((agora - inicioDescanso) / totalDescanso, 0), 1) : 1;
    return {
      titulo: "Descanso",
      tempo: formatMMSSAssinado(restante),
      subtitulo: descansando.nome,
      atrasado: restante < 0,
      progresso,
    };
  });

  /** Só a posição da barra minimizada — tocar no nome sempre abre a rotina ao vivo; o "^" apenas
   * manda a barra pro topo (ou de volta pro rodapé), sem sair da tela atual. */
  let posicao = $state<"baixo" | "cima">("baixo");

  // O formato "relógio" (anel) foi removido: apaga as preferências antigas que ele guardava.
  try {
    localStorage.removeItem("fitforge_formato_minimizado");
    localStorage.removeItem("fitforge_formato_descanso");
  } catch {
    // sem localStorage (modo privado etc.): nada a limpar
  }
</script>

{#if treinoLogSessao.atual && info}
  <div
    class="barra"
    class:cima={posicao === "cima"}
    style={`${zIndex != null ? `z-index:${zIndex};` : ""}${!comBottomNav && posicao !== "cima" ? "bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-2));" : ""}`}
  >
    <button
      class="icone-btn"
      onclick={() => (posicao = posicao === "baixo" ? "cima" : "baixo")}
      aria-label={posicao === "baixo" ? "Mover barra para o topo" : "Mover barra para baixo"}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style={posicao === "cima" ? "transform: rotate(180deg);" : ""}
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
    <button class="conteudo" onclick={abrirRotina}>
      <span class="titulo">
        <span class="ponto"></span>
        {info.titulo}
        <span class="tempo" class:atrasado={info.atrasado}>{info.tempo}</span>
      </span>
      <span class="subtitulo">{info.subtitulo}</span>
    </button>
  </div>
{/if}

<style>
  .barra {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-2));
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    box-shadow: var(--shadow-float);
    z-index: 60;
  }
  /** Deslocada mais que o TreinoTopoFixo (nome/duração/séries/concluir, sempre fixo no topo
   * enquanto essa barra também aparece, já que os dois só existem juntos) pra não sobrepor ele. */
  .barra.cima {
    bottom: auto;
    top: calc(env(safe-area-inset-top, 0px) + 72px);
  }
  .icone-btn {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-bg);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .icone-btn svg {
    width: 22px;
    height: 22px;
    transition: transform 0.2s;
  }
  .conteudo {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .titulo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ponto {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success);
    flex-shrink: 0;
    animation: pulsar 1.6s ease-in-out infinite;
  }
  @keyframes pulsar {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  .tempo {
    color: var(--color-primary);
    font-weight: 700;
  }
  .tempo.atrasado {
    color: var(--color-danger);
  }
  .subtitulo {
    font-size: var(--font-size-base);
    color: var(--surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }
</style>
