<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar as voltarRouter } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
  import { BarcodeFormat, DecodeHintType } from "@zxing/library";
  import { getAlimentoPorCodigoBarras, criarAlimentoOpenFoodFacts, type AlimentoOpenFoodFactsInput } from "../../lib/dietaApi";
  import { buscarProdutoPorCodigoBarras } from "../../lib/openFoodFacts";
  import { receitaRascunho, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";
  import Button from "../../components/Button.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";

  let {
    data,
    refeicaoId,
    modoReceita,
    receitaIdExistente,
  }: { data?: string; refeicaoId?: string; modoReceita?: boolean; receitaIdExistente?: string } = $props();

  const dataResolvida = untrack(() => data) ?? hojeISO();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let fase = $state<"camera" | "buscando" | "erro">("camera");
  let mensagemErro = $state("");
  let controls: IScannerControls | null = null;
  /** zxing pode entregar dois frames decodificados em sequência antes do ctrl.stop() surtir efeito
   * — sem essa trava, os dois chamavam aoDetectar concorrentemente pro mesmo código e, pra um
   * produto novo, uma das duas criações batia no unique constraint de codigo_barras e mostrava um
   * erro cru de banco em vez de simplesmente ignorar a segunda detecção. */
  let detectando = false;
  let mostrarManual = $state(false);
  let codigoManual = $state("");
  /** Produto novo (não achado localmente) achado na Open Food Facts, aguardando a escolha de
   * salvar no catálogo ou usar só nessa refeição — só perguntamos quando há uma refeição de
   * contexto, senão o produto é sempre salvo no catálogo geral como já era. */
  let produtoPendente = $state<AlimentoOpenFoodFactsInput | null>(null);
  let mostrarEscolhaSalvar = $state(false);

  /** `aindaValido` cobre o caso de o usuário sair da tela ANTES do getUserMedia/decodeFromConstraints
   * resolver: nesse momento `controls` ainda é null, então o cleanup do $effect (controls?.stop())
   * não tem nada pra parar; sem essa checagem, quando a promise resolvia depois do unmount, a
   * câmera ficava ligada em segundo plano pra sempre (ninguém mais chamava stop() nela). */
  async function iniciarCamera(el: HTMLVideoElement, aindaValido: () => boolean) {
    try {
      // Garante que uma câmera de uma visita anterior (ainda não totalmente liberada pelo navegador) não fique
      // disputando o dispositivo com essa nova tentativa — sem isso, às vezes o getUserMedia trava em silêncio.
      controls?.stop();
      controls = null;
      detectando = false;
      trackAtual = null;
      zoomInfo = null;
      temLanterna = false;
      lanternaLigada = false;
      // Só os formatos de código de produto (EAN/UPC, mais Code 128/39 de etiquetas) e modo "tentar
      // mais": decodifica bem mais rápido e acerta mais do que procurar QR/PDF417/etc. em todo quadro.
      // Tenta de novo a cada 60ms (o padrão é 500ms, o que dava poucas chances por segundo).
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, unknown>, { delayBetweenScanAttempts: 60 });
      const novosControls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        el,
        (result, _err, ctrl) => {
          if (result && !detectando) {
            detectando = true;
            ctrl.stop();
            controls = null;
            void aoDetectar(result.getText());
          }
        },
      );
      if (!aindaValido()) {
        novosControls.stop();
        return;
      }
      controls = novosControls;
      prepararControles(el);
    } catch (err) {
      if (!aindaValido()) return;
      fase = "erro";
      mensagemErro = "Não foi possível acessar a câmera: " + (err as Error).message;
    }
  }

  /** Controles de câmera que dependem do aparelho (Chrome Android; no iOS Safari não existem e
   * tudo abaixo é ignorado em silêncio). */
  type CapacidadesCamera = MediaTrackCapabilities & {
    focusMode?: string[];
    zoom?: { min: number; max: number; step: number };
    torch?: boolean;
  };
  let trackAtual: MediaStreamTrack | null = null;
  let zoomInfo = $state<{ min: number; max: number; step: number } | null>(null);
  let zoomValor = $state(1);
  let temLanterna = $state(false);
  let lanternaLigada = $state(false);
  let timeoutFoco: ReturnType<typeof setTimeout> | undefined;

  function aplicar(avancadas: Record<string, unknown>[]) {
    if (!trackAtual) return;
    const constraints = { advanced: avancadas } as unknown as MediaTrackConstraints;
    trackAtual.applyConstraints(constraints).catch(() => {});
  }

  /**
   * Foco contínuo + zoom inicial de 2x: câmera de celular não foca bem muito perto, e o zoom
   * deixa o usuário afastar o aparelho (onde ela foca) mantendo o código grande no quadro — era o
   * que mais fazia a leitura "não pegar nada". Cada ajuste vai em um conjunto próprio de
   * `advanced`: o aparelho ignora só o que não suporta, em vez de descartar tudo junto.
   */
  function prepararControles(el: HTMLVideoElement) {
    const stream = el.srcObject;
    if (!(stream instanceof MediaStream)) return;
    const track = stream.getVideoTracks()[0];
    if (!track?.getCapabilities) return;
    trackAtual = track;
    const cap = track.getCapabilities() as CapacidadesCamera;
    const avancadas: Record<string, unknown>[] = [];
    if (cap.focusMode?.includes("continuous")) avancadas.push({ focusMode: "continuous" });
    if (cap.zoom) {
      const alvo = Math.min(cap.zoom.max, Math.max(cap.zoom.min, 2));
      zoomInfo = cap.zoom;
      zoomValor = alvo;
      avancadas.push({ zoom: alvo });
    }
    temLanterna = !!cap.torch;
    aplicar(avancadas);
  }

  function aoMudarZoom() {
    aplicar([{ zoom: zoomValor }]);
  }

  function alternarLanterna() {
    lanternaLigada = !lanternaLigada;
    aplicar([{ torch: lanternaLigada }]);
  }

  /** Toque na imagem = focar ali (foco de um disparo) e depois volta pro contínuo. */
  function focarNoToque(e: MouseEvent) {
    if (!trackAtual?.getCapabilities) return;
    const cap = trackAtual.getCapabilities() as CapacidadesCamera;
    if (!cap.focusMode?.includes("single-shot")) return;
    const alvo = e.currentTarget as HTMLElement;
    const r = alvo.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    aplicar([{ focusMode: "single-shot", pointsOfInterest: [{ x, y }] }]);
    clearTimeout(timeoutFoco);
    timeoutFoco = setTimeout(() => {
      if (cap.focusMode?.includes("continuous")) aplicar([{ focusMode: "continuous" }]);
    }, 1500);
  }

  /** Plano B quando a câmera ao vivo não foca (comum em WebView/alguns aparelhos, onde o navegador
   * não expõe foco/zoom): abre o app de câmera do sistema, que tem foco automático de verdade, e
   * lê o código na foto tirada. */
  let inputFoto = $state<HTMLInputElement | null>(null);
  let lendoFoto = $state(false);
  let erroFoto = $state("");

  async function aoTirarFoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = "";
    if (!arquivo) return;
    erroFoto = "";
    lendoFoto = true;
    const url = URL.createObjectURL(arquivo);
    try {
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, unknown>);
      const resultado = await reader.decodeFromImageUrl(url);
      controls?.stop();
      controls = null;
      detectando = true;
      void aoDetectar(resultado.getText());
    } catch {
      erroFoto = "Não consegui ler o código nessa foto. Tente de novo, com o código bem nítido e na horizontal.";
    } finally {
      URL.revokeObjectURL(url);
      lendoFoto = false;
    }
  }

  /** Ao voltar do app de câmera, a câmera ao vivo pode ter sido encerrada pelo sistema: reabre. */
  function aoVoltarVisivel() {
    if (document.visibilityState !== "visible" || fase !== "camera" || !videoEl) return;
    if (trackAtual && trackAtual.readyState === "live") return;
    if (detectando) return;
    void iniciarCamera(videoEl, () => true);
  }

  $effect(() => {
    if (!videoEl) return;
    let valido = true;
    void iniciarCamera(videoEl, () => valido);
    return () => {
      valido = false;
      controls?.stop();
    };
  });

  function irParaItem(alimentoId: string) {
    const destino = modoReceita
      ? `/dieta/alimento/${alimentoId}/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`
      : refeicaoId
        ? `/dieta/alimento/${alimentoId}/${dataResolvida}/${refeicaoId}`
        : `/dieta/alimento/${alimentoId}/${dataResolvida}`;
    navigate(destino);
  }

  async function aoDetectar(codigo: string) {
    fase = "buscando";
    try {
      const existente = await getAlimentoPorCodigoBarras(codigo);
      if (existente) {
        irParaItem(existente.id);
        return;
      }
      const produto = await buscarProdutoPorCodigoBarras(codigo);
      if (!produto) {
        fase = "erro";
        mensagemErro = "Produto não encontrado, ou sem informações nutricionais completas na Open Food Facts.";
        return;
      }
      const input = { ...produto, codigoBarras: codigo };
      if (refeicaoId) {
        produtoPendente = input;
        mostrarEscolhaSalvar = true;
        return;
      }
      irParaItem(await criarAlimentoOpenFoodFacts(input));
    } catch (err) {
      fase = "erro";
      mensagemErro = (err as Error).message;
    }
  }

  async function confirmarProdutoPendente(oculta: boolean) {
    if (!produtoPendente) return;
    mostrarEscolhaSalvar = false;
    fase = "buscando";
    try {
      const alimentoId = await criarAlimentoOpenFoodFacts(produtoPendente, oculta);
      produtoPendente = null;
      irParaItem(alimentoId);
    } catch (err) {
      fase = "erro";
      mensagemErro = (err as Error).message;
    }
  }

  function tentarNovamente() {
    mensagemErro = "";
    fase = "camera";
  }

  function buscarCodigoManual() {
    const codigo = codigoManual.trim();
    if (!codigo) return;
    mostrarManual = false;
    controls?.stop();
    controls = null;
    void aoDetectar(codigo);
  }

  function irParaCadastroManual() {
    if (modoReceita) {
      navigate(`/dieta/alimentos/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`);
      return;
    }
    navigate(refeicaoId ? `/dieta/alimentos/refeicao/${refeicaoId}` : "/dieta/alimentos");
  }

  /** O padrão abaixo só é usado se a tela foi aberta direto (deep link/recarregar) — em uso
   * normal, `voltarRouter` já volta pro pai real de verdade (window.history.back()). */
  function voltar() {
    if (modoReceita) {
      if (receitaIdExistente) {
        voltarRouter(`/dieta/alimentos/receita/${receitaIdExistente}`);
      } else {
        voltarRouter(urlNovaReceitaMeta());
      }
    } else if (refeicaoId) {
      voltarRouter(`/dieta/refeicao/${refeicaoId}`);
    } else {
      voltarRouter("/dieta");
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet iconCatalogo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l7-4 7 4Z" />
  </svg>
{/snippet}

{#snippet iconRefeicao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v7a2 2 0 0 0 2 2v9" />
    <path d="M7 3v4M11 3v4" />
    <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
  </svg>
{/snippet}

<svelte:document onvisibilitychange={aoVoltarVisivel} />

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={voltar} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Escanear Alimento</h1>
    <span class="header-spacer"></span>
  </div>

  {#if fase === "camera"}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="camera-wrap" onclick={focarNoToque}>
      <video bind:this={videoEl} class="video" autoplay muted playsinline></video>
      <div class="mira"></div>
    </div>
    <!-- Linha de controles sempre ocupa o espaço (altura fixa), com ou sem suporte do aparelho. -->
    <div class="controles-camera">
      {#if zoomInfo}
        <label class="zoom">
          <span>Zoom</span>
          <input type="range" min={zoomInfo.min} max={zoomInfo.max} step={zoomInfo.step || 0.1} bind:value={zoomValor} oninput={aoMudarZoom} />
        </label>
      {/if}
      {#if temLanterna}
        <button type="button" class="lanterna" class:ligada={lanternaLigada} onclick={alternarLanterna}>Lanterna</button>
      {/if}
    </div>
    <input bind:this={inputFoto} class="foto-input" type="file" accept="image/*" capture="environment" onchange={aoTirarFoto} />
    <Button variant="secondary" onclick={() => inputFoto?.click()} disabled={lendoFoto}>
      {lendoFoto ? "Lendo foto…" : "Tirar foto do código (foco automático)"}
    </Button>
    <p class="dica" class:erro={!!erroFoto}>{erroFoto || "Aponte para o código, afaste um pouco se estiver desfocado e toque na imagem para focar."}</p>
    <Button variant="secondary" onclick={() => (mostrarManual = true)}>Digitar código manualmente</Button>
  {:else if fase === "buscando"}
    <p class="muted">Buscando informações do produto…</p>
  {:else if fase === "erro"}
    <p class="erro">{mensagemErro}</p>
    <div class="acoes-erro">
      <Button onclick={tentarNovamente}>Tentar Novamente</Button>
      <Button variant="secondary" onclick={irParaCadastroManual}>Cadastrar Manualmente</Button>
    </div>
  {/if}
</div>

{#if mostrarManual}
  <Sheet titulo="Digitar código de barras" onFechar={() => (mostrarManual = false)}>
    <input
      class="codigo-input"
      type="text"
      inputmode="numeric"
      placeholder="Ex: 7891000100103"
      bind:value={codigoManual}
      onkeydown={(e) => e.key === "Enter" && buscarCodigoManual()}
    />
    <Button onclick={buscarCodigoManual} disabled={!codigoManual.trim()}>Buscar</Button>
  </Sheet>
{/if}

{#if mostrarEscolhaSalvar}
  <ActionSheet
    titulo="Salvar esse alimento?"
    onFechar={() => {
      mostrarEscolhaSalvar = false;
      produtoPendente = null;
      tentarNovamente();
    }}
    opcoes={[
      {
        label: "Salvar no catálogo",
        subtitulo: "Fica disponível pra usar em outras refeições depois",
        icon: iconCatalogo,
        manterAberto: true,
        onSelect: () => confirmarProdutoPendente(false),
      },
      {
        label: "Usar só nesta refeição",
        subtitulo: "Não aparece na busca de alimentos depois",
        icon: iconRefeicao,
        manterAberto: true,
        onSelect: () => confirmarProdutoPendente(true),
      },
    ]}
  />
{/if}

<style>
  .foto-input {
    display: none;
  }
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding-top: max(var(--space-4), env(safe-area-inset-top, 0px));
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
    text-align: center;
  }
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .back {
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
  .back svg {
    width: 18px;
    height: 18px;
  }
  .camera-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: #000;
  }
  .video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .mira {
    position: absolute;
    inset: 20% 10%;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-md);
    pointer-events: none;
  }
  .controles-camera {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 36px;
    margin-top: var(--space-3);
  }
  .zoom {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .zoom input {
    flex: 1;
    min-width: 0;
  }
  .lanterna {
    flex-shrink: 0;
    border: 1px solid var(--surface-border);
    background: none;
    color: var(--surface-fg);
    border-radius: 999px;
    padding: 6px 14px;
    font-family: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .lanterna.ligada {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .dica {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: var(--space-4) 0;
  }
  .codigo-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .muted {
    color: var(--surface-muted);
    text-align: center;
    margin-top: var(--space-6);
  }
  .erro {
    color: var(--color-danger);
    text-align: center;
    margin-top: var(--space-6);
    margin-bottom: var(--space-4);
  }
  .acoes-erro {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
