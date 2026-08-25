<script lang="ts">
  import { untrack } from "svelte";
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import {
    buscarAlimentos,
    listAlimentos,
    buscarReceitas,
    adicionarItemDiario,
    adicionarReceitaAoDiario,
    getRefeicaoDia,
    type Alimento,
    type ReceitaResumo,
  } from "../../lib/dietaApi";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  /** Quando presente, a tela entra em modo seleção múltipla pra adicionar vários alimentos de uma vez a essa refeição. Sem isso, clicar num alimento abre o detalhamento normal. */
  let { refeicaoId }: { refeicaoId?: string } = $props();

  const modoSelecao = untrack(() => refeicaoId != null);
  const refeicaoIdFixo = untrack(() => refeicaoId);

  let alimentos = $state<Alimento[]>([]);
  let alimentosPorId = new Map<string, Alimento>();
  let resultadosReceitas = $state<ReceitaResumo[]>([]);
  let loading = $state(true);
  let busca = $state("");
  let mostrarEscolhaCriar = $state(false);
  let mostrarCriarAlimento = $state(false);
  let selecionados = $state<Set<string>>(new Set());
  let refeicaoData = $state("");
  let adicionandoReceita = $state<string | null>(null);
  let confirmando = $state(false);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  function registrar(lista: Alimento[]) {
    for (const a of lista) alimentosPorId.set(a.id, a);
    return lista;
  }

  async function carregarInicial() {
    loading = true;
    alimentos = registrar(await listAlimentos());
    loading = false;
  }

  void carregarInicial();

  if (modoSelecao) {
    void getRefeicaoDia(refeicaoIdFixo!).then((r) => (refeicaoData = r?.data ?? ""));
  }

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(async () => {
      loading = true;
      if (busca.trim()) {
        const [alRes, recRes] = await Promise.all([
          buscarAlimentos(busca),
          modoSelecao ? buscarReceitas(busca) : Promise.resolve([]),
        ]);
        alimentos = registrar(alRes);
        resultadosReceitas = recRes;
      } else {
        alimentos = registrar(await listAlimentos());
        resultadosReceitas = [];
      }
      loading = false;
    }, 300);
  }

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function alternarSelecao(id: string) {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    selecionados = novo;
  }

  function aoClicarItem(a: Alimento) {
    if (modoSelecao) alternarSelecao(a.id);
    else navigate(`/dieta/alimento/${a.id}/${hojeISO()}`);
  }

  async function selecionarReceita(receita: ReceitaResumo) {
    if (!refeicaoId) return;
    adicionandoReceita = receita.id;
    try {
      await adicionarReceitaAoDiario(receita.id, refeicaoData, refeicaoId);
      window.history.back();
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
      adicionandoReceita = null;
    }
  }

  async function confirmarSelecao() {
    if (!refeicaoId || !selecionados.size) return;
    confirmando = true;
    try {
      for (const id of selecionados) {
        const alimento = alimentosPorId.get(id);
        if (!alimento) continue;
        await adicionarItemDiario({ alimento, data: refeicaoData, refeicaoId, quantidade: alimento.porcaoPadraoQtd });
      }
      window.history.back();
    } catch (err) {
      alert("Erro ao adicionar alimentos: " + (err as Error).message);
      confirmando = false;
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
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
{/snippet}

<div class="container has-bottom-nav" class:com-rodape={modoSelecao}>
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Alimentos</h1>
    <button class="criar" onclick={() => (mostrarEscolhaCriar = true)}>Criar</button>
  </div>

  <input class="search" type="text" placeholder="Procurar alimento" bind:value={busca} oninput={aoDigitar} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    {#if modoSelecao && resultadosReceitas.length}
      <p class="secao-titulo">Refeições</p>
      <ul class="lista">
        {#each resultadosReceitas as receita (receita.id)}
          <li>
            <button class="item" onclick={() => selecionarReceita(receita)} disabled={adicionandoReceita != null}>
              <span class="avatar">{iniciais(receita.nome)}</span>
              <span class="info">
                <span class="nome">{receita.nome}</span>
                <span class="sub">Refeição salva</span>
              </span>
              <span class="chevron">{adicionandoReceita === receita.id ? "…" : "›"}</span>
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
          <li>
            <button class="item" class:selecionado={modoSelecao && selecionados.has(a.id)} onclick={() => aoClicarItem(a)}>
              {#if modoSelecao}
                <span class="check" class:marcado={selecionados.has(a.id)}>
                  {#if selecionados.has(a.id)}{@render iconCheck()}{/if}
                </span>
              {:else}
                <span class="avatar">{iniciais(a.nome)}</span>
              {/if}
              <span class="info">
                <span class="nome">{a.nome}{#if a.marca} <span class="marca">· {a.marca}</span>{/if}</span>
                <span class="sub">{a.caloriasPorPorcao.toFixed(0)} kcal / {a.porcaoPadraoQtd}{a.porcaoPadraoUnidade}</span>
              </span>
              {#if !modoSelecao}<span class="chevron">›</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if modoSelecao}
  <div class="rodape">
    <button class="rodape-btn" onclick={confirmarSelecao} disabled={confirmando || !selecionados.size}>
      Adicionar{selecionados.size ? ` (${selecionados.size})` : ""}
    </button>
  </div>
{/if}

{#if mostrarEscolhaCriar}
  <ActionSheet
    titulo="Criar"
    onFechar={() => (mostrarEscolhaCriar = false)}
    opcoes={[
      { label: "Alimento", icon: iconAlimento, onSelect: () => (mostrarCriarAlimento = true) },
      { label: "Refeição", icon: iconReceita, onSelect: () => navigate("/dieta/receitas/nova") },
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
  .container.com-rodape {
    padding-bottom: calc(var(--space-4) + 64px);
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
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    border-left: none;
    border-right: none;
    border-top: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .item.selecionado {
    background: #1e4a2f;
    margin: 0 calc(var(--space-4) * -1);
    padding: var(--space-3) var(--space-4);
    border-bottom-color: transparent;
  }
  .item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    flex-shrink: 0;
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
  .check {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--surface-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-primary-fg);
  }
  .check.marcado {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }
  .check svg {
    width: 14px;
    height: 14px;
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
  .rodape {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    background: var(--surface-card);
    border-top: 1px solid var(--surface-border);
    z-index: 60;
  }
  .rodape-btn {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    display: block;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .rodape-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
