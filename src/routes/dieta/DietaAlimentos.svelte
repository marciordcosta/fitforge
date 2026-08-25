<script lang="ts">
  import { untrack } from "svelte";
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import {
    buscarAlimentos,
    listAlimentos,
    buscarReceitas,
    listReceitas,
    adicionarItemDiario,
    adicionarReceitaAoDiario,
    getRefeicaoDia,
    type Alimento,
    type ReceitaResumo,
  } from "../../lib/dietaApi";
  import { adicionarAoRascunho } from "../../lib/receitaRascunho.svelte";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  /** Quando presente, cada alimento ganha um "+" pra adicionar direto a essa refeição, sem passar pelo detalhamento. Sem isso, é só o catálogo normal. */
  let { refeicaoId, modoReceita }: { refeicaoId?: string; modoReceita?: boolean } = $props();

  const modoAdicionar = untrack(() => refeicaoId != null);
  const refeicaoIdFixo = untrack(() => refeicaoId);

  let alimentos = $state<Alimento[]>([]);
  let resultadosReceitas = $state<ReceitaResumo[]>([]);
  let loading = $state(true);
  let busca = $state("");
  let mostrarEscolhaCriar = $state(false);
  let mostrarCriarAlimento = $state(false);
  let refeicaoData = $state("");
  let refeicaoNome = $state("");
  let adicionandoId = $state<string | null>(null);
  let mensagem = $state<string | null>(null);
  let erro = $state<string | null>(null);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;
  let timeoutMensagem: ReturnType<typeof setTimeout> | undefined;

  function mostrarMensagem(texto: string) {
    mensagem = texto;
    clearTimeout(timeoutMensagem);
    timeoutMensagem = setTimeout(() => (mensagem = null), 2000);
  }

  async function carregarInicial() {
    loading = true;
    erro = null;
    try {
      const [alRes, recRes] = await Promise.all([listAlimentos(), modoAdicionar ? listReceitas() : Promise.resolve([])]);
      alimentos = alRes;
      resultadosReceitas = recRes;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregarInicial();

  if (modoAdicionar) {
    void getRefeicaoDia(refeicaoIdFixo!).then((r) => {
      refeicaoData = r?.data ?? "";
      refeicaoNome = r?.nome ?? "";
    });
  }

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(async () => {
      loading = true;
      erro = null;
      try {
        if (busca.trim()) {
          const [alRes, recRes] = await Promise.all([
            buscarAlimentos(busca),
            modoAdicionar ? buscarReceitas(busca) : Promise.resolve([]),
          ]);
          alimentos = alRes;
          resultadosReceitas = recRes;
        } else {
          const [alRes, recRes] = await Promise.all([listAlimentos(), modoAdicionar ? listReceitas() : Promise.resolve([])]);
          alimentos = alRes;
          resultadosReceitas = recRes;
        }
      } catch (err) {
        erro = (err as Error).message;
      } finally {
        loading = false;
      }
    }, 300);
  }

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function abrirDetalhamento(a: Alimento) {
    if (modoReceita) {
      navigate(`/dieta/alimento/${a.id}/receita`);
    } else if (modoAdicionar) {
      navigate(`/dieta/alimento/${a.id}/${refeicaoData}/${refeicaoIdFixo}`);
    } else {
      navigate(`/dieta/alimento/${a.id}/${hojeISO()}`);
    }
  }

  async function adicionarRapido(a: Alimento) {
    if (!refeicaoIdFixo) return;
    adicionandoId = a.id;
    try {
      await adicionarItemDiario({ alimento: a, data: refeicaoData, refeicaoId: refeicaoIdFixo, quantidade: a.porcaoPadraoQtd });
      mostrarMensagem(`Adicionado ao ${refeicaoNome}`);
    } catch (err) {
      alert("Erro ao adicionar alimento: " + (err as Error).message);
    } finally {
      adicionandoId = null;
    }
  }

  function adicionarNaReceita(a: Alimento) {
    adicionarAoRascunho(a);
    mostrarMensagem(`${a.nome} adicionado`);
  }

  function abrirScanner() {
    const destino = modoReceita
      ? "/dieta/scanear/receita"
      : modoAdicionar
        ? `/dieta/scanear/${refeicaoData}/${refeicaoIdFixo}`
        : `/dieta/scanear/${hojeISO()}`;
    navigate(destino);
  }

  async function selecionarReceita(receita: ReceitaResumo) {
    if (!refeicaoIdFixo) return;
    adicionandoId = receita.id;
    try {
      await adicionarReceitaAoDiario(receita.id, refeicaoData, refeicaoIdFixo);
      mostrarMensagem(`Adicionado ao ${refeicaoNome}`);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
    } finally {
      adicionandoId = null;
    }
  }
</script>

{#snippet iconAlimento()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v7a2 2 0 0 0 2 2v9" />
    <path d="M7 3v4M11 3v4" />
    <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
  </svg>
{/snippet}
{#snippet iconReceita()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
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
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Alimentos</h1>
    <button class="criar" onclick={() => (mostrarEscolhaCriar = true)}>Criar</button>
  </div>

  <input class="search" type="text" placeholder="Procurar alimento" bind:value={busca} oninput={aoDigitar} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao buscar alimentos: {erro}</p>
  {:else}
    {#if modoAdicionar && resultadosReceitas.length}
      <p class="secao-titulo">Refeições</p>
      <ul class="lista">
        {#each resultadosReceitas as receita (receita.id)}
          <li class="linha">
            <button class="info-btn" onclick={() => selecionarReceita(receita)}>
              <span class="avatar">{iniciais(receita.nome)}</span>
              <span class="info">
                <span class="nome">{receita.nome}</span>
                <span class="sub">Refeição salva</span>
              </span>
            </button>
            <button class="add-btn" onclick={() => selecionarReceita(receita)} disabled={adicionandoId === receita.id} aria-label="Adicionar">
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
              <button class="add-btn" onclick={() => adicionarRapido(a)} disabled={adicionandoId === a.id} aria-label="Adicionar">
                {#if adicionandoId === a.id}…{:else}{@render iconMais()}{/if}
              </button>
            {:else if modoReceita}
              <button class="add-btn" onclick={() => adicionarNaReceita(a)} aria-label="Adicionar">
                {@render iconMais()}
              </button>
            {:else}
              <span class="chevron">›</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if mensagem}
  <div class="toast">{mensagem}</div>
{/if}

{#if mostrarEscolhaCriar}
  <ActionSheet
    titulo="Criar"
    onFechar={() => (mostrarEscolhaCriar = false)}
    opcoes={[
      { label: "Alimento", icon: iconAlimento, onSelect: () => (mostrarCriarAlimento = true) },
      ...(modoReceita ? [] : [{ label: "Refeição", icon: iconReceita, onSelect: () => navigate("/dieta/receitas/nova") }]),
      { label: "Escanear Alimento", icon: iconScanner, onSelect: abrirScanner },
    ]}
  />
{/if}

{#if mostrarCriarAlimento}
  <DietaAlimentoFormSheet onFechar={() => (mostrarCriarAlimento = false)} onSalvo={carregarInicial} />
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
  .back,
  .criar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-4);
  }
  .secao-titulo {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-muted);
    text-transform: uppercase;
    margin: var(--space-3) 0 var(--space-1);
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
