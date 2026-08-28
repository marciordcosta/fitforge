<script lang="ts">
  import { parseISODate } from "../../lib/dates";
  import { navigate, voltar } from "../../lib/router.svelte";
  import { treinoLogSessao, type ExercicioSessao, type SetSessao } from "../../lib/treinoLogSessao.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import {
    getHistoricoDia,
    salvarRegistrosDoDia,
    excluirRegistrosDoDia,
    criarRotinaAPartirDeSessao,
    getRecordesExercicio,
    type SetRegistro,
  } from "../../lib/treinoApi";

  let { treinoId, data }: { treinoId: string; data: string } = $props();

  interface ExercicioSessaoHistorico {
    exercicioId: string;
    exercicioNome: string;
    sets: SetRegistro[];
  }

  let treinoNome = $state("");
  let sessao = $state<ExercicioSessaoHistorico[]>([]);
  let loading = $state(true);
  let salvando = $state(false);
  let salvo = $state(false);
  let modoEdicao = $state(false);
  let menuAberto = $state(false);
  let mostrarConfirmarExcluir = $state(false);
  let mostrarNomearRotina = $state(false);
  let nomeRotina = $state("");
  let salvandoRotina = $state(false);
  let copiando = $state(false);
  let excluindo = $state(false);

  const dataLabel = $derived.by(() => {
    const d = parseISODate(data);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  });

  async function carregar() {
    loading = true;
    const historico = await getHistoricoDia(treinoId, data);
    treinoNome = historico.treinoNome;
    sessao = historico.exercicios.map((ex) => ({
      exercicioId: ex.exercicioId,
      exercicioNome: ex.exercicioNome,
      sets: ex.sets.map((s) => ({ ...s })),
    }));
    loading = false;
  }

  void carregar();

  function adicionarSerie(exIdx: number) {
    const ex = sessao[exIdx];
    ex.sets = [...ex.sets, { serie: ex.sets.length + 1, peso: null, repeticoes: null }];
  }

  function removerSerie(exIdx: number, setIdx: number) {
    const ex = sessao[exIdx];
    ex.sets = ex.sets.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, serie: i + 1 }));
  }

  async function salvar() {
    salvando = true;
    salvo = false;
    try {
      const porExercicio = new Map<string, SetRegistro[]>();
      for (const ex of sessao) porExercicio.set(ex.exercicioId, ex.sets);
      await salvarRegistrosDoDia(treinoId, data, porExercicio);
      salvo = true;
      modoEdicao = false;
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  function abrirEditar() {
    menuAberto = false;
    modoEdicao = true;
  }

  function abrirSalvarComoRotina() {
    menuAberto = false;
    nomeRotina = treinoNome;
    mostrarNomearRotina = true;
  }

  async function confirmarSalvarComoRotina() {
    if (!nomeRotina.trim()) return;
    salvandoRotina = true;
    try {
      const novoId = await criarRotinaAPartirDeSessao(
        nomeRotina.trim(),
        sessao.map((ex) => ({ exercicioId: ex.exercicioId, sets: ex.sets })),
      );
      mostrarNomearRotina = false;
      navigate(`/treino/rotina/${novoId}/ver`);
    } catch (e) {
      alert("Erro ao criar rotina: " + (e as Error).message);
    } finally {
      salvandoRotina = false;
    }
  }

  async function copiarTreinamento() {
    menuAberto = false;
    copiando = true;
    try {
      const novaSessao: ExercicioSessao[] = await Promise.all(
        sessao.map(async (ex) => {
          const recordes = await getRecordesExercicio(ex.exercicioId);
          const sets: SetSessao[] = ex.sets.map((s) => ({
            serie: s.serie,
            peso: null,
            repeticoes: null,
            concluida: false,
            anteriorPeso: s.peso,
            anteriorReps: s.repeticoes,
            pesoAlvo: null,
            repMin: null,
            repMax: null,
            prPeso: false,
            prPesoDelta: null,
            pr1rm: false,
            pr1rmDelta: null,
            prVolume: false,
            prVolumeDelta: null,
          }));
          return {
            treino_exercicio_id: `copia-${ex.exercicioId}-${Date.now()}`,
            exercicio_id: ex.exercicioId,
            nome: ex.exercicioNome,
            descanso_seg: null,
            observacao: null,
            sets,
            descansoAte: null,
            descansoInicioEm: null,
            descansoNotificado: false,
            recordes,
          };
        }),
      );
      treinoLogSessao.iniciar({
        treinoId,
        nomeTreino: treinoNome,
        inicio: Date.now(),
        sessao: novaSessao,
        houveAlteracaoEstrutura: false,
      });
      navigate(`/treino/log/${treinoId}`);
    } catch (e) {
      alert("Erro ao copiar treinamento: " + (e as Error).message);
    } finally {
      copiando = false;
    }
  }

  async function excluirTreinamento() {
    excluindo = true;
    try {
      await excluirRegistrosDoDia(treinoId, data);
      voltar("/treino/historico");
    } catch (e) {
      alert("Erro ao excluir: " + (e as Error).message);
      excluindo = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMenu()}
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
{/snippet}
{#snippet iconSalvarRotina()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
{/snippet}
{#snippet iconCopiar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
{/snippet}
{#snippet iconEditar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/historico")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{treinoNome}</h1>
    {#if modoEdicao}
      <button class="salvar" disabled={salvando || loading} onclick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
    {:else}
      <button class="menu-btn" disabled={loading || !sessao.length} onclick={() => (menuAberto = true)} aria-label="Mais opções">
        {@render iconMenu()}
      </button>
    {/if}
  </div>
  <p class="data-label">{dataLabel}</p>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !sessao.length}
    <p class="muted">Nenhum registro encontrado para esse dia.</p>
  {:else if modoEdicao}
    {#if salvo}
      <p class="aviso-salvo">Alterações salvas.</p>
    {/if}
    {#each sessao as ex, exIdx (ex.exercicioId)}
      <div class="exercicio-card">
        <h2>{ex.exercicioNome}</h2>
        <div class="tabela">
          <div class="linha cabecalho">
            <span>Série</span>
            <span>Kg</span>
            <span>Reps</span>
            <span></span>
          </div>
          {#each ex.sets as serieItem, setIdx (setIdx)}
            <div class="linha">
              <span class="serie-num">{serieItem.serie}</span>
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serieItem.peso} />
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serieItem.repeticoes} />
              <button class="remover" onclick={() => removerSerie(exIdx, setIdx)} aria-label="Remover série">✕</button>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(exIdx)}>+ Adicionar Série</button>
      </div>
    {/each}
  {:else}
    {#each sessao as ex (ex.exercicioId)}
      <div class="sessao-card">
        <h2 class="sessao-nome">{ex.exercicioNome}</h2>
        <div class="sessao-tabela">
          <div class="sessao-linha sessao-cabecalho">
            <span>Série</span>
            <span>Peso &amp; Repetições</span>
          </div>
          {#each ex.sets as s (s.serie)}
            <div class="sessao-linha">
              <span class="sessao-serie">{s.serie}</span>
              <span>{s.peso != null && s.repeticoes != null ? `${s.peso} kg x ${s.repeticoes}` : "—"}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if menuAberto}
  <ActionSheet
    onFechar={() => (menuAberto = false)}
    opcoes={[
      { label: "Salvar como Rotina", icon: iconSalvarRotina, onSelect: abrirSalvarComoRotina },
      { label: "Copiar Treinamento", icon: iconCopiar, disabled: copiando, onSelect: copiarTreinamento },
      { label: "Editar Treinamento", icon: iconEditar, onSelect: abrirEditar },
      { label: "Deletar Treinamento", icon: iconExcluir, destructive: true, onSelect: () => (mostrarConfirmarExcluir = true) },
    ]}
  />
{/if}

{#if mostrarNomearRotina}
  <Sheet titulo="Salvar como rotina" onFechar={() => (mostrarNomearRotina = false)}>
    <input class="nome-input" type="text" placeholder="Nome da rotina" bind:value={nomeRotina} />
    <Button onclick={confirmarSalvarComoRotina} disabled={salvandoRotina || !nomeRotina.trim()}>
      {salvandoRotina ? "Salvando…" : "Salvar"}
    </Button>
  </Sheet>
{/if}

{#if mostrarConfirmarExcluir}
  <ConfirmDialog
    titulo="Tem certeza de que quer deletar todos os registros desse treino?"
    textoConfirmar="Deletar Treinamento"
    onConfirmar={excluirTreinamento}
    onCancelar={() => (mostrarConfirmarExcluir = false)}
  />
{/if}

<style>
  .container {
    max-width: 520px;
    margin: 0 auto;
    padding-top: var(--space-4);
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .header h1 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .menu-btn {
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
  .menu-btn svg {
    width: 18px;
    height: 18px;
  }
  .menu-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .salvar {
    flex-shrink: 0;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .salvar:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .data-label {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: var(--space-1) 0 var(--space-4);
    text-transform: capitalize;
  }
  .aviso-salvo {
    text-align: center;
    color: var(--color-success);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-3);
  }
  .exercicio-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-5);
  }
  .exercicio-card h2 {
    font-size: var(--font-size-base);
    color: var(--color-primary);
    margin: 0 0 var(--space-2);
  }
  .tabela {
    display: flex;
    flex-direction: column;
  }
  .linha {
    display: grid;
    grid-template-columns: 36px 1fr 1fr 32px;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
  }
  .linha.cabecalho {
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
  }
  .serie-num {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: var(--surface-card);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
  }
  .linha input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2);
    border-radius: 6px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .remover {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .add-serie {
    width: 100%;
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .sessao-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-4);
  }
  .sessao-nome {
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--color-primary);
    margin: 0 0 var(--space-3);
  }
  .sessao-tabela {
    display: flex;
    flex-direction: column;
  }
  .sessao-linha {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }
  .sessao-cabecalho {
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
  }
  .sessao-serie {
    font-weight: 600;
  }
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-3);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
