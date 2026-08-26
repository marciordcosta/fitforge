<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import {
    getPerfilDietaEditavel,
    getParametros,
    salvarParametro,
    DEFINICOES_PARAMETROS,
    PARAMETROS_PADRAO,
    type LimiteParametro,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";

  let pesoAtual = $state(76);
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

  function valorCalculado(porKg: number): string {
    return (porKg * pesoAtual).toFixed(0);
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
          const max = def.somenteMinimo ? v.min : v.max;
          return salvarParametro(def.chave, v.min, max);
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

{#snippet iconChevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => navigate("/dieta")} aria-label="Voltar">←</button>
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
      Cada parâmetro é um mínimo e máximo por kg de peso — usados pelo app pra travar faixas (roletas, piso de calorias) e calcular metas automáticas.
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
                <p class="param-nome">{def.label} <span class="param-unidade">({def.unidade})</span></p>
                <div class="param-campos">
                  <label class="param-campo">
                    <span>Mínimo</span>
                    <input type="number" inputmode="decimal" step="0.01" min="0" bind:value={valores[def.chave].min} />
                  </label>
                  {#if !def.somenteMinimo}
                    <label class="param-campo">
                      <span>Máximo</span>
                      <input type="number" inputmode="decimal" step="0.01" min="0" bind:value={valores[def.chave].max} />
                    </label>
                  {/if}
                </div>
                <p class="param-calculado">
                  ≈ {valorCalculado(valores[def.chave].min)}{#if !def.somenteMinimo && valores[def.chave].max !== valores[def.chave].min} – {valorCalculado(valores[def.chave].max)}{/if}
                  {unidadeCalculada(def.unidade)} no seu peso
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
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .header-spacer {
    width: 24px;
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
  .param-nome {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .param-unidade {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .param-campos {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .param-campo {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .param-campo input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .param-calculado {
    margin: 0;
    font-size: 12px;
    color: var(--surface-muted);
  }
</style>
