<script lang="ts">
  import { untrack } from "svelte";
  import { navigate } from "../../lib/router.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import {
    getAlimento,
    getItemDiario,
    getRefeicaoDia,
    getRefeicoesDoDia,
    getMetasDiarias,
    adicionarItemDiario,
    atualizarItemDiario,
    duplicarAlimento,
    excluirAlimento,
    type Alimento,
    type MetasDiarias,
    type RefeicaoDia,
  } from "../../lib/dietaApi";

  let {
    alimentoId,
    data,
    refeicaoIdInicial,
    itemDiarioId,
  }: {
    alimentoId?: string;
    data?: string;
    refeicaoIdInicial?: string | null;
    itemDiarioId?: string;
  } = $props();

  const editandoItem = untrack(() => itemDiarioId != null);

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let alimento = $state<Alimento | null>(null);
  let metas = $state<MetasDiarias | null>(null);
  let loading = $state(true);
  let dataResolvida = $state(untrack(() => data ?? ""));
  let refeicao = $state<RefeicaoDia | null>(null);
  let porcoes = $state(1);
  let opcoesRefeicao = $state<RefeicaoDia[]>([]);
  let mostrarEscolhaRefeicao = $state(false);
  let mostrarCriarRefeicao = $state(false);
  let mostrarMenuAlimento = $state(false);
  let mostrarEditar = $state(false);
  let confirmandoExclusao = $state(false);
  let salvando = $state(false);
  let processandoAlimento = $state(false);
  let erro = $state<string | null>(null);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      if (editandoItem) {
        const item = await getItemDiario(itemDiarioId!);
        if (!item) return;
        const [alimentoRes, refeicaoRes, metasRes] = await Promise.all([
          getAlimento(item.alimentoId),
          getRefeicaoDia(item.refeicaoId),
          getMetasDiarias(),
        ]);
        alimento = alimentoRes;
        refeicao = refeicaoRes;
        metas = metasRes;
        dataResolvida = refeicaoRes?.data ?? "";
        porcoes = alimentoRes ? item.quantidade / alimentoRes.porcaoPadraoQtd : 1;
      } else {
        const [alimentoRes, metasRes, refeicaoRes] = await Promise.all([
          getAlimento(alimentoId!),
          getMetasDiarias(),
          refeicaoIdInicial ? getRefeicaoDia(refeicaoIdInicial) : Promise.resolve(null),
        ]);
        alimento = alimentoRes;
        metas = metasRes;
        refeicao = refeicaoRes;
      }
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  async function abrirEscolhaRefeicao() {
    opcoesRefeicao = await getRefeicoesDoDia(dataResolvida);
    mostrarEscolhaRefeicao = true;
  }

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    mostrarEscolhaRefeicao = false;
    void getRefeicaoDia(id).then((r) => (refeicao = r));
  }

  const quantidade = $derived(alimento ? porcoes * alimento.porcaoPadraoQtd : 0);
  const calorias = $derived(alimento ? alimento.caloriasPorPorcao * porcoes : 0);
  const proteinaG = $derived(alimento ? alimento.proteinaG * porcoes : 0);
  const gorduraG = $derived(alimento ? alimento.gorduraG * porcoes : 0);
  const carboidratoG = $derived(alimento ? alimento.carboidratoG * porcoes : 0);

  const caloriasCarbo = $derived(carboidratoG * 4);
  const caloriasGordura = $derived(gorduraG * 9);
  const caloriasProteina = $derived(proteinaG * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`,
  );

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  }

  function sufixoRota(): string {
    return refeicao ? `/${dataResolvida}/${refeicao.id}` : dataResolvida ? `/${dataResolvida}` : "";
  }

  async function duplicarAlimentoCadastro() {
    if (!alimento) return;
    processandoAlimento = true;
    try {
      const novoId = await duplicarAlimento(alimento);
      navigate(`/dieta/alimento/${novoId}${sufixoRota()}`);
    } catch (err) {
      alert("Erro ao duplicar alimento: " + (err as Error).message);
      processandoAlimento = false;
    }
  }

  async function excluir() {
    if (!alimento) return;
    processandoAlimento = true;
    try {
      await excluirAlimento(alimento.id);
      navigate("/dieta/alimentos");
    } catch (err) {
      alert("Erro ao excluir alimento: " + (err as Error).message);
      processandoAlimento = false;
    }
  }

  async function salvar() {
    if (!alimento || !refeicao) return;
    salvando = true;
    try {
      if (editandoItem) {
        await atualizarItemDiario(itemDiarioId!, alimento, quantidade);
      } else {
        await adicionarItemDiario({ alimento, data: dataResolvida, refeicaoId: refeicao.id, quantidade });
      }
      window.history.back();
    } catch (err) {
      alert("Erro ao salvar alimento: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconMenu()}
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
{/snippet}
{#snippet iconEditar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconDuplicar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>{editandoItem ? "Editar Alimento" : "Adicionar Alimento"}</h1>
    <div class="header-acoes">
      {#if alimento?.fonte === "manual"}
        <button class="icone-acao" onclick={() => (mostrarMenuAlimento = true)} disabled={processandoAlimento} aria-label="Mais opções">
          {@render iconMenu()}
        </button>
      {/if}
      <button class="salvar" onclick={salvar} disabled={salvando || !refeicao || loading} aria-label="Salvar">✓</button>
    </div>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else if !alimento}
    <p class="muted">Alimento não encontrado.</p>
  {:else}
    <h2 class="nome-alimento">{alimento.nome}</h2>

    <div
      class="linha"
      class:desabilitada={editandoItem}
      role="button"
      tabindex="0"
      onclick={() => !editandoItem && abrirEscolhaRefeicao()}
      onkeydown={(e) => e.key === "Enter" && !editandoItem && abrirEscolhaRefeicao()}
    >
      <span>Refeição</span>
      <span class:placeholder={!refeicao}>{refeicao ? refeicao.nome : "Selecione uma refeição"}</span>
    </div>

    <div class="linha">
      <span>Quantidade de porções</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" bind:value={porcoes} />
    </div>

    <div class="resumo">
      <div class="donut" style={donutStyle}>
        <div class="donut-centro">
          <strong>{calorias.toFixed(0)}</strong>
          <span>Cal</span>
        </div>
      </div>
      <div class="resumo-macros">
        <p style={`color:${COR_CARBO}`}><strong>{pctCarbo.toFixed(0)}%</strong><br />{carboidratoG.toFixed(1)} g<br />Carb</p>
        <p style={`color:${COR_GORDURA}`}><strong>{pctGordura.toFixed(0)}%</strong><br />{gorduraG.toFixed(1)} g<br />Gorduras</p>
        <p style={`color:${COR_PROTEINA}`}><strong>{pctProteina.toFixed(0)}%</strong><br />{proteinaG.toFixed(1)} g<br />Proteínas</p>
      </div>
    </div>

    {#if metas}
      <p class="metas-titulo">Percentual das suas metas diárias</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(calorias, metas.calorias)}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{pctMeta(calorias, metas.calorias).toFixed(0)}% · {metas.calorias.toFixed(0)}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(carboidratoG, metas.carboidratoG)}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{pctMeta(carboidratoG, metas.carboidratoG).toFixed(0)}% · {metas.carboidratoG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(gorduraG, metas.gorduraG)}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{pctMeta(gorduraG, metas.gorduraG).toFixed(0)}% · {metas.gorduraG.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${pctMeta(proteinaG, metas.proteinaG)}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{pctMeta(proteinaG, metas.proteinaG).toFixed(0)}% · {metas.proteinaG.toFixed(0)}g</span>
        </div>
      </div>
    {/if}

    <p class="itens-titulo">Item</p>
    <div class="item-preview">
      <span class="item-nome">{alimento.nome}</span>
      <span class="item-sub">{quantidade.toFixed(0)}{alimento.porcaoPadraoUnidade} · {calorias.toFixed(0)} kcal</span>
    </div>
  {/if}
</div>

{#if mostrarEscolhaRefeicao}
  <ActionSheet
    titulo="Selecione a refeição"
    onFechar={() => (mostrarEscolhaRefeicao = false)}
    opcoes={[
      ...opcoesRefeicao.map((r) => ({ label: r.nome, onSelect: () => (refeicao = r) })),
      { label: "+ Nova Refeição", onSelect: () => (mostrarCriarRefeicao = true) },
    ]}
  />
{/if}

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={dataResolvida}
    onFechar={() => (mostrarCriarRefeicao = false)}
    onCriada={aoCriarRefeicao}
  />
{/if}

{#if mostrarMenuAlimento}
  <ActionSheet
    titulo={alimento?.nome}
    onFechar={() => (mostrarMenuAlimento = false)}
    opcoes={[
      { label: "Editar", icon: iconEditar, onSelect: () => (mostrarEditar = true) },
      { label: "Duplicar", icon: iconDuplicar, onSelect: () => duplicarAlimentoCadastro() },
      { label: "Excluir", icon: iconExcluir, destructive: true, onSelect: () => (confirmandoExclusao = true) },
    ]}
  />
{/if}

{#if mostrarEditar && alimento}
  <DietaAlimentoFormSheet {alimento} onFechar={() => (mostrarEditar = false)} onSalvo={carregar} />
{/if}

{#if confirmandoExclusao}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir este alimento?"
    textoConfirmar="Excluir Alimento"
    onConfirmar={excluir}
    onCancelar={() => (confirmandoExclusao = false)}
  />
{/if}

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
    margin-bottom: var(--space-3);
  }
  .header h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .back,
  .salvar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
  }
  .salvar:disabled {
    color: var(--surface-muted);
    cursor: not-allowed;
  }
  .header-acoes {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }
  .icone-acao {
    background: none;
    border: none;
    color: var(--surface-fg);
    cursor: pointer;
    padding: var(--space-1);
    display: flex;
  }
  .icone-acao svg {
    width: 20px;
    height: 20px;
  }
  .icone-acao:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .nome-alimento {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-4);
  }
  .linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    cursor: pointer;
  }
  .linha.desabilitada {
    cursor: default;
  }
  .linha span:first-child {
    color: var(--surface-fg);
  }
  .linha span.placeholder {
    color: var(--color-danger);
  }
  .linha input {
    width: 70px;
    text-align: right;
    padding: var(--space-1);
    border: none;
    background: none;
    color: var(--color-secondary);
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0;
  }
  .donut {
    position: relative;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-centro {
    position: absolute;
    inset: 14px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: var(--font-size-lg);
  }
  .donut-centro span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .resumo-macros p {
    margin: 0;
    font-size: var(--font-size-sm);
    text-align: center;
    line-height: 1.5;
  }
  .metas-titulo,
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .metas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .meta-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .meta-label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .meta-barra {
    height: 4px;
    border-radius: 2px;
    background: var(--surface-border);
    overflow: hidden;
  }
  .meta-barra-fill {
    height: 100%;
  }
  .meta-valor {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .item-preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .item-nome {
    font-size: var(--font-size-base);
  }
  .item-sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
