<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { mostrarToast } from "../../lib/toast.svelte";
  import {
    listTreinos,
    listOverrideSemana,
    salvarOverrideSemana,
    horarioFixoComoOverride,
    segundaDaSemana,
    DIAS_SEMANA_ABREV,
    type TreinoComExercicios,
    type TreinoOverrideDia,
  } from "../../lib/treinoApi";

  let { data, onFechar, onSalvo }: { data: string; onFechar: () => void; onSalvo: () => void } = $props();

  /** Segunda primeiro, domingo por último — mesma ordem de exibição já usada no calendário de Peso. */
  const ORDEM_EXIBICAO = [1, 2, 3, 4, 5, 6, 0];

  const semanaInicio = $derived(segundaDaSemana(data));
  let treinosDaSemana = $state<TreinoComExercicios[]>([]);
  let atribuicoes = $state<Map<number, Set<string>>>(new Map());
  let loading = $state(true);
  let salvando = $state(false);

  async function carregar() {
    loading = true;
    try {
      const [todos, overrides] = await Promise.all([listTreinos(), listOverrideSemana(semanaInicio)]);
      treinosDaSemana = todos.filter((t) => t.dia_semana != null);
      const base = overrides.length ? overrides : horarioFixoComoOverride(todos);
      const mapa = new Map<number, Set<string>>();
      for (const dia of ORDEM_EXIBICAO) mapa.set(dia, new Set());
      for (const o of base) mapa.get(o.diaSemana)?.add(o.treinoId);
      atribuicoes = mapa;
    } catch (err) {
      alert("Erro ao carregar a semana: " + (err as Error).message);
    } finally {
      loading = false;
    }
  }

  void carregar();

  function alternar(dia: number, treinoId: string) {
    const atual = new Set(atribuicoes.get(dia));
    if (atual.has(treinoId)) atual.delete(treinoId);
    else atual.add(treinoId);
    atribuicoes = new Map(atribuicoes).set(dia, atual);
  }

  async function salvar() {
    salvando = true;
    try {
      const linhas: TreinoOverrideDia[] = [];
      for (const [dia, ids] of atribuicoes) {
        for (const id of ids) linhas.push({ diaSemana: dia, treinoId: id });
      }
      await salvarOverrideSemana(semanaInicio, linhas);
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

<Sheet titulo="Mudar dia" {onFechar} acaoTituloDireita={acaoSalvar}>
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    <p class="ajuda">Toque nas células pra marcar em quais dias cada treino cai — só vale pra essa semana.</p>
    {#if !treinosDaSemana.length}
      <p class="dia-vazio">Nenhuma rotina com dia fixo configurado.</p>
    {:else}
      <div class="grade" style={`grid-template-columns: minmax(0, 1.4fr) repeat(${ORDEM_EXIBICAO.length}, 1fr);`}>
        <span class="celula celula-cabecalho"></span>
        {#each ORDEM_EXIBICAO as dia (dia)}
          <span class="celula celula-cabecalho celula-dia-nome">{DIAS_SEMANA_ABREV[dia]}</span>
        {/each}
        {#each treinosDaSemana as treino (treino.id)}
          <span class="celula celula-treino-nome">{treino.nome_treino}</span>
          {#each ORDEM_EXIBICAO as dia (dia)}
            {@const marcado = atribuicoes.get(dia)?.has(treino.id) ?? false}
            <button
              type="button"
              class="celula celula-toggle"
              class:marcado
              onclick={() => alternar(dia, treino.id)}
              aria-label={`${treino.nome_treino} em ${DIAS_SEMANA_ABREV[dia]}`}
            >
              {#if marcado}✓{/if}
            </button>
          {/each}
        {/each}
      </div>
    {/if}
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
  .dia-vazio {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .grade {
    display: grid;
    gap: 4px;
    margin-bottom: var(--space-4);
    align-items: center;
  }
  .celula {
    min-width: 0;
  }
  .celula-cabecalho {
    font-size: 11px;
    font-weight: 600;
    color: var(--surface-muted);
  }
  .celula-dia-nome {
    text-align: center;
  }
  .celula-treino-nome {
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 4px;
  }
  .celula-toggle {
    aspect-ratio: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: transparent;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }
  .celula-toggle.marcado {
    background: var(--color-secondary);
    border-color: var(--color-secondary);
    color: var(--surface-bg);
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
