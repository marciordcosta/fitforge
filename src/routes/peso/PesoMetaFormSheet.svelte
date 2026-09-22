<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import { navigate } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { getMeta, getUltimoPeso, salvarMeta, excluirMeta, type ReferenciaIdeal, type EstiloMeta } from "../../lib/pesoApi";
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
  /** Estilo da linha de meta (ver calcularLinhaMetaPorDia em pesoApi.ts) — "ritmo_semanal" (estilo
   * MacroFactor: reseta a cada 7 dias, projeta no ritmo escolhido) ou "faixa_alvo" (estilo
   * TrendWeight: sem trajetória, meta = peso-alvo constante). Só relevante pra tipo "percentual". */
  let estiloMeta = $state<EstiloMeta>("ritmo_semanal");
  /** Sempre a magnitude (sem sinal) — o sinal é aplicado na hora de salvar, conforme o tipo de
   * dieta. Só usados quando estiloMeta é "ritmo_semanal": `percentualMin` é o ritmo
   * padrão/conservador, `percentualMax` o mais agressivo — `referenciaIdeal` escolhe qual dos
   * dois vira a inclinação da linha. */
  let percentualMin = $state<number | null>(null);
  let percentualMax = $state<number | null>(null);
  let referenciaIdeal = $state<ReferenciaIdeal>("minimo");
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
      estiloMeta = metaAtual?.estiloMeta ?? "ritmo_semanal";
      percentualMin = metaAtual?.tipo === "percentual" && metaAtual.percentualMin != null ? Math.abs(metaAtual.percentualMin) : null;
      percentualMax = metaAtual?.tipo === "percentual" && metaAtual.percentualMax != null ? Math.abs(metaAtual.percentualMax) : null;
      referenciaIdeal = metaAtual?.referenciaIdeal ?? "minimo";
      clampPercentuais();
      original = JSON.stringify({ tipoDieta, estiloMeta, percentualMin, percentualMax, referenciaIdeal, pesoAlvo });
    } finally {
      carregando = false;
    }
  }

  void carregar();

  const precisaPercentual = $derived(tipoDieta !== "manutencao");
  const precisaRitmo = $derived(precisaPercentual && estiloMeta === "ritmo_semanal");
  const podeSalvar = $derived(pesoAlvo != null && (!precisaRitmo || (percentualMin != null && percentualMax != null)));

  function sujo(): boolean {
    return !carregando && JSON.stringify({ tipoDieta, estiloMeta, percentualMin, percentualMax, referenciaIdeal, pesoAlvo }) !== original;
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
        await salvarMeta("manutencao", estiloMeta, null, null, referenciaIdeal, pesoAlvo);
      } else {
        const sinal = tipoDieta === "bulking" ? 1 : -1;
        await salvarMeta(
          "percentual",
          estiloMeta,
          precisaRitmo ? sinal * Math.abs(percentualMin!) : null,
          precisaRitmo ? sinal * Math.abs(percentualMax!) : null,
          referenciaIdeal,
          pesoAlvo,
        );
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
      <div class="campo">
        <label for="meta-estilo">Estilo da meta</label>
        <div class="referencia-opcoes" id="meta-estilo">
          <button type="button" class:ativo={estiloMeta === "ritmo_semanal"} onclick={() => (estiloMeta = "ritmo_semanal")}>
            Ritmo semanal
          </button>
          <button type="button" class:ativo={estiloMeta === "faixa_alvo"} onclick={() => (estiloMeta = "faixa_alvo")}>
            Faixa no alvo
          </button>
        </div>
        <span class="campo-dica">
          {#if estiloMeta === "ritmo_semanal"}
            A meta reseta toda semana pro seu progresso real e projeta a próxima no ritmo escolhido — sem tentar "recuperar o atraso".
          {:else}
            A meta é sempre o peso-alvo, sem trajetória — só compara sua média real com ele.
          {/if}
        </span>
      </div>
    {/if}

    {#if precisaRitmo}
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
        Entre {PERCENTUAL_MIN}% e {PERCENTUAL_MAX}%
      </span>

      <div class="campo">
        <label for="meta-referencia-ideal">Linha segue o ritmo</label>
        <div class="referencia-opcoes" id="meta-referencia-ideal">
          <button type="button" class:ativo={referenciaIdeal === "minimo"} onclick={() => (referenciaIdeal = "minimo")}>Mínimo</button>
          <button type="button" class:ativo={referenciaIdeal === "media"} onclick={() => (referenciaIdeal = "media")}>Média</button>
          <button type="button" class:ativo={referenciaIdeal === "maximo"} onclick={() => (referenciaIdeal = "maximo")}>Máximo</button>
        </div>
        <span class="campo-dica">Qual ritmo vira a inclinação da linha a cada semana</span>
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
  .referencia-opcoes {
    display: flex;
    gap: var(--space-2);
  }
  .referencia-opcoes button {
    flex: 1;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .referencia-opcoes button.ativo {
    background: var(--color-secondary);
    color: var(--surface-bg);
    border-color: var(--color-secondary);
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
