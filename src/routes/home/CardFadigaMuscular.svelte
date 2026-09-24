<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { toISODate, hojeISO } from "../../lib/dates";
  import { treinoLogSessao } from "../../lib/treinoLogSessao.svelte";
  import {
    listTreinos,
    listMusculos,
    getRegistrosPorTreinoPeriodo,
    getParametrosDistribuicao,
    PARAMETROS_DISTRIBUICAO_PADRAO,
    type TreinoComExercicios,
    type Musculo,
    type ParametrosDistribuicao,
  } from "../../lib/treinoApi";
  import { partesFadigaSemanal, partesParaSegmentos, CORES_FAIXA } from "../../lib/fadiga";

  /** Mesma lógica de Rotinas.svelte (o card "Grupos Musculares" da Home do treino) — replicada
   * aqui pra a Início não precisar carregar a tela inteira de Rotinas só por esse resumo. Ver
   * Rotinas.svelte se essa conta mudar lá, pra manter as duas em sincronia. */
  let treinos = $state<TreinoComExercicios[]>([]);
  let parametrosDistribuicao = $state<ParametrosDistribuicao>(PARAMETROS_DISTRIBUICAO_PADRAO);
  let musculos = $state<Musculo[]>([]);
  let feitoPorMusculoSalvo = $state<Map<string, number>>(new Map());
  let musculosPorExercicio = $state<Map<string, { musculo_id: string; peso: number }[]>>(new Map());
  let modoRestante = $state(true);
  let loading = $state(true);
  let erro = $state<string | null>(null);

  function segundaISO(): string {
    const hoje = new Date();
    const delta = (hoje.getDay() + 6) % 7;
    return toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - delta));
  }

  async function carregar(): Promise<void> {
    loading = true;
    erro = null;
    try {
      const [treinosCarregados, musculosCarregados, registros, parametros] = await Promise.all([
        listTreinos(),
        listMusculos(),
        getRegistrosPorTreinoPeriodo(segundaISO(), hojeISO()),
        getParametrosDistribuicao(),
      ]);
      musculos = musculosCarregados;
      parametrosDistribuicao = parametros;

      const mapaMusculos = new Map<string, { musculo_id: string; peso: number }[]>();
      for (const t of treinosCarregados) {
        for (const ex of t.exercicios) {
          if (!mapaMusculos.has(ex.exercicio_id)) {
            mapaMusculos.set(
              ex.exercicio_id,
              (ex.exercicio?.musculos ?? []).map((m) => ({ musculo_id: m.musculo_id, peso: m.peso_contribuicao })),
            );
          }
        }
      }
      musculosPorExercicio = mapaMusculos;

      const mapaFeito = new Map<string, number>();
      for (const r of registros) {
        for (const m of mapaMusculos.get(r.exercicio_id) ?? []) {
          mapaFeito.set(m.musculo_id, (mapaFeito.get(m.musculo_id) ?? 0) + m.peso);
        }
      }
      feitoPorMusculoSalvo = mapaFeito;
      treinos = treinosCarregados;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  const feitoAoVivoPorMusculo = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const exSessao of treinoLogSessao.atual?.sessao ?? []) {
      const concluidas = exSessao.sets.filter((s) => s.concluida).length;
      if (!concluidas) continue;
      for (const m of musculosPorExercicio.get(exSessao.exercicio_id) ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + concluidas * m.peso);
      }
    }
    return mapa;
  });

  const feitoPorMusculo = $derived.by(() => {
    if (!treinoLogSessao.atual) return feitoPorMusculoSalvo;
    const mapa = new Map(feitoPorMusculoSalvo);
    for (const [musculoId, valor] of feitoAoVivoPorMusculo) {
      mapa.set(musculoId, (mapa.get(musculoId) ?? 0) + valor);
    }
    return mapa;
  });

  function planejadoPorMusculoDe(lista: TreinoComExercicios[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const t of lista) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    return mapa;
  }

  const planejadoPorMusculo = $derived(
    parametrosDistribuicao.homeModoGrupos === "proximo" ? planejadoPorMusculoDe(treinos.slice(0, 1)) : planejadoPorMusculoDe(treinos),
  );

  const partesPorMusculo = $derived(
    partesFadigaSemanal(parametrosDistribuicao.homeModoGrupos === "proximo" ? treinos.slice(0, 1) : treinos, parametrosDistribuicao),
  );

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

  function passouMeta(valor: number, meta: number): boolean {
    return valor > meta;
  }

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  const COR_ALERTA = "#f87171";

  /** Hachura diagonal usada pra marcar "quanto passou" quando o feito estoura o planejado (mesma
   * ideia das barras/anéis de macro em DiarioAlimentar/CardCaloriasDia). */
  function hachuraEstouro(cor: string): string {
    return `repeating-linear-gradient(45deg, ${cor} 0px, ${cor} 3px, transparent 3px, transparent 6px)`;
  }

  /** Dentro do planejado: anel de fadiga normal (segmentos A/B/C proporcionais ao preenchido, resto
   * vazio). Acima do planejado: o anel passa a representar o FEITO (não o planejado) como 100% — os
   * segmentos de fadiga ficam comprimidos até onde o planejado ficou, e o resto (o quanto passou)
   * vira hachurado, mesma técnica das barras/anéis de macro. */
  function gradienteFadiga(musculoId: string, feito: number, planejado: number): string {
    const pct = pctMeta(feito, planejado);
    const partes = partesPorMusculo.get(musculoId);
    const total = partes ? partes.a + partes.b + partes.c : 0;
    const segmentos = total > 0 ? partesParaSegmentos(partes!) : [{ valor: 1, cor: CORES_FAIXA.a }];

    const limite = pct <= 100 || planejado <= 0 ? larguraBarra(pct) : (planejado / feito) * 100;
    let acumulado = 0;
    const stops: string[] = [];
    for (const seg of segmentos) {
      if (seg.valor <= 0) continue;
      const inicio = acumulado;
      acumulado += (seg.valor / (total || 1)) * limite;
      stops.push(`${seg.cor} ${inicio}% ${acumulado}%`);
    }

    if (pct <= 100 || planejado <= 0) {
      stops.push(`var(--surface-border) ${limite}% 100%`);
      return `conic-gradient(${stops.join(", ")})`;
    }
    stops.push(`transparent ${limite}% 100%`);
    return `conic-gradient(${stops.join(", ")}), ${hachuraEstouro(COR_ALERTA)}`;
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

<div class="card" role="button" tabindex="0" onclick={() => navigate("/treino")} onkeydown={(e) => e.key === "Enter" && navigate("/treino")}>
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else if !top6.length}
    <p class="muted">Nenhum músculo planejado ainda — adicione exercícios às rotinas.</p>
  {:else}
    <div class="musculos-wrap">
      <button
        type="button"
        class="toggle-btn"
        onclick={(e) => {
          e.stopPropagation();
          modoRestante = !modoRestante;
        }}
        aria-label="Alternar exibição"
      >
        {@render iconToggle()}
      </button>
      <div class="musculos-grid">
        {#each top6 as item (item.musculo.id)}
          <div class="musculo-col">
            <p class="musculo-nome">{item.musculo.nome}</p>
            <div class="musculo-anel" style={`background: ${gradienteFadiga(item.musculo.id, item.feito, item.planejado)};`}>
              <div class="musculo-anel-centro">
                {#if modoRestante && passouMeta(item.feito, item.planejado)}
                  <strong>{pctMeta(item.feito, item.planejado).toFixed(0)}%</strong>
                  <span class="musculo-meta">{(item.feito - item.planejado).toFixed(0)} acima</span>
                {:else if modoRestante}
                  <strong>{pctMeta(item.feito, item.planejado).toFixed(0)}%</strong>
                  <span class="musculo-meta">{restante(item.feito, item.planejado).toFixed(0)} rest.</span>
                {:else}
                  <strong>{item.feito.toFixed(0)}</strong>
                  <span class="musculo-meta">/{item.planejado.toFixed(0)}</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .muted {
    margin: 0;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .erro {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-sm);
  }
  .musculos-wrap {
    position: relative;
    padding-right: 40px;
  }
  .toggle-btn {
    position: absolute;
    top: 0;
    right: 0;
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
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  .musculo-meta {
    color: var(--surface-muted);
  }
  .musculo-anel {
    position: relative;
    width: 76px;
    height: 76px;
    margin: 0 auto;
    border-radius: 50%;
  }
  .musculo-anel-centro {
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: var(--surface-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.2;
  }
  .musculo-anel-centro strong {
    font-size: 14px;
    color: var(--surface-fg);
  }
  .musculo-anel-centro .musculo-meta {
    font-size: 10px;
  }
</style>
