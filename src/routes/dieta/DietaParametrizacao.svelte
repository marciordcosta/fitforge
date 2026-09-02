<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import {
    getPerfilDietaEditavel,
    getParametros,
    salvarParametro,
    DEFINICOES_PARAMETROS,
    PARAMETROS_PADRAO,
    gramasDoParametro,
    type LimiteParametro,
    type DefinicaoParametro,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";

  let pesoAtual = $state(76);
  let caloriasCalc = $state(2000);
  let carregando = $state(true);
  let erro = $state<string | null>(null);
  let salvando = $state(false);
  let valores = $state<Record<string, LimiteParametro>>({ ...PARAMETROS_PADRAO });
  let categoriasAbertas = $state<Set<string>>(new Set());

  const categorias = [...new Set(DEFINICOES_PARAMETROS.map((d) => d.categoria))];

  function definicoesDaCategoria(categoria: string) {
    return DEFINICOES_PARAMETROS.filter((d) => d.categoria === categoria);
  }

  function alternarCategoria(categoria: string) {
    const novo = new Set(categoriasAbertas);
    if (novo.has(categoria)) novo.delete(categoria);
    else novo.add(categoria);
    categoriasAbertas = novo;
  }

  function unidadeCalculada(unidade: string): string {
    if (unidade === "kcal/kg") return "kcal";
    if (unidade === "L/kg") return "L";
    return "g";
  }

  function valorCalculado(def: DefinicaoParametro, valor: number): string {
    return gramasDoParametro(def, valor, pesoAtual, caloriasCalc).toFixed(0);
  }

  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const [perfil, pesoMedio, parametros] = await Promise.all([
        getPerfilDietaEditavel(),
        getPesoMedioAtual(),
        getParametros(),
      ]);
      pesoAtual = pesoMedio ?? perfil.pesoAtual;
      caloriasCalc = Math.round(4 * perfil.proteinaGKg * pesoAtual + 9 * perfil.gorduraGKg * pesoAtual + 4 * perfil.carboidratoGKg * pesoAtual);
      const novo: Record<string, LimiteParametro> = { ...PARAMETROS_PADRAO };
      for (const [chave, limite] of parametros) novo[chave] = limite;
      valores = novo;
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
      await Promise.all(
        DEFINICOES_PARAMETROS.map((def) => {
          const v = valores[def.chave];
          if (def.metaUnica) {
            const valor = def.campoMeta === "max" ? v.max : v.min;
            return salvarParametro(def.chave, valor, valor);
          }
          const min = def.somenteMaximo ? 0 : v.min;
          const max = def.somenteMinimo ? v.min : v.max;
          return salvarParametro(def.chave, min, max);
        }),
      );
      navigate("/dieta");
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

{#snippet iconChevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/dieta")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Parâmetros</h1>
    <span class="header-spacer"></span>
  </div>

  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar parâmetros: {erro}</p>
  {:else}
    <p class="peso-ref">Com base no peso médio atual: <strong>{pesoAtual.toFixed(1)} kg</strong></p>
    <p class="dica">
      Cada parâmetro é um mínimo e máximo, por kg de peso ou por % das calorias do dia (Fibras e Gordura Saturada) — usados pelo app pra travar faixas (roletas, piso de calorias) e calcular metas automáticas.
    </p>

    {#each categorias as categoria (categoria)}
      {@const aberta = categoriasAbertas.has(categoria)}
      <div class="param-card">
        <button type="button" class="param-card-header" onclick={() => alternarCategoria(categoria)}>
          <span>{categoria}</span>
          <span class="chevron" class:aberto={aberta}>{@render iconChevron()}</span>
        </button>
        {#if aberta}
          <div class="param-card-body">
            {#each definicoesDaCategoria(categoria) as def (def.chave)}
              <div class="param-linha">
                <div class="param-titulos">
                  {#if def.metaUnica}
                    <span class="param-titulo-campo">Meta</span>
                  {:else}
                    {#if !def.somenteMaximo}<span class="param-titulo-campo">Mín</span>{/if}
                    {#if !def.somenteMinimo}<span class="param-titulo-campo">Máx</span>{/if}
                  {/if}
                </div>
                <div class="param-linha-topo">
                  <p class="param-nome">{def.label} <span class="param-unidade">({def.unidade})</span></p>
                  <div class="param-campos">
                    {#if def.metaUnica}
                      <input
                        class="param-input"
                        type="number"
                        inputmode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="Meta"
                        aria-label="Meta"
                        bind:value={valores[def.chave][def.campoMeta ?? "min"]}
                      />
                    {:else}
                      {#if !def.somenteMaximo}
                        <input
                          class="param-input"
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Mín"
                          aria-label="Mínimo"
                          bind:value={valores[def.chave].min}
                        />
                      {/if}
                      {#if !def.somenteMinimo}
                        <input
                          class="param-input"
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Máx"
                          aria-label="Máximo"
                          bind:value={valores[def.chave].max}
                        />
                      {/if}
                    {/if}
                  </div>
                </div>
                <p class="param-calculado" class:destaque={def.chave === "calorias"}>
                  {#if def.metaUnica}
                    ≈ {valorCalculado(def, valores[def.chave][def.campoMeta ?? "min"])} {unidadeCalculada(def.unidade)}
                    {def.base === "peso" ? "no seu peso" : "na sua meta de calorias"}
                  {:else if def.somenteMaximo}
                    até {valorCalculado(def, valores[def.chave].max)} {unidadeCalculada(def.unidade)} {def.base === "peso" ? "no seu peso" : "na sua meta de calorias"}
                  {:else}
                    ≈ {valorCalculado(def, valores[def.chave].min)}{#if !def.somenteMinimo && valores[def.chave].max !== valores[def.chave].min} – {valorCalculado(def, valores[def.chave].max)}{/if}
                    {unidadeCalculada(def.unidade)} {def.base === "peso" ? "no seu peso" : "na sua meta de calorias"}
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

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
  .peso-ref {
    margin: 0 0 var(--space-2);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .dica {
    margin: 0 0 var(--space-4);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
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
    overflow: hidden;
  }
  .param-card-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .chevron {
    display: flex;
    color: var(--surface-muted);
    transition: transform 0.15s ease;
  }
  .chevron svg {
    width: 18px;
    height: 18px;
  }
  .chevron.aberto {
    transform: rotate(180deg);
  }
  .param-card-body {
    padding: 0 var(--space-4) var(--space-4);
  }
  .param-linha {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--surface-border);
  }
  /* Nome e caixas na mesma linha, mais compacto — só o texto calculado (≈X no seu peso) fica
     numa linha própria embaixo. */
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
    margin-bottom: var(--space-1);
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
  .param-calculado {
    margin: 0;
    font-size: 12px;
    color: var(--surface-muted);
  }
  .param-calculado.destaque {
    color: var(--surface-fg);
  }
</style>
