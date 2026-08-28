<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate, toISODate, hojeISO } from "../../lib/dates";
  import Sheet from "../../components/Sheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import {
    garantirRefeicoesPadraoDoDia,
    getDiarioDoDia,
    getMetasDoDia,
    listRefeicoesModelo,
    getParametros,
    getPerfilDietaEditavel,
    DEFINICOES_PARAMETROS,
    PARAMETROS_PADRAO,
    gramasDoParametro,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
    type LimiteParametro,
    type RefeicaoModelo,
  } from "../../lib/dietaApi";
  import { listTreinos, type Treino } from "../../lib/treinoApi";
  import { getProgressoMetaHoje, getPesoMedioAtual, type ProgressoMetaPeso } from "../../lib/pesoApi";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  let dataAtual = $state(hojeISO());
  let refeicoes = $state<RefeicaoDia[]>([]);
  let itens = $state<ItemDiario[]>([]);
  let metas = $state<MetasDiarias | null>(null);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let mostrarCriarRefeicao = $state(false);
  let mostrarMenuMais = $state(false);
  let mostrarData = $state(false);
  let modoRestante = $state(false);
  let rotinaHoje = $state<Treino | null>(null);
  let progressoPeso = $state<ProgressoMetaPeso | null>(null);
  let metasRefeicaoPorNome = $state<Map<string, RefeicaoModelo>>(new Map());
  let modoDiarioPorId = $state<Set<string>>(new Set());
  let parametros = $state<Map<string, LimiteParametro>>(new Map(Object.entries(PARAMETROS_PADRAO)));
  let pesoAtual = $state(76);
  const defParametro = new Map(DEFINICOES_PARAMETROS.map((d) => [d.chave, d]));

  function parametro(chave: string): LimiteParametro {
    return parametros.get(chave) ?? PARAMETROS_PADRAO[chave];
  }

  async function carregarMetasRefeicoes() {
    try {
      const modelos = await listRefeicoesModelo();
      metasRefeicaoPorNome = new Map(modelos.filter((m) => m.metaCalorias !== null).map((m) => [m.nome, m]));
    } catch {
      // opcional — sem meta cadastrada, os cards seguem mostrando só o percentual da meta diária
    }
  }

  void carregarMetasRefeicoes();

  async function carregarParametros() {
    try {
      const [params, pesoMedio, perfil] = await Promise.all([getParametros(), getPesoMedioAtual(), getPerfilDietaEditavel()]);
      parametros = params;
      pesoAtual = pesoMedio ?? perfil.pesoAtual;
    } catch {
      // informativo — Gordura Saturada/Fibras seguem com os padrões se falhar
    }
  }

  void carregarParametros();

  async function carregarInfoTopo() {
    try {
      const [treinos, progresso] = await Promise.all([listTreinos(), getProgressoMetaHoje()]);
      const diaSemanaHoje = new Date().getDay();
      rotinaHoje = treinos.find((t) => t.dia_semana === diaSemanaHoje) ?? null;
      progressoPeso = progresso;
    } catch {
      // informativo, não impede o uso do diário se falhar
    }
  }

  void carregarInfoTopo();

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [refeicoes, itens, metas] = await Promise.all([garantirRefeicoesPadraoDoDia(dataAtual), getDiarioDoDia(dataAtual), getMetasDoDia(dataAtual)]);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  const dataLabel = $derived.by(() => {
    if (dataAtual === hojeISO()) return "Hoje";
    const d = parseISODate(dataAtual);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  function selecionarData(iso: string) {
    dataAtual = iso;
    mostrarData = false;
    void carregar();
  }

  function preview(refeicaoId: string): string {
    const nomes = itens.filter((i) => i.refeicaoId === refeicaoId).map((i) => i.nome);
    if (!nomes.length) return "Nenhum alimento ainda";
    return nomes.join(", ");
  }

  function totaisRefeicao(refeicaoId: string) {
    const doItens = itens.filter((i) => i.refeicaoId === refeicaoId);
    return {
      calorias: doItens.reduce((acc, i) => acc + i.calorias, 0),
      proteinaG: doItens.reduce((acc, i) => acc + i.proteinaG, 0),
      gorduraG: doItens.reduce((acc, i) => acc + i.gorduraG, 0),
      carboidratoG: doItens.reduce((acc, i) => acc + i.carboidratoG, 0),
    };
  }

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    navigate(`/dieta/refeicao/${id}`);
  }

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itens.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itens.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itens.reduce((acc, i) => acc + i.carboidratoG, 0));
  const totalFibras = $derived(itens.reduce((acc, i) => acc + i.fibraG, 0));
  const totalGorduraSaturada = $derived(itens.reduce((acc, i) => acc + i.gorduraSaturadaG, 0));

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  function alternarModoRefeicao(refeicaoId: string) {
    const novo = new Set(modoDiarioPorId);
    if (novo.has(refeicaoId)) novo.delete(refeicaoId);
    else novo.add(refeicaoId);
    modoDiarioPorId = novo;
  }

  function labelAbsoluto(valor: number, meta: number, unidade: string): string {
    return `${valor.toFixed(0)}/${meta.toFixed(0)}${unidade}`;
  }

  const fibrasMaxG = $derived(metas ? Math.round(gramasDoParametro(defParametro.get("fibras")!, parametro("fibras").max, pesoAtual, metas.calorias)) : 0);
  const gorduraSaturadaMaxG = $derived(
    metas ? Math.round(gramasDoParametro(defParametro.get("gordura_saturada")!, parametro("gordura_saturada").max, pesoAtual, metas.calorias)) : 0,
  );
