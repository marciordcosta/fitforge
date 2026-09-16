<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar as voltarRouter } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import {
    buscarAlimentos,
    listAlimentos,
    buscarReceitas,
    listReceitas,
    adicionarItemDiario,
    adicionarReceitaAoDiario,
    getRefeicaoDia,
    getItensDaRefeicao,
    getReceita,
    getAlimento,
    adicionarItemReceita,
    type Alimento,
    type ReceitaResumo,
  } from "../../lib/dietaApi";
  import { receitaRascunho, adicionarAoRascunho, definirContexto, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";

  /** Quando presente, cada alimento ganha um "+" pra adicionar direto a essa refeição, sem passar pelo detalhamento. Sem isso, é só o catálogo normal. */
  let {
    refeicaoId,
    modoReceita,
    receitaIdExistente,
  }: { refeicaoId?: string; modoReceita?: boolean; receitaIdExistente?: string } = $props();

  const modoAdicionar = untrack(() => refeicaoId != null);
  const refeicaoIdFixo = untrack(() => refeicaoId);
  /** Mesma seção "Refeições" (adicionar de uma vez os itens de outra receita/refeição salva)
   * vale tanto pra adicionar no diário quanto pra montar/editar uma receita — sem isso, só
   * aparecia vindo da Home, dando a impressão de que aqui (Gerenciar Refeições/receita) era um
   * catálogo mais limitado. */
  const mostrarReceitasRapidas = untrack(() => refeicaoId != null || modoReceita === true);
  /** Essa tela é reaberta a partir de mais de uma origem com a MESMA URL de resto (ex: uma receita
   * salva de verdade, OU a lista de alimentos privada de uma refeição do catálogo) — quem navega
   * pra cá pode informar o pai real via ?origem=, usado só como fallback (deep link/recarregar);
   * em uso normal o voltar físico/botão já volta pro pai de verdade via histórico. */
  const origemPadrao = untrack(() => new URLSearchParams(window.location.search).get("origem"));

  function lerBuscaDaUrl(): string {
    return new URLSearchParams(window.location.search).get("q") ?? "";
  }

  function atualizarUrlBusca(valor: string) {
    const url = new URL(window.location.href);
    if (valor.trim()) {
      url.searchParams.set("q", valor);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  let alimentos = $state<Alimento[]>([]);
  let resultadosReceitas = $state<ReceitaResumo[]>([]);
  /** Nunca mostra a própria receita sendo editada como opção de "importar itens dela mesma". */
  const receitasParaMostrar = $derived(resultadosReceitas.filter((r) => r.id !== receitaIdExistente));
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let busca = $state(untrack(() => lerBuscaDaUrl()));
  let mostrarCriarAlimento = $state(false);
  let refeicaoData = $state("");
  let refeicaoNome = $state("");
  let adicionandoId = $state<string | null>(null);
  let adicionadosIds = $state<Set<string>>(new Set());
  let mensagem = $state<string | null>(null);
  let erro = $state<string | null>(null);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;
  let timeoutMensagem: ReturnType<typeof setTimeout> | undefined;

  function mostrarMensagem(texto: string) {
    mensagem = texto;
    clearTimeout(timeoutMensagem);
    timeoutMensagem = setTimeout(() => (mensagem = null), 2000);
  }

  /** Digitar rápido dispara uma busca debounced atrás da outra — sem essa trava, uma busca mais
   * antiga (mais lenta) podia responder depois de uma mais nova e sobrescrever a lista com
   * resultados de um termo que já não está mais na caixa de busca. */
  let tokenBusca = 0;

  async function executarBusca(query: string) {
    const meuToken = ++tokenBusca;
    loading = true;
    erro = null;
    try {
      let alRes: Alimento[];
      let recRes: ReceitaResumo[];
      if (query.trim()) {
        [alRes, recRes] = await Promise.all([
          buscarAlimentos(query),
          mostrarReceitasRapidas ? buscarReceitas(query) : Promise.resolve([]),
        ]);
      } else {
        [alRes, recRes] = await Promise.all([listAlimentos(), mostrarReceitasRapidas ? listReceitas() : Promise.resolve([])]);
      }
      if (meuToken !== tokenBusca) return;
      alimentos = alRes;
      resultadosReceitas = recRes;
    } catch (err) {
      if (meuToken === tokenBusca) erro = (err as Error).message;
    } finally {
      if (meuToken === tokenBusca) {
        loading = false;
        carregouAlgumaVez = true;
      }
    }
  }

  async function carregarInicial() {
    await executarBusca(busca);
  }

  void carregarInicial();

  if (modoAdicionar) {
    void getRefeicaoDia(refeicaoIdFixo!).then((r) => {
      refeicaoData = r?.data ?? "";
      refeicaoNome = r?.nome ?? "";
    });
    void getItensDaRefeicao(refeicaoIdFixo!).then((itensExistentes) => {
      adicionadosIds = new Set(itensExistentes.map((i) => i.alimentoId));
    });
  }

  const modoReceitaFixo = untrack(() => modoReceita);
  const receitaIdExistenteFixo = untrack(() => receitaIdExistente);

  if (modoReceitaFixo) {
    const doRascunho =
      receitaRascunho.contexto === (receitaIdExistenteFixo ?? "nova") ? receitaRascunho.itens.map((it) => it.alimento.id) : [];
    adicionadosIds = new Set(doRascunho);
    if (receitaIdExistenteFixo) {
      void getReceita(receitaIdExistenteFixo).then((r) => {
        if (!r) return;
        adicionadosIds = new Set([...adicionadosIds, ...r.itens.map((i) => i.alimentoId)]);
      });
    }
  }

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => {
      atualizarUrlBusca(busca);
      void executarBusca(busca);
    }, 300);
  }

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function voltar() {
    if (origemPadrao) {
      voltarRouter(origemPadrao);
      return;
    }
    if (modoReceita) {
      if (receitaIdExistente) {
        voltarRouter(`/dieta/receitas/ver/${receitaIdExistente}`);
      } else {
        voltarRouter(urlNovaReceitaMeta());
      }
    } else if (refeicaoId) {
      voltarRouter(`/dieta/refeicao/${refeicaoId}`);
    } else {
      voltarRouter("/dieta");
    }
  }

  function abrirDetalhamento(a: Alimento) {
    if (modoReceita) {
      navigate(`/dieta/alimento/${a.id}/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`);
    } else if (modoAdicionar) {
      navigate(`/dieta/alimento/${a.id}/${refeicaoData}/${refeicaoIdFixo}`);
    } else {
      navigate(`/dieta/alimento/${a.id}/${hojeISO()}`);
    }
  }

  async function adicionarRapido(a: Alimento) {
    if (!refeicaoIdFixo || adicionadosIds.has(a.id)) return;
    adicionandoId = a.id;
    try {
      await adicionarItemDiario({ alimento: a, data: refeicaoData, refeicaoId: refeicaoIdFixo, quantidade: a.porcaoPadraoQtd });
      adicionadosIds = new Set(adicionadosIds).add(a.id);
      mostrarMensagem(`Adicionado ao ${refeicaoNome}`);
    } catch (err) {
      alert("Erro ao adicionar alimento: " + (err as Error).message);
    } finally {
      adicionandoId = null;
    }
  }

  /** Receita já existente (caso mais comum aqui: lista de alimentos de uma refeição do catálogo,
   * ou "+ Adicionar Alimento" de dentro de uma receita já salva) grava direto no banco — sem isso,
   * o item ficava só no rascunho em memória, e só era gravado de verdade se o usuário passasse
   * pela tela de visualizar receita e tocasse em "concluir"; saindo por qualquer outro caminho
   * (inclusive o botão de voltar dessa própria tela), o alimento se perdia sem aviso. Sem receita
   * ainda criada (fluxo de "Nova Receita"), continua usando o rascunho normalmente. */
  async function adicionarNaReceita(a: Alimento) {
    if (adicionadosIds.has(a.id)) return;
    if (receitaIdExistente) {
      adicionandoId = a.id;
      try {
        await adicionarItemReceita(receitaIdExistente, a.id, a.porcaoPadraoQtd);
        adicionadosIds = new Set(adicionadosIds).add(a.id);
        mostrarMensagem(`${a.nome} adicionado`);
      } catch (err) {
        alert("Erro ao adicionar alimento: " + (err as Error).message);
      } finally {
        adicionandoId = null;
      }
      return;
    }
    definirContexto("nova");
    adicionarAoRascunho(a);
    adicionadosIds = new Set(adicionadosIds).add(a.id);
    mostrarMensagem(`${a.nome} adicionado`);
  }

  function abrirScanner() {
    const destino = modoReceita
      ? `/dieta/scanear/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`
      : modoAdicionar
        ? `/dieta/scanear/${refeicaoData}/${refeicaoIdFixo}`
        : `/dieta/scanear/${hojeISO()}`;
    navigate(destino);
  }

  async function selecionarReceita(receita: ReceitaResumo) {
    if (!refeicaoIdFixo || adicionadosIds.has(receita.id)) return;
    adicionandoId = receita.id;
    try {
      await adicionarReceitaAoDiario(receita.id, refeicaoData, refeicaoIdFixo);
      adicionadosIds = new Set(adicionadosIds).add(receita.id);
      mostrarMensagem(`Adicionado ao ${refeicaoNome}`);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
    } finally {
      adicionandoId = null;
    }
  }

  /** Mesma ideia de selecionarReceita, mas pra dentro de outra receita/lista de alimentos sendo
   * montada aqui (Gerenciar Refeições, receita salva ou "Nova Refeição") em vez do diário — copia
   * cada item da receita escolhida, pulando os que já estão na lista atual. */
  async function selecionarReceitaParaReceita(receita: ReceitaResumo) {
    if (adicionadosIds.has(receita.id)) return;
    adicionandoId = receita.id;
    try {
      const origem = await getReceita(receita.id);
      if (!origem) return;
      if (receitaIdExistente) {
        for (const item of origem.itens) {
          if (adicionadosIds.has(item.alimentoId)) continue;
          await adicionarItemReceita(receitaIdExistente, item.alimentoId, item.quantidade);
          adicionadosIds = new Set(adicionadosIds).add(item.alimentoId);
        }
      } else {
        definirContexto("nova");
        for (const item of origem.itens) {
          if (adicionadosIds.has(item.alimentoId)) continue;
          const alimento = await getAlimento(item.alimentoId);
          if (!alimento) continue;
          adicionarAoRascunho(alimento, item.quantidade);
          adicionadosIds = new Set(adicionadosIds).add(item.alimentoId);
        }
      }
      adicionadosIds = new Set(adicionadosIds).add(receita.id);
      mostrarMensagem(`Itens de "${receita.nome}" adicionados`);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
    } finally {
      adicionandoId = null;
    }
  }

  function abrirDetalheReceita(receita: ReceitaResumo) {
    navigate(`/dieta/receitas/ver/${receita.id}`);
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={voltar} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Alimentos</h1>
    <button class="criar" onclick={() => (mostrarCriarAlimento = true)}>Criar</button>
  </div>

  <div class="busca-linha">
    <input class="search" type="text" placeholder="Procurar alimento" bind:value={busca} oninput={aoDigitar} />
    <button class="scanner-btn" onclick={abrirScanner} aria-label="Escanear código de barras">
      {@render iconScanner()}
    </button>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao buscar alimentos: {erro}</p>
  {:else}
    <div class="resultados" class:carregando={loading}>
    {#if mostrarReceitasRapidas && receitasParaMostrar.length}
      <p class="secao-titulo">Refeições</p>
      <ul class="lista">
        {#each receitasParaMostrar as receita (receita.id)}
          <li class="linha">
            <button class="info-btn" onclick={() => abrirDetalheReceita(receita)}>
              <span class="avatar">{iniciais(receita.nome)}</span>
              <span class="info">
                <span class="nome">{receita.nome}</span>
                <span class="sub">{receita.calorias.toFixed(0)} kcal</span>
              </span>
            </button>
            <button
              class="add-btn"
              class:adicionado={adicionadosIds.has(receita.id)}
              onclick={() => (modoReceita ? selecionarReceitaParaReceita(receita) : selecionarReceita(receita))}
              disabled={adicionandoId === receita.id || adicionadosIds.has(receita.id)}
              aria-label="Adicionar"
            >
              {#if adicionandoId === receita.id}…{:else}{@render iconMais()}{/if}
            </button>
          </li>
        {/each}
      </ul>
      <p class="secao-titulo">Alimentos</p>
    {/if}

    {#if !alimentos.length}
      <p class="muted">Nenhum alimento encontrado.</p>
    {:else}
      <ul class="lista">
        {#each alimentos as a (a.id)}
          <li class="linha">
            <button class="info-btn" onclick={() => abrirDetalhamento(a)}>
              <span class="avatar">{iniciais(a.nome)}</span>
              <span class="info">
                <span class="nome">{a.nome}{#if a.marca} <span class="marca">· {a.marca}</span>{/if}</span>
                <span class="sub">{a.caloriasPorPorcao.toFixed(0)} kcal / {a.porcaoPadraoQtd}{a.porcaoPadraoUnidade}</span>
              </span>
            </button>
            {#if modoAdicionar}
              <button
                class="add-btn"
                class:adicionado={adicionadosIds.has(a.id)}
                onclick={() => adicionarRapido(a)}
                disabled={adicionandoId === a.id || adicionadosIds.has(a.id)}
                aria-label="Adicionar"
              >
                {#if adicionandoId === a.id}…{:else}{@render iconMais()}{/if}
              </button>
            {:else if modoReceita}
              <button
                class="add-btn"
                class:adicionado={adicionadosIds.has(a.id)}
                onclick={() => adicionarNaReceita(a)}
                disabled={adicionandoId === a.id || adicionadosIds.has(a.id)}
                aria-label="Adicionar"
              >
                {#if adicionandoId === a.id}…{:else}{@render iconMais()}{/if}
              </button>
            {:else}
              <span class="chevron">›</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    </div>
  {/if}
</div>

{#if mensagem}
  <div class="toast">{mensagem}</div>
{/if}

{#if mostrarCriarAlimento}
  <DietaAlimentoFormSheet
    refeicaoId={refeicaoIdFixo}
    data={refeicaoData}
    onFechar={() => (mostrarCriarAlimento = false)}
    onSalvo={carregarInicial}
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
  .criar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .busca-linha {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .search {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .scanner-btn {
    flex-shrink: 0;
    width: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .scanner-btn svg {
    width: 20px;
    height: 20px;
  }
  .secao-titulo {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-muted);
    text-transform: uppercase;
    margin: var(--space-3) 0 var(--space-1);
  }
  .resultados {
    transition: opacity 0.15s;
  }
  .resultados.carregando {
    opacity: 0.5;
  }
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .linha {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .info-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    padding: 0;
  }
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    flex-shrink: 0;
  }
  .add-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .add-btn svg {
    width: 16px;
    height: 16px;
  }
  .add-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .add-btn.adicionado {
    background: var(--surface-border);
    color: var(--surface-muted);
    opacity: 1;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-border);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    flex-shrink: 0;
    text-transform: uppercase;
  }
  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nome {
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marca {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    font-weight: 400;
  }
  .sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--bottom-nav-height, 0px) + var(--space-4));
    transform: translateX(-50%);
    background: var(--surface-card);
    color: var(--surface-fg);
    border: 1px solid var(--surface-border);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
    font-size: var(--font-size-sm);
    z-index: 80;
    white-space: nowrap;
  }
</style>
