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
    onIndiceChange,
  }: {
    fotos: FotoItem[];
    indiceInicial: number;
    urls: Map<string, string>;
    pesoDia: number | null;
    mediaSemana: number | null;
    data: string;
    /** Avisa o pai qual foto do carrossel está em exibição agora — usado por quem precisa saber
     * a foto "atual" mesmo depois do usuário arrastar pra outra do mesmo dia (ex: pra comparar). */
    onIndiceChange?: (indice: number) => void;
  } = $props();

  let indice = $state(untrack(() => indiceInicial));
  let containerEl: HTMLDivElement | undefined;

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

  // ---- Zoom (duplo toque) + arrastar (pan quando ampliado, trocar de foto num trilho quando não) ----
  const ZOOM_AMPLIADO = 2.5;
  const LIMIAR_TROCA_PX = 60;
  const TOLERANCIA_TOQUE_PX = 12;
  const JANELA_DUPLO_TOQUE_MS = 300;
  /** Resistência ao arrastar além da primeira/última foto — não trava, só fica "pesado". */
  const FATOR_RESISTENCIA_BORDA = 0.35;

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
    onIndiceChange?.(indice);
  });

  /** Desloca o trilho inteiro (um "filme" com todas as fotos lado a lado) em vez de trocar o
   * conteúdo de uma única <img> no meio do gesto — evita o salto/estranheza de trocar a foto
   * exibida enquanto ainda está animando de volta pra posição, já que agora cada foto é um
   * elemento próprio e a transição é só a posição do trilho. */
  function offsetTrilho(): number {
    if (indice === 0 && deltaArrastoX > 0) return deltaArrastoX * FATOR_RESISTENCIA_BORDA;
    if (indice === fotos.length - 1 && deltaArrastoX < 0) return deltaArrastoX * FATOR_RESISTENCIA_BORDA;
    return deltaArrastoX;
  }

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

  function aoPointerDown(e: PointerEvent) {
    arrastando = true;
    inicioX = e.clientX;
    inicioY = e.clientY;
    panInicialX = panX;
    panInicialY = panY;
    deltaArrastoX = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function aoPointerMove(e: PointerEvent) {
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

  function aoPointerUp(e: PointerEvent) {
    const moveuPouco = Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < TOLERANCIA_TOQUE_PX;
    finalizarArrasto();
    if (!moveuPouco) return;
    const agora = Date.now();
    const duploToque = agora - ultimoToqueTempo < JANELA_DUPLO_TOQUE_MS;
    ultimoToqueTempo = duploToque ? 0 : agora;
    if (duploToque) alternarZoom(e);
  }
</script>

<div
  class="foto-painel"
  role="presentation"
  bind:this={containerEl}
  onpointerdown={aoPointerDown}
  onpointermove={aoPointerMove}
  onpointerup={aoPointerUp}
  onpointercancel={finalizarArrasto}
>
  <div
    class="trilho"
    class:sem-transicao={arrastando}
    style={`transform: translateX(calc(${-indice * 100}% + ${scale > 1 ? 0 : offsetTrilho()}px));`}
  >
    {#each fotos as foto, i (foto.id)}
      <div class="slide">
        {#if urls.get(foto.path)}
          <img
            src={urls.get(foto.path)}
            alt=""
            draggable="false"
            class:sem-transicao={arrastando}
            style={i === indice ? `transform: translate(${panX}px, ${panY}px) scale(${scale});` : ""}
          />
        {/if}
      </div>
    {/each}
  </div>

  <div class="foto-topo">
    <div class="foto-info">
      <strong class="foto-info-data">{formatarDataCurta(data)}</strong>
      {#if pesoDia != null || mediaSemana != null}
        <span class="foto-info-peso">{formatarPeso(pesoDia)}{mediaSemana != null ? ` · méd. ${formatarPeso(mediaSemana)}` : ""}</span>
      {/if}
    </div>
    {#if fotos.length > 1}
      <span class="foto-contador">{indice + 1}/{fotos.length}</span>
    {/if}
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
  .trilho {
    display: flex;
    width: 100%;
    height: 100%;
    transition: transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .trilho.sem-transicao {
    transition: none;
  }
  .slide {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .foto-topo {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: max(var(--space-3), env(safe-area-inset-top, 0px)) var(--space-3) var(--space-6);
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
    pointer-events: none;
  }
  .foto-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #fff;
    min-width: 0;
  }
  .foto-info-data {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .foto-info-peso {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
  }
  .foto-contador {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    padding: 3px 10px;
    border-radius: 999px;
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
