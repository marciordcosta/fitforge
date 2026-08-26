<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { buscarReceitas, listReceitas, vincularMetaReceita, vincularMetaReceitaDias, type ReceitaResumo } from "../../lib/dietaApi";
  import { receitaRascunho, limparRascunho, definirContexto } from "../../lib/receitaRascunho.svelte";

  let {
    metaParaModeloId,
    nomeInicial,
    metaParaDiasSemana,
  }: { metaParaModeloId?: string; nomeInicial?: string; metaParaDiasSemana?: number[] } = $props();

  let receitas = $state<ReceitaResumo[]>([]);
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let busca = $state("");
  let vinculando = $state<string | null>(null);

  let timeoutBusca: ReturnType<typeof setTimeout> | undefined;

  function criarNova() {
    limparRascunho();
    definirContexto("nova");
    if (metaParaModeloId && nomeInicial) {
      receitaRascunho.nome = nomeInicial;
    }
    const diaSeg = metaParaDiasSemana?.length ? `/${metaParaDiasSemana.join(",")}` : "";
    navigate(metaParaModeloId ? `/dieta/receitas/nova/meta/${metaParaModeloId}${diaSeg}` : "/dieta/receitas/nova");
  }

  async function selecionar(r: ReceitaResumo) {
    if (!metaParaModeloId) {
      navigate(`/dieta/receitas/ver/${r.id}`);
      return;
    }
    vinculando = r.id;
    try {
      if (metaParaDiasSemana?.length) {
        await vincularMetaReceitaDias(metaParaModeloId, metaParaDiasSemana, r.id);
      } else {
        await vincularMetaReceita(metaParaModeloId, r.id);
      }
      navigate("/dieta/refeicoes/gerenciar");
    } catch (err) {
      alert("Erro ao vincular refeição: " + (err as Error).message);
      vinculando = null;
    }
  }

  async function carregarInicial() {
    loading = true;
    erro = null;
    try {
      receitas = await listReceitas();
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregarInicial();

  function aoDigitar() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(async () => {
      loading = true;
      erro = null;
      try {
        receitas = busca.trim() ? await buscarReceitas(busca) : await listReceitas();
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
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => navigate(metaParaModeloId ? "/dieta/refeicoes/gerenciar" : "/dieta")} aria-label="Voltar">←</button>
    <h1>Refeições</h1>
    <button class="criar" onclick={criarNova}>Criar</button>
  </div>

  <input class="search" type="text" placeholder="Procurar refeição" bind:value={busca} oninput={aoDigitar} />

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao buscar refeições: {erro}</p>
  {:else if !receitas.length}
    <p class="muted">Nenhuma refeição criada ainda. Toque em + pra juntar alimentos num prato.</p>
  {:else}
    <ul class="lista">
      {#each receitas as r (r.id)}
        <li class="linha">
          <button class="info-btn" onclick={() => selecionar(r)} disabled={vinculando === r.id}>
            <span class="avatar">{iniciais(r.nome)}</span>
            <span class="info">
              <span class="nome">{r.nome}</span>
              <span class="sub">{r.calorias.toFixed(0)} kcal</span>
            </span>
          </button>
          <span class="chevron">{vinculando === r.id ? "…" : "›"}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

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
</style>
