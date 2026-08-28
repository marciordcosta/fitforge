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
    musculos = await listMusculos();
  }

  void carregarLista();

  function adicionarMusculo() {
    linhasMusculos = [...linhasMusculos, { nome: "" }];
  }

  function removerMusculo(idx: number) {
    linhasMusculos = linhasMusculos.filter((_, i) => i !== idx);
  }
</script>

<label class="field">
  <span>Nome do Movimento</span>
  <input type="text" bind:value={nome} placeholder="Ex: Empurrar Horizontal" />
</label>

<div class="field">
  <span>Grupos Musculares</span>
  <datalist id="musculos-list-movimento">
    {#each musculos as m (m.id)}
      <option value={m.nome}></option>
    {/each}
  </datalist>
  {#each linhasMusculos as linha, idx (idx)}
    <div class="musculo-row">
      <input type="text" list="musculos-list-movimento" bind:value={linha.nome} placeholder="Nome do músculo" />
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
  .musculo-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .musculo-row input {
    flex: 1;
    min-width: 0;
  }
  .remover {
    width: 36px;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
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
