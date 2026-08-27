<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import { toISODate, hojeISO } from "../../lib/dates";
  import {
    listTreinos,
    listMusculos,
    getVolumeRealizadoBruto,
    getSeriesExecutadasPorTreinoPeriodo,
    DIAS_SEMANA_COMPLETO,
    type TreinoComExercicios,
    type Musculo,
  } from "../../lib/treinoApi";

  let treinos = $state<TreinoComExercicios[]>([]);
  let loading = $state(true);
  let musculos = $state<Musculo[]>([]);
  let seriesPorTreino = $state<Map<string, number>>(new Map());
  let feitoPorMusculo = $state<Map<string, number>>(new Map());
  let modoRestante = $state(false);

  /** Rotinas com dia informado sobem pro topo, ordenadas pelo dia mais próximo; sem dia, mantém a ordenação manual. */
  function ordenarPorDia(lista: TreinoComExercicios[]): TreinoComExercicios[] {
    const hoje = new Date().getDay();
    const comDia = lista
      .filter((t) => t.dia_semana != null)
      .sort((a, b) => ((a.dia_semana! - hoje + 7) % 7) - ((b.dia_semana! - hoje + 7) % 7));
    const semDia = lista.filter((t) => t.dia_semana == null);
    return [...comDia, ...semDia];
  }

  /** Semana ancorada em segunda-feira (exceção — o resto do app usa terça, ver inicioSemana em dates.ts), só pros cards de progresso semanal de treino. */
  function segundaISO(): string {
    const hoje = new Date();
    const delta = (hoje.getDay() + 6) % 7;
    return toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - delta));
  }

  async function carregar() {
    loading = true;
    const [treinosCarregados, musculosCarregados, volumeRealizado, seriesPorTreinoCarregado] = await Promise.all([
      listTreinos(),
      listMusculos(),
      getVolumeRealizadoBruto(segundaISO(), hojeISO()),
      getSeriesExecutadasPorTreinoPeriodo(segundaISO(), hojeISO()),
    ]);
    treinos = ordenarPorDia(treinosCarregados);
    musculos = musculosCarregados;
    seriesPorTreino = seriesPorTreinoCarregado;
    const mapaFeito = new Map<string, number>();
    for (const l of volumeRealizado) {
      mapaFeito.set(l.musculo_id, (mapaFeito.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
    }
    feitoPorMusculo = mapaFeito;
    loading = false;
  }

  void carregar();

  function preview(t: TreinoComExercicios): string {
    const nomes = t.exercicios
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => e.exercicio?.nome)
      .filter(Boolean);
    if (!nomes.length) return "Nenhum exercício ainda";
    return nomes.join(", ");
  }

  /** Total de séries programadas em todas as rotinas — meta semanal do card (assume 1 execução de cada rotina na semana). */
  const programado = $derived(treinos.reduce((acc, t) => acc + t.exercicios.reduce((a, ex) => a + ex.series.length, 0), 0));

  /** Total de séries feitas na semana, somando todas as rotinas. */
  const executado = $derived([...seriesPorTreino.values()].reduce((acc, v) => acc + v, 0));

  /** Volume planejado por músculo (ponderado por peso_contribuicao) — é a "meta" de cada músculo: as próprias rotinas cadastradas. */
  const planejadoPorMusculo = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const t of treinos) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    return mapa;
  });

  /** Os 6 músculos com maior volume planejado na semana — só entram os que aparecem em alguma rotina. */
  const top6 = $derived.by(() =>
    musculos
      .map((m) => ({ musculo: m, planejado: planejadoPorMusculo.get(m.id) ?? 0, feito: feitoPorMusculo.get(m.id) ?? 0 }))
      .filter((item) => item.planejado > 0)
      .sort((a, b) => b.planejado - a.planejado)
      .slice(0, 6),
  );

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }
</script>

