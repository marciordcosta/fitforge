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

  function formatarDataCurta(iso: string): string {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  function formatarPeso(v: number | null): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }

  /** Troca qual foto fica em cima/embaixo — a de baixo sobe, a de cima desce. */
  function trocarLados(): void {
    if (!lado1 || !lado2) return;
    [lado1, lado2] = [lado2, lado1];
  }

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

{#snippet iconFechar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
{/snippet}

{#snippet iconTrocar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 7l4-4 4 4" />
    <path d="M12 3v10" />
    <path d="M16 17l-4 4-4-4" />
    <path d="M12 21V11" />
  </svg>
{/snippet}

<div class="comparar-container">
  <button class="voltar-btn" onclick={() => voltar("/fotos")} aria-label="Fechar">{@render iconFechar()}</button>

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
        ocultarRodape
      />
      <FotoPainel
        fotos={lado2.fotos}
        indiceInicial={lado2.indiceInicial}
        {urls}
        pesoDia={lado2.pesoDia}
        mediaSemana={lado2.mediaSemana}
        data={lado2.data}
        ocultarTopo
      />
    </div>

    <!-- Selo único na junção das duas fotos: peso do painel de cima de um lado, data do painel de
         baixo do outro — em vez de duas linhas separadas e redundantes bem coladas uma na outra. -->
    <div class="comparar-juncao">
      <span class="juncao-badge">{formatarPeso(lado1.pesoDia)}{lado1.mediaSemana != null ? ` · méd. ${formatarPeso(lado1.mediaSemana)}` : ""}</span>
      <span class="juncao-badge">{formatarDataCurta(lado2.data)}</span>
    </div>
    <button type="button" class="trocar-btn" onclick={trocarLados} aria-label="Trocar posição das fotos">
      {@render iconTrocar()}
    </button>
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
  .comparar-juncao {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    z-index: 10;
    pointer-events: none;
  }
  .juncao-badge {
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.45);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }
  .trocar-btn {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
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
  .trocar-btn svg {
    width: 18px;
    height: 18px;
  }
  @media (orientation: landscape) {
    .comparar-painel {
      flex-direction: row;
    }
    .comparar-juncao {
      left: 50%;
      top: var(--space-3);
      transform: translateX(-50%);
    }
    .trocar-btn {
      left: 50%;
      right: auto;
      top: auto;
      bottom: var(--space-3);
      transform: translateX(-50%);
    }
  }
</style>
