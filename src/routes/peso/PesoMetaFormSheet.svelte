<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import { navigate } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
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
  /** Sempre a magnitude (sem sinal) — o sinal é aplicado na hora de salvar, conforme o tipo de
   * dieta. `percentualMin` é o ritmo padrão/conservador (usado como inclinação da linha de meta
   * do gráfico); `percentualMax` é só o limite de tolerância antes da linha reancorar. */
  let percentualMin = $state<number | null>(null);
  let percentualMax = $state<number | null>(null);
  let pesoAlvo = $state<number | null>(null);
  let carregando = $state(true);
  let salvando = $state(false);
  let temMetaSalva = $state(false);
  let confirmandoDescartar = $state(false);
  let original = "";

  /** Faixa segura de ritmo semanal pra fisiculturismo natural (perda ~0,5-1%/semana, ganho magro
   * ~0,25-0,5%/semana — aqui uma faixa única, generosa o bastante pros dois casos, já que o tipo
   * de dieta é quem decide a direção): abaixo disso o progresso é ruído/estagnação, acima disso
   * o ritmo tende a vir com perda de músculo (cutting) ou gordura em excesso (bulking). */
  const PERCENTUAL_MIN = 0.25;
  const PERCENTUAL_MAX = 1;

  function clampPercentuais(): void {
    if (percentualMin != null) percentualMin = Math.min(PERCENTUAL_MAX, Math.max(PERCENTUAL_MIN, percentualMin));
    if (percentualMax != null) percentualMax = Math.min(PERCENTUAL_MAX, Math.max(PERCENTUAL_MIN, percentualMax));
    // O mínimo é sempre a MENOR magnitude (ritmo conservador) — se o usuário inverter os campos,
    // troca os valores em vez de deixar a banda invertida.
    if (percentualMin != null && percentualMax != null && percentualMin > percentualMax) {
      [percentualMin, percentualMax] = [percentualMax, percentualMin];
    }
  }

  async function carregar() {
    carregando = true;
    try {
      const [tipo, metaAtual, ultimoPeso] = await Promise.all([getTipoDieta(), getMeta(), getUltimoPeso()]);
      tipoDieta = tipo;
      temMetaSalva = metaAtual != null;
      pesoAlvo = metaAtual?.pesoAlvo ?? ultimoPeso;
      percentualMin = metaAtual?.tipo === "percentual" && metaAtual.percentualMin != null ? Math.abs(metaAtual.percentualMin) : null;
      percentualMax = metaAtual?.tipo === "percentual" && metaAtual.percentualMax != null ? Math.abs(metaAtual.percentualMax) : null;
      clampPercentuais();
      original = JSON.stringify({ tipoDieta, percentualMin, percentualMax, pesoAlvo });
    } finally {
      carregando = false;
    }
  }

  void carregar();

  const precisaPercentual = $derived(tipoDieta !== "manutencao");
  const podeSalvar = $derived(pesoAlvo != null && (!precisaPercentual || (percentualMin != null && percentualMax != null)));

  function sujo(): boolean {
    return !carregando && JSON.stringify({ tipoDieta, percentualMin, percentualMax, pesoAlvo }) !== original;
  }

  /** Sheet sem botão de voltar dedicado — fechar (toque fora, arrastar pra baixo) é o próprio
   * "voltar" daqui; intercepta antes de descartar silenciosamente o que foi digitado. */
  function aoTentarFechar(): void {
    if (sujo()) {
      confirmandoDescartar = true;
      return;
    }
    onFechar();
  }

  async function salvar() {
    if (!podeSalvar || pesoAlvo == null) return;
    salvando = true;
    try {
      if (tipoDieta === "manutencao") {
        await salvarMeta("manutencao", null, null, pesoAlvo);
      } else {
        const sinal = tipoDieta === "bulking" ? 1 : -1;
        await salvarMeta("percentual", sinal * Math.abs(percentualMin!), sinal * Math.abs(percentualMax!), pesoAlvo);
      }
      mostrarToast("Salvo");
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

<Sheet titulo="Meta" onFechar={aoTentarFechar}>
  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else}
    <button class="tipo-dieta-info" onclick={() => navigate("/dieta/parametrizacao")}>
      Baseado na dieta: <strong>{TEXTO_TIPO[tipoDieta]}</strong>
      <span class="tipo-dieta-link">Mudar</span>
    </button>

    {#if precisaPercentual}
      <div class="campo campo-dupla">
        <div>
          <label for="meta-percentual-min">Ritmo mínimo (%/semana)</label>
          <input
            id="meta-percentual-min"
            type="number"
            inputmode="decimal"
            step="0.1"
            min={PERCENTUAL_MIN}
            max={PERCENTUAL_MAX}
            placeholder="-"
            bind:value={percentualMin}
            onblur={clampPercentuais}
          />
        </div>
        <div>
          <label for="meta-percentual-max">Ritmo máximo (%/semana)</label>
          <input
            id="meta-percentual-max"
            type="number"
            inputmode="decimal"
            step="0.1"
            min={PERCENTUAL_MIN}
            max={PERCENTUAL_MAX}
            placeholder="-"
            bind:value={percentualMax}
            onblur={clampPercentuais}
          />
        </div>
      </div>
      <span class="campo-dica campo-dica-dupla">
        Entre {PERCENTUAL_MIN}% e {PERCENTUAL_MAX}% — a linha de meta segue o ritmo mínimo; só reancora se sair da faixa
      </span>
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

{#if confirmandoDescartar}
  <ConfirmDialog
    titulo="Descartar alterações na meta?"
    textoConfirmar="Descartar"
    onConfirmar={() => {
      confirmandoDescartar = false;
      onFechar();
    }}
    onCancelar={() => (confirmandoDescartar = false)}
  />
{/if}

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
  .campo-dica-dupla {
    display: block;
    margin: calc(var(--space-2) * -1) 0 var(--space-4);
  }
  .campo-dupla {
    flex-direction: row;
    gap: var(--space-3);
  }
  .campo-dupla > div {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
