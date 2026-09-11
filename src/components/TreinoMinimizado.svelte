<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { treinoLogSessao } from "../lib/treinoLogSessao.svelte";

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
  $effect(() => () => clearInterval(timerId));

  function formatMMSS(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /** Igual a formatMMSS, mas mostra o sinal de negativo quando o descanso já passou do tempo. */
  function formatMMSSAssinado(segundos: number): string {
    return segundos < 0 ? `-${formatMMSS(-segundos)}` : formatMMSS(segundos);
  }

  const info = $derived.by(() => {
    const atual = treinoLogSessao.atual;
    if (!atual) return null;

    /** Mesma regra do cronômetro na tela ao vivo: continua marcando "Descanso" mesmo depois de
     * zerar (contando o atraso em negativo) até pular ou iniciar outro descanso — sem isso, aqui
     * fora da tela o card voltava a mostrar a duração total assim que o descanso zerava. */
    const descansando =
      atual.sessao.find((ex) => ex.descansoAte && ex.descansoAte > agora) ??
      atual.sessao.find((ex) => ex.descansoAte != null);
    if (descansando) {
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
    }

    const total = Math.floor((agora - atual.inicio) / 1000);
    const duracao = total < 60 ? `${total}s` : formatMMSS(total);
    const emAndamento = atual.sessao.find((ex) => ex.sets.some((s) => !s.concluida));
    return {
      titulo: atual.nomeTreino,
      tempo: duracao,
      subtitulo: emAndamento?.nome ?? atual.sessao[atual.sessao.length - 1]?.nome ?? "",
      atrasado: false,
      progresso: 0,
    };
  });

  /** Só a posição da barra minimizada — tocar no nome sempre abre a rotina ao vivo; o "^" apenas
   * manda a barra pro topo (ou de volta pro rodapé), sem sair da tela atual. Não se aplica ao
   * formato anel, que já é livremente arrastável pra qualquer canto. */
  let posicao = $state<"baixo" | "cima">("baixo");

  const CHAVE_FORMATO = "fitforge_formato_minimizado";
  let formato = $state<"barra" | "anel">(
    typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_FORMATO) === "anel" ? "anel" : "barra",
  );
  $effect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_FORMATO, formato);
  });

  const ANEL_DIAMETRO = 60;
  const ANEL_RAIO = 24;
  const ANEL_CIRCUNFERENCIA = 2 * Math.PI * ANEL_RAIO;

  let anelPos = $state<{ x: number; y: number }>(
    typeof window !== "undefined" ? { x: window.innerWidth - ANEL_DIAMETRO - 16, y: 84 } : { x: 260, y: 84 },
  );

  function iniciarArrasteAnel(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetX = startX - anelPos.x;
    const offsetY = startY - anelPos.y;
    const rect = el.getBoundingClientRect();
    let moveu = false;

    function mover(ev: PointerEvent): void {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) moveu = true;
      anelPos = {
        x: Math.min(Math.max(ev.clientX - offsetX, 4), window.innerWidth - rect.width - 4),
        y: Math.min(Math.max(ev.clientY - offsetY, 4), window.innerHeight - rect.height - 4),
      };
    }
    function soltar(): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      if (!moveu) abrirRotina();
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }
</script>

{#if treinoLogSessao.atual && info}
  {#if formato === "barra"}
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
      <button class="icone-btn" onclick={() => (formato = "anel")} aria-label="Ver como relógio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 13.5" />
        </svg>
      </button>
    </div>
  {:else}
    <button
      class="anel-min"
      class:atrasado={info.atrasado}
      style={`left:${anelPos.x}px; top:${anelPos.y}px;${zIndex != null ? ` z-index:${zIndex};` : ""}`}
      onpointerdown={iniciarArrasteAnel}
      aria-label="Abrir rotina"
    >
      <svg viewBox="0 0 60 60" class="anel-min-svg">
        <circle cx="30" cy="30" r={ANEL_RAIO} class="anel-min-fundo" />
        <circle
          cx="30"
          cy="30"
          r={ANEL_RAIO}
          class="anel-min-progresso"
          style={`stroke-dasharray:${ANEL_CIRCUNFERENCIA}; stroke-dashoffset:${ANEL_CIRCUNFERENCIA * (1 - info.progresso)};`}
        />
      </svg>
      <span class="ponto anel-min-ponto"></span>
      <span class="anel-min-tempo">{info.tempo}</span>
    </button>
    <button class="anel-min-formato-btn" style={`left:${anelPos.x + ANEL_DIAMETRO - 10}px; top:${anelPos.y + ANEL_DIAMETRO - 10}px;${zIndex != null ? ` z-index:${zIndex + 1};` : ""}`} onclick={() => (formato = "barra")} aria-label="Ver como barra">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="10" width="18" height="4" rx="2" />
      </svg>
    </button>
  {/if}
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
  .barra.cima {
    bottom: auto;
    top: calc(env(safe-area-inset-top, 0px) + var(--space-3));
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
  .anel-min {
    position: fixed;
    z-index: 60;
    width: 60px;
    height: 60px;
    padding: 0;
    border: none;
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    touch-action: none;
  }
  .anel-min-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .anel-min-fundo {
    fill: none;
    stroke: var(--surface-border);
    stroke-width: 5;
  }
  .anel-min-progresso {
    fill: none;
    stroke: var(--color-primary);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear, stroke 0.2s;
  }
  .anel-min.atrasado .anel-min-progresso {
    stroke: var(--color-danger);
  }
  .anel-min.atrasado .anel-min-tempo {
    color: var(--color-danger);
  }
  .anel-min-ponto {
    position: absolute;
    top: 4px;
    right: 4px;
  }
  .anel-min-tempo {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-card);
    box-shadow: var(--shadow-float);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--surface-fg);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .anel-min-formato-btn {
    position: fixed;
    z-index: 61;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 2px solid var(--surface-bg);
    border-radius: 50%;
    background: var(--surface-card);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-float);
  }
  .anel-min-formato-btn svg {
    width: 12px;
    height: 12px;
  }
</style>
