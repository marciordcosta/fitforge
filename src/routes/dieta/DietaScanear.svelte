<script lang="ts">
  import { untrack } from "svelte";
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
  import { getAlimentoPorCodigoBarras, criarAlimentoOpenFoodFacts } from "../../lib/dietaApi";
  import { buscarProdutoPorCodigoBarras } from "../../lib/openFoodFacts";
  import { receitaRascunho, urlNovaReceitaMeta } from "../../lib/receitaRascunho.svelte";
  import Button from "../../components/Button.svelte";
  import Sheet from "../../components/Sheet.svelte";

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
  let mostrarManual = $state(false);
  let codigoManual = $state("");

  async function iniciarCamera(el: HTMLVideoElement) {
    try {
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        el,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop();
            controls = null;
            void aoDetectar(result.getText());
          }
        },
      );
      ajustarFoco(el);
    } catch (err) {
      fase = "erro";
      mensagemErro = "Não foi possível acessar a câmera: " + (err as Error).message;
    }
  }

  /**
   * Pede foco contínuo (ajuda a mirar de perto num código de barras) — focusMode não faz parte
   * do MediaTrackConstraintSet padrão do TS, só existe em navegadores que suportam a Image
   * Capture API (Chrome Android). No iOS Safari `getCapabilities` nem lista "focusMode", então
   * a checagem abaixo já ignora silenciosamente sem tentar aplicar nada.
   */
  function ajustarFoco(el: HTMLVideoElement) {
    const stream = el.srcObject;
    if (!(stream instanceof MediaStream)) return;
    const track = stream.getVideoTracks()[0];
    if (!track?.getCapabilities) return;
    const capacidades = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
    if (!capacidades.focusMode?.includes("continuous")) return;
    const constraintsFoco = { advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints;
    track.applyConstraints(constraintsFoco).catch(() => {});
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

      const destino = modoReceita
        ? `/dieta/alimento/${alimentoId}/receita${receitaIdExistente ? `/${receitaIdExistente}` : ""}`
        : refeicaoId
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

  function voltar() {
    if (modoReceita) {
      if (receitaIdExistente) {
        navigate(`/dieta/receitas/ver/${receitaIdExistente}`);
      } else {
        navigate(urlNovaReceitaMeta());
      }
    } else if (refeicaoId) {
      navigate(`/dieta/refeicao/${refeicaoId}`);
    } else {
      navigate("/dieta");
    }
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={voltar} aria-label="Voltar">←</button>
    <h1>Escanear Alimento</h1>
    <span class="header-spacer"></span>
  </div>

  {#if fase === "camera"}
    <div class="camera-wrap">
      <video bind:this={videoEl} class="video" autoplay muted playsinline></video>
      <div class="mira"></div>
    </div>
    <p class="dica">Aponte a câmera para o código de barras do produto.</p>
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
