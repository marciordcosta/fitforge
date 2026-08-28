<script lang="ts">
  import { listMusculos, type Musculo } from "../../lib/treinoApi";

  let {
    nome = $bindable(),
    linhasMusculos = $bindable(),
  }: {
    nome: string;
    linhasMusculos: { nome: string }[];
  } = $props();

  let musculos = $state<Musculo[]>([]);

  async function carregarLista() {
    musculos = (await listMusculos()).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  void carregarLista();

  /** Índices das linhas em modo "digitar músculo novo" (nome ainda não existe no catálogo). */
  let modoNovo = $state<Set<number>>(new Set());

  function aoEscolher(idx: number, valor: string) {
    if (valor === "__novo__") {
      modoNovo = new Set(modoNovo).add(idx);
      linhasMusculos[idx].nome = "";
    } else {
      linhasMusculos[idx].nome = valor;
    }
  }

  function adicionarMusculo() {
    linhasMusculos = [...linhasMusculos, { nome: "" }];
  }

  function removerMusculo(idx: number) {
    linhasMusculos = linhasMusculos.filter((_, i) => i !== idx);
    const restante = new Set<number>();
    for (const i of modoNovo) {
      if (i < idx) restante.add(i);
      else if (i > idx) restante.add(i - 1);
    }
    modoNovo = restante;
  }
</script>

<label class="field">
  <span>Nome do Movimento</span>
  <input type="text" bind:value={nome} placeholder="Ex: Empurrar Horizontal" />
</label>

<div class="field">
  <span>Grupos Musculares</span>
  {#each linhasMusculos as linha, idx (idx)}
    <div class="musculo-card">
      {#if modoNovo.has(idx)}
        <input type="text" bind:value={linha.nome} placeholder="Nome do músculo novo" />
      {:else}
        <select value={linha.nome} onchange={(e) => aoEscolher(idx, e.currentTarget.value)}>
          <option value="" disabled>Selecione…</option>
          {#each musculos as m (m.id)}
            <option value={m.nome}>{m.nome}</option>
          {/each}
          <option value="__novo__">+ Novo músculo</option>
        </select>
      {/if}
      <button class="remover" onclick={() => removerMusculo(idx)} aria-label="Remover">×</button>
    </div>
  {/each}
  <button class="adicionar" onclick={adicionarMusculo}>+ Adicionar músculo</button>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
  .field > span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .field input {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .musculo-card {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
  }
  .musculo-card input,
  .musculo-card select {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-3);
    padding-left: var(--space-3);
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .musculo-card select {
    color-scheme: dark;
  }
  .musculo-card input:focus,
  .musculo-card select:focus {
    outline: none;
  }
  .remover {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: none;
    color: var(--color-danger);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .adicionar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: var(--space-2) 0;
  }
</style>
