<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getReceita,
    garantirRefeicoesPadraoDoDia,
    getRefeicoesDoDia,
    getMetasDiarias,
    receitaEhMetaDeRefeicao,
    adicionarReceitaAoDiario,
    atualizarReceita,
    atualizarItemReceita,
    removerItemReceita,
    adicionarItemReceita,
    excluirReceita,
    type Receita,
    type ReceitaItem,
    type RefeicaoDia,
    type MetasDiarias,
  } from "../../lib/dietaApi";
  import { receitaRascunho, limparRascunho } from "../../lib/receitaRascunho.svelte";

  let { receitaId }: { receitaId: string } = $props();

  const PREFIXO_NOVO = "novo-";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let receita = $state<Receita | null>(null);
  let metas = $state<MetasDiarias | null>(null);
  let ehMetaPadrao = $state(false);
  let refeicao = $state<RefeicaoDia | null>(null);
  let opcoesRefeicao = $state<RefeicaoDia[]>([]);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let mostrarEscolhaRefeicao = $state(false);
  let mostrarCriarRefeicao = $state(false);
  let itemEditando = $state<ReceitaItem | null>(null);
  let itemParaRemover = $state<ReceitaItem | null>(null);
  let confirmandoExclusao = $state(false);
  let excluindo = $state(false);

  /** Cópia local editável — nome e itens só são gravados no banco ao tocar em "concluir". Saindo sem salvar, nada muda. */
  let nomeEditavel = $state("");
  let nomeEditando = $state(false);
  let itensLocais = $state<ReceitaItem[]>([]);
  let idsParaRemover = $state<string[]>([]);
  let salvandoEdicoes = $state(false);

  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const [receitaRes, metasRes, refeicoesHoje, ehMeta] = await Promise.all([
        getReceita(receitaId),
        getMetasDiarias(),
        garantirRefeicoesPadraoDoDia(hojeISO()),
        receitaEhMetaDeRefeicao(receitaId),
      ]);
      receita = receitaRes;
      metas = metasRes;
      refeicao = refeicoesHoje[0] ?? null;
      ehMetaPadrao = ehMeta;
      nomeEditavel = receitaRes?.nome ?? "";
      idsParaRemover = [];

      const itensSalvos = receitaRes?.itens ?? [];
      const itensPendentes = receitaRascunho.contexto === receitaId ? receitaRascunho.itens : [];
      const itensNovos: ReceitaItem[] = itensPendentes.map((it) => {
        const fator = it.quantidade / it.alimento.porcaoPadraoQtd;
        return {
          id: `${PREFIXO_NOVO}${crypto.randomUUID()}`,
          alimentoId: it.alimento.id,
          nome: it.alimento.nome,
          quantidade: it.quantidade,
          unidade: it.alimento.porcaoPadraoUnidade,
          porcaoPadraoQtd: it.alimento.porcaoPadraoQtd,
          calorias: round1(it.alimento.caloriasPorPorcao * fator),
          proteinaG: round1(it.alimento.proteinaG * fator),
          gorduraG: round1(it.alimento.gorduraG * fator),
          carboidratoG: round1(it.alimento.carboidratoG * fator),
          fibraG: round1((it.alimento.fibraG ?? 0) * fator),
          gorduraSaturadaG: round1((it.alimento.gorduraSaturadaG ?? 0) * fator),
        };
      });
      itensLocais = [...itensSalvos, ...itensNovos];
      if (itensNovos.length) limparRascunho();
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  async function salvarEdicoes() {
    if (!receita) return;
    const nome = nomeEditavel.trim();
    if (!nome) return;
    salvandoEdicoes = true;
    try {
      if (nome !== receita.nome) {
        await atualizarReceita(receita.id, nome);
      }
      for (const id of idsParaRemover) {
        await removerItemReceita(id);
      }
      for (const item of itensLocais) {
        if (item.id.startsWith(PREFIXO_NOVO)) {
          await adicionarItemReceita(receita.id, item.alimentoId, item.quantidade);
        } else {
          await atualizarItemReceita(item.id, item.quantidade);
        }
      }
      nomeEditando = false;
      await carregar();
    } catch (err) {
      alert("Erro ao salvar alterações: " + (err as Error).message);
    } finally {
      salvandoEdicoes = false;
    }
  }

  async function abrirEscolhaRefeicao() {
    opcoesRefeicao = await getRefeicoesDoDia(hojeISO());
    mostrarEscolhaRefeicao = true;
  }

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    mostrarEscolhaRefeicao = false;
    void adicionarNaRefeicao(id);
  }

  const totalCalorias = $derived(itensLocais.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itensLocais.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itensLocais.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itensLocais.reduce((acc, i) => acc + i.carboidratoG, 0));

  const caloriasCarbo = $derived(totalCarboidrato * 4);
  const caloriasGordura = $derived(totalGordura * 9);
  const caloriasProteina = $derived(totalProteina * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`,
  );

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  async function adicionarNaRefeicao(refeicaoIdAlvo: string) {
    if (!receita) return;
    try {
      await adicionarReceitaAoDiario(receita.id, hojeISO(), refeicaoIdAlvo);
      navigate(`/dieta/refeicao/${refeicaoIdAlvo}`);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
    }
  }

  function aoSalvarQuantidadeItem(novaQuantidade: number) {
    if (!itemEditando) return;
    const fatorAntigo = itemEditando.quantidade / itemEditando.porcaoPadraoQtd;
    const fatorNovo = novaQuantidade / itemEditando.porcaoPadraoQtd;
    const id = itemEditando.id;
    itensLocais = itensLocais.map((it) =>
      it.id === id
        ? {
            ...it,
            quantidade: novaQuantidade,
            calorias: round1((it.calorias / fatorAntigo) * fatorNovo),
            proteinaG: round1((it.proteinaG / fatorAntigo) * fatorNovo),
            gorduraG: round1((it.gorduraG / fatorAntigo) * fatorNovo),
            carboidratoG: round1((it.carboidratoG / fatorAntigo) * fatorNovo),
          }
        : it,
    );
    itemEditando = null;
  }

  function abrirDetalheItem(item: ReceitaItem) {
    navigate(`/dieta/alimento/${item.alimentoId}/${hojeISO()}`);
  }

  /** Tempo segurando o card parado antes do toque virar "pressionar" (abre a confirmação de excluir) — evita disparar sem querer num toque rápido/rolagem. */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownItem(e: PointerEvent, item: ReceitaItem) {
    pressionarX = e.clientX;
    pressionarY = e.clientY;
    pressionouLongo = false;
    window.addEventListener("pointermove", aoPointerMovePressionar);
    window.addEventListener("pointerup", aoPointerUpPressionar);
    timeoutPressionar = setTimeout(() => {
      pressionouLongo = true;
      cancelarPressionar();
      if (navigator.vibrate) navigator.vibrate(10);
      itemParaRemover = item;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuItem(e: MouseEvent, item: ReceitaItem) {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    itemParaRemover = item;
  }

  function cancelarPressionar() {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarPressionar();
    }
  }

  function aoPointerUpPressionar() {
    cancelarPressionar();
  }

  function aoClickItem(item: ReceitaItem) {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    itemEditando = item;
  }

  function removerItem() {
    if (!itemParaRemover) return;
    if (!itemParaRemover.id.startsWith(PREFIXO_NOVO)) {
      idsParaRemover = [...idsParaRemover, itemParaRemover.id];
    }
    itensLocais = itensLocais.filter((it) => it.id !== itemParaRemover!.id);
    itemParaRemover = null;
  }

  async function excluir() {
    if (!receita) return;
    excluindo = true;
    try {
      await excluirReceita(receita.id);
      navigate("/dieta/receitas");
    } catch (err) {
      alert("Erro ao excluir refeição: " + (err as Error).message);
      excluindo = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}
{#snippet iconInfo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/dieta/receitas")} aria-label="Voltar">{@render iconVoltar()}</button>
    {#if nomeEditando}
      <input
        class="nome-input"
        type="text"
        bind:value={nomeEditavel}
        onkeydown={(e) => e.key === "Enter" && salvarEdicoes()}
      />
    {:else}
      <button class="nome-btn" onclick={() => (nomeEditando = true)}>{nomeEditavel}</button>
    {/if}
    <button class="salvar" onclick={salvarEdicoes} disabled={salvandoEdicoes || loading || !nomeEditavel.trim()} aria-label="Salvar">
      {@render iconCheck()}
    </button>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else if !receita}
    <p class="muted">Refeição não encontrada.</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    {#if !ehMetaPadrao}
      <div
        class="linha"
        role="button"
        tabindex="0"
        onclick={() => abrirEscolhaRefeicao()}
        onkeydown={(e) => e.key === "Enter" && abrirEscolhaRefeicao()}
      >
        <span>Adicionar à refeição</span>
        <span class:placeholder={!refeicao}>{refeicao ? refeicao.nome : "Selecione uma refeição"}</span>
      </div>
    {/if}

    {#if itensLocais.length}
      <div class="resumo">
        <div class="donut" style={donutStyle}>
          <div class="donut-centro">
            <strong>{totalCalorias.toFixed(0)}</strong>
            <span>Cal</span>
          </div>
        </div>
        <div class="resumo-macros">
          <p><strong class="pct" style={`color:${COR_CARBO}`}>{pctCarbo.toFixed(0)}%</strong><br /><span class="valor-g">{totalCarboidrato.toFixed(1)} g</span><br />Carb</p>
          <p><strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong><br /><span class="valor-g">{totalGordura.toFixed(1)} g</span><br />Gorduras</p>
          <p><strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong><br /><span class="valor-g">{totalProteina.toFixed(1)} g</span><br />Proteínas</p>
        </div>
      </div>

      {#if metas}
        <p class="metas-titulo">Percentual das suas metas diárias</p>
        <div class="metas-grid">
          <div class="meta-col">
            <span class="meta-label">Calorias</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metas.calorias))}%; background:var(--color-secondary);`}></div></div>
            <span class="meta-valor">{pctMeta(totalCalorias, metas.calorias).toFixed(0)}% · {metas.calorias.toFixed(0)}</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Carb</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metas.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
            <span class="meta-valor">{pctMeta(totalCarboidrato, metas.carboidratoG).toFixed(0)}% · {metas.carboidratoG.toFixed(0)}g</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Gorduras</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metas.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
            <span class="meta-valor">{pctMeta(totalGordura, metas.gorduraG).toFixed(0)}% · {metas.gorduraG.toFixed(0)}g</span>
          </div>
          <div class="meta-col">
            <span class="meta-label">Proteínas</span>
            <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metas.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
            <span class="meta-valor">{pctMeta(totalProteina, metas.proteinaG).toFixed(0)}% · {metas.proteinaG.toFixed(0)}g</span>
          </div>
        </div>
      {/if}
    {/if}

    <p class="itens-titulo">Itens</p>
    {#if !itensLocais.length}
      <p class="muted">Nenhum alimento nessa refeição.</p>
    {:else}
      {#each itensLocais as item (item.id)}
        <button
          class="item-card"
          onpointerdown={(e) => aoPointerDownItem(e, item)}
          onclick={() => aoClickItem(item)}
          oncontextmenu={(e) => aoContextMenuItem(e, item)}
        >
          <div class="item-info">
            <p class="item-nome">{item.nome}</p>
            <p class="item-qtd">{item.quantidade}{item.unidade} · {item.calorias.toFixed(0)} kcal</p>
          </div>
          <span
            class="item-detalhe"
            role="button"
            tabindex="0"
            onclick={(e) => { e.stopPropagation(); abrirDetalheItem(item); }}
            onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); abrirDetalheItem(item); } }}
            aria-label="Detalhes do alimento"
          >
            {@render iconInfo()}
          </span>
        </button>
      {/each}
    {/if}

    <button class="acao-adicionar" onclick={() => navigate(`/dieta/alimentos/receita/${receitaId}`)}>+ Adicionar Alimento</button>

    <div class="acao-excluir">
      <Button variant="danger" onclick={() => (confirmandoExclusao = true)} disabled={excluindo}>Excluir Refeição</Button>
    </div>
    </div>
  {/if}
