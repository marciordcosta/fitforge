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
    ocultarTopo = false,
    ocultarRodape = false,
    ocultarContador = false,
    onIndiceChange,
  }: {
    fotos: FotoItem[];
    indiceInicial: number;
    urls: Map<string, string>;
    pesoDia: number | null;
    mediaSemana: number | null;
    data: string;
    /** Pra telas que preferem desenhar a data/peso/contador combinados por fora (num topbar/rodapé
     * próprios, fora da foto) em vez do selo flutuante padrão deste painel — usado na tela cheia
     * (topbar/rodapé da galeria) e na comparação (selo único na junção dos dois painéis). */
    ocultarTopo?: boolean;
    ocultarRodape?: boolean;
    ocultarContador?: boolean;
    /** Avisa o pai qual foto do carrossel está em exibição agora — usado por quem precisa saber
     * a foto "atual" mesmo depois do usuário arrastar pra outra do mesmo dia (ex: pra comparar). */
    onIndiceChange?: (indice: number) => void;
  } = $props();

  let indice = $state(untrack(() => indiceInicial));
  let containerEl: HTMLDivElement | undefined;

  /** Se o pai trocar qual dia este painel mostra (ex: botão de trocar posição na comparação), o
   * índice interno precisa realinhar com o novo indiceInicial — sem isso continuaria mostrando o
   * índice antigo, possivelmente fora do tamanho do novo array de fotos daquele dia. */
  $effect(() => {
    indice = indiceInicial;
  });

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

  // ---- Zoom (duplo toque ou pinça com 2 dedos) + arrastar (pan quando ampliado, trocar de foto
  // num trilho quando não) ----
  const ZOOM_AMPLIADO = 2.5;
  const ESCALA_MIN = 1;
  const ESCALA_MAX = 4;
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

  /** Dedos na tela agora (pointerId -> posição), pra detectar a pinça de 2 dedos — não precisa
   * ser $state porque só é usado nos cálculos dos handlers, nunca lido no template. */
  const ponteirosAtivos = new Map<number, { x: number; y: number }>();
  let pinchDistanciaInicial = 0;
  let pinchEscalaInicial = 1;
  /** Ponto da imagem (em pixels "não escalados", relativo ao centro do painel) que estava sob o
   * meio dos 2 dedos ao iniciar a pinça — mantém esse ponto fixo sob os dedos enquanto o usuário
   * afasta/aproxima, em vez de sempre ampliar a partir do centro da tela. */
  let pinchOrigemLocalX = 0;
  let pinchOrigemLocalY = 0;

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

  function pontoRelativoAoCentro(x: number, y: number): { x: number; y: number } {
    if (!containerEl) return { x: 0, y: 0 };
    const rect = containerEl.getBoundingClientRect();
    return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
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

  function iniciarPinca(): void {
    const [p1, p2] = [...ponteirosAtivos.values()];
    pinchDistanciaInicial = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    pinchEscalaInicial = scale;
    const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const centroRel = pontoRelativoAoCentro(centro.x, centro.y);
    pinchOrigemLocalX = (centroRel.x - panX) / scale;
    pinchOrigemLocalY = (centroRel.y - panY) / scale;
  }

  function aoPointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ponteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ponteirosAtivos.size === 2) {
      // 2º dedo pousou — cancela um possível arrasto de troca de foto e começa a pinça.
      arrastando = false;
      deltaArrastoX = 0;
      iniciarPinca();
      return;
    }
    if (ponteirosAtivos.size > 2) return; // ignora um 3º dedo

    arrastando = true;
    inicioX = e.clientX;
    inicioY = e.clientY;
    panInicialX = panX;
    panInicialY = panY;
    deltaArrastoX = 0;
  }

  function aoPointerMove(e: PointerEvent) {
    if (!ponteirosAtivos.has(e.pointerId)) return;
    ponteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ponteirosAtivos.size === 2) {
      if (pinchDistanciaInicial <= 0) return;
      const [p1, p2] = [...ponteirosAtivos.values()];
      const distancia = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const novaEscala = Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, pinchEscalaInicial * (distancia / pinchDistanciaInicial)));
      const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const centroRel = pontoRelativoAoCentro(centro.x, centro.y);
      scale = novaEscala;
      panX = centroRel.x - pinchOrigemLocalX * novaEscala;
      panY = centroRel.y - pinchOrigemLocalY * novaEscala;
      limitarPan();
      return;
    }

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
    const tinhaDoisDedos = ponteirosAtivos.size === 2;
    ponteirosAtivos.delete(e.pointerId);

    if (tinhaDoisDedos) {
      if (scale <= 1.02) {
        scale = 1;
        panX = 0;
        panY = 0;
      } else {
        limitarPan();
      }
      // sobrou 1 dedo na tela: continua o gesto como um arrastar normal (pan), sem soltar e
      // precisar tocar de novo — é o padrão de qualquer app de fotos.
      const restante = [...ponteirosAtivos.values()][0];
      if (restante && scale > 1) {
        arrastando = true;
        inicioX = restante.x;
        inicioY = restante.y;
        panInicialX = panX;
        panInicialY = panY;
        deltaArrastoX = 0;
      }
      return;
    }

    if (ponteirosAtivos.size >= 1) return; // ainda tem outro dedo apoiado, gesto não acabou

    const moveuPouco = Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < TOLERANCIA_TOQUE_PX;
    finalizarArrasto();
    if (!moveuPouco) return;
    const agora = Date.now();
    const duploToque = agora - ultimoToqueTempo < JANELA_DUPLO_TOQUE_MS;
    ultimoToqueTempo = duploToque ? 0 : agora;
    if (duploToque) alternarZoom(e);
  }

  function aoPointerCancel(e: PointerEvent) {
    ponteirosAtivos.delete(e.pointerId);
    finalizarArrasto();
  }
