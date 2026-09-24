<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { treinoLogSessao } from "../lib/treinoLogSessao.svelte";

  /** Resumo fixo da rotina ao vivo (nome, duração, séries, concluir), sempre visível no topo de
   * qualquer tela do app enquanto uma rotina está em andamento — exceto na própria tela da rotina
   * (que já tem esse mesmo resumo fixo dentro dela). Não mostra nada sobre descanso: isso é
   * exclusividade do TreinoMinimizado (barra/anel), pra nunca misturar os dois cronômetros. Tocar
   * em qualquer parte, incluindo o ícone de concluir, só abre a rotina ao vivo — concluir de fato
   * exige a tela (validação/confirmação já vivem só lá). */

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

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

{#if treinoLogSessao.atual}
  <button class="topo-fixo" onclick={abrirRotina} aria-label="Abrir rotina ao vivo">
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
    <span class="concluir-icone" aria-hidden="true">{@render iconCheck()}</span>
  </button>
{/if}

<style>
  .topo-fixo {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    top: calc(env(safe-area-inset-top, 0px) + var(--space-3));
    z-index: 55;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2) var(--space-3);
    box-shadow: var(--shadow-float);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .stat {
    flex-shrink: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-treino {
    flex: 1;
  }
  .stat-label {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .stat-valor {
    font-size: 15px;
    font-weight: 600;
    color: var(--surface-fg);
  }
  .nome-treino {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .duracao {
    font-variant-numeric: tabular-nums;
  }
  .concluir-icone {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-radius: 50%;
  }
  .concluir-icone svg {
    width: 15px;
    height: 15px;
  }
</style>