</div>

{#if confirmandoExclusao}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir esta refeição salva?"
    textoConfirmar="Excluir Refeição"
    onConfirmar={excluir}
    onCancelar={() => (confirmandoExclusao = false)}
  />
{/if}

{#if mostrarEscolhaRefeicao}
  <ActionSheet
    titulo="Selecione a refeição"
    onFechar={() => (mostrarEscolhaRefeicao = false)}
    opcoes={[
      ...opcoesRefeicao.map((r) => ({ label: r.nome, onSelect: () => adicionarNaRefeicao(r.id) })),
      { label: "+ Nova Refeição", onSelect: () => (mostrarCriarRefeicao = true) },
    ]}
  />
{/if}

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={hojeISO()}
    onFechar={() => (mostrarCriarRefeicao = false)}
    onCriada={aoCriarRefeicao}
  />
{/if}

{#if itemEditando}
  <DietaQuantidadeDialog
    titulo={itemEditando.nome}
    quantidadeInicial={itemEditando.quantidade}
    porcaoPadraoUnidade={itemEditando.unidade}
    onSalvar={aoSalvarQuantidadeItem}
    onFechar={() => (itemEditando = null)}
  />
{/if}

{#if itemParaRemover !== null}
  <ConfirmDialog
    titulo="Tem certeza de que quer remover este alimento?"
    textoConfirmar="Remover"
    onConfirmar={removerItem}
    onCancelar={() => (itemParaRemover = null)}
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
  .nome-btn {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-family: inherit;
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    color: var(--surface-fg);
    cursor: pointer;
    padding: var(--space-1) 0;
  }
  .nome-input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-family: inherit;
    text-align: center;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
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
  .salvar {
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
  .salvar svg {
    width: 18px;
    height: 18px;
  }
  .salvar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    cursor: pointer;
  }
  .linha span:first-child {
    color: var(--surface-fg);
  }
  .linha span.placeholder {
    color: var(--color-danger);
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
    inset: 6px;
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
  .resumo-macros .pct {
    font-size: var(--font-size-base);
  }
  .resumo-macros .valor-g {
    font-size: 17px;
  }
  .metas-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .metas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-6);
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
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .item-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface-card);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-2);
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .item-info {
    flex: 1;
    min-width: 0;
  }
  .item-nome {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-qtd {
    margin: 2px 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .item-detalhe {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--surface-muted);
    cursor: pointer;
  }
  .item-detalhe svg {
    width: 18px;
    height: 18px;
  }
  .acao-adicionar {
    width: 100%;
    padding: var(--space-3);
    margin-top: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .acao-excluir {
    margin-top: var(--space-4);
  }
  .conteudo {
    transition: opacity 0.15s;
  }
  .conteudo.carregando {
    opacity: 0.5;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