</script>

<div
  class="foto-painel"
  role="presentation"
  bind:this={containerEl}
  onpointerdown={aoPointerDown}
  onpointermove={aoPointerMove}
  onpointerup={aoPointerUp}
  onpointercancel={aoPointerCancel}
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

  {#if !ocultarTopo}
    <div class="foto-topo">
      <div class="foto-info">
        <strong class="foto-info-data">{formatarDataCurta(data)}</strong>
      </div>
    </div>
  {/if}

  {#if !ocultarContador && fotos.length > 1}
    <span class="foto-contador">{indice + 1}/{fotos.length}</span>
  {/if}

  {#if !ocultarRodape && (pesoDia != null || mediaSemana != null)}
    <div class="foto-rodape">
      <span class="foto-rodape-peso">{formatarPeso(pesoDia)}{mediaSemana != null ? ` · méd. ${formatarPeso(mediaSemana)}` : ""}</span>
    </div>
  {/if}

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
    /* padding-left maior que o padrão: deixa espaço pro botão de fechar/voltar (36px + margem)
       que a tela que usa este painel desenha por cima, no mesmo canto — evitava sobrepor a data. */
    padding: max(var(--space-3), env(safe-area-inset-top, 0px)) var(--space-3) 0 52px;
    pointer-events: none;
  }
  /* Selo só atrás do texto (como o contador), em vez de um degradê cobrindo a largura toda —
     esse degradê escurecia demais a foto na comparação, onde os dois painéis são bem baixos. */
  .foto-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #fff;
    min-width: 0;
    background: rgba(0, 0, 0, 0.45);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }
  .foto-info-data {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .foto-rodape {
    position: absolute;
    left: 0;
    bottom: 0;
    padding: var(--space-3) var(--space-3) max(var(--space-3), env(safe-area-inset-bottom, 0px));
    pointer-events: none;
  }
  .foto-rodape-peso {
    display: inline-block;
    font-size: 12px;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }
  .foto-contador {
    position: absolute;
    top: max(var(--space-3), env(safe-area-inset-top, 0px));
    right: var(--space-3);
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    padding: 3px 10px;
    border-radius: 999px;
    pointer-events: none;
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
