<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { DIAS_SEMANA_ABREV, segundaDaSemana } from "../../lib/treinoApi";
  import { listOverrideSemanaDieta, salvarOverrideSemanaDieta, perfilSemanalOndulatoria, type DietaOverrideDia } from "../../lib/dietaApi";
  import { marcarDietaDesatualizada } from "../../lib/dietaInvalidacao.svelte";

  let { data, onFechar, onSalvo }: { data: string; onFechar: () => void; onSalvo: () => void } = $props();

  const ORDEM_EXIBICAO = [1, 2, 3, 4, 5, 6, 0];

  const semanaInicio = $derived(segundaDaSemana(data));
  let dias = $state<DietaOverrideDia[]>([]);
  let selecionado = $state<number | null>(null);
  let loading = $state(true);
  let salvando = $state(false);

  async function carregar() {
    loading = true;
    try {
      const overrides = await listOverrideSemanaDieta(semanaInicio);
      dias = overrides.length ? overrides : await perfilSemanalOndulatoria();
    } catch (err) {
      alert("Erro ao carregar a semana: " + (err as Error).message);
    } finally {
      loading = false;
    }
  }

  void carregar();

  function valorDoDia(diaSemana: number): DietaOverrideDia | undefined {
    return dias.find((d) => d.diaSemana === diaSemana);
  }

  /** Toca no primeiro dia pra selecionar, toca num segundo pra trocar as metas entre os dois —
   * reposiciona os mesmos 7 valores da semana, não inventa número novo. */
  function aoClicarDia(diaSemana: number) {
    if (selecionado == null) {
      selecionado = diaSemana;
      return;
    }
    if (selecionado === diaSemana) {
      selecionado = null;
      return;
    }
    const a = valorDoDia(selecionado);
    const b = valorDoDia(diaSemana);
    if (a && b) {
      const novaLista = dias.map((d) => {
        if (d.diaSemana === a.diaSemana) return { ...d, calorias: b.calorias, gorduraG: b.gorduraG };
        if (d.diaSemana === b.diaSemana) return { ...d, calorias: a.calorias, gorduraG: a.gorduraG };
        return d;
      });
      dias = novaLista;
    }
    selecionado = null;
  }

  async function salvar() {
    salvando = true;
    try {
      await salvarOverrideSemanaDieta(semanaInicio, dias);
      marcarDietaDesatualizada();
      mostrarToast("Salvo");
      onSalvo();
    } catch (err) {
      alert("Erro ao salvar: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet acaoSalvar()}
  <button type="button" class="salvar-btn" disabled={salvando || loading} onclick={salvar}>Salvar</button>
{/snippet}

<Sheet titulo="Ajustar dieta da semana" {onFechar} acaoTituloDireita={acaoSalvar}>
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    <p class="ajuda">Toque em 2 dias pra trocar as metas de calorias entre eles — só vale pra essa semana.</p>
    <div class="dias-lista">
      {#each ORDEM_EXIBICAO as diaSemana (diaSemana)}
        {@const info = valorDoDia(diaSemana)}
        <button type="button" class="dia-linha" class:selecionado={selecionado === diaSemana} onclick={() => aoClicarDia(diaSemana)}>
          <span class="dia-nome">{DIAS_SEMANA_ABREV[diaSemana]}</span>
          <span class="dia-valor">{info ? `${info.calorias.toFixed(0)} kcal` : "—"}</span>
        </button>
      {/each}
    </div>
    <Button onclick={salvar} disabled={salvando}>Salvar</Button>
  {/if}
</Sheet>

<style>
  .muted {
    color: var(--surface-muted);
  }
  .ajuda {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .dias-lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .dia-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-family: inherit;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .dia-linha.selecionado {
    border-color: var(--color-secondary);
    background: color-mix(in srgb, var(--color-secondary) 15%, var(--surface-bg));
  }
  .dia-nome {
    font-weight: 600;
  }
  .dia-valor {
    color: var(--surface-muted);
  }
  .salvar-btn {
    border: none;
    background: none;
    color: var(--color-primary);
    font-family: inherit;
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .salvar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
