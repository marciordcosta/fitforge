<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { treinoLogSessao } from "../lib/treinoLogSessao.svelte";

  /** Resumo fixo da rotina ao vivo (nome, duração, séries), sempre visível no topo de qualquer
   * tela do app enquanto uma rotina está em andamento — exceto na própria tela da rotina (que já
   * tem esse mesmo resumo fixo dentro dela, ver .header-fixo em TreinoLog.svelte — o visual aqui é
   * deliberadamente idêntico, ponta a ponta, sem cantos/margens, pra parecer o MESMO topbar que só
   * "acompanha" pra fora da tela, não um card novo). Não mostra nada sobre descanso: isso é
   * exclusividade do TreinoMinimizado (barra/anel), pra nunca misturar os dois cronômetros. Sem o
   * botão de concluir daqui (não dá pra validar/salvar fora da tela) — no lugar, um ponto pulsante
   * só indicando "ao vivo". Tocar em qualquer parte abre a rotina ao vivo. */

  let agora = $state(Date.now());
  const timerId = setInterval(() => (agora = Date.now()), 1000);
  /** Mesmo ajuste do TreinoMinimizado: setInterval fica suspenso com a tela apagada/app em segundo
   * plano, então força a resincronizar assim que volta. */
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

  function formatDuracao(segundosTotais: number): string {
    const h = Math.floor(segundosTotais / 3600);
    const m = Math.floor((segundosTotais % 3600) / 60);
    const s = Math.floor(segundosTotais % 60);
    if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
    if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`;
    return `${s}s`;
  }

  const duracaoLabel = $derived.by(() => {
    const atual = treinoLogSessao.atual;
    if (!atual) return "";
    return formatDuracao(Math.floor((agora - atual.inicio) / 1000));
  });

  const seriesTotal = $derived(
    treinoLogSessao.atual?.sessao.reduce((acc, ex) => acc + ex.sets.filter((s) => s.concluida).length, 0) ?? 0,
  );
  const seriesPlanejadas = $derived(
    treinoLogSessao.atual?.sessao.reduce((acc, ex) => acc + ex.sets.length, 0) ?? 0,
  );

  function abrirRotina(): void {
    navigate(`/treino/log/${treinoLogSessao.atual!.treinoId}`);
  }
</script>

{#if treinoLogSessao.atual}
  <div class="topo-fixo">
    <button class="topo-fixo-inner" onclick={abrirRotina} aria-label="Abrir rotina ao vivo">
      <span class="stat stat-treino">
        <span class="stat-label">Treino</span>
        <span class="stat-valor nome-treino">{treinoLogSessao.atual.nomeTreino}</span>
      </span>
      <span class="stat">
        <span class="stat-label">Duração</span>
        <span class="stat-valor duracao">{duracaoLabel}</span>
      </span>
      <span class="stat">
        <span class="stat-label">Séries</span>
        <span class="stat-valor">{seriesTotal}/{seriesPlanejadas}</span>
      </span>
      <span class="ponto" aria-hidden="true"></span>
    </button>
  </div>
{/if}

<style>
  .topo-fixo {
    position: sticky;
    top: 0;
    /* Acima das faixas de swipe entre módulos (z-index 45 em App.svelte) -- elas cobrem a tela
       inteira de cima a baixo, então sem isso os 24px das pontas esquerda/direita dessa barra
       (que é full-width) ficavam mortos pro toque, capturados pelo swipe em vez do botão. */
    z-index: 46;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
  }
  .topo-fixo-inner {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    padding-top: max(var(--space-3), env(safe-area-inset-top, 0px));
    background: none;
    border: none;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .stat {
    flex-shrink: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat-treino {
    min-width: 0;
    max-width: 40%;
    align-items: flex-start;
  }
  .stat-label {
    font-size: 12px;
    color: var(--surface-muted);
  }
  .stat-valor {
    font-size: 17px;
    font-weight: 600;
    color: var(--surface-fg);
  }
  .nome-treino {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .duracao {
    display: inline-block;
    min-width: 84px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .ponto {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-success);
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
</style>
