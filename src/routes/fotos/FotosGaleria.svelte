<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate, hojeISO } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { listFotosAgrupadas, getUrlsAssinadas, adicionarFoto, type FotoGrupoData } from "../../lib/pesoApi";

  let grupos = $state<FotoGrupoData[]>([]);
  let urls = $state<Map<string, string>>(new Map());
  let loading = $state(true);
  let erro = $state<string | null>(null);
  /** Até 2 ids de foto — tocar numa terceira enquanto já há 2 selecionadas não faz nada. */
  let selecionadas = $state<string[]>([]);

  let mostrarAdicionar = $state(false);
  let dataNovaFoto = $state(hojeISO());
  let mostrarOpcoesFoto = $state(false);
  let enviando = $state(false);
  let inputCamera = $state<HTMLInputElement | undefined>();
  let inputGaleria = $state<HTMLInputElement | undefined>();

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const lista = await listFotosAgrupadas();
      grupos = lista;
      urls = await getUrlsAssinadas(lista.flatMap((g) => g.fotos.map((f) => f.path)));
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function formatarData(iso: string): string {
    const texto = parseISODate(iso).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function alternarSelecao(id: string) {
    if (selecionadas.includes(id)) {
      selecionadas = selecionadas.filter((x) => x !== id);
    } else if (selecionadas.length < 2) {
      selecionadas = [...selecionadas, id];
    }
  }

  function abrirComparacao() {
    if (selecionadas.length !== 2) return;
    navigate(`/fotos/comparar/${selecionadas[0]}/${selecionadas[1]}`);
    selecionadas = [];
  }

  function abrirAdicionar() {
    dataNovaFoto = hojeISO();
    mostrarAdicionar = true;
  }

  async function selecionarFotos(e: Event) {
    const input = e.target as HTMLInputElement;
    const arquivos = input.files ? Array.from(input.files) : [];
    if (!arquivos.length) return;
    enviando = true;
    try {
      await Promise.all(arquivos.map((arquivo) => adicionarFoto(dataNovaFoto, arquivo)));
      mostrarAdicionar = false;
      await carregar();
    } catch (err) {
      alert("Erro ao adicionar foto: " + (err as Error).message);
    } finally {
      enviando = false;
      input.value = "";
    }
  }
</script>

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}
{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}
{#snippet iconCamera()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
{/snippet}
{#snippet iconGaleria()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15l-5-5-9 9" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Fotos</h1>
    <button class="icon-btn" onclick={abrirAdicionar} aria-label="Adicionar foto">{@render iconMais()}</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar fotos: {erro}</p>
  {:else if !grupos.length}
    <p class="muted">Nenhuma foto registrada ainda — toque no "+" pra adicionar a primeira.</p>
  {:else}
    {#each grupos as grupo (grupo.data)}
      <p class="data-titulo">{formatarData(grupo.data)}</p>
      <div class="grade-fotos">
        {#each grupo.fotos as foto (foto.id)}
          <button
            type="button"
            class="foto-item"
            class:selecionada={selecionadas.includes(foto.id)}
            onclick={() => alternarSelecao(foto.id)}
            aria-label="Selecionar foto"
          >
            {#if urls.get(foto.path)}
              <img src={urls.get(foto.path)} alt="" loading="lazy" />
            {/if}
            {#if selecionadas.includes(foto.id)}
              <span class="foto-check">{@render iconCheck()}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  {/if}
</div>

{#if selecionadas.length === 2}
  <div class="barra-comparar">
    <button type="button" class="comparar-btn" onclick={abrirComparacao}>Comparar</button>
  </div>
{/if}

{#if mostrarAdicionar}
  <Sheet titulo="Adicionar foto" onFechar={() => (mostrarAdicionar = false)}>
    <label class="campo-data">
      <span>Data da foto</span>
      <input type="date" bind:value={dataNovaFoto} max={hojeISO()} />
    </label>
    <Button onclick={() => (mostrarOpcoesFoto = true)} disabled={enviando}>
      {enviando ? "Enviando…" : "Escolher foto"}
    </Button>
  </Sheet>
{/if}

{#if mostrarOpcoesFoto}
  <ActionSheet
    titulo="Adicionar foto"
    onFechar={() => (mostrarOpcoesFoto = false)}
    opcoes={[
      { label: "Câmera", icon: iconCamera, onSelect: () => inputCamera?.click() },
      { label: "Galeria", icon: iconGaleria, onSelect: () => inputGaleria?.click() },
    ]}
  />
{/if}

<input bind:this={inputCamera} type="file" accept="image/*" capture="environment" class="foto-input" onchange={selecionarFotos} />
<input bind:this={inputGaleria} type="file" accept="image/*" multiple class="foto-input" onchange={selecionarFotos} />

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
  }
  .icon-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
  }
  .campo-data {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
  .campo-data span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo-data input {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .foto-input {
    display: none;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .data-titulo {
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-muted);
  }
  .data-titulo:first-of-type {
    margin-top: 0;
  }
  .grade-fotos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }
  .foto-item {
    position: relative;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface-card);
    cursor: pointer;
  }
  .foto-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .foto-item.selecionada img {
    opacity: 0.6;
  }
  .foto-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .foto-check svg {
    width: 14px;
    height: 14px;
  }
  .barra-comparar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
    display: flex;
    justify-content: center;
    z-index: 50;
  }
  .comparar-btn {
    padding: var(--space-3) var(--space-6);
    border-radius: 999px;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    box-shadow: var(--shadow-float);
    cursor: pointer;
  }
</style>
