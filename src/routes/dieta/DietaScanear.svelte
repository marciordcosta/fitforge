<script lang="ts">
  import { untrack } from "svelte";
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
  import { getAlimentoPorCodigoBarras, criarAlimentoOpenFoodFacts } from "../../lib/dietaApi";
  import { buscarProdutoPorCodigoBarras } from "../../lib/openFoodFacts";
  import Button from "../../components/Button.svelte";

  let { data, refeicaoId }: { data?: string; refeicaoId?: string } = $props();

  const dataResolvida = untrack(() => data) ?? hojeISO();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let fase = $state<"camera" | "buscando" | "erro">("camera");
  let mensagemErro = $state("");
  let controls: IScannerControls | null = null;

  async function iniciarCamera(el: HTMLVideoElement) {
    try {
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        el,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop();
            controls = null;
            void aoDetectar(result.getText());
          }
        },
      );
    } catch (err) {
      fase = "erro";
      mensagemErro = "Não foi possível acessar a câmera: " + (err as Error).message;
    }
  }

  $effect(() => {
    if (videoEl) void iniciarCamera(videoEl);
    return () => controls?.stop();
  });

  async function aoDetectar(codigo: string) {
    fase = "buscando";
    try {
      let alimentoId: string;
      const existente = await getAlimentoPorCodigoBarras(codigo);
      if (existente) {
        alimentoId = existente.id;
      } else {
        const produto = await buscarProdutoPorCodigoBarras(codigo);
        if (!produto) {
          fase = "erro";
          mensagemErro = "Produto não encontrado, ou sem informações nutricionais completas na Open Food Facts.";
          return;
        }
        alimentoId = await criarAlimentoOpenFoodFacts({ ...produto, codigoBarras: codigo });
      }
      const destino = refeicaoId
        ? `/dieta/alimento/${alimentoId}/${dataResolvida}/${refeicaoId}`
        : `/dieta/alimento/${alimentoId}/${dataResolvida}`;
      navigate(destino);
    } catch (err) {
      fase = "erro";
      mensagemErro = (err as Error).message;
    }
  }

  function tentarNovamente() {
    mensagemErro = "";
    fase = "camera";
  }

  function irParaCadastroManual() {
    navigate(refeicaoId ? `/dieta/alimentos/refeicao/${refeicaoId}` : "/dieta/alimentos");
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>Escanear Alimento</h1>
    <span class="header-spacer"></span>
  </div>

  {#if fase === "camera"}
    <div class="camera-wrap">
      <video bind:this={videoEl} class="video" autoplay muted playsinline></video>
      <div class="mira"></div>
    </div>
    <p class="dica">Aponte a câmera para o código de barras do produto.</p>
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
    text-align: center;
  }
  .header-spacer {
    width: 24px;
    flex-shrink: 0;
  }
  .back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
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
  .dica {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin-top: var(--space-4);
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
