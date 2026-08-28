<script lang="ts">
  import { listMusculos, type Musculo } from "../../lib/treinoApi";
  import WheelPicker from "../../components/WheelPicker.svelte";

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

  const opcoesMusculo = $derived([
    ...musculos.map((m) => ({ valor: m.nome, label: m.nome })),
    { valor: "__novo__", label: "+ Novo músculo" },
  ]);

  /** Índices das linhas em modo "digitar músculo novo" (nome ainda não existe no catálogo). */
  let modoNovo = $state<Set<number>>(new Set());
  let editandoIdx = $state<number | null>(null);

  function aoEscolher(idx: number, valor: string) {
    if (valor === "__novo__") {
      modoNovo = new Set(modoNovo).add(idx);
      linhasMusculos[idx].nome = "";
    } else {
      linhasMusculos[idx].nome = valor;
    }
    editandoIdx = null;
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
        <button type="button" class="musculo-select-btn" onclick={() => (editandoIdx = idx)}>
          {linha.nome || "Selecione…"}
        </button>
      {/if}
      <button class="remover" onclick={() => removerMusculo(idx)} aria-label="Remover">×</button>
    </div>
  {/each}
  <button class="adicionar" onclick={adicionarMusculo}>+ Adicionar músculo</button>
</div>

{#if editandoIdx !== null}
  {@const idx = editandoIdx}
  <WheelPicker
    titulo="Músculo"
    opcoes={opcoesMusculo}
    valorAtual={linhasMusculos[idx]?.nome ?? ""}
    onSelecionar={(v) => aoEscolher(idx, v)}
    onFechar={() => (editandoIdx = null)}
  />
{/if}

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
  .musculo-card input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-3);
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .musculo-card input:focus {
    outline: none;
  }
  .musculo-select-btn {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-3);
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
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
