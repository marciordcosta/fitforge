<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { toISODate, hojeISO } from "../../lib/dates";
  import { getDiasComTreino, type DiaComTreino } from "../../lib/treinoApi";

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const DIAS_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  let mesBase = $state(new Date());
  let dias = $state<DiaComTreino[]>([]);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);

  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);
  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));

  async function carregar() {
    loading = true;
    dias = await getDiasComTreino(toISODate(mesInicio), toISODate(mesFim));
    loading = false;
    carregouAlgumaVez = true;
  }

  void carregar();

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregar();
  }

  const diasPorData = $derived.by(() => {
    const mapa = new Map<string, DiaComTreino>();
    for (const d of dias) mapa.set(d.data, d);
    return mapa;
  });

  /** Grade do mês: células vazias antes do dia 1 (pra alinhar com o dia da semana), depois um item por dia do mês. */
  const celulas = $derived.by(() => {
    const totalDias = mesFim.getDate();
    const primeiroDiaSemana = (mesInicio.getDay() + 6) % 7; // 0=Seg..6=Dom
    const lista: ({ dia: number; iso: string; treino: DiaComTreino | null } | null)[] = [];
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null);
    for (let dia = 1; dia <= totalDias; dia++) {
      const iso = toISODate(new Date(mesBase.getFullYear(), mesBase.getMonth(), dia));
      lista.push({ dia, iso, treino: diasPorData.get(iso) ?? null });
    }
    return lista;
  });
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Histórico</h1>
    <span class="spacer"></span>
  </div>

  <div class="mes-nav">
    <button onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
    <span>{mesLabel}</span>
    <button onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
  </div>

  <div class="dias-semana">
    {#each DIAS_ABREV as d (d)}
      <span>{d}</span>
    {/each}
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else}
    <div class="grade" class:carregando={loading}>
      {#each celulas as cel, i (i)}
        {#if cel === null}
          <div class="celula vazia"></div>
        {:else if cel.treino}
          <div class="celula">
            <button
              class="dia-btn"
              onclick={() =>
                navigate(`/treino/historico/${cel.treino!.treinoId ?? "avulso"}/${cel.iso}`)}
            >
              <span class="dia-circulo">{cel.dia}</span>
              <span class="treino-nome">{cel.treino.treinoNome}</span>
            </button>
          </div>
        {:else}
          <div class="celula">
            <span class="dia-numero-wrap">
              <span class="dia-numero" class:hoje={cel.iso === hojeISO()}>{cel.dia}</span>
            </span>
          </div>
        {/if}
      {/each}
    </div>
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
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
  }
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .back svg {
    width: 18px;
    height: 18px;
  }
  .spacer {
    width: 36px;
  }
  .mes-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .mes-nav span {
    font-weight: 600;
    min-width: 140px;
    text-align: center;
  }
  .mes-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .dias-semana {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: var(--space-2);
  }
  .dias-semana span {
    text-align: center;
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
  }
  .grade {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    transition: opacity 0.15s;
  }
  .grade.carregando {
    opacity: 0.5;
  }
  .celula {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    border-bottom: 1px solid var(--surface-border);
    padding: var(--space-3) 2px;
    box-sizing: border-box;
    overflow: hidden;
  }
  .dia-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    max-width: 100%;
  }
  .dia-circulo {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
  .dia-numero-wrap {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dia-numero {
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    font-weight: 600;
  }
  .dia-numero.hoje {
    color: var(--color-primary);
  }
  .treino-nome {
    font-size: 10px;
    color: var(--surface-muted);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
