<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { treinoLogSessao } from "../lib/treinoLogSessao.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let agora = $state(Date.now());
  const timerId = setInterval(() => (agora = Date.now()), 1000);
  $effect(() => () => clearInterval(timerId));

  function formatMMSS(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const info = $derived.by(() => {
    const atual = treinoLogSessao.atual;
    if (!atual) return null;

    const descansando = atual.sessao.find((ex) => ex.descansoAte && ex.descansoAte > agora);
    if (descansando) {
      const restante = Math.ceil((descansando.descansoAte! - agora) / 1000);
      return {
        titulo: "Descanso",
        tempo: formatMMSS(Math.max(restante, 0)),
        subtitulo: descansando.nome,
      };
    }

    const total = Math.floor((agora - atual.inicio) / 1000);
    const duracao = total < 60 ? `${total}s` : formatMMSS(total);
    const emAndamento = atual.sessao.find((ex) => ex.sets.some((s) => !s.concluida));
    return {
      titulo: atual.nomeTreino,
      tempo: duracao,
      subtitulo: emAndamento?.nome ?? atual.sessao[atual.sessao.length - 1]?.nome ?? "",
    };
  });

  let mostrarConfirmDescartar = $state(false);

  function descartar() {
    mostrarConfirmDescartar = false;
    treinoLogSessao.limpar();
  }
</script>

{#if treinoLogSessao.atual && info}
  <div class="barra">
    <button class="icone-btn" onclick={() => navigate(`/treino/log/${treinoLogSessao.atual!.treinoId}`)} aria-label="Abrir treino">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
    <button class="conteudo" onclick={() => navigate(`/treino/log/${treinoLogSessao.atual!.treinoId}`)}>
      <span class="titulo">
        <span class="ponto"></span>
        {info.titulo}
        <span class="tempo">{info.tempo}</span>
      </span>
      <span class="subtitulo">{info.subtitulo}</span>
    </button>
    <button class="icone-btn lixeira" onclick={() => (mostrarConfirmDescartar = true)} aria-label="Descartar treino">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </button>
  </div>
{/if}

{#if mostrarConfirmDescartar}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar este treino?"
    textoConfirmar="Descartar Treino"
    onConfirmar={descartar}
    onCancelar={() => (mostrarConfirmDescartar = false)}
  />
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
  }
  .icone-btn.lixeira {
    color: var(--color-danger);
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
  .subtitulo {
    font-size: var(--font-size-base);
    color: var(--surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }
</style>
