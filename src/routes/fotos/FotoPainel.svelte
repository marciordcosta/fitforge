<script lang="ts">
  import { untrack } from "svelte";
  import type { FotoItem } from "../../lib/pesoApi";

  let {
    fotos,
    indiceInicial,
    urls,
    pesoDia,
    mediaSemana,
    data,
  }: {
    fotos: FotoItem[];
    indiceInicial: number;
    urls: Map<string, string>;
    pesoDia: number | null;
    mediaSemana: number | null;
    data: string;
  } = $props();

  let indice = $state(untrack(() => indiceInicial));
  let containerEl: HTMLDivElement | undefined;

  const fotoAtual = $derived(fotos[indice]);
  const urlAtual = $derived(fotoAtual ? urls.get(fotoAtual.path) : undefined);

  function formatarDataCurta(iso: string): string {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  function formatarPeso(v: number | null): string {
    return v == null ? "—" : `${v.toFixed(1).replace(".", ",")} kg`;
  }

  function proximaFoto() {
    if (indice < fotos.length - 1) indice += 1;
  }
  function fotoAnterior() {
    if (indice > 0) indice -= 1;
  }

  // ---- Zoom (duplo toque) + arrastar (pan quando ampliado, trocar de foto quando não) ----
  const ZOOM_AMPLIADO = 2.5;
  const LIMIAR_TROCA_PX = 60;
  const TOLERANCIA_TOQUE_PX = 12;
  const JANELA_DUPLO_TOQUE_MS = 300;

  let scale = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let deltaArrastoX = $state(0);
  let arrastando = $state(false);

  let inicioX = 0;
  let inicioY = 0;
  let panInicialX = 0;
  let panInicialY = 0;
  let ultimoToqueTempo = 0;

  /** Sempre que muda de foto no carrossel, não faz sentido carregar o zoom/posição da anterior. */
  $effect(() => {
    indice;
    scale = 1;
    panX = 0;
    panY = 0;
  });

  function limitarPan() {
    if (!containerEl) return;
    const limiteX = (containerEl.clientWidth * (scale - 1)) / 2;
    const limiteY = (containerEl.clientHeight * (scale - 1)) / 2;
    panX = Math.max(-limiteX, Math.min(limiteX, panX));
    panY = Math.max(-limiteY, Math.min(limiteY, panY));
  }

  function alternarZoom(e: PointerEvent) {
    if (scale > 1) {
      scale = 1;
      panX = 0;
      panY = 0;
      return;
    }
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const toqueX = e.clientX - rect.left - rect.width / 2;
    const toqueY = e.clientY - rect.top - rect.height / 2;
    scale = ZOOM_AMPLIADO;
    panX = -toqueX * (ZOOM_AMPLIADO - 1);
    panY = -toqueY * (ZOOM_AMPLIADO - 1);
    limitarPan();
  }

  function aoPointerDownImagem(e: PointerEvent) {
    arrastando = true;
    inicioX = e.clientX;
    inicioY = e.clientY;
    panInicialX = panX;
    panInicialY = panY;
    deltaArrastoX = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function aoPointerMoveImagem(e: PointerEvent) {
    if (!arrastando) return;
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (scale > 1) {
      panX = panInicialX + dx;
      panY = panInicialY + dy;
      limitarPan();
    } else {
      deltaArrastoX = dx;
    }
  }

  function finalizarArrasto() {
    if (!arrastando) return;
    arrastando = false;
    if (scale === 1) {
      if (deltaArrastoX <= -LIMIAR_TROCA_PX) proximaFoto();
      else if (deltaArrastoX >= LIMIAR_TROCA_PX) fotoAnterior();
    }
    deltaArrastoX = 0;
  }

  function aoPointerUpImagem(e: PointerEvent) {
    const moveuPouco = Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < TOLERANCIA_TOQUE_PX;
    finalizarArrasto();
    if (!moveuPouco) return;
    const agora = Date.now();
    const duploToque = agora - ultimoToqueTempo < JANELA_DUPLO_TOQUE_MS;
    ultimoToqueTempo = duploToque ? 0 : agora;
    if (duploToque) alternarZoom(e);
  }
</script>

<div class="foto-painel" bind:this={containerEl}>
  {#if urlAtual}
    <img
      src={urlAtual}
      alt=""
      draggable="false"
      class:sem-transicao={arrastando}
      style={`transform: translate(${scale > 1 ? panX : deltaArrastoX}px, ${scale > 1 ? panY : 0}px) scale(${scale});`}
      onpointerdown={aoPointerDownImagem}
      onpointermove={aoPointerMoveImagem}
      onpointerup={aoPointerUpImagem}
      onpointercancel={finalizarArrasto}
    />
  {/if}

  <div class="foto-info-canto">
    <strong>{formatarDataCurta(data)}</strong>
    <span>{formatarPeso(pesoDia)}</span>
    <span class="foto-info-media">méd. sem. {formatarPeso(mediaSemana)}</span>
  </div>

  {#if fotos.length > 1}
    <div class="foto-pontos">
      {#each fotos as _foto, i (i)}
        <span class="ponto" class:ativo={i === indice}></span>
      {/each}
    </div>
    {#if indice > 0}
      <button type="button" class="seta seta-esq" onclick={fotoAnterior} aria-label="Foto anterior">‹</button>
    {/if}
    {#if indice < fotos.length - 1}
      <button type="button" class="seta seta-dir" onclick={proximaFoto} aria-label="Próxima foto">›</button>
    {/if}
  {/if}
</div>

<style>
  .foto-painel {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #000;
    touch-action: none;
  }
  .foto-painel img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    touch-action: none;
    user-select: none;
    transition: transform 0.15s ease;
  }
  .foto-painel img.sem-transicao {
    transition: none;
  }
  .foto-info-canto {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 11px;
    line-height: 1.3;
    pointer-events: none;
  }
  .foto-info-media {
    color: rgba(255, 255, 255, 0.75);
  }
  .foto-pontos {
    position: absolute;
    bottom: var(--space-2);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    pointer-events: none;
  }
  .ponto {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
  }
  .ponto.ativo {
    background: #fff;
  }
  .seta {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    border: none;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .seta-esq {
    left: var(--space-2);
  }
  .seta-dir {
    right: var(--space-2);
  }
</style>
