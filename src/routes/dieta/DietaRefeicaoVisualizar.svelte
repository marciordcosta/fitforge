<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import { parseISODate } from "../../lib/dates";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import DietaListaItens from "./DietaListaItens.svelte";
  import {
    getRefeicaoDia,
    getItensDaRefeicao,
    removerItemDiario,
    removerRefeicaoDia,
    getMetaRefeicaoPorNome,
    getAlimento,
    listRefeicoesModelo,
    listMetasDiaModelo,
    getMetasDoDia,
    getPreferenciasRefeicoesHome,
    getReceita,
    lancarReceitaPadrao,
    salvarComoReceitaPadrao,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
    type Alimento,
    type RefeicaoModelo,
    type PreferenciasRefeicoesHome,
    type BaseReferenciaRefeicao,
  } from "../../lib/dietaApi";
  import { receitaRascunho, definirContexto, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";

  let { refeicaoId }: { refeicaoId: string } = $props();

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];

  let refeicao = $state<RefeicaoDia | null>(null);
  let itens = $state<ItemDiario[]>([]);
  let metaRefeicao = $state<MetasDiarias | null>(null);
  let metaDiaria = $state<MetasDiarias | null>(null);
  let prefsRefeicoes = $state<PreferenciasRefeicoesHome>({ barraBase: "refeicao", valoresFormato: "restante_acima" });
  let modeloRefeicao = $state<RefeicaoModelo | null>(null);
  /** Só mostra o botão "Refeição Padrão" quando a lista de alimentos efetiva desse dia (override do
   * dia se houver, senão a global) realmente tem algum item — senão o botão aparece sem ter nada
   * pra lançar. */
  let receitaPadraoTemItens = $state(false);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let mostrarMenuExcluir = $state(false);
  let confirmandoExcluirAlimentos = $state(false);
  let confirmandoExclusaoRefeicao = $state(false);
  let processando = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const [refeicaoRes, itensRes, modelos, metasDia, prefs] = await Promise.all([
        getRefeicaoDia(refeicaoId),
        getItensDaRefeicao(refeicaoId),
        listRefeicoesModelo(),
        listMetasDiaModelo(),
        getPreferenciasRefeicoesHome(),
      ]);
      refeicao = refeicaoRes;
      itens = itensRes;
      prefsRefeicoes = prefs;
      modeloRefeicao = refeicao ? (modelos.find((m) => m.nome === refeicao!.nome) ?? null) : null;
      [metaRefeicao, metaDiaria] = refeicao
        ? await Promise.all([getMetaRefeicaoPorNome(refeicao.nome, refeicao.data), getMetasDoDia(refeicao.data)])
        : [null, null];

      if (refeicao && modeloRefeicao) {
        const diaSemana = parseISODate(refeicao.data).getDay();
        const override = metasDia.find((md) => md.modeloId === modeloRefeicao!.id && md.diaSemana === diaSemana);
        const receitaIdEfetiva = override?.metaReceitaId ?? modeloRefeicao.metaReceitaId ?? null;
        const receitaPadrao = receitaIdEfetiva ? await getReceita(receitaIdEfetiva) : null;
        receitaPadraoTemItens = !!receitaPadrao?.itens.length;
      } else {
        receitaPadraoTemItens = false;
      }
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  const dataLabel = $derived.by(() => {
    if (!refeicao) return "";
    const d = parseISODate(refeicao.data);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itens.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itens.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itens.reduce((acc, i) => acc + i.carboidratoG, 0));

  const caloriasCarbo = $derived(totalCarboidrato * 4);
  const caloriasGordura = $derived(totalGordura * 9);
  const caloriasProteina = $derived(totalProteina * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  // Com 0 kcal (refeição sem itens ainda), o último stop do conic-gradient (aberto até 100%)
  // preenchia o anel inteiro com a cor da proteína por engano — mostra uma cor neutra em vez disso.
  const donutStyle = $derived(
    caloriasMacros > 0
      ? `background: conic-gradient(${COR_CARBO} 0% ${pctCarbo}%, ${COR_GORDURA} ${pctCarbo}% ${pctCarbo + pctGordura}%, ${COR_PROTEINA} ${pctCarbo + pctGordura}% 100%);`
      : `background: var(--surface-border);`,
  );

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  /** Mesma regra do Diário (Exibição das Refeições, em Parametrização): a barra e o valor podem
   * corresponder à meta DESSA refeição (padrão) ou à meta diária inteira, cada um independente. */
  function metaPara(campo: keyof MetasDiarias, metaRef: MetasDiarias, base: BaseReferenciaRefeicao): number {
    if (base === "diaria" && metaDiaria) return metaDiaria[campo];
    return metaRef[campo];
  }

  /** Mesma regra do Diário (Exibição das Refeições, em Parametrização) — percentual tem variante
   * refeição/diária; resto-ou-acima e a meta em gramas são sempre contra a meta DESSA refeição. */
  function metaValorTexto(consumido: number, metaRefeicaoValor: number, metaDiariaValor: number, unidade: string): string {
    switch (prefsRefeicoes.valoresFormato) {
      case "percentual_refeicao": {
        const pct = metaRefeicaoValor > 0 ? (consumido / metaRefeicaoValor) * 100 : 0;
        return `${consumido.toFixed(0)}${unidade} / ${pct.toFixed(0)}%`;
      }
      case "percentual_diario": {
        const pct = metaDiariaValor > 0 ? (consumido / metaDiariaValor) * 100 : 0;
        return `${consumido.toFixed(0)}${unidade} / ${pct.toFixed(0)}%`;
      }
      case "meta_refeicao":
        return `${consumido.toFixed(0)}/${metaRefeicaoValor.toFixed(0)}${unidade}`;
      case "restante_acima":
      default:
        if (consumido > metaRefeicaoValor) return `${consumido.toFixed(0)}${unidade} (${(consumido - metaRefeicaoValor).toFixed(0)}${unidade} acima)`;
        return `${consumido.toFixed(0)}${unidade} (${Math.max(0, metaRefeicaoValor - consumido).toFixed(0)}${unidade} rest.)`;
    }
  }

  let lancandoPadrao = $state(false);

  async function aoClicarRefeicaoPadrao() {
    if (!refeicao || !modeloRefeicao) return;
    lancandoPadrao = true;
    try {
      const lancou = await lancarReceitaPadrao(modeloRefeicao.id, parseISODate(refeicao.data).getDay(), refeicaoId, refeicao.data);
      if (!lancou) {
        alert("Essa refeição não tem alimentos configurados na Refeição Padrão.");
        return;
      }
      await carregar();
    } catch (err) {
      alert("Erro ao lançar refeição padrão: " + (err as Error).message);
    } finally {
      lancandoPadrao = false;
    }
  }

  let mostrarMenuSalvar = $state(false);
  let confirmandoSalvarPadrao = $state(false);
  let salvandoPadrao = $state(false);
  let preparandoNovaReceita = $state(false);

  /** Caminho inverso de "Lançar Refeição Padrão": salva os alimentos de hoje como a nova Refeição
   * Padrão desse dia da semana, substituindo a lista antiga (se houver). */
  async function salvarComoPadrao() {
    confirmandoSalvarPadrao = false;
    if (!refeicao || !modeloRefeicao) return;
    salvandoPadrao = true;
    try {
      await salvarComoReceitaPadrao(
        modeloRefeicao.id,
        modeloRefeicao.nome,
        parseISODate(refeicao.data).getDay(),
        itens.map((item) => ({ alimentoId: item.alimentoId, quantidade: item.quantidade })),
      );
      receitaPadraoTemItens = true;
    } catch (err) {
      alert("Erro ao salvar refeição padrão: " + (err as Error).message);
    } finally {
      salvandoPadrao = false;
    }
  }

  /** Diferente de "Salvar como Refeição Padrão" (sobrescreve o catálogo direto): aqui só prepara
   * o rascunho com os alimentos de hoje e abre a tela de Nova Refeição, pra revisar/renomear antes
   * de confirmar — vira uma refeição salva normal, na lista de Receitas. */
  async function prepararNovaReceita() {
    if (!refeicao) return;
    preparandoNovaReceita = true;
    try {
      const alimentos = await Promise.all(itens.map((item) => getAlimento(item.alimentoId)));
      definirContexto("nova");
      receitaRascunho.nome = refeicao.nome;
      receitaRascunho.itens = itens
        .map((item, i) => ({ alimento: alimentos[i], quantidade: item.quantidade }))
        .filter((it): it is { alimento: Alimento; quantidade: number } => it.alimento != null);
      navigate(urlNovaReceitaMeta());
    } catch (err) {
      alert("Erro ao preparar nova refeição: " + (err as Error).message);
    } finally {
      preparandoNovaReceita = false;
    }
  }

  async function descartarRefeicao() {
    processando = true;
    try {
      await removerRefeicaoDia(refeicaoId);
      navigate("/dieta");
    } catch (err) {
      alert("Erro ao descartar refeição: " + (err as Error).message);
      processando = false;
    }
  }

  /** Só os alimentos — a refeição em si continua existindo (vazia) pro dia, diferente de
   * descartarRefeicao (que apaga o "slot" inteiro). */
  async function excluirTodosAlimentos(): Promise<void> {
    processando = true;
    try {
      await Promise.all(itens.map((item) => removerItemDiario(item.id)));
    } catch (err) {
      alert("Erro ao excluir alimentos: " + (err as Error).message);
    } finally {
      // Mesmo se algum item falhou no meio do Promise.all, outros já podem ter sido removidos de
      // verdade no servidor — recarrega sempre pra tela nunca ficar mostrando uma lista "cheia"
      // que não bate mais com o banco.
      await carregar();
      processando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet iconLixeira()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
{/snippet}

{#snippet iconBaixar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="4" x2="12" y2="15" />
    <polyline points="7 11 12 16 17 11" />
    <line x1="6" y1="20" x2="18" y2="20" />
  </svg>
{/snippet}

{#snippet iconSubir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="20" x2="12" y2="9" />
    <polyline points="7 13 12 8 17 13" />
    <line x1="6" y1="4" x2="18" y2="4" />
  </svg>
{/snippet}

<div class="header-fixo">
  <div class="header-fixo-inner">
    <button class="icone-header" onclick={() => voltar("/dieta")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>
      {refeicao?.nome ?? ""}
      <span class="data-inline">{dataLabel}</span>
    </h1>
    {#if itens.length && modeloRefeicao}
      <button class="icone-header" disabled={salvandoPadrao || preparandoNovaReceita} onclick={() => (mostrarMenuSalvar = true)} aria-label="Salvar Refeição">{@render iconSubir()}</button>
    {:else if receitaPadraoTemItens}
      <button class="icone-header" disabled={lancandoPadrao} onclick={aoClicarRefeicaoPadrao} aria-label="Lançar Refeição Padrão">{@render iconBaixar()}</button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </div>
</div>

<div class="container has-bottom-nav">
  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar a refeição: {erro}</p>
  {:else if !refeicao}
    <p class="muted">Refeição não encontrada.</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    {#if itens.length}
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
    {/if}

    {#if metaRefeicao}
      {@const metaBarra = {
        calorias: metaPara("calorias", metaRefeicao, prefsRefeicoes.barraBase),
        carboidratoG: metaPara("carboidratoG", metaRefeicao, prefsRefeicoes.barraBase),
        gorduraG: metaPara("gorduraG", metaRefeicao, prefsRefeicoes.barraBase),
        proteinaG: metaPara("proteinaG", metaRefeicao, prefsRefeicoes.barraBase),
      }}
      <p class="metas-titulo">Meta de {refeicao?.nome}</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metaBarra.calorias))}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalCalorias, metaRefeicao.calorias, metaDiaria?.calorias ?? 0, "")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metaBarra.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalCarboidrato, metaRefeicao.carboidratoG, metaDiaria?.carboidratoG ?? 0, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metaBarra.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalGordura, metaRefeicao.gorduraG, metaDiaria?.gorduraG ?? 0, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metaBarra.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(totalProteina, metaRefeicao.proteinaG, metaDiaria?.proteinaG ?? 0, "g")}</span>
        </div>
      </div>
    {:else}
      <p class="metas-titulo">Refeição sem meta</p>
      <div class="metas-grid">
        <div class="meta-col">
          <span class="meta-label">Calorias</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCalorias, metaDiaria?.calorias ?? 0))}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{totalCalorias.toFixed(0)}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalCarboidrato, metaDiaria?.carboidratoG ?? 0))}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{totalCarboidrato.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalGordura, metaDiaria?.gorduraG ?? 0))}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{totalGordura.toFixed(0)}g</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(totalProteina, metaDiaria?.proteinaG ?? 0))}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{totalProteina.toFixed(0)}g</span>
        </div>
      </div>
    {/if}

    <DietaListaItens {itens} {refeicaoId} dataRefeicao={refeicao.data} onMudou={carregar} />

    <div class="acoes-refeicao">
      <button class="acao-adicionar" onclick={() => navigate(`/dieta/alimentos/refeicao/${refeicaoId}`)}>+ Adicionar Alimento</button>
    </div>
    <button class="descartar" disabled={processando} onclick={() => (mostrarMenuExcluir = true)}>Excluir</button>
    </div>
  {/if}
