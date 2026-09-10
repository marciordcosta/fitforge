<script lang="ts">
  import { voltar } from "../../lib/router.svelte";
  import { getFotoPorId, getFotosDaData, getUrlsAssinadas, getPesoDoDia, getPesoMedioNaData, type FotoItem } from "../../lib/pesoApi";
  import FotoPainel from "./FotoPainel.svelte";

  let { fotoId1, fotoId2 }: { fotoId1: string; fotoId2: string } = $props();

  interface LadoComparacao {
    fotos: FotoItem[];
    indiceInicial: number;
    pesoDia: number | null;
    mediaSemana: number | null;
    data: string;
  }

  let lado1 = $state<LadoComparacao | null>(null);
  let lado2 = $state<LadoComparacao | null>(null);
  let urls = $state<Map<string, string>>(new Map());
  let loading = $state(true);
  let erro = $state<string | null>(null);

  async function carregarLado(fotoId: string): Promise<LadoComparacao | null> {
    const foto = await getFotoPorId(fotoId);
    if (!foto) return null;
    const [fotosDia, pesoDia, mediaSemana] = await Promise.all([
      getFotosDaData(foto.data),
      getPesoDoDia(foto.data),
      getPesoMedioNaData(foto.data),
    ]);
    const indiceInicial = Math.max(0, fotosDia.findIndex((f) => f.id === fotoId));
    return { fotos: fotosDia.length ? fotosDia : [foto], indiceInicial, pesoDia, mediaSemana, data: foto.data };
  }

  async function carregar() {
    loading = true;
    erro = null;
    try {
      const [l1, l2] = await Promise.all([carregarLado(fotoId1), carregarLado(fotoId2)]);
      lado1 = l1;
      lado2 = l2;
      const paths = [...(l1?.fotos ?? []), ...(l2?.fotos ?? [])].map((f) => f.path);
      urls = await getUrlsAssinadas(paths);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

<div class="comparar-container">
  <button class="voltar-btn" onclick={() => voltar("/fotos")} aria-label="Voltar">{@render iconVoltar()}</button>

  {#if loading}
    <p class="comparar-status">Carregando…</p>
  {:else if erro || !lado1 || !lado2}
    <p class="comparar-status">Erro ao carregar as fotos{erro ? `: ${erro}` : "."}</p>
  {:else}
    <div class="comparar-painel">
      <FotoPainel
        fotos={lado1.fotos}
        indiceInicial={lado1.indiceInicial}
        {urls}
        pesoDia={lado1.pesoDia}
        mediaSemana={lado1.mediaSemana}
        data={lado1.data}
      />
      <FotoPainel
        fotos={lado2.fotos}
        indiceInicial={lado2.indiceInicial}
        {urls}
        pesoDia={lado2.pesoDia}
        mediaSemana={lado2.mediaSemana}
        data={lado2.data}
      />
    </div>
  {/if}
</div>

<style>
  .comparar-container {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 300;
  }
  .voltar-btn {
    position: absolute;
    top: max(var(--space-3), env(safe-area-inset-top, 0px));
    left: var(--space-3);
    z-index: 10;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .voltar-btn svg {
    width: 18px;
    height: 18px;
  }
  .comparar-status {
    color: var(--surface-muted);
    text-align: center;
    padding-top: var(--space-6);
  }
  .comparar-painel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  @media (orientation: landscape) {
    .comparar-painel {
      flex-direction: row;
    }
  }
</style>