{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconExercicios()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.4 14.4 9.6 9.6" />
    <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
    <path d="m21.5 21.5-1.4-1.4" />
    <path d="M3.9 3.9 2.5 2.5" />
    <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
  </svg>
{/snippet}
{#snippet iconDistribuicao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
{/snippet}
{#snippet iconHistorico()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
{/snippet}
{#snippet iconEmBreve()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Treino</h1>
    <button class="icon-btn" onclick={() => navigate("/treino/rotina/nova")} aria-label="Nova rotina">+</button>
  </div>

  {#if !loading}
    <div class="card-series">
      <p class="card-titulo">Séries</p>
      <div class="series-linha">
        <span class="series-valor"><strong>{executado}</strong> <span class="series-meta">/ {programado}</span></span>
        <span class="series-restantes"><strong>{restante(executado, programado)}</strong> restantes</span>
      </div>
      <div class="barra-wrap-grande">
        <div class="barra-grande" style={`width:${larguraBarra(pctMeta(executado, programado))}%; background:var(--color-secondary);`}></div>
      </div>
    </div>

    <div class="card-musculos">
      <button type="button" class="toggle-btn" onclick={() => (modoRestante = !modoRestante)} aria-label="Alternar exibição">
        {@render iconToggle()}
      </button>
      {#if !top6.length}
        <p class="card-titulo">Grupos Musculares</p>
        <p class="muted">Nenhum músculo planejado ainda — adicione exercícios às rotinas.</p>
      {:else}
        <div class="musculos-grid">
          {#each top6 as item (item.musculo.id)}
            <div class="musculo-col">
              <p class="musculo-nome">{item.musculo.nome}</p>
              <p class="musculo-valor">
                {#if modoRestante}
                  <strong>{restante(item.feito, item.planejado).toFixed(0)}</strong> <span class="musculo-meta">restantes</span>
                {:else}
                  <strong>{item.feito.toFixed(0)}</strong> <span class="musculo-meta">/ {item.planejado.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(item.feito, item.planejado))}%; background:var(--color-primary);`}></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="quick-actions">
    <button class="quick-btn" onclick={() => navigate("/treino/exercicios")}>
      <span class="quick-btn-label">Exercícios</span>
      {@render iconExercicios()}
    </button>
    <button class="quick-btn" onclick={() => navigate("/treino/distribuicao")}>
      <span class="quick-btn-label">Distribuição</span>
      {@render iconDistribuicao()}
    </button>
    <button class="quick-btn" onclick={() => navigate("/treino/historico")}>
      <span class="quick-btn-label">Histórico</span>
      {@render iconHistorico()}
    </button>
    <button class="quick-btn" disabled aria-label="Em breve">
      <span class="quick-btn-label">Em breve</span>
      {@render iconEmBreve()}
    </button>
  </div>

  <p class="rotinas-titulo">Rotinas</p>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !treinos.length}
    <p class="muted">Nenhuma rotina ainda. Crie a primeira.</p>
  {:else}
    {#each treinos as treino (treino.id)}
      <div
        class="rotina-item"
        role="button"
        tabindex="0"
        onclick={() => navigate(`/treino/rotina/${treino.id}/ver`)}
        onkeydown={(e) => e.key === "Enter" && navigate(`/treino/rotina/${treino.id}/ver`)}
      >
        <div class="card-header">
          <h2>
            {treino.nome_treino}
            {#if treino.dia_semana != null}
              <span class="dia-tag">{DIAS_SEMANA_COMPLETO[treino.dia_semana]}</span>
            {/if}
          </h2>
        </div>
        <p class="preview">{preview(treino)}</p>
        <Button onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .icon-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }
  .card-series,
  .card-musculos {
    position: relative;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .series-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .series-valor {
    font-size: var(--font-size-lg);
  }
  .series-valor strong {
    font-size: 22px;
  }
  .series-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .series-restantes {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .barra-wrap-grande {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
  .toggle-btn {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn svg {
    width: 16px;
    height: 16px;
  }
  .musculos-grid {
    display: flex;
    gap: var(--space-3);
    width: calc(100% - 48px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .musculos-grid::-webkit-scrollbar {
    display: none;
  }
  .musculo-col {
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .musculo-nome {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .musculo-valor {
    margin: 0 0 var(--space-2);
    font-size: 13px;
    color: var(--surface-fg);
  }
  .musculo-meta {
    color: var(--surface-muted);
  }
  .barra-wrap {
    height: 8px;
    background: var(--surface-border);
    border-radius: 5px;
    overflow: hidden;
  }
  .barra {
    height: 100%;
    border-radius: 5px;
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .quick-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .quick-btn-label {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
  .quick-btn svg {
    width: 20px;
    height: 20px;
  }
  .rotinas-titulo {
    font-weight: 600;
    margin: 0 0 var(--space-3);
  }
  .rotina-item {
    cursor: pointer;
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .card-header h2 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .dia-tag {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    margin-left: var(--space-1);
  }
  .preview {
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
