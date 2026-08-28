<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    listExercicios,
    listPadroesMovimento,
    listMusculos,
    type Exercicio,
    type PadraoMovimento,
    type Musculo,
  } from "../../lib/treinoApi";

  let exercicios = $state<Exercicio[]>([]);
  let padroes = $state<PadraoMovimento[]>([]);
  let musculos = $state<Musculo[]>([]);
  let loading = $state(true);

  let busca = $state("");
  let filtroPadrao = $state("");
  let filtroMusculo = $state("");

  async function carregar() {
    loading = true;
    [exercicios, padroes, musculos] = await Promise.all([
      listExercicios(),
      listPadroesMovimento(),
      listMusculos(),
    ]);
    loading = false;
  }

  void carregar();

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function subtitulo(ex: Exercicio): string {
    if (!ex.musculos.length) return "Sem músculo definido";
    return ex.musculos
      .slice()
      .sort((a, b) => b.peso_contribuicao - a.peso_contribuicao)
      .map((m) => m.musculo?.nome)
      .join(", ");
  }

  const filtrados = $derived(
    exercicios.filter((ex) => {
      if (busca.trim() && !ex.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
      if (filtroPadrao && ex.padrao_id !== filtroPadrao) return false;
      if (filtroMusculo && !ex.musculos.some((m) => m.musculo_id === filtroMusculo)) return false;
      return true;
    }),
  );
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">←</button>
    <h1>Exercícios</h1>
    <button class="criar" onclick={() => navigate("/treino/exercicios/novo")}>Criar</button>
  </div>

  <input class="search" type="text" placeholder="Procurar exercício" bind:value={busca} />

  <div class="filters">
    <select bind:value={filtroPadrao}>
      <option value="">Todo padrão</option>
      {#each padroes as p (p.id)}
        <option value={p.id}>{p.nome}</option>
      {/each}
    </select>
    <select bind:value={filtroMusculo}>
      <option value="">Todos os músculos</option>
      {#each musculos as m (m.id)}
        <option value={m.id}>{m.nome}</option>
      {/each}
    </select>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !filtrados.length}
    <p class="muted">Nenhum exercício encontrado.</p>
  {:else}
    <ul class="lista">
      {#each filtrados as ex (ex.id)}
        <li>
          <button class="item" onclick={() => navigate(`/treino/exercicios/${ex.id}`)}>
            <span class="avatar">{iniciais(ex.nome)}</span>
            <span class="info">
              <span class="nome">{ex.nome}</span>
              <span class="sub">{subtitulo(ex)}</span>
            </span>
            <span class="chevron">›</span>
          </button>
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
  .back {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
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
    margin-bottom: var(--space-3);
  }
  .filters {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .filters select {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
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
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    cursor: pointer;
    text-align: left;
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
  }
  .sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .chevron {
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
