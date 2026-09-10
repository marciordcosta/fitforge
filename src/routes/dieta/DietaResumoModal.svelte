<script lang="ts">
  import { getPerfilDietaEditavel, getMetasDoDia } from "../../lib/dietaApi";
  import { getUltimoPeso, getPesoMedioAtual, getMeta, getMetaSemanal, getDiasParaObjetivo, formatDiasObjetivo } from "../../lib/pesoApi";
  import { hojeISO } from "../../lib/dates";

  let { onFechar }: { onFechar: () => void } = $props();

  let loading = $state(true);

  let metaCalorias = $state<number | null>(null);
  let metaProteina = $state<number | null>(null);
  let metaGordura = $state<number | null>(null);
  let metaCarboidrato = $state<number | null>(null);
  let caloriasAjustadasEm = $state<string | null>(null);

  let pesoAtual = $state<number | null>(null);
  let mediaSemanaPeso = $state<number | null>(null);
  let metaSemanaPeso = $state<number | null>(null);
  let pesoAlvo = $state<number | null>(null);
  let temMeta = $state(false);
  let diasObjetivo = $state<number | null>(null);

  async function carregar(): Promise<void> {
    loading = true;
    const [perfil, metasHoje, ultimoPeso, mediaPeso, meta, metaSemanal, dias] = await Promise.all([
      getPerfilDietaEditavel(),
      getMetasDoDia(hojeISO()),
      getUltimoPeso(),
      getPesoMedioAtual(),
      getMeta(),
      getMetaSemanal(),
      getDiasParaObjetivo(),
    ]);
    caloriasAjustadasEm = perfil.caloriasAjustadasEm;
    metaCalorias = metasHoje.calorias;
    metaProteina = metasHoje.proteinaG;
    metaGordura = metasHoje.gorduraG;
    metaCarboidrato = metasHoje.carboidratoG;
    pesoAtual = ultimoPeso;
    mediaSemanaPeso = mediaPeso;
    temMeta = meta != null;
    metaSemanaPeso = metaSemanal;
    pesoAlvo = meta?.pesoAlvo ?? null;
    diasObjetivo = dias;
    loading = false;
  }

  void carregar();

  function formatKcal(v: number | null): string {
    return v == null ? "—" : `${Math.round(v)} kcal`;
  }

  function formatG(v: number | null): string {
    return v == null ? "—" : `${Math.round(v)} g`;
  }

  function formatKg(v: number | null): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }

  function formatDataAjuste(iso: string | null): string {
    if (!iso) return "Nunca ajustado";
    const data = new Date(iso);
    return `Ajustado em ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }

  const textoObjetivo = $derived(
    !temMeta ? "Sem meta de peso definida" : diasObjetivo == null ? "Sem dados suficientes pra estimar" : formatDiasObjetivo(diasObjetivo) + " para o objetivo",
  );
</script>

<div class="resumo-overlay" role="presentation" onclick={onFechar}>
  <div class="resumo-card" role="presentation" onclick={(e) => e.stopPropagation()}>
    <h3 class="resumo-titulo">Resumo</h3>

    {#if loading}
      <p class="resumo-carregando">Carregando…</p>
    {:else}
      <div class="resumo-secao">
        <div class="resumo-linha">
          <span class="resumo-label">Meta de calorias</span>
          <span class="resumo-valor">{formatKcal(metaCalorias)}</span>
        </div>
        <p class="resumo-sub">{formatDataAjuste(caloriasAjustadasEm)}</p>
      </div>

      <div class="resumo-secao">
        <p class="resumo-label">Meta de macros</p>
        <div class="resumo-macros">
          <div class="resumo-macro-item">
            <span class="resumo-macro-valor">{formatG(metaCarboidrato)}</span>
            <span class="resumo-macro-nome">Carb</span>
          </div>
          <div class="resumo-macro-item">
            <span class="resumo-macro-valor">{formatG(metaGordura)}</span>
            <span class="resumo-macro-nome">Gorduras</span>
          </div>
          <div class="resumo-macro-item">
            <span class="resumo-macro-valor">{formatG(metaProteina)}</span>
            <span class="resumo-macro-nome">Proteínas</span>
          </div>
        </div>
      </div>

      <div class="resumo-secao resumo-grid">
        <div class="resumo-linha">
          <span class="resumo-label">Peso atual</span>
          <span class="resumo-valor">{formatKg(pesoAtual)}</span>
        </div>
        <div class="resumo-linha">
          <span class="resumo-label">Média da semana</span>
          <span class="resumo-valor">{formatKg(mediaSemanaPeso)}</span>
        </div>
        <div class="resumo-linha">
          <span class="resumo-label">Meta da semana</span>
          <span class="resumo-valor">{formatKg(metaSemanaPeso)}</span>
        </div>
        <div class="resumo-linha">
          <span class="resumo-label">Meta alvo</span>
          <span class="resumo-valor">{formatKg(pesoAlvo)}</span>
        </div>
      </div>

      <p class="resumo-objetivo">{textoObjetivo}</p>
    {/if}

    <button class="resumo-fechar" onclick={onFechar}>Fechar</button>
  </div>
</div>

<style>
  .resumo-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    z-index: 200;
  }
  .resumo-card {
    width: 100%;
    max-width: 360px;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-float);
  }
  .resumo-titulo {
    text-align: center;
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-4);
  }
  .resumo-carregando {
    text-align: center;
    color: var(--surface-muted);
    margin: 0 0 var(--space-4);
  }
  .resumo-secao {
    margin-bottom: var(--space-4);
  }
  .resumo-secao.resumo-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .resumo-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .resumo-label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resumo-valor {
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--surface-fg);
  }
  .resumo-sub {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .resumo-macros {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .resumo-macro-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--surface-bg);
  }
  .resumo-macro-valor {
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--surface-fg);
  }
  .resumo-macro-nome {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .resumo-objetivo {
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-primary);
    padding-top: var(--space-3);
    border-top: 1px solid var(--surface-border);
    margin: var(--space-2) 0 var(--space-4);
  }
  .resumo-fechar {
    display: block;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
</style>
