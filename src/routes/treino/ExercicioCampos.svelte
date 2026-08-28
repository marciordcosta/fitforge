<script lang="ts">
  import {
    listPadroesMovimento,
    listMusculosDoPadrao,
    PESOS_CONTRIBUICAO_PRESET,
    type PadraoMovimento,
    type LinhaMusculoInput,
  } from "../../lib/treinoApi";
  import WheelPicker from "../../components/WheelPicker.svelte";

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

  async function carregarPadroes() {
    padroes = await listPadroesMovimento();
  }

  void carregarPadroes();

  /** Ao escolher um Padrão de Movimento, lança automaticamente todos os músculos
   * cadastrados nele — a contribuição de quem já estava na lista é preservada. */
  $effect(() => {
    const id = padraoId;
    if (!id) return;
    listMusculosDoPadrao(id).then((lista) => {
      const pesosAtuais = new Map(linhasMusculos.map((l) => [l.nome, l.peso]));
      linhasMusculos = lista.map((m) => ({ nome: m.nome, peso: pesosAtuais.get(m.nome) ?? 1 }));
    });
  });

  const opcoesPeso = PESOS_CONTRIBUICAO_PRESET.slice()
    .sort((a, b) => a - b)
    .map((p) => ({ valor: p, label: String(p) }));

  const opcoesPadrao = $derived([{ valor: "", label: "Nenhum" }, ...padroes.map((p) => ({ valor: p.id, label: p.nome }))]);

  let editandoIdx = $state<number | null>(null);
  let mostrarPadraoPicker = $state(false);
</script>

<label class="field">
  <span>Nome</span>
  <input type="text" bind:value={nome} placeholder="Ex: Supino Inclinado" />
</label>

<div class="field">
  <span>Padrão de Movimento</span>
  <button type="button" class="select-btn" onclick={() => (mostrarPadraoPicker = true)}>
    {padroes.find((p) => p.id === padraoId)?.nome ?? "Nenhum"}
  </button>
</div>

<div class="field">
  <span>Músculos Envolvidos</span>
  {#if !linhasMusculos.length}
    <p class="musculos-vazio">
      {padraoId
        ? "Esse movimento ainda não tem músculos cadastrados."
        : "Selecione um Padrão de Movimento para lançar os músculos."}
    </p>
  {:else}
    <div class="card-musculos">
      {#each linhasMusculos as linha, idx (linha.nome)}
        <div class="musculo-linha">
          <span class="musculo-nome">{linha.nome}</span>
          <button type="button" class="musculo-valor" onclick={() => (editandoIdx = idx)}>{linha.peso}</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if editandoIdx !== null}
  {@const idx = editandoIdx}
  <WheelPicker
    titulo={linhasMusculos[idx]?.nome ?? "Contribuição"}
    opcoes={opcoesPeso}
    valorAtual={linhasMusculos[idx]?.peso ?? 1}
    onSelecionar={(v) => (linhasMusculos[idx].peso = v)}
    onFechar={() => (editandoIdx = null)}
  />
{/if}

{#if mostrarPadraoPicker}
  <WheelPicker
    titulo="Padrão de Movimento"
    opcoes={opcoesPadrao}
    valorAtual={padraoId}
    onSelecionar={(v) => (padraoId = v)}
    onFechar={() => (mostrarPadraoPicker = false)}
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
  .field input,
  .select-btn {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .select-btn {
    width: 100%;
    text-align: left;
    cursor: pointer;
  }
  .musculos-vazio {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0;
  }
  .card-musculos {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: 0 var(--space-4);
  }
  .musculo-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .musculo-linha:last-child {
    border-bottom: none;
  }
  .musculo-nome {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .musculo-valor {
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
  }
</style>
