<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar } from "../../lib/router.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import { criarGuardaSaida } from "../../lib/guardaSaida.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import DietaQuantidadeDialog from "./DietaQuantidadeDialog.svelte";
  import {
    getAlimento,
    getItemDiario,
    getRefeicaoDia,
    getRefeicoesDoDia,
    getMetasDiarias,
    getMetaRefeicaoPorNome,
    getPreferenciasRefeicoesHome,
    adicionarItemDiario,
    atualizarItemDiario,
    adicionarItemReceita,
    duplicarAlimento,
    excluirAlimento,
    renomearAlimento,
    type Alimento,
    type MetasDiarias,
    type RefeicaoDia,
    type PreferenciasRefeicoesHome,
    type BaseReferenciaRefeicao,
  } from "../../lib/dietaApi";
  import { receitaRascunho, adicionarAoRascunho, definirContexto, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";

  let {
    alimentoId,
    data,
    refeicaoIdInicial,
    itemDiarioId,
    modoReceita,
    receitaIdExistente,
    voltarPara,
  }: {
    alimentoId?: string;
    data?: string;
    refeicaoIdInicial?: string | null;
    itemDiarioId?: string;
    modoReceita?: boolean;
    receitaIdExistente?: string;
    /** Destino de voltar/salvar quando não há refeição nem modo receita — ex: aberto a partir do
     * detalhe de um item já existente numa receita (visualizar, não adicionar), onde não faz
     * sentido lançar no diário nem tratar como rascunho de receita nova. */
    voltarPara?: string;
  } = $props();

  const editandoItem = untrack(() => itemDiarioId != null);
  /** Essa rota (`/dieta/alimento/:id/:data/receita/:receitaId`) é usada tanto a partir de uma
   * receita salva de verdade quanto da lista de alimentos privada de uma refeição do catálogo —
   * `voltarPara` (prop, calculado no route table) assume sempre o primeiro caso; quem navega pra
   * cá no segundo caso complementa com ?origem= pra corrigir o destino real. */
  const origemPadrao = untrack(() => new URLSearchParams(window.location.search).get("origem"));

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  let alimento = $state<Alimento | null>(null);
  let metas = $state<MetasDiarias | null>(null);
  let metaRefeicao = $state<MetasDiarias | null>(null);
  let prefsRefeicoes = $state<PreferenciasRefeicoesHome>({ barraBase: "refeicao", valoresFormato: "restante_acima" });
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let dataResolvida = $state(untrack(() => data ?? ""));
  let refeicao = $state<RefeicaoDia | null>(null);
  let quantidade = $state(0);
  let opcoesRefeicao = $state<RefeicaoDia[]>([]);
  let mostrarEscolhaRefeicao = $state(false);
  let mostrarCriarRefeicao = $state(false);
  let mostrarQuantidade = $state(false);
  let mostrarMenuAlimento = $state(false);
  let mostrarEditar = $state(false);
  let confirmandoExclusao = $state(false);
  let salvando = $state(false);
  let processandoAlimento = $state(false);
  let erro = $state<string | null>(null);
  let confirmandoDescartar = $state(false);
  let quantidadeOriginal = 0;
  let refeicaoOriginalId: string | null = null;

  async function carregar() {
    loading = true;
    erro = null;
    try {
      if (editandoItem) {
        const item = await getItemDiario(itemDiarioId!);
        if (!item) return;
        const [alimentoRes, refeicaoRes, metasRes, prefs] = await Promise.all([
          getAlimento(item.alimentoId),
          getRefeicaoDia(item.refeicaoId),
          getMetasDiarias(),
          getPreferenciasRefeicoesHome(),
        ]);
        alimento = alimentoRes;
        refeicao = refeicaoRes;
        metas = metasRes;
        prefsRefeicoes = prefs;
        dataResolvida = refeicaoRes?.data ?? "";
        quantidade = item.quantidade;
        quantidadeOriginal = item.quantidade;
        refeicaoOriginalId = item.refeicaoId;
      } else {
        const [alimentoRes, metasRes, refeicaoRes, prefs] = await Promise.all([
          getAlimento(alimentoId!),
          getMetasDiarias(),
          refeicaoIdInicial ? getRefeicaoDia(refeicaoIdInicial) : Promise.resolve(null),
          getPreferenciasRefeicoesHome(),
        ]);
        alimento = alimentoRes;
        metas = metasRes;
        refeicao = refeicaoRes;
        prefsRefeicoes = prefs;
        quantidade = alimentoRes ? alimentoRes.porcaoPadraoQtd : 0;
        quantidadeOriginal = quantidade;
        refeicaoOriginalId = refeicaoRes?.id ?? null;
      }
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
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

  function aoSalvarQuantidade(qtd: number) {
    quantidade = qtd;
    mostrarQuantidade = false;
  }

  $effect(() => {
    const nome = refeicao?.nome;
    if (!nome || !dataResolvida) {
      metaRefeicao = null;
      return;
    }
    let cancelado = false;
    getMetaRefeicaoPorNome(nome, dataResolvida).then((m) => {
      if (!cancelado) metaRefeicao = m;
    });
    return () => {
      cancelado = true;
    };
  });

  const fator = $derived(alimento && alimento.porcaoPadraoQtd > 0 ? quantidade / alimento.porcaoPadraoQtd : 0);
  const calorias = $derived(alimento ? alimento.caloriasPorPorcao * fator : 0);
  const proteinaG = $derived(alimento ? alimento.proteinaG * fator : 0);
  const gorduraG = $derived(alimento ? alimento.gorduraG * fator : 0);
  const carboidratoG = $derived(alimento ? alimento.carboidratoG * fator : 0);
  const fibraG = $derived(alimento?.fibraG != null ? alimento.fibraG * fator : null);
  const gorduraSaturadaG = $derived(alimento?.gorduraSaturadaG != null ? alimento.gorduraSaturadaG * fator : null);
  const gorduraInsaturadaG = $derived(alimento?.gorduraInsaturadaG != null ? alimento.gorduraInsaturadaG * fator : null);

  const caloriasCarbo = $derived(carboidratoG * 4);
  const caloriasGordura = $derived(gorduraG * 9);
  const caloriasProteina = $derived(proteinaG * 4);
  const caloriasMacros = $derived(caloriasCarbo + caloriasGordura + caloriasProteina);

  const pctCarbo = $derived(caloriasMacros > 0 ? (caloriasCarbo / caloriasMacros) * 100 : 0);
  const pctGordura = $derived(caloriasMacros > 0 ? (caloriasGordura / caloriasMacros) * 100 : 0);
  const pctProteina = $derived(caloriasMacros > 0 ? (caloriasProteina / caloriasMacros) * 100 : 0);

  // Com 0 kcal (ex: água), o último stop do conic-gradient (aberto até 100%) preenchia o anel
  // inteiro com a cor da proteína por engano — mostra uma cor neutra em vez disso.
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

  /** Mesma regra do Diário (Exibição das Refeições, em Parametrização): a barra pode corresponder
   * à meta DESSA refeição (padrão) ou à meta diária inteira. */
  function metaPara(campo: keyof MetasDiarias, metaRef: MetasDiarias, base: BaseReferenciaRefeicao): number {
    if (base === "diaria" && metas) return metas[campo];
    return metaRef[campo];
  }

  /** Mesma regra do Diário — percentual tem variante refeição/diária; resto-ou-acima e a meta em
   * gramas são sempre contra a meta DESSA refeição. */
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

  function sufixoRota(): string {
    if (modoReceita) return `/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`;
    return refeicao ? `/${dataResolvida}/${refeicao.id}` : dataResolvida ? `/${dataResolvida}` : "";
  }

  function sujo(): boolean {
    return !loading && (quantidade !== quantidadeOriginal || (refeicao?.id ?? null) !== refeicaoOriginalId);
  }

  const guardaSaida = criarGuardaSaida(sujo);

  function aoVoltar(): void {
    if (sujo()) {
      confirmandoDescartar = true;
      return;
    }
    voltar(destinoVoltar());
  }

  function destinoVoltar(): string {
    if (origemPadrao) return origemPadrao;
    if (voltarPara) return voltarPara;
    if (modoReceita) {
      if (receitaIdExistente) return `/dieta/receitas/ver/${receitaIdExistente}`;
      return urlNovaReceitaMeta();
    }
    if (refeicao) return `/dieta/refeicao/${refeicao.id}`;
    return "/dieta";
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

  let nomeEditando = $state(false);
  let nomeEditavel = $state("");
  let salvandoNome = $state(false);

  /** Renomear é separado de "Editar" (que mexe na tabela nutricional inteira e só existe pra
   * alimentos manuais) — só o nome, disponível pra qualquer alimento, tocando nele aqui. */
  function abrirRenomear(): void {
    if (!alimento) return;
    nomeEditavel = alimento.nome;
    nomeEditando = true;
  }

  function focarAoMontar(el: HTMLInputElement): void {
    el.focus();
  }

  async function confirmarRenomear(): Promise<void> {
    if (!alimento) return;
    nomeEditando = false;
    const novoNome = nomeEditavel.trim();
    if (!novoNome || novoNome === alimento.nome) return;
    salvandoNome = true;
    try {
      await renomearAlimento(alimento.id, novoNome);
      alimento = { ...alimento, nome: novoNome };
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao renomear alimento: " + (err as Error).message);
    } finally {
      salvandoNome = false;
    }
  }

  async function excluir() {
    if (!alimento) return;
    processandoAlimento = true;
    try {
      await excluirAlimento(alimento.id);
      navigate(modoReceita ? `/dieta/alimentos/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}` : "/dieta/alimentos");
    } catch (err) {
      alert("Erro ao excluir alimento: " + (err as Error).message);
      processandoAlimento = false;
    }
  }

  async function salvar() {
    if (!alimento) return;
    if (modoReceita) {
      if (receitaIdExistente) {
        // Receita já existe (lista de alimentos de uma refeição do catálogo, ou "+ Adicionar
        // Alimento" de dentro de uma receita salva) — grava direto, sem depender do rascunho +
        // "concluir" na tela de visualizar receita (que se perdia se o usuário saísse por outro
        // caminho, inclusive o próprio botão de voltar).
        salvando = true;
        try {
          await adicionarItemReceita(receitaIdExistente, alimento.id, quantidade);
          mostrarToast("Salvo");
          guardaSaida.resolverSaida(() => voltar(destinoVoltar()));
        } catch (err) {
          alert("Erro ao salvar alimento: " + (err as Error).message);
          salvando = false;
        }
        return;
      }
      definirContexto("nova");
      adicionarAoRascunho(alimento, quantidade);
      guardaSaida.resolverSaida(() => voltar(destinoVoltar()));
      return;
    }
    if (!refeicao) {
      // Sem refeição escolhida não há o que lançar no diário — o alimento já foi criado/salvo no catálogo antes de chegar aqui.
      guardaSaida.resolverSaida(() => voltar(destinoVoltar()));
      return;
    }
    salvando = true;
    try {
      if (editandoItem) {
        await atualizarItemDiario(itemDiarioId!, alimento, quantidade, refeicao.id, quantidade !== quantidadeOriginal);
      } else {
        await adicionarItemDiario({ alimento, data: dataResolvida, refeicaoId: refeicao.id, quantidade });
      }
      mostrarToast("Salvo");
      guardaSaida.resolverSaida(() => voltar(destinoVoltar()));
    } catch (err) {
      alert("Erro ao salvar alimento: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

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
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={aoVoltar} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{editandoItem ? "Editar Alimento" : "Adicionar Alimento"}</h1>
    <div class="header-acoes">
      {#if alimento?.fonte === "manual"}
        <button class="icone-acao" onclick={() => (mostrarMenuAlimento = true)} disabled={processandoAlimento} aria-label="Mais opções">
          {@render iconMenu()}
        </button>
      {/if}
      <button class="salvar" onclick={salvar} disabled={salvando || loading} aria-label="Salvar">
        {@render iconCheck()}
      </button>
    </div>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar: {erro}</p>
  {:else if !alimento}
    <p class="muted">Alimento não encontrado.</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    <h2 class="nome-alimento">
      {#if nomeEditando}
        <input
          class="nome-alimento-input"
          type="text"
          bind:value={nomeEditavel}
          onblur={confirmarRenomear}
          onkeydown={(e) => e.key === "Enter" && confirmarRenomear()}
          use:focarAoMontar
        />
      {:else}
        <button type="button" class="nome-alimento-btn" onclick={abrirRenomear} disabled={salvandoNome}>{alimento.nome}</button>
      {/if}
      <span class="porcao-padrao">{alimento.porcaoPadraoQtd}{alimento.porcaoPadraoUnidade}</span>
    </h2>

    {#if !modoReceita}
      <div
        class="linha"
        role="button"
        tabindex="0"
        onclick={() => abrirEscolhaRefeicao()}
        onkeydown={(e) => e.key === "Enter" && abrirEscolhaRefeicao()}
      >
        <span>Refeição</span>
        <span class:placeholder={!refeicao}>{refeicao ? refeicao.nome : "Nenhuma (opcional)"}</span>
      </div>
    {/if}

    <div
      class="linha"
      role="button"
      tabindex="0"
      onclick={() => (mostrarQuantidade = true)}
      onkeydown={(e) => e.key === "Enter" && (mostrarQuantidade = true)}
    >
      <span>Quantidade</span>
      <span>{quantidade.toFixed(0)}{alimento.porcaoPadraoUnidade}</span>
    </div>

    <div class="resumo">
      <div class="donut" style={donutStyle}>
        <div class="donut-centro">
          <strong>{calorias.toFixed(0)}</strong>
          <span>Cal</span>
        </div>
      </div>
      <div class="resumo-macros">
        <p><strong class="pct" style={`color:${COR_CARBO}`}>{pctCarbo.toFixed(0)}%</strong><br /><span class="valor-g">{carboidratoG.toFixed(1)} g</span><br />Carb</p>
        <p><strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong><br /><span class="valor-g">{gorduraG.toFixed(1)} g</span><br />Gorduras</p>
        <p><strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong><br /><span class="valor-g">{proteinaG.toFixed(1)} g</span><br />Proteínas</p>
      </div>
    </div>

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
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(calorias, metaBarra.calorias))}%; background:var(--color-secondary);`}></div></div>
          <span class="meta-valor">{metaValorTexto(calorias, metaRefeicao.calorias, metas?.calorias ?? 0, "")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Carb</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(carboidratoG, metaBarra.carboidratoG))}%; background:${COR_CARBO};`}></div></div>
          <span class="meta-valor">{metaValorTexto(carboidratoG, metaRefeicao.carboidratoG, metas?.carboidratoG ?? 0, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Gorduras</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(gorduraG, metaBarra.gorduraG))}%; background:${COR_GORDURA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(gorduraG, metaRefeicao.gorduraG, metas?.gorduraG ?? 0, "g")}</span>
        </div>
        <div class="meta-col">
          <span class="meta-label">Proteínas</span>
          <div class="meta-barra"><div class="meta-barra-fill" style={`width:${larguraBarra(pctMeta(proteinaG, metaBarra.proteinaG))}%; background:${COR_PROTEINA};`}></div></div>
          <span class="meta-valor">{metaValorTexto(proteinaG, metaRefeicao.proteinaG, metas?.proteinaG ?? 0, "g")}</span>
        </div>
      </div>
    {:else}
      <p class="metas-titulo">Refeição sem meta</p>
    {/if}

    <p class="nutrientes-titulo">Nutrientes</p>
    <div class="nutrientes-lista">
      <div class="nutriente-item">
        <span>Carboidratos</span>
        <span>{carboidratoG.toFixed(1)} g</span>
      </div>
      <div class="nutriente-item">
        <span>Proteínas</span>
        <span>{proteinaG.toFixed(1)} g</span>
      </div>
      <div class="nutriente-item">
        <span>Gordura Saturada</span>
        <span>{gorduraSaturadaG != null ? `${gorduraSaturadaG.toFixed(1)} g` : "—"}</span>
      </div>
      <div class="nutriente-item">
        <span>Gordura Insaturada</span>
        <span>{gorduraInsaturadaG != null ? `${gorduraInsaturadaG.toFixed(1)} g` : "—"}</span>
      </div>
      <div class="nutriente-item">
        <span>Fibras</span>
        <span>{fibraG != null ? `${fibraG.toFixed(1)} g` : "—"}</span>
      </div>
    </div>
    </div>
  {/if}
</div>

{#if mostrarQuantidade && alimento}
  <DietaQuantidadeDialog
    titulo={alimento.nome}
    quantidadeInicial={quantidade}
    porcaoPadraoUnidade={alimento.porcaoPadraoUnidade}
    onSalvar={aoSalvarQuantidade}
    onFechar={() => (mostrarQuantidade = false)}
  />
{/if}

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

{#if confirmandoDescartar || guardaSaida.confirmando}
  <ConfirmDialog
    titulo="Descartar alterações?"
    textoConfirmar="Descartar"
    onConfirmar={() => {
      confirmandoDescartar = false;
      guardaSaida.resolverSaida(() => voltar(destinoVoltar()));
    }}
    onCancelar={() => {
      confirmandoDescartar = false;
      guardaSaida.cancelar();
    }}
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
  .nome-alimento-btn {
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    text-align: left;
    cursor: pointer;
  }
  .nome-alimento-input {
    box-sizing: border-box;
    max-width: 100%;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    background: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
  }
  .nome-alimento-input:focus {
    outline: none;
    border-bottom-color: var(--color-primary);
  }
  .porcao-padrao {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
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
    color: var(--surface-muted);
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0;
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
  .nutrientes-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .nutrientes-lista {
    display: flex;
    flex-direction: column;
  }
  .nutriente-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    font-size: var(--font-size-sm);
  }
  .nutriente-item:last-child {
    border-bottom: none;
  }
  .nutriente-item span:first-child {
    color: var(--surface-muted);
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
