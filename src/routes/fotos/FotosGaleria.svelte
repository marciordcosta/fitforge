<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate } from "../../lib/dates";
  import { listFotosAgrupadas, getUrlsAssinadas, type FotoGrupoData } from "../../lib/pesoApi";

  let grupos = $state<FotoGrupoData[]>([]);
  let urls = $state<Map<string, string>>(new Map());
  let loading = $state(true);
  let erro = $state<string | null>(null);
  /** Até 2 ids de foto — tocar numa terceira enquanto já há 2 selecionadas não faz nada. */
  let selecionadas = $state<string[]>([]);

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
</script>

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Fotos</h1>
    <span class="header-spacer"></span>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar fotos: {erro}</p>
  {:else if !grupos.length}
    <p class="muted">Nenhuma foto registrada ainda — adicione fotos ao registrar seu peso do dia.</p>
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
