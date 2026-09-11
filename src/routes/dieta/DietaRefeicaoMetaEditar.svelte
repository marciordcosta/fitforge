<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPickerMacros from "../../components/WheelPickerMacros.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    listRefeicoesModelo,
    listMetasDiaModelo,
    getReceita,
    getRefeicoesDoDia,
    getDiarioDoDia,
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

  interface Totais {
    calorias: number;
    proteinaG: number;
    gorduraG: number;
    carboidratoG: number;
  }

  /** Consumo de hoje dessa refeição (pelo nome, igual ao Diário) — pra comparar com a meta aqui
   * mesmo, sem precisar ir na Home. Zero se hoje ainda não tem essa refeição ou nada lançado nela. */
  let consumoHoje = $state<Totais>({ calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 });

  function somarItens(itens: ReceitaItem[]): Totais {
    return itens.reduce(
      (acc, i) => ({
        calorias: acc.calorias + i.calorias,
        proteinaG: acc.proteinaG + i.proteinaG,
        gorduraG: acc.gorduraG + i.gorduraG,
        carboidratoG: acc.carboidratoG + i.carboidratoG,
      }),
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
    );
  }

  /** Soma dos alimentos da lista (quando há algum) — a meta em si passa a ser isso, igual funciona
   * em toda outra tela que soma os itens de uma receita (visualizar receita, nova receita etc.). */
  const totaisItens = $derived(receita?.itens.length ? somarItens(receita.itens) : null);

  async function carregar(): Promise<void> {
    loading = true;
    erro = null;
    try {
      const [modelos, metasDia, refeicoesHoje, itensHoje] = await Promise.all([
        listRefeicoesModelo(),
        listMetasDiaModelo(),
        getRefeicoesDoDia(hojeISO()),
        getDiarioDoDia(hojeISO()),
      ]);
      modelo = modelos.find((m) => m.id === modeloId) ?? null;
      overrideDia = diasSemana?.length ? (metasDia.find((m) => m.modeloId === modeloId && m.diaSemana === diasSemana![0]) ?? null) : null;
      const receitaId = overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null;
      receita = receitaId ? await getReceita(receitaId) : null;

      // Com alimentos na lista, a meta numérica (usada na Home, no Gerenciar e na redistribuição)
      // sempre acompanha a soma deles — sem isso a meta ficaria "presa" no último valor manual
      // enquanto essa tela mostra a soma dos itens, divergindo do resto do app.
      if (receita?.itens.length) {
        const soma = somarItens(receita.itens);
        if (diasSemana?.length) {
          await salvarMetaNumericaRefeicaoDias(modeloId, diasSemana, soma.proteinaG, soma.gorduraG, soma.carboidratoG);
        } else {
          await salvarMetaNumericaRefeicao(modeloId, soma.proteinaG, soma.gorduraG, soma.carboidratoG);
        }
      }

      const refeicaoHoje = refeicoesHoje.find((r) => r.nome === nome);
      const itensDaRefeicao = refeicaoHoje ? itensHoje.filter((i) => i.refeicaoId === refeicaoHoje.id) : [];
      consumoHoje = itensDaRefeicao.reduce(
        (acc, i) => ({
          calorias: acc.calorias + i.calorias,
          proteinaG: acc.proteinaG + i.proteinaG,
          gorduraG: acc.gorduraG + i.gorduraG,
          carboidratoG: acc.carboidratoG + i.carboidratoG,
        }),
        { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
      );
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  function labelAbsoluto(valor: number, meta: number, unidade: string): string {
    return `${valor.toFixed(0)}/${meta.toFixed(0)}${unidade}`;
  }

  /** Valor guardado no banco — só usado como ponto de partida da roda tripla quando ainda não há
   * nenhum alimento na lista (com alimentos, a meta É a soma deles, ver totaisItens). */
  const proteinaArmazenada = $derived(overrideDia?.metaProteinaG ?? modelo?.metaProteinaG ?? null);
  const gorduraArmazenada = $derived(overrideDia?.metaGorduraG ?? modelo?.metaGorduraG ?? null);
  const carboidratoArmazenado = $derived(overrideDia?.metaCarboidratoG ?? modelo?.metaCarboidratoG ?? null);
  const receitaIdAtual = $derived(overrideDia?.metaReceitaId ?? modelo?.metaReceitaId ?? null);

  /** Valores efetivos da meta mostrados na tela inteira — soma dos alimentos quando há algum
   * (igual funciona nas outras telas de receita), senão o valor guardado manualmente. */
  const proteinaG = $derived(totaisItens ? totaisItens.proteinaG : proteinaArmazenada);
  const gorduraG = $derived(totaisItens ? totaisItens.gorduraG : gorduraArmazenada);
  const carboidratoG = $derived(totaisItens ? totaisItens.carboidratoG : carboidratoArmazenado);
  const caloriasCalc = $derived(totaisItens ? totaisItens.calorias : 4 * (proteinaG ?? 0) + 9 * (gorduraG ?? 0) + 4 * (carboidratoG ?? 0));

  const caloriasCarbo = $derived((carboidratoG ?? 0) * 4);
  const caloriasGordura = $derived((gorduraG ?? 0) * 9);
  const caloriasProteina = $derived((proteinaG ?? 0) * 4);
  /** Denominador dos 3 percentuais — sempre a soma pela fórmula dos macros (não a calorias real
   * dos itens, que pode diferir um pouco), pra garantir que os 3 percentuais somem 100%. */
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

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
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesGramas(300), valorAtual: Math.round(carboidratoArmazenado ?? 0), kcalPorGrama: 4, secundario: (v: number) => `${v} g` },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesGramas(150), valorAtual: Math.round(gorduraArmazenada ?? 0), kcalPorGrama: 9, secundario: (v: number) => `${v} g` },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesGramas(300), valorAtual: Math.round(proteinaArmazenada ?? 0), kcalPorGrama: 4, secundario: (v: number) => `${v} g` },
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
      <div class="card-meta">
        <p class="card-meta-titulo">Meta da Refeição</p>
        <button
          type="button"
          class="resumo"
          disabled={totaisItens != null}
          onclick={() => (mostrarMacros = true)}
        >
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
        {#if totaisItens}
          <p class="card-meta-ajuda">Somada dos alimentos da lista — pra editar na mão, remova os alimentos.</p>
        {/if}
      </div>

      <p class="pct-titulo">Consumo de Hoje</p>
      <div class="pct-grid">
        <div class="pct-col">
          <p class="pct-nome">Calorias</p>
          <div class="pct-barra-wrap">
            <div class="pct-barra" style={`width:${larguraBarra(pctMeta(consumoHoje.calorias, caloriasCalc))}%; background:var(--color-secondary);`}></div>
          </div>
          <p class="pct-valor">{labelAbsoluto(consumoHoje.calorias, caloriasCalc, "")}</p>
        </div>
        <div class="pct-col">
          <p class="pct-nome">Carb</p>
          <div class="pct-barra-wrap">
            <div class="pct-barra" style={`width:${larguraBarra(pctMeta(consumoHoje.carboidratoG, carboidratoG ?? 0))}%; background:${COR_CARBO};`}></div>
          </div>
          <p class="pct-valor">{labelAbsoluto(consumoHoje.carboidratoG, carboidratoG ?? 0, "g")}</p>
        </div>
        <div class="pct-col">
          <p class="pct-nome">Gorduras</p>
          <div class="pct-barra-wrap">
            <div class="pct-barra" style={`width:${larguraBarra(pctMeta(consumoHoje.gorduraG, gorduraG ?? 0))}%; background:${COR_GORDURA};`}></div>
          </div>
          <p class="pct-valor">{labelAbsoluto(consumoHoje.gorduraG, gorduraG ?? 0, "g")}</p>
        </div>
        <div class="pct-col">
          <p class="pct-nome">Proteínas</p>
          <div class="pct-barra-wrap">
            <div class="pct-barra" style={`width:${larguraBarra(pctMeta(consumoHoje.proteinaG, proteinaG ?? 0))}%; background:${COR_PROTEINA};`}></div>
          </div>
          <p class="pct-valor">{labelAbsoluto(consumoHoje.proteinaG, proteinaG ?? 0, "g")}</p>
        </div>
      </div>

      <p class="itens-titulo">Itens</p>
      <p class="itens-ajuda">Opcional — só serve pra lançar essa refeição sozinha no diário do dia. A barra de cada um mostra quanto ele representa da meta de calorias.</p>
      {#if !receita?.itens.length}
        <p class="muted">Nenhum alimento adicionado ainda.</p>
      {:else}
        {#each receita.itens as item (item.id)}
          {@const pctItem = pctMeta(item.calorias, caloriasCalc)}
          <button
            class="item-card"
            onpointerdown={(e) => aoPointerDownItem(e, item)}
            onclick={() => aoClickItem(item)}
            oncontextmenu={(e) => aoContextMenuItem(e, item)}
          >
            <div class="item-info">
              <p class="item-nome">{item.nome}</p>
              <p class="item-qtd">{item.quantidade}{item.unidade} · {item.calorias.toFixed(0)} kcal · {pctItem.toFixed(0)}% da meta</p>
              <div class="item-barra-wrap">
                <div class="item-barra" style={`width:${larguraBarra(pctItem)}%;`}></div>
              </div>
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
  .card-meta {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .card-meta-titulo {
    margin: 0;
    font-weight: 600;
    color: var(--surface-fg);
  }
  .card-meta-ajuda {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resumo {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) 0 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .resumo:disabled {
    cursor: default;
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
  .pct-titulo {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .pct-grid {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
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
  .item-barra-wrap {
    height: 4px;
    margin-top: var(--space-2);
    background: var(--surface-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .item-barra {
    height: 100%;
    border-radius: 3px;
    background: var(--color-primary);
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