</div>

{#if mostrarMenuExcluir}
  <ActionSheet
    titulo="O que deseja excluir?"
    onFechar={() => (mostrarMenuExcluir = false)}
    opcoes={[
      {
        label: "Excluir Alimentos",
        subtitulo: "A refeição continua, só os itens somem",
        icon: iconLixeira,
        destructive: true,
        onSelect: () => (confirmandoExcluirAlimentos = true),
      },
      {
        label: "Excluir Refeição",
        subtitulo: "Remove a refeição inteira desse dia",
        icon: iconLixeira,
        destructive: true,
        onSelect: () => (confirmandoExclusaoRefeicao = true),
      },
    ]}
  />
{/if}

{#if confirmandoExcluirAlimentos}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir todos os alimentos dessa refeição?"
    textoConfirmar="Excluir Alimentos"
    onConfirmar={excluirTodosAlimentos}
    onCancelar={() => (confirmandoExcluirAlimentos = false)}
  />
{/if}

{#if confirmandoExclusaoRefeicao}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir esta refeição? Todos os alimentos dela serão apagados."
    textoConfirmar="Excluir Refeição"
    onConfirmar={descartarRefeicao}
    onCancelar={() => (confirmandoExclusaoRefeicao = false)}
  />
{/if}

{#if mostrarMenuSalvar}
  <ActionSheet
    titulo="Salvar refeição"
    onFechar={() => (mostrarMenuSalvar = false)}
    opcoes={[
      {
        label: "Salvar Refeição",
        subtitulo: "Vira uma refeição salva normal, na lista de Receitas",
        onSelect: () => prepararNovaReceita(),
      },
      {
        label: "Salvar como Refeição Padrão",
        subtitulo: "Substitui a lista de alimentos padrão desse dia da semana",
        onSelect: () => (confirmandoSalvarPadrao = true),
      },
    ]}
  />
{/if}

{#if confirmandoSalvarPadrao}
  <ConfirmDialog
    titulo="Salvar os alimentos de hoje como a Refeição Padrão desse dia? A lista antiga (se houver) é substituída."
    textoConfirmar="Salvar Refeição"
    destrutivo={false}
    onConfirmar={salvarComoPadrao}
    onCancelar={() => (confirmandoSalvarPadrao = false)}
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
  .header-fixo {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
  }
  .header-fixo-inner {
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4);
    padding-top: max(var(--space-4), env(safe-area-inset-top, 0px));
  }
  .header-fixo-inner h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .icone-header {
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
  .icone-header svg {
    width: 18px;
    height: 18px;
  }
  .icone-header:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .data-inline {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    text-transform: capitalize;
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) 0 var(--space-5);
  }
  .donut {
    position: relative;
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
  }
  .resumo-macros p {
    flex: 1;
    min-width: 0;
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
  .acoes-refeicao {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
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
  .descartar {
    width: 100%;
    padding: var(--space-3);
    margin-top: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .descartar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
