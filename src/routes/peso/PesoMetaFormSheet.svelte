<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import { navigate } from "../../lib/router.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { getMeta, getUltimoPeso, salvarMeta, excluirMeta, type DiaSemana } from "../../lib/pesoApi";
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
  const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  /** Qual visualização do gráfico (Peso.svelte) abre por padrão -- "diário" (peso bruto de cada
   * dia) ou "média" (móvel de 7 dias). Preferência só de exibição, sem relação com a meta em si
   * (por isso fica fora do fluxo de "Salvar Meta": grava direto no toque, como metaVisivel já faz
   * em Peso.svelte, em vez de ficar bloqueada por precisar de peso alvo definido). */
  const CHAVE_MODO_GRAFICO_PADRAO = "fitforge_peso_modo_grafico_padrao";
  let modoGraficoPadrao = $state<"diario" | "media">(
    typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_MODO_GRAFICO_PADRAO) === "media" ? "media" : "diario",
  );
  function selecionarModoGraficoPadrao(m: "diario" | "media"): void {
    modoGraficoPadrao = m;
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_MODO_GRAFICO_PADRAO, m);
  }

  /** "Mostrar detalhes" no gráfico (Peso.svelte) — marcado (padrão) mantém o comportamento de
   * sempre (peso/% aparecem nos pontos conforme o período escolhido); desmarcado força só a linha
   * (peso e meta), nunca mostra os rótulos por ponto. Mesma convenção de modoGraficoPadrao: grava
   * direto no toque, sem passar pelo fluxo de "Salvar Meta". */
  const CHAVE_MOSTRAR_DETALHES = "fitforge_peso_mostrar_detalhes";
  let mostrarDetalhes = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_MOSTRAR_DETALHES) !== "false" : true,
  );
  function alternarMostrarDetalhes(v: boolean): void {
    mostrarDetalhes = v;
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_MOSTRAR_DETALHES, String(v));
  }

  /** Card "Variação" (Peso.svelte): "Acumulada" (padrão) é direto do primeiro pro último registro
   * do período; "Média" quebra o período em blocos de 7 dias e tira a média das variações de cada
   * bloco. Mesma convenção das outras duas prefs dessa tela: grava direto no toque. */
  const CHAVE_TIPO_VARIACAO = "fitforge_peso_tipo_variacao";
  let tipoVariacao = $state<"acumulada" | "media">(
    typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_TIPO_VARIACAO) === "media" ? "media" : "acumulada",
  );
  function selecionarTipoVariacao(v: "acumulada" | "media"): void {
    tipoVariacao = v;
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_TIPO_VARIACAO, v);
  }

  let tipoDieta = $state<TipoDieta>("manutencao");
  /** Sempre a magnitude (sem sinal) — o sinal é aplicado na hora de salvar, conforme o tipo de
   * dieta. `percentualMin` é o ritmo usado pra calcular a meta de cada semana; `percentualMax` só
   * dispara o alerta de "ajustar rota" quando a média real desvia demais dela. */
  let percentualMin = $state<number | null>(null);
  let percentualMax = $state<number | null>(null);
  /** Dia da semana em que a meta reseta e recalcula (0=domingo..6=sábado) — ver
   * calcularLinhaMetaPorDia em pesoApi.ts. */
  let diaResetSemana = $state<DiaSemana>(1);
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
      diaResetSemana = metaAtual?.diaResetSemana ?? 1;
      clampPercentuais();
      original = JSON.stringify({ tipoDieta, percentualMin, percentualMax, pesoAlvo, diaResetSemana });
    } finally {
      carregando = false;
    }
  }

  void carregar();

  const precisaPercentual = $derived(tipoDieta !== "manutencao");
  const podeSalvar = $derived(pesoAlvo != null && (!precisaPercentual || (percentualMin != null && percentualMax != null)));

  function sujo(): boolean {
    return !carregando && JSON.stringify({ tipoDieta, percentualMin, percentualMax, pesoAlvo, diaResetSemana }) !== original;
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
        await salvarMeta("manutencao", null, null, pesoAlvo, diaResetSemana);
      } else {
        const sinal = tipoDieta === "bulking" ? 1 : -1;
        await salvarMeta("percentual", sinal * Math.abs(percentualMin!), sinal * Math.abs(percentualMax!), pesoAlvo, diaResetSemana);
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
        Entre {PERCENTUAL_MIN}% e {PERCENTUAL_MAX}% — a meta de cada semana usa o ritmo mínimo; o máximo só dispara o aviso de ajustar a rota
      </span>

      <div class="campo">
        <label for="meta-dia-reset">Reinicia a meta toda</label>
        <div class="dia-opcoes" id="meta-dia-reset">
          {#each DIAS_SEMANA_ABREV as dia, i (dia)}
            <button type="button" class:ativo={diaResetSemana === i} onclick={() => (diaResetSemana = i as DiaSemana)}>{dia}</button>
          {/each}
        </div>
        <span class="campo-dica">Nesse dia, a meta da próxima semana é recalculada em cima da sua média atual</span>
      </div>
    {/if}

    <div class="campo">
      <label for="meta-grafico-padrao">Visualização padrão do gráfico</label>
      <div class="referencia-opcoes" id="meta-grafico-padrao">
        <button type="button" class:ativo={modoGraficoPadrao === "diario"} onclick={() => selecionarModoGraficoPadrao("diario")}>Diário</button>
        <button type="button" class:ativo={modoGraficoPadrao === "media"} onclick={() => selecionarModoGraficoPadrao("media")}>Média</button>
      </div>
      <span class="campo-dica">Qual visualização o gráfico mostra quando abre</span>
    </div>

    <div class="campo">
      <label class="campo-checkbox-linha">
        <input type="checkbox" checked={mostrarDetalhes} onchange={(e) => alternarMostrarDetalhes(e.currentTarget.checked)} />
        Mostrar detalhes
      </label>
      <span class="campo-dica">Peso e % nos pontos do gráfico (conforme o período). Desmarcado, fica só a linha (peso e meta).</span>
    </div>

    <div class="campo">
      <label for="meta-tipo-variacao">Variação</label>
      <div class="referencia-opcoes" id="meta-tipo-variacao">
        <button type="button" class:ativo={tipoVariacao === "acumulada"} onclick={() => selecionarTipoVariacao("acumulada")}>Acumulada</button>
        <button type="button" class:ativo={tipoVariacao === "media"} onclick={() => selecionarTipoVariacao("media")}>Média</button>
      </div>
      <span class="campo-dica">
        {#if tipoVariacao === "acumulada"}
          Direto do primeiro pro último registro do período
        {:else}
          Média da variação de cada semana (blocos de 7 dias) dentro do período
        {/if}
      </span>
    </div>

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
  .campo-checkbox-linha {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }
  .campo-checkbox-linha input {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: var(--color-primary);
  }
  .campo-dica-dupla {
    display: block;
    margin: calc(var(--space-2) * -1) 0 var(--space-4);
  }
  .campo-dupla {
    flex-direction: row;
    gap: var(--space-3);
  }
  .dia-opcoes {
    display: flex;
    gap: 4px;
  }
  .dia-opcoes button {
    flex: 1;
    padding: var(--space-2) 2px;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .dia-opcoes button.ativo {
    background: var(--color-secondary);
    color: var(--surface-bg);
    border-color: var(--color-secondary);
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
