<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { navigate } from "../../lib/router.svelte";
  import { getMeta, getUltimoPeso, salvarMeta, excluirMeta } from "../../lib/pesoApi";
  import { getTipoDieta, type TipoDieta } from "../../lib/dietaApi";

  let {
    onFechar,
    onSalvo,
  }: {
    onFechar: () => void;
    onSalvo: () => void;
  } = $props();

  const TEXTO_TIPO: Record<TipoDieta, string> = {
    cutting: "Cutting (perda)",
    manutencao: "Manutenção",
    bulking: "Bulking (ganho)",
  };

  let tipoDieta = $state<TipoDieta>("manutencao");
  /** Sempre a magnitude (sem sinal) — o sinal é aplicado na hora de salvar, conforme o tipo de dieta. */
  let percentual = $state<number | null>(null);
  let pesoAlvo = $state<number | null>(null);
  let carregando = $state(true);
  let salvando = $state(false);
  let temMetaSalva = $state(false);

  /** Faixa segura de ritmo semanal pra fisiculturismo natural (perda ~0,5-1%/semana, ganho magro
   * ~0,25-0,5%/semana — aqui uma faixa única, generosa o bastante pros dois casos, já que o tipo
   * de dieta é quem decide a direção): abaixo disso o progresso é ruído/estagnação, acima disso
   * o ritmo tende a vir com perda de músculo (cutting) ou gordura em excesso (bulking). */
  const PERCENTUAL_MIN = 0.25;
  const PERCENTUAL_MAX = 1;

  function clampPercentual(): void {
    if (percentual == null) return;
    percentual = Math.min(PERCENTUAL_MAX, Math.max(PERCENTUAL_MIN, percentual));
  }

  async function carregar() {
    carregando = true;
    try {
      const [tipo, metaAtual, ultimoPeso] = await Promise.all([getTipoDieta(), getMeta(), getUltimoPeso()]);
      tipoDieta = tipo;
      temMetaSalva = metaAtual != null;
      pesoAlvo = metaAtual?.pesoAlvo ?? ultimoPeso;
      percentual = metaAtual?.tipo === "percentual" && metaAtual.percentual != null ? Math.abs(metaAtual.percentual) : null;
      clampPercentual();
    } finally {
      carregando = false;
    }
  }

  void carregar();

  const precisaPercentual = $derived(tipoDieta !== "manutencao");
  const podeSalvar = $derived(pesoAlvo != null && (!precisaPercentual || percentual != null));

  async function salvar() {
    if (!podeSalvar || pesoAlvo == null) return;
    salvando = true;
    try {
      if (tipoDieta === "manutencao") {
        await salvarMeta("manutencao", null, pesoAlvo);
      } else {
        const sinal = tipoDieta === "bulking" ? 1 : -1;
        await salvarMeta("percentual", sinal * Math.abs(percentual!), pesoAlvo);
      }
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao salvar meta: " + (err as Error).message);
      salvando = false;
    }
  }

  async function limpar() {
    salvando = true;
    try {
      await excluirMeta();
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao limpar meta: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Meta" {onFechar}>
  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else}
    <button class="tipo-dieta-info" onclick={() => navigate("/dieta/parametrizacao")}>
      Baseado na dieta: <strong>{TEXTO_TIPO[tipoDieta]}</strong>
      <span class="tipo-dieta-link">Mudar</span>
    </button>

    {#if precisaPercentual}
      <div class="campo">
        <label for="meta-percentual">Percentual semanal (%)</label>
        <input
          id="meta-percentual"
          type="number"
          inputmode="decimal"
          step="0.1"
          min={PERCENTUAL_MIN}
          max={PERCENTUAL_MAX}
          placeholder="-"
          bind:value={percentual}
          onblur={clampPercentual}
        />
        <span class="campo-dica">Entre {PERCENTUAL_MIN}% e {PERCENTUAL_MAX}% — ritmo seguro pra fisiculturismo natural</span>
      </div>
    {/if}

    <div class="campo">
      <label for="meta-peso">Peso alvo (kg)</label>
      <input id="meta-peso" type="number" inputmode="decimal" step="0.1" placeholder="-" bind:value={pesoAlvo} />
    </div>

    <Button onclick={salvar} disabled={salvando || !podeSalvar}>Salvar Meta</Button>
    {#if temMetaSalva}
      <button class="limpar-btn" onclick={limpar} disabled={salvando}>Limpar Meta</button>
    {/if}
  {/if}
</Sheet>

<style>
  .tipo-dieta-info {
    display: block;
    width: 100%;
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
  }
  .tipo-dieta-info strong {
    color: var(--surface-fg);
  }
  .tipo-dieta-link {
    display: block;
    margin-top: 2px;
    color: var(--color-primary);
    font-size: 12px;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .campo label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo-dica {
    font-size: 12px;
    color: var(--surface-muted);
  }
  .campo input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .limpar-btn {
    display: block;
    width: 100%;
    margin-top: var(--space-3);
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--color-negative);
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: center;
    cursor: pointer;
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
