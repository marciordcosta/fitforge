<script lang="ts">
  import { untrack } from "svelte";
  import { navigate, voltar as voltarRouter } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { BrowserMultiFormatReader } from "@zxing/browser";
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

  let fase = $state<"camera" | "buscando" | "erro">("camera");
  let mensagemErro = $state("");
  let mostrarManual = $state(false);
  let codigoManual = $state("");
  /** Produto novo (não achado localmente) achado na Open Food Facts, aguardando a escolha de
   * salvar no catálogo ou usar só nessa refeição — só perguntamos quando há uma refeição de
   * contexto, senão o produto é sempre salvo no catálogo geral como já era. */
  let produtoPendente = $state<AlimentoOpenFoodFactsInput | null>(null);
  let mostrarEscolhaSalvar = $state(false);

  /** Abre o app de câmera do sistema (foco automático de verdade) e lê o código na foto tirada. */
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
    try {
      const codigo = await lerCodigoDaFoto(arquivo);
      if (!codigo) throw new Error("sem código");
      void aoDetectar(codigo);
    } catch {
      erroFoto = "Não consegui ler o código nessa foto. Tente de novo, com o código bem nítido e na horizontal.";
    } finally {
      lendoFoto = false;
    }
  }

  const FORMATOS_ZXING = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39];

  /** Lê o código numa foto: primeiro o leitor nativo do Android (BarcodeDetector, bem melhor com
   * foto grande/levemente fora de foco), depois o zxing com a foto reduzida em vários tamanhos e
   * girada — fotos de 12MP inteiras fazem o zxing falhar. */
  async function lerCodigoDaFoto(arquivo: File): Promise<string | null> {
    const bitmap = await createImageBitmap(arquivo);
    try {
      const Detector = (globalThis as unknown as { BarcodeDetector?: new (o?: unknown) => { detect(i: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (Detector) {
        try {
          const achados = await new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] }).detect(bitmap);
          if (achados[0]?.rawValue) return achados[0].rawValue;
        } catch {
          /* segue pro zxing */
        }
      }
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, FORMATOS_ZXING],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, unknown>);
      // Janelas da foto em resolução original (código pequeno na foto cheia some quando ela é
      // reduzida): foto inteira, depois recortes de 60% e 40% em grade, cada um normal e girado.
      const janelas: { x: number; y: number; f: number }[] = [{ x: 0, y: 0, f: 1 }];
      for (const f of [0.6, 0.4]) {
        const passo = (1 - f) / 2;
        for (const y of [0, 1, 2]) for (const x of [0, 1, 2]) janelas.push({ x: x * passo, y: y * passo, f });
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      let tentativas = 0;
      for (const jan of janelas) {
        const sw = Math.round(bitmap.width * jan.f);
        const sh = Math.round(bitmap.height * jan.f);
        const sx = Math.round(bitmap.width * jan.x);
        const sy = Math.round(bitmap.height * jan.y);
        const escala = Math.min(1, 1600 / Math.max(sw, sh));
        const w = Math.round(sw * escala);
        const h = Math.round(sh * escala);
        for (const giro of [0, 90]) {
          canvas.width = giro ? h : w;
          canvas.height = giro ? w : h;
          ctx.save();
          if (giro) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
          }
          ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
          ctx.restore();
          try {
            return reader.decodeFromCanvas(canvas).getText();
          } catch {
            /* próxima janela */
          }
          // Respira a cada poucas tentativas pra tela não travar.
          if (++tentativas % 4 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }
      return null;
    } finally {
      bitmap.close();
    }
  }

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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={voltar} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Escanear Alimento</h1>
    <span class="header-spacer"></span>
  </div>

  {#if fase === "camera"}
    <!-- A câmera do sistema (foto, com foco automático) é o caminho principal: a câmera ao vivo do
         navegador não foca no aparelho do usuário. A caixa tem sempre o mesmo tamanho. -->
    <div class="camera-wrap camera-inativa">
      <button type="button" class="botao-camera" onclick={() => inputFoto?.click()} disabled={lendoFoto}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span>{lendoFoto ? "Lendo o código…" : "Escanear com a câmera"}</span>
      </button>
    </div>
    <input bind:this={inputFoto} class="foto-input" type="file" accept="image/*" capture="environment" onchange={aoTirarFoto} />
    <p class="dica" class:erro={!!erroFoto}>{erroFoto || "Abre a câmera traseira: tire a foto com o código bem visível."}</p>
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
  .camera-inativa {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface, #1b1f2a);
  }
  .botao-camera {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-5);
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--color-primary);
    color: #06201c;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .botao-camera svg {
    width: 48px;
    height: 48px;
  }
  .botao-camera:disabled {
    opacity: 0.6;
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
