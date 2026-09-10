<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import {
    getParametrosDistribuicao,
    salvarParametrosDistribuicao,
    fatorPerformanceGradual,
    PARAMETROS_DISTRIBUICAO_PADRAO,
    type ParametrosDistribuicao,
    type FadigaModo,
  } from "../../lib/treinoApi";

  let carregando = $state(true);
  let erro = $state<string | null>(null);
  let salvando = $state(false);

  let seriesManutencaoMin = $state(PARAMETROS_DISTRIBUICAO_PADRAO.seriesManutencaoMin);
  let seriesManutencaoMax = $state(PARAMETROS_DISTRIBUICAO_PADRAO.seriesManutencaoMax);
  let seriesFocoMin = $state(PARAMETROS_DISTRIBUICAO_PADRAO.seriesFocoMin);
  let seriesFocoMax = $state(PARAMETROS_DISTRIBUICAO_PADRAO.seriesFocoMax);
  let fadigaModo = $state<FadigaModo>(PARAMETROS_DISTRIBUICAO_PADRAO.fadigaModo);
  let fadigaFasesCorteA = $state(PARAMETROS_DISTRIBUICAO_PADRAO.fadigaFasesCorteA);
  let fadigaFasesCorteB = $state(PARAMETROS_DISTRIBUICAO_PADRAO.fadigaFasesCorteB);
  let fadigaGradualC = $state(PARAMETROS_DISTRIBUICAO_PADRAO.fadigaGradualC);
  let fadigaGradualD = $state(PARAMETROS_DISTRIBUICAO_PADRAO.fadigaGradualD);

  const OPCOES_FADIGA: { valor: FadigaModo; label: string }[] = [
    { valor: "fases", label: "Fases" },
    { valor: "gradual", label: "Gradual" },
  ];

  /** Preview ao vivo das primeiras 8 séries — mesma função pura usada no motor de cálculo, só
   * pra o usuário ver o efeito de mexer em c/d antes de salvar. */
  const previewGradual = $derived(
    Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      return { n, fator: fatorPerformanceGradual(n, fadigaGradualC, fadigaGradualD) };
    }),
  );

  function formatFator(v: number): string {
    return v.toFixed(2);
  }

  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const p = await getParametrosDistribuicao();
      seriesManutencaoMin = p.seriesManutencaoMin;
      seriesManutencaoMax = p.seriesManutencaoMax;
      seriesFocoMin = p.seriesFocoMin;
      seriesFocoMax = p.seriesFocoMax;
      fadigaModo = p.fadigaModo;
      fadigaFasesCorteA = p.fadigaFasesCorteA;
      fadigaFasesCorteB = p.fadigaFasesCorteB;
      fadigaGradualC = p.fadigaGradualC;
      fadigaGradualD = p.fadigaGradualD;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      carregando = false;
    }
  }

  void carregar();

  async function salvar() {
    salvando = true;
    try {
      const p: ParametrosDistribuicao = {
        seriesManutencaoMin,
        seriesManutencaoMax,
        seriesFocoMin,
        seriesFocoMax,
        fadigaModo,
        fadigaFasesCorteA,
        fadigaFasesCorteB,
        fadigaGradualC,
        fadigaGradualD,
      };
      await salvarParametrosDistribuicao(p);
      navigate("/treino");
    } catch (err) {
      alert("Erro ao salvar parâmetros: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Parametrização</h1>
    <span class="header-spacer"></span>
  </div>

  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar parâmetros: {erro}</p>
  {:else}
    <div class="param-card">
      <p class="param-card-titulo">Classificação de Volume Semanal</p>
      <p class="param-card-desc">Usada pra colorir o total de séries por músculo na semana (Distribuição, Rotinas).</p>
      <div class="param-linha">
        <div class="param-titulos">
          <span class="param-titulo-campo">Mín</span>
          <span class="param-titulo-campo">Máx</span>
        </div>
        <div class="param-linha-topo">
          <p class="param-nome">Manutenção <span class="legenda-cor legenda-manutencao">●</span></p>
          <div class="param-campos">
            <input class="param-input" type="number" inputmode="numeric" min="0" step="1" aria-label="Manutenção mínimo" bind:value={seriesManutencaoMin} />
            <input class="param-input" type="number" inputmode="numeric" min="0" step="1" aria-label="Manutenção máximo" bind:value={seriesManutencaoMax} />
          </div>
        </div>
      </div>
      <div class="param-linha">
        <div class="param-linha-topo">
          <p class="param-nome">Foco <span class="legenda-cor legenda-foco">●</span></p>
          <div class="param-campos">
            <input class="param-input" type="number" inputmode="numeric" min="0" step="1" aria-label="Foco mínimo" bind:value={seriesFocoMin} />
            <input class="param-input" type="number" inputmode="numeric" min="0" step="1" aria-label="Foco máximo" bind:value={seriesFocoMax} />
          </div>
        </div>
      </div>
      <p class="param-card-desc">
        Entre o máximo da Manutenção e o mínimo do Foco, o sistema classifica como
        <strong>Moderado</strong> automaticamente — sem campo próprio.
      </p>
      <p class="param-legenda">
        <span class="legenda-cor legenda-abaixo">●</span> abaixo de {seriesManutencaoMin} — insuficiente
        &nbsp;·&nbsp; <span class="legenda-cor legenda-manutencao">●</span> {seriesManutencaoMin}–{seriesManutencaoMax} — manutenção
        &nbsp;·&nbsp; <span class="legenda-cor legenda-moderado">●</span> {seriesManutencaoMax + 1}–{seriesFocoMin - 1} — moderado
        &nbsp;·&nbsp; <span class="legenda-cor legenda-foco">●</span> {seriesFocoMin}–{seriesFocoMax} — foco
        &nbsp;·&nbsp; <span class="legenda-cor legenda-abaixo">●</span> acima de {seriesFocoMax} — excessivo
      </p>
    </div>

    <div class="param-card">
      <p class="param-card-titulo">Fadiga por Posição</p>
      <p class="param-card-desc">
        Regra 80/20 de priorização dentro da sessão — não mede fadiga física real. Define quais
        séries caem no bloco de maior retorno (afeta a coluna "Acum." e a tendência por músculo).
      </p>
      <div class="fadiga-opcoes">
        {#each OPCOES_FADIGA as opcao (opcao.valor)}
          <button type="button" class:ativo={fadigaModo === opcao.valor} onclick={() => (fadigaModo = opcao.valor)}>{opcao.label}</button>
        {/each}
      </div>

      {#if fadigaModo === "fases"}
        <p class="param-card-desc">
          % da sessão (não nº de séries) até onde a posição ainda conta como bloco de maior
          prioridade "A"; daí até o segundo corte é o bloco intermediário "B"; depois disso, o
          bloco final "C". Independe do treino ter 8 ou 18 séries.
        </p>
        <div class="param-linha">
          <div class="param-linha-topo">
            <p class="param-nome">Bloco A até <span class="legenda-cor legenda-fase-a">●</span></p>
            <div class="param-campos">
              <input class="param-input" type="number" inputmode="numeric" min="1" max="99" step="5" aria-label="Corte A" bind:value={fadigaFasesCorteA} />
              <span class="param-unidade">%</span>
            </div>
          </div>
        </div>
        <div class="param-linha">
          <div class="param-linha-topo">
            <p class="param-nome">Bloco B até <span class="legenda-cor legenda-fase-b">●</span></p>
            <div class="param-campos">
              <input class="param-input" type="number" inputmode="numeric" min="1" max="99" step="5" aria-label="Corte B" bind:value={fadigaFasesCorteB} />
              <span class="param-unidade">%</span>
            </div>
          </div>
        </div>
      {/if}

      {#if fadigaModo === "gradual"}
        <p class="formula">
          Pₙ = P₁ × (1 − F), F = c·ln(n) + (n−1)·d
        </p>
        <div class="param-linha">
          <div class="param-linha-topo">
            <p class="param-nome">c <span class="param-unidade">(fadiga inicial)</span></p>
            <div class="param-campos">
              <input class="param-input" type="number" inputmode="decimal" min="0" step="0.01" aria-label="Coeficiente c" bind:value={fadigaGradualC} />
            </div>
          </div>
        </div>
        <div class="param-linha">
          <div class="param-linha-topo">
            <p class="param-nome">d <span class="param-unidade">(desgaste sistêmico)</span></p>
            <div class="param-campos">
              <input class="param-input" type="number" inputmode="decimal" min="0" step="0.001" aria-label="Coeficiente d" bind:value={fadigaGradualD} />
            </div>
          </div>
        </div>

        <div class="preview-tabela">
          <div class="preview-linha preview-cabecalho">
            {#each previewGradual as p (p.n)}
              <span>Série {p.n}</span>
            {/each}
          </div>
          <div class="preview-linha">
            {#each previewGradual as p (p.n)}
              <span>{formatFator(p.fator)}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <Button onclick={salvar} disabled={salvando}>Salvar</Button>
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
    margin-bottom: var(--space-3);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
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
  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .param-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-3);
    padding: var(--space-4);
  }
  .param-card-titulo {
    margin: 0 0 4px;
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .param-card-desc {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .param-linha {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--surface-border);
  }
  .param-titulos {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .param-titulo-campo {
    width: 64px;
    text-align: center;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .param-linha-topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .param-nome {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .param-unidade {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .param-campos {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-2);
  }
  .param-input {
    box-sizing: border-box;
    width: 64px;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
    color-scheme: dark;
  }
  .legenda-cor {
    font-size: 10px;
  }
  .legenda-abaixo {
    color: var(--color-danger);
  }
  .legenda-manutencao {
    color: var(--color-neutral);
  }
  .legenda-moderado {
    color: var(--color-success);
  }
  .legenda-foco {
    color: var(--color-secondary);
  }
  .legenda-fase-a {
    color: #60a5fa;
  }
  .legenda-fase-b {
    color: #fbbf24;
  }
  .param-legenda {
    margin: var(--space-2) 0 0;
    font-size: 12px;
    color: var(--surface-muted);
    border-top: 1px solid var(--surface-border);
    padding-top: var(--space-2);
  }
  .fadiga-opcoes {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .fadiga-opcoes button {
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
  .fadiga-opcoes button.ativo {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .formula {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
    font-style: italic;
  }
  .preview-tabela {
    margin-top: var(--space-2);
    overflow-x: auto;
  }
  .preview-linha {
    display: flex;
    gap: var(--space-3);
  }
  .preview-linha span {
    flex-shrink: 0;
    width: 56px;
    text-align: center;
    font-size: 12px;
  }
  .preview-cabecalho span {
    color: var(--surface-muted);
  }
</style>
