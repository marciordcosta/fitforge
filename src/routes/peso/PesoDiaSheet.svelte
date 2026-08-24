<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { parseISODate } from "../../lib/dates";
  import {
    getPesoDoDia,
    getFotoDoDia,
    getUrlAssinadaFoto,
    salvarPeso,
    excluirPeso,
    salvarFotoDoDia,
    excluirFotoDoDia,
    type FotoRegistro,
  } from "../../lib/pesoApi";

  let {
    data,
    onFechar,
    onSalvo,
  }: {
    data: string;
    onFechar: () => void;
    onSalvo: () => void;
  } = $props();

  let peso = $state<number | null>(null);
  let pesoOriginal = $state<number | null>(null);
  let salvando = $state(false);
  let carregando = $state(true);
  let foto = $state<FotoRegistro | null>(null);
  let fotoUrl = $state<string | null>(null);
  let inputArquivo = $state<HTMLInputElement | undefined>();

  const dataLabel = $derived.by(() => {
    const texto = parseISODate(data).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  async function carregar() {
    carregando = true;
    try {
      const [p, f] = await Promise.all([getPesoDoDia(data), getFotoDoDia(data)]);
      peso = p;
      pesoOriginal = p;
      foto = f;
      fotoUrl = f ? await getUrlAssinadaFoto(f.path) : null;
    } finally {
      carregando = false;
    }
  }

  void carregar();

  async function selecionarFoto(e: Event) {
    const arquivo = (e.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    salvando = true;
    try {
      foto = await salvarFotoDoDia(data, arquivo, foto);
      fotoUrl = await getUrlAssinadaFoto(foto.path);
    } catch (err) {
      alert("Erro ao salvar foto: " + (err as Error).message);
    } finally {
      salvando = false;
      if (inputArquivo) inputArquivo.value = "";
    }
  }

  async function removerFoto() {
    if (!foto) return;
    salvando = true;
    try {
      await excluirFotoDoDia(foto);
      foto = null;
      fotoUrl = null;
    } catch (err) {
      alert("Erro ao remover foto: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function salvar() {
    if (peso == null) return;
    salvando = true;
    try {
      await salvarPeso(data, peso);
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao salvar: " + (err as Error).message);
      salvando = false;
    }
  }

  async function excluir() {
    salvando = true;
    try {
      await excluirPeso(data);
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao excluir: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconCamera()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
{/snippet}

<Sheet titulo={dataLabel} {onFechar}>
  <div class="campo">
    <label for="peso-input">Peso (kg)</label>
    <input id="peso-input" type="number" inputmode="decimal" step="0.1" placeholder="-" bind:value={peso} />
  </div>

  <div class="foto-secao">
    <span class="foto-label">Foto de acompanhamento</span>
    {#if carregando}
      <p class="muted">Carregando…</p>
    {:else if fotoUrl}
      <div class="foto-preview">
        <img src={fotoUrl} alt="Foto de acompanhamento" />
        <button class="foto-remover" onclick={removerFoto} disabled={salvando} aria-label="Remover foto">✕</button>
      </div>
    {:else}
      <button class="foto-btn" onclick={() => inputArquivo?.click()} disabled={salvando} aria-label="Adicionar foto">
        {@render iconCamera()}
      </button>
    {/if}
    <input
      bind:this={inputArquivo}
      type="file"
      accept="image/*"
      capture="environment"
      class="foto-input"
      onchange={selecionarFoto}
    />
  </div>

  <div class="acoes">
    <Button onclick={salvar} disabled={salvando || carregando || peso == null}>Salvar</Button>
    {#if pesoOriginal != null}
      <Button variant="danger" onclick={excluir} disabled={salvando}>Excluir Registro</Button>
    {/if}
  </div>
</Sheet>

<style>
  .campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .campo label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .foto-secao {
    margin-bottom: var(--space-5);
  }
  .foto-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin-bottom: var(--space-2);
  }
  .foto-btn {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .foto-btn svg {
    width: 28px;
    height: 28px;
  }
  .foto-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .foto-preview {
    position: relative;
    width: 96px;
    height: 96px;
  }
  .foto-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-md);
  }
  .foto-remover {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .foto-input {
    display: none;
  }
  .acoes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
