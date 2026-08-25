<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { buscarAlimentos, listAlimentos, type Alimento } from "../../lib/dietaApi";
  import DietaAlimentoFormSheet from "./DietaAlimentoFormSheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  let alimentos = $state<Alimento[]>([]);
  let loading = $state(true);
  let busca = $state("");
  let mostrarEscolhaCriar = $state(false);
  let mostrarCriarAlimento = $state(false);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  async function carregarInicial() {
    loading = true;
    alimentos = await listAlimentos();
    loading = false;
  }

  void carregarInicial();

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(async () => {
      loading = true;
      alimentos = busca.trim() ? await buscarAlimentos(busca) : await listAlimentos();
      loading = false;
    }, 300);
  }

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => navigate("/dieta")} aria-label="Voltar">←</button>
    <h1>Alimentos</h1>
    <button class="criar" onclick={() => (mostrarEscolhaCriar = true)}>Criar</button>
  </div>

  <input class="search" type="text" placeholder="Procurar alimento" bind:value={busca} oninput={aoDigitar} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !alimentos.length}
    <p class="muted">Nenhum alimento encontrado.</p>
  {:else}
    <ul class="lista">
      {#each alimentos as a (a.id)}
        <li>
          <button class="item" onclick={() => navigate(`/dieta/alimento/${a.id}/${hojeISO()}`)}>
            <span class="avatar">{iniciais(a.nome)}</span>
            <span class="info">
              <span class="nome">{a.nome}{#if a.marca} <span class="marca">· {a.marca}</span>{/if}</span>
              <span class="sub">{a.caloriasPorPorcao.toFixed(0)} kcal / {a.porcaoPadraoQtd}{a.porcaoPadraoUnidade}</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

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
</style>
