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
  /** Foto realmente em exibição em cada painel agora (pode ter mudado do indiceInicial se o
   * usuário arrastou pro carrossel do mesmo dia) — usado pro contador no topbar/rodapé. */
  let indiceAtual1 = $state(0);
  let indiceAtual2 = $state(0);

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
  {#if loading}
    <button class="voltar-btn voltar-btn-solto" onclick={() => voltar("/fotos")} aria-label="Fechar">{@render iconFechar()}</button>
    <p class="comparar-status">Carregando…</p>
  {:else if erro || !lado1 || !lado2}
    <button class="voltar-btn voltar-btn-solto" onclick={() => voltar("/fotos")} aria-label="Fechar">{@render iconFechar()}</button>
    <p class="comparar-status">Erro ao carregar as fotos{erro ? `: ${erro}` : "."}</p>
  {:else}
    <!-- Topbar mostra a data/peso do painel de CIMA, rodapé a do painel de BAIXO — cada bar
         "pertence" ao painel mais perto dela, em vez de infos soltas por cima das fotos. -->
    <div class="comparar-topbar">
      <button class="voltar-btn" onclick={() => voltar("/fotos")} aria-label="Fechar">{@render iconFechar()}</button>
      <div class="comparar-info">
        <strong>{formatarDataCurta(lado1.data)}</strong>
        {#if lado1.pesoDia != null || lado1.mediaSemana != null}
          <span>{formatarPeso(lado1.pesoDia)}{lado1.mediaSemana != null ? ` · méd. ${formatarPeso(lado1.mediaSemana)}` : ""}</span>
        {/if}
      </div>
      {#if lado1.fotos.length > 1}
        <span class="comparar-contador">{indiceAtual1 + 1}/{lado1.fotos.length}</span>
      {/if}
    </div>

    <div class="comparar-painel">
      <FotoPainel
        fotos={lado1.fotos}
        indiceInicial={lado1.indiceInicial}
        {urls}
        pesoDia={lado1.pesoDia}
        mediaSemana={lado1.mediaSemana}
        data={lado1.data}
        ocultarTopo
        ocultarRodape
        ocultarContador
        onIndiceChange={(i) => (indiceAtual1 = i)}
      />
      <FotoPainel
        fotos={lado2.fotos}
        indiceInicial={lado2.indiceInicial}
        {urls}
        pesoDia={lado2.pesoDia}
        mediaSemana={lado2.mediaSemana}
        data={lado2.data}
        ocultarTopo
        ocultarRodape
        ocultarContador
        onIndiceChange={(i) => (indiceAtual2 = i)}
      />
      <button type="button" class="trocar-btn" onclick={trocarLados} aria-label="Trocar posição das fotos">
        {@render iconTrocar()}
      </button>
    </div>

    <div class="comparar-rodape">
      <div class="comparar-info">
        <strong>{formatarDataCurta(lado2.data)}</strong>
        {#if lado2.pesoDia != null || lado2.mediaSemana != null}
          <span>{formatarPeso(lado2.pesoDia)}{lado2.mediaSemana != null ? ` · méd. ${formatarPeso(lado2.mediaSemana)}` : ""}</span>
        {/if}
      </div>
      {#if lado2.fotos.length > 1}
        <span class="comparar-contador">{indiceAtual2 + 1}/{lado2.fotos.length}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .comparar-container {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 300;
    display: flex;
    flex-direction: column;
  }
  .comparar-topbar,
  .comparar-rodape {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .comparar-topbar {
    padding-top: max(var(--space-3), env(safe-area-inset-top, 0px));
    padding-bottom: var(--space-2);
  }
  .comparar-rodape {
    padding-top: var(--space-2);
    padding-bottom: max(var(--space-3), env(safe-area-inset-bottom, 0px));
  }
  .comparar-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    color: #fff;
  }
  .comparar-info strong {
    font-size: 14px;
    font-weight: 600;
  }
  .comparar-info span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  }
  .comparar-contador {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
    padding: 4px 10px;
    border-radius: 999px;
  }
  .voltar-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .voltar-btn-solto {
    position: absolute;
    top: max(var(--space-3), env(safe-area-inset-top, 0px));
    left: var(--space-3);
    z-index: 10;
    background: rgba(0, 0, 0, 0.5);
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
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
    .trocar-btn {
      left: 50%;
      right: auto;
      top: auto;
      bottom: var(--space-3);
      transform: translateX(-50%);
    }
  }
</style>