</script>

{#snippet iconChevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
{/snippet}
{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconRefeicaoAvulsa()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18" />
    <path d="M12 13v5" />
    <path d="M9.5 15.5h5" />
  </svg>
{/snippet}
{#snippet iconGerenciar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </svg>
{/snippet}
{#snippet iconScanner()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 7V5a1 1 0 0 1 1-1h2" />
    <path d="M17 4h2a1 1 0 0 1 1 1v2" />
    <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
    <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
    <path d="M7 8v8" />
    <path d="M10 8v8" />
    <path d="M13.5 8v8" />
    <path d="M17 8v8" />
  </svg>
{/snippet}
{#snippet iconRotina()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 7v10M2 9v6M18 7v10M22 9v6" />
    <path d="M6 12h12" />
  </svg>
{/snippet}
{#snippet iconPesoMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="2" />
  </svg>
{/snippet}
{#snippet iconQuickAlimentos()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v7a2 2 0 0 0 2 2v9" />
    <path d="M7 3v4M11 3v4" />
    <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
  </svg>
{/snippet}
{#snippet iconQuickRefeicoes()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </svg>
{/snippet}
{#snippet iconQuickParametrizacao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="topo">
    <button class="dia-btn" onclick={() => (mostrarData = true)}>
      <span class="dia-texto">{dataLabel}</span>
      {@render iconChevron()}
    </button>
    {#if dataAtual === hojeISO()}
      <div class="info-hoje">
        {#if rotinaHoje}
          <button class="chip-info" onclick={() => navigate(`/treino/rotina/${rotinaHoje!.id}/ver`)}>
            {@render iconRotina()}
            <span class="chip-texto">{rotinaHoje.nome_treino}</span>
          </button>
        {/if}
        {#if progressoPeso}
          <button class="chip-info" onclick={() => navigate("/peso")}>
            {@render iconPesoMeta()}
            <span class="chip-texto">{progressoPeso.pesoAlvo.toFixed(1)} / {progressoPeso.pesoAtual.toFixed(1)} kg</span>
          </button>
        {/if}
      </div>
    {/if}
    <button class="icon-btn" onclick={() => (mostrarMenuMais = true)} aria-label="Adicionar">+</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar o diário: {erro}</p>
  {:else}
    {#if metas}
      <div class="card-calorias">
        <p class="card-titulo">Calorias</p>
        <div class="calorias-linha">
          <span class="calorias-valor"><strong>{totalCalorias.toFixed(0)}</strong> cal <span class="calorias-meta">/ {metas.calorias.toFixed(0)}</span></span>
          <span class="calorias-restantes"><strong>{restante(totalCalorias, metas.calorias).toFixed(0)}</strong> restantes</span>
        </div>
        <div class="barra-wrap-grande">
          <div class="barra-grande" style={`width:${larguraBarra(pctMeta(totalCalorias, metas.calorias))}%; background:var(--color-secondary);`}></div>
        </div>
      </div>

      <div class="card-macros">
        <button class="toggle-btn" onclick={() => (modoRestante = !modoRestante)} aria-label="Alternar exibição">
          {@render iconToggle()}
        </button>
        <div class="macros-grid">
          <div class="macro-col">
            <p class="macro-nome">Carb</p>
            <p class="macro-valor">
              {#if modoRestante}
                <strong>{restante(totalCarboidrato, metas.carboidratoG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{totalCarboidrato.toFixed(0)} g</strong> <span class="macro-meta">/ {metas.carboidratoG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metas.carboidratoG))}%; background:${COR_CARBO};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Gorduras</p>
            <p class="macro-valor">
              {#if modoRestante}
                <strong>{restante(totalGordura, metas.gorduraG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{totalGordura.toFixed(0)} g</strong> <span class="macro-meta">/ {metas.gorduraG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(totalGordura, metas.gorduraG))}%; background:${COR_GORDURA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Proteínas</p>
            <p class="macro-valor">
              {#if modoRestante}
                <strong>{restante(totalProteina, metas.proteinaG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{totalProteina.toFixed(0)} g</strong> <span class="macro-meta">/ {metas.proteinaG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(totalProteina, metas.proteinaG))}%; background:${COR_PROTEINA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Gordura Sat.</p>
            <p class="macro-valor">
              {#if modoRestante}
                <strong>{restante(totalGorduraSaturada, gorduraSaturadaMaxG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{totalGorduraSaturada.toFixed(0)} g</strong> <span class="macro-meta">/ {gorduraSaturadaMaxG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(totalGorduraSaturada, gorduraSaturadaMaxG))}%; background:${COR_GORDURA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Fibras</p>
            <p class="macro-valor">
              {#if modoRestante}
                <strong>{restante(totalFibras, fibrasMaxG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{totalFibras.toFixed(0)} g</strong> <span class="macro-meta">/ {fibrasMaxG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(totalFibras, fibrasMaxG))}%; background:${COR_CARBO};`}></div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <div class="quick-actions">
      <button class="quick-btn" onclick={() => navigate("/dieta/alimentos")}>
        <span class="quick-btn-label">Alimentos</span>
        {@render iconQuickAlimentos()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/receitas")}>
        <span class="quick-btn-label">Refeições</span>
        {@render iconQuickRefeicoes()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/refeicoes/gerenciar")}>
        <span class="quick-btn-label">Gerenciar</span>
        {@render iconGerenciar()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/parametrizacao")}>
        <span class="quick-btn-label">Parâmetros</span>
        {@render iconQuickParametrizacao()}
      </button>
    </div>

    <p class="diario-titulo">Diário</p>

    {#if !refeicoes.length}
      <p class="muted">Nenhuma refeição ainda. Toque em + pra criar.</p>
    {:else}
      {#each refeicoes as refeicao (refeicao.id)}
        {@const totais = totaisRefeicao(refeicao.id)}
        {@const temItens = itens.some((i) => i.refeicaoId === refeicao.id)}
        {@const metaRef = metasRefeicaoPorNome.get(refeicao.nome)}
        {@const modoDiario = modoDiarioPorId.has(refeicao.id)}
        <div
          class="refeicao-item"
          role="button"
          tabindex="0"
          onclick={() => navigate(`/dieta/refeicao/${refeicao.id}`)}
          onkeydown={(e) => e.key === "Enter" && navigate(`/dieta/refeicao/${refeicao.id}`)}
        >
          <div class="card-header">
            <h2>{refeicao.nome}</h2>
            {#if metaRef && temItens}
              <button
                class="toggle-btn-card"
                onclick={(e) => { e.stopPropagation(); alternarModoRefeicao(refeicao.id); }}
                aria-label="Alternar exibição"
              >
                {@render iconToggle()}
              </button>
            {/if}
          </div>
          {#if temItens && metas}
            {#if metaRef && !modoDiario}
              <p class="pct-titulo">Meta de {refeicao.nome}</p>
              <div class="pct-grid">
                <div class="pct-col">
                  <p class="pct-nome">Calorias</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.calorias, metaRef.metaCalorias!))}%; background:var(--color-secondary);`}></div>
                  </div>
                  <p class="pct-valor">{labelAbsoluto(totais.calorias, metaRef.metaCalorias!, "")}</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Carb</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.carboidratoG, metaRef.metaCarboidratoG!))}%; background:${COR_CARBO};`}></div>
                  </div>
                  <p class="pct-valor">{labelAbsoluto(totais.carboidratoG, metaRef.metaCarboidratoG!, "g")}</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Gorduras</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.gorduraG, metaRef.metaGorduraG!))}%; background:${COR_GORDURA};`}></div>
                  </div>
                  <p class="pct-valor">{labelAbsoluto(totais.gorduraG, metaRef.metaGorduraG!, "g")}</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Proteínas</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.proteinaG, metaRef.metaProteinaG!))}%; background:${COR_PROTEINA};`}></div>
                  </div>
                  <p class="pct-valor">{labelAbsoluto(totais.proteinaG, metaRef.metaProteinaG!, "g")}</p>
                </div>
              </div>
            {:else}
              <p class="pct-titulo">Percentual das suas metas diárias</p>
              <div class="pct-grid">
                <div class="pct-col">
                  <p class="pct-nome">Calorias</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.calorias, metas.calorias))}%; background:var(--color-secondary);`}></div>
                  </div>
                  <p class="pct-valor">{totais.calorias.toFixed(0)} · {pctMeta(totais.calorias, metas.calorias).toFixed(0)}%</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Carb</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.carboidratoG, metas.carboidratoG))}%; background:${COR_CARBO};`}></div>
                  </div>
                  <p class="pct-valor">{totais.carboidratoG.toFixed(0)}g · {pctMeta(totais.carboidratoG, metas.carboidratoG).toFixed(0)}%</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Gorduras</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.gorduraG, metas.gorduraG))}%; background:${COR_GORDURA};`}></div>
                  </div>
                  <p class="pct-valor">{totais.gorduraG.toFixed(0)}g · {pctMeta(totais.gorduraG, metas.gorduraG).toFixed(0)}%</p>
                </div>
                <div class="pct-col">
                  <p class="pct-nome">Proteínas</p>
                  <div class="pct-barra-wrap">
                    <div class="pct-barra" style={`width:${larguraBarra(pctMeta(totais.proteinaG, metas.proteinaG))}%; background:${COR_PROTEINA};`}></div>
                  </div>
                  <p class="pct-valor">{totais.proteinaG.toFixed(0)}g · {pctMeta(totais.proteinaG, metas.proteinaG).toFixed(0)}%</p>
                </div>
              </div>
            {/if}
          {:else}
            <p class="preview">{preview(refeicao.id)}</p>
          {/if}
          <button
            type="button"
            class="acao-adicionar"
            onclick={(e) => {
              e.stopPropagation();
              navigate(`/dieta/alimentos/refeicao/${refeicao.id}`);
            }}
          >
            Adicionar Alimento
          </button>
        </div>
      {/each}
    {/if}
  {/if}
</div>

{#if mostrarMenuMais}
  <ActionSheet
    onFechar={() => (mostrarMenuMais = false)}
    opcoes={[
      { label: "Refeição avulsa", subtitulo: "Apenas para hoje", icon: iconRefeicaoAvulsa, onSelect: () => (mostrarCriarRefeicao = true) },
      { label: "Escanear alimento", subtitulo: "Ler código de barras", icon: iconScanner, onSelect: () => navigate(`/dieta/scanear/${dataAtual}`) },
    ]}
  />
{/if}

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={dataAtual}
    onFechar={() => (mostrarCriarRefeicao = false)}
    onCriada={aoCriarRefeicao}
  />
{/if}

{#if mostrarData}
  <Sheet titulo="Selecionar dia" onFechar={() => (mostrarData = false)}>
    <input class="data-input" type="date" value={dataAtual} onchange={(e) => selecionarData(e.currentTarget.value)} />
    <button class="hoje-btn" onclick={() => selecionarData(hojeISO())}>Hoje</button>
  </Sheet>
{/if}

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .dia-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }
  .dia-texto {
    text-transform: capitalize;
  }
  .dia-btn svg {
    width: 18px;
    height: 18px;
    color: var(--surface-muted);
  }
  .info-hoje {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding-right: var(--space-2);
  }
  .chip-info {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 140px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: 12px;
    cursor: pointer;
  }
  .chip-info svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--color-primary);
  }
  .chip-texto {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .quick-btn-label {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
  .quick-btn svg {
    width: 20px;
    height: 20px;
  }
  .card-calorias,
  .card-macros {
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
  .calorias-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .calorias-valor {
    font-size: var(--font-size-lg);
  }
  .calorias-valor strong {
    font-size: 22px;
  }
  .calorias-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .calorias-restantes {
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
    top: var(--space-3);
    right: var(--space-3);
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
  .macros-grid {
    display: flex;
    gap: var(--space-3);
    width: calc(100% - 40px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .macros-grid::-webkit-scrollbar {
    display: none;
  }
  .macro-col {
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .macro-nome {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    white-space: nowrap;
  }
  .macro-valor {
    margin: 0 0 var(--space-2);
    font-size: 13px;
    color: var(--surface-fg);
  }
  .macro-meta {
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
  .refeicao-item {
    cursor: pointer;
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .card-header h2 {
    flex-shrink: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    color: var(--surface-fg);
  }
  .diario-titulo {
    font-weight: 600;
    margin: 0 0 var(--space-3);
  }
  .toggle-btn-card {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn-card svg {
    width: 14px;
    height: 14px;
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
  .acao-adicionar {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .pct-titulo {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .pct-grid {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .pct-col {
    flex: 1;
    min-width: 0;
  }
  .pct-nome {
    margin: 0 0 var(--space-1);
    font-size: 12px;
    color: var(--surface-fg);
  }
  .pct-barra-wrap {
    height: 6px;
    background: var(--surface-border);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--space-1);
  }
  .pct-barra {
    height: 100%;
    border-radius: 4px;
  }
  .pct-valor {
    margin: 0;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .data-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .hoje-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
</style>
