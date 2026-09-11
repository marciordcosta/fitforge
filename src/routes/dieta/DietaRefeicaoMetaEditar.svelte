<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPickerMacros from "../../components/WheelPickerMacros.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    listRefeicoesModelo,
    listMetasDiaModelo,
    getReceita,
    salvarMetaNumericaRefeicao,
    salvarMetaNumericaRefeicaoDias,
    garantirReceitaPrivadaRefeicao,
    desvincularMetaReceita,
    removerMetaReceitaDias,
    excluirReceita,
    atualizarItemReceita,
    removerItemReceita,
    type RefeicaoModelo,
    type MetaDiaModelo,
    type Receita,
    type ReceitaItem,
  } from "../../lib/dietaApi";

  let { modeloId, nome, diasSemana }: { modeloId: string; nome: string; diasSemana?: number[] } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let modelo = $state<RefeicaoModelo | null>(null);
  let overrideDia = $state<MetaDiaModelo | null>(null);
  let receita = $state<Receita | null>(null);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);

  async function carregar(): Promise<void> {
    loading = true;
    erro = null;
    try {
      const [modelos, metasDia] = await Promise.all([listRefeicoesModelo(), listMetasDiaModelo()]);
      modelo = modelos.find((m) => m.id === modeloId) ?? null;
      overrideDia = diasSemana?.length ? (metasDia.find((m) => m.modeloId === modeloId && m.diaSemana === diasSemana![0]) ?? null) : null;
      const receitaId = overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null;
      receita = receitaId ? await getReceita(receitaId) : null;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  const proteinaG = $derived(overrideDia?.metaProteinaG ?? modelo?.metaProteinaG ?? null);
  const gorduraG = $derived(overrideDia?.metaGorduraG ?? modelo?.metaGorduraG ?? null);
  const carboidratoG = $derived(overrideDia?.metaCarboidratoG ?? modelo?.metaCarboidratoG ?? null);
  const receitaIdAtual = $derived(overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null);

  const caloriasCarbo = $derived((carboidratoG ?? 0) * 4);
  const caloriasGordura = $derived((gorduraG ?? 0) * 9);
  const caloriasProteina = $derived((proteinaG ?? 0) * 4);
  const caloriasCalc = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasCalc > 0 ? (caloriasCarbo / caloriasCalc) * 100 : 0);
  const pctGordura = $derived(caloriasCalc > 0 ? (caloriasGordura / caloriasCalc) * 100 : 0);
  const pctProteina = $derived(caloriasCalc > 0 ? (caloriasProteina / caloriasCalc) * 100 : 0);

  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`,
  );

  let mostrarMacros = $state(false);

  function opcoesGramas(max: number): { valor: number; label: string }[] {
    const opcoes: { valor: number; label: string }[] = [{ valor: 0, label: "0 g" }];
    for (let v = 1; v <= max; v++) opcoes.push({ valor: v, label: `${v} g` });
    return opcoes;
  }

  function colunasMacros() {
    return [
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesGramas(300), valorAtual: Math.round(carboidratoG ?? 0), kcalPorGrama: 4, secundario: (v: number) => `${v} g` },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesGramas(150), valorAtual: Math.round(gorduraG ?? 0), kcalPorGrama: 9, secundario: (v: number) => `${v} g` },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesGramas(300), valorAtual: Math.round(proteinaG ?? 0), kcalPorGrama: 4, secundario: (v: number) => `${v} g` },
    ];
  }

  async function confirmarMacros(valores: Record<string, number>): Promise<void> {
    try {
      if (diasSemana?.length) {
        await salvarMetaNumericaRefeicaoDias(modeloId, diasSemana, valores.proteinaG, valores.gorduraG, valores.carboidratoG);
      } else {
        await salvarMetaNumericaRefeicao(modeloId, valores.proteinaG, valores.gorduraG, valores.carboidratoG);
      }
      await carregar();
    } catch (err) {
      alert("Erro ao salvar meta: " + (err as Error).message);
    }
  }

  let itemEditando = $state<ReceitaItem | null>(null);
  let itemParaRemover = $state<ReceitaItem | null>(null);

  async function aoSalvarQuantidadeItem(novaQuantidade: number): Promise<void> {
    if (!itemEditando) return;
    try {
      await atualizarItemReceita(itemEditando.id, novaQuantidade);
      itemEditando = null;
      await carregar();
    } catch (err) {
      alert("Erro ao salvar quantidade: " + (err as Error).message);
    }
  }

  async function removerItem(): Promise<void> {
    if (!itemParaRemover) return;
    try {
      await removerItemReceita(itemParaRemover.id);
      itemParaRemover = null;
      await carregar();
    } catch (err) {
      alert("Erro ao remover alimento: " + (err as Error).message);
    }
  }

  let preparandoAlimento = $state(false);

  async function abrirAdicionarAlimento(): Promise<void> {
    preparandoAlimento = true;
    try {
      const receitaId = await garantirReceitaPrivadaRefeicao(modeloId, nome, receitaIdAtual, diasSemana);
      navigate(`/dieta/alimentos/receita/${receitaId}`);
    } catch (err) {
      alert("Erro ao preparar lista de alimentos: " + (err as Error).message);
    } finally {
      preparandoAlimento = false;
    }
  }

  /** Tempo segurando o card parado antes do toque virar "pressionar" (abre a confirmação de remover). */
  const ATRASO_PRESSIONAR_MS = 500;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutPressionar: ReturnType<typeof setTimeout> | undefined;
  let pressionarX = 0;
  let pressionarY = 0;
  let pressionouLongo = false;

  function aoPointerDownItem(e: PointerEvent, item: ReceitaItem): void {
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

  function aoContextMenuItem(e: MouseEvent, item: ReceitaItem): void {
    e.preventDefault();
    cancelarPressionar();
    pressionouLongo = false;
    itemParaRemover = item;
  }

  function cancelarPressionar(): void {
    clearTimeout(timeoutPressionar);
    timeoutPressionar = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionar);
    window.removeEventListener("pointerup", aoPointerUpPressionar);
  }

  function aoPointerMovePressionar(e: PointerEvent): void {
    if (Math.hypot(e.clientX - pressionarX, e.clientY - pressionarY) > TOLERANCIA_MOVIMENTO_PX) cancelarPressionar();
  }

  function aoPointerUpPressionar(): void {
    cancelarPressionar();
  }

  function aoClickItem(item: ReceitaItem): void {
    if (pressionouLongo) {
      pressionouLongo = false;
      return;
    }
    itemEditando = item;
  }

  let confirmandoRemoverMeta = $state(false);
  let removendoMeta = $state(false);

  async function removerMetaCompleta(): Promise<void> {
    removendoMeta = true;
    try {
      if (diasSemana?.length) {
        await removerMetaReceitaDias(modeloId, diasSemana);
      } else {
        await salvarMetaNumericaRefeicao(modeloId, null, null, null);
        await desvincularMetaReceita(modeloId);
      }
      if (receita?.oculta) await excluirReceita(receita.id);
      navigate("/dieta/refeicoes/gerenciar?aba=refeicoes");
    } catch (err) {
      alert("Erro ao remover meta: " + (err as Error).message);
      removendoMeta = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
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
    <button class="back" onclick={() => voltar("/dieta/refeicoes/gerenciar?aba=refeicoes")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{nome}</h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
      <button type="button" class="resumo" onclick={() => (mostrarMacros = true)}>
        <span class="donut" style={donutStyle}>
          <span class="donut-centro">
            <strong>{caloriasCalc.toFixed(0)}</strong>
            <span>Cal</span>
          </span>
        </span>
        <span class="resumo-macros">
          <span><strong class="pct" style={`color:${COR_CARBO}`}>{pctCarbo.toFixed(0)}%</strong><br /><span class="valor-g">{(carboidratoG ?? 0).toFixed(0)} g</span><br />Carb</span>
          <span><strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong><br /><span class="valor-g">{(gorduraG ?? 0).toFixed(0)} g</span><br />Gorduras</span>
          <span><strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong><br /><span class="valor-g">{(proteinaG ?? 0).toFixed(0)} g</span><br />Proteínas</span>
        </span>
      </button>

      <p class="itens-titulo">Itens</p>
      <p class="itens-ajuda">Opcional — só serve pra lançar essa refeição sozinha no diário do dia.</p>
      {#if !receita?.itens.length}
        <p class="muted">Nenhum alimento adicionado ainda.</p>
      {:else}
        {#each receita.itens as item (item.id)}
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
            <span class="item-detalhe" aria-hidden="true">{@render iconInfo()}</span>
          </button>
        {/each}
      {/if}

      <button class="acao-adicionar" onclick={abrirAdicionarAlimento} disabled={preparandoAlimento}>+ Adicionar Alimento</button>

      <div class="acao-excluir">
        <Button variant="danger" onclick={() => (confirmandoRemoverMeta = true)} disabled={removendoMeta}>Remover Meta</Button>
      </div>
    </div>
  {/if}
</div>

{#if mostrarMacros}
  <WheelPickerMacros titulo="Ajustar Macros (g)" colunas={colunasMacros()} onSelecionar={confirmarMacros} onFechar={() => (mostrarMacros = false)} />
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

{#if confirmandoRemoverMeta}
  <ConfirmDialog
    titulo="Remover a meta e os alimentos dessa refeição?"
    textoConfirmar="Remover Meta"
    onConfirmar={removerMetaCompleta}
    onCancelar={() => (confirmandoRemoverMeta = false)}
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
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .resumo {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .donut {
    position: relative;
    display: block;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .donut-centro {
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: 18px;
    color: var(--surface-fg);
  }
  .donut-centro span {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--surface-fg);
  }
  .resumo-macros > span {
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
  .itens-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 0;
  }
  .itens-ajuda {
    margin: 2px 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
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
  .acao-adicionar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
