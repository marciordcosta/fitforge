<script lang="ts">
  import {
    listPadroesMovimento,
    listMusculos,
    listMusculosDoPadrao,
    PESOS_CONTRIBUICAO_PRESET,
    type PadraoMovimento,
    type Musculo,
    type LinhaMusculoInput,
  } from "../../lib/treinoApi";

  let {
    nome = $bindable(),
    padraoId = $bindable(),
    linhasMusculos = $bindable(),
  }: {
    nome: string;
    padraoId: string;
    linhasMusculos: LinhaMusculoInput[];
  } = $props();

  let padroes = $state<PadraoMovimento[]>([]);
  let musculos = $state<Musculo[]>([]);
  let musculosDoPadrao = $state<Musculo[]>([]);

  async function carregarListas() {
    [padroes, musculos] = await Promise.all([listPadroesMovimento(), listMusculos()]);
  }

  void carregarListas();

  $effect(() => {
    const id = padraoId;
    if (!id) {
      musculosDoPadrao = [];
      return;
    }
    listMusculosDoPadrao(id).then((lista) => (musculosDoPadrao = lista));
  });

  const opcoesMusculo = $derived(musculosDoPadrao.length ? musculosDoPadrao : musculos);

  function adicionarMusculo() {
    linhasMusculos = [...linhasMusculos, { nome: "", peso: 1 }];
  }

  function removerMusculo(idx: number) {
    linhasMusculos = linhasMusculos.filter((_, i) => i !== idx);
  }
</script>

<label class="field">
  <span>Nome</span>
  <input type="text" bind:value={nome} placeholder="Ex: Supino Inclinado" />
</label>

<label class="field">
  <span>Padrão de Movimento</span>
  <select bind:value={padraoId}>
    <option value="">Nenhum</option>
    {#each padroes as p (p.id)}
      <option value={p.id}>{p.nome}</option>
    {/each}
  </select>
</label>

<div class="field">
  <span>Músculos Envolvidos</span>
  {#each linhasMusculos as linha, idx (idx)}
    <div class="secundario-row">
      <select bind:value={linha.nome}>
        <option value="">Selecione…</option>
        {#if linha.nome && !opcoesMusculo.some((m) => m.nome === linha.nome)}
          <option value={linha.nome}>{linha.nome}</option>
        {/if}
        {#each opcoesMusculo as m (m.id)}
          <option value={m.nome}>{m.nome}</option>
        {/each}
      </select>
      <select bind:value={linha.peso}>
        {#each PESOS_CONTRIBUICAO_PRESET as p (p)}
          <option value={p}>{p}</option>
        {/each}
      </select>
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
  .field input,
  .field select {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .secundario-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .secundario-row select:first-child {
    flex: 1;
    min-width: 0;
  }
  .secundario-row select:nth-child(2) {
    width: 72px;
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
