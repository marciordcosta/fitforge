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
    <p class="ajuda">Marque quais treinos caem em cada dia — só vale pra essa semana.</p>
    {#each ORDEM_EXIBICAO as dia (dia)}
      <div class="dia-bloco">
        <p class="dia-nome">{DIAS_SEMANA_ABREV[dia]}</p>
        {#if !treinosDaSemana.length}
          <p class="dia-vazio">Nenhuma rotina com dia fixo configurado.</p>
        {:else}
          <div class="treino-lista">
            {#each treinosDaSemana as treino (treino.id)}
              {@const marcado = atribuicoes.get(dia)?.has(treino.id) ?? false}
              <button type="button" class="treino-opcao" class:marcado onclick={() => alternar(dia, treino.id)}>
                {treino.nome_treino}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
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
  .dia-bloco {
    margin-bottom: var(--space-4);
  }
  .dia-nome {
    margin: 0 0 var(--space-2);
    font-weight: 600;
  }
  .dia-vazio {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .treino-lista {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .treino-opcao {
    padding: var(--space-2) var(--space-3);
    border-radius: 999px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    font-family: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .treino-opcao.marcado {
    background: var(--color-secondary);
    color: var(--surface-bg);
    border-color: var(--color-secondary);
    font-weight: 600;
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
