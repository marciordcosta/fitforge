<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
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
  import { getModoCalorias, trocarCaloriasEntreDias } from "../../lib/dietaApi";

  let { data, onFechar, onSalvo }: { data: string; onFechar: () => void; onSalvo: () => void } = $props();

  /** Segunda primeiro, domingo por último — mesma ordem de exibição já usada no calendário de Peso. */
  const ORDEM_EXIBICAO = [1, 2, 3, 4, 5, 6, 0];

  const semanaInicio = $derived(segundaDaSemana(data));
  let treinosDaSemana = $state<TreinoComExercicios[]>([]);
  /** Um dia só por rotina (troca automática ao clicar em outra célula da mesma linha) — mais de
   * uma rotina ainda pode cair no MESMO dia (a coluna aceita várias linhas marcadas), só a rotina
   * em si não pode estar em 2 dias ao mesmo tempo. null = essa rotina não entra em nenhum dia. */
  let atribuicoes = $state<Map<string, number | null>>(new Map());
  /** Estado no momento em que o sheet abriu — comparado no salvar pra saber se alguma rotina
   * TROCOU de dia (não só entrou/saiu), pra oferecer trocar a meta de calorias entre os 2 dias
   * envolvidos automaticamente, sem precisar de um seletor de 7 dias separado. */
  let atribuicoesOriginais = $state<Map<string, number | null>>(new Map());
  let loading = $state(true);
  let salvando = $state(false);
  /** Quando não-nulo, pergunta se quer trocar a meta de calorias entre esses 2 dias também —
   * só faz sentido quando exatamente 1 rotina trocou de um dia definido pra outro (não faz
   * sentido "trocar calorias" quando várias rotinas mudam ao mesmo tempo, ou quando uma rotina só
   * entra/sai sem um par claro). */
  let trocaCaloriasProposta = $state<{ de: number; para: number } | null>(null);

  async function carregar() {
    loading = true;
    try {
      const [todos, overrides] = await Promise.all([listTreinos(), listOverrideSemana(semanaInicio)]);
      treinosDaSemana = todos.filter((t) => t.dia_semana != null);
      const base = overrides.length ? overrides : horarioFixoComoOverride(todos);
      const mapa = new Map<string, number | null>(treinosDaSemana.map((t) => [t.id, null]));
      for (const o of base) mapa.set(o.treinoId, o.diaSemana);
      atribuicoes = mapa;
      atribuicoesOriginais = new Map(mapa);
    } catch (err) {
      alert("Erro ao carregar a semana: " + (err as Error).message);
    } finally {
      loading = false;
    }
  }

  void carregar();

  /** Clicar numa célula já marcada desmarca (rotina fica sem dia essa semana); clicar numa célula
   * diferente da mesma linha move a rotina pra lá automaticamente. */
  function selecionar(dia: number, treinoId: string) {
    const atual = new Map(atribuicoes);
    atual.set(treinoId, atual.get(treinoId) === dia ? null : dia);
    atribuicoes = atual;
  }

  async function salvar() {
    salvando = true;
    try {
      const linhas: TreinoOverrideDia[] = [];
      const mudancas: { de: number; para: number }[] = [];
      for (const [treinoId, diaNovo] of atribuicoes) {
        if (diaNovo != null) linhas.push({ diaSemana: diaNovo, treinoId });
        const diaAntigo = atribuicoesOriginais.get(treinoId) ?? null;
        if (diaAntigo != null && diaNovo != null && diaAntigo !== diaNovo) mudancas.push({ de: diaAntigo, para: diaNovo });
      }
      await salvarOverrideSemana(semanaInicio, linhas);
      mostrarToast("Salvo");

      if (mudancas.length === 1) {
        try {
          if ((await getModoCalorias()) === "ondulatoria") {
            trocaCaloriasProposta = mudancas[0];
            return; // onSalvo só dispara depois que essa pergunta for respondida (ver ConfirmDialog abaixo)
          }
        } catch {
          // informativo — se falhar, só não oferece a troca de calorias
        }
      }
      onSalvo();
    } catch (err) {
      alert("Erro ao salvar: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function confirmarTrocaCalorias() {
    const troca = trocaCaloriasProposta;
    trocaCaloriasProposta = null;
    if (!troca) return;
    try {
      await trocarCaloriasEntreDias(data, troca.de, troca.para);
      mostrarToast("Salvo");
    } catch (err) {
      alert("Erro ao trocar a meta de calorias: " + (err as Error).message);
    }
    onSalvo();
  }

  function cancelarTrocaCalorias() {
    trocaCaloriasProposta = null;
    onSalvo();
  }
</script>

{#snippet acaoSalvar()}
  <button type="button" class="salvar-btn" disabled={salvando || loading} onclick={salvar}>Salvar</button>
{/snippet}

<Sheet titulo="Mudar dia" {onFechar} acaoTituloDireita={acaoSalvar}>
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else}
    <p class="ajuda">Toque no dia que cada treino cai (um dia por treino) — só vale pra essa semana.</p>
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
            {@const marcado = atribuicoes.get(treino.id) === dia}
            <span class="celula celula-toggle-wrap">
              <input
                type="checkbox"
                checked={marcado}
                onchange={() => selecionar(dia, treino.id)}
                aria-label={`${treino.nome_treino} em ${DIAS_SEMANA_ABREV[dia]}`}
              />
            </span>
          {/each}
        {/each}
      </div>
    {/if}
    <Button onclick={salvar} disabled={salvando}>Salvar</Button>
  {/if}
</Sheet>

{#if trocaCaloriasProposta}
  <ConfirmDialog
    titulo={`Quer trocar a meta de calorias entre ${DIAS_SEMANA_ABREV[trocaCaloriasProposta.de]} e ${DIAS_SEMANA_ABREV[trocaCaloriasProposta.para]} também?`}
    textoConfirmar="Trocar"
    destrutivo={false}
    onConfirmar={confirmarTrocaCalorias}
    onCancelar={cancelarTrocaCalorias}
  />
{/if}

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
  .celula-toggle-wrap {
    justify-self: center;
    align-self: center;
  }
  .celula-toggle-wrap input {
    display: block;
    width: 18px;
    height: 18px;
    accent-color: var(--color-secondary);
    cursor: pointer;
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
