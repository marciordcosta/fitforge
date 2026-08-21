<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import {
    getExercicio,
    updateExercicio,
    deleteExercicio,
    construirMusculosInput,
    findOrCreatePadraoMovimento,
    getHistoricoDetalhadoExercicio,
    type Exercicio,
    type SessaoHistorico,
    type LinhaMusculoInput,
  } from "../../lib/treinoApi";
  import ExercicioChart from "./ExercicioChart.svelte";
  import ExercicioCampos from "./ExercicioCampos.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";

  let { exercicioId }: { exercicioId: string } = $props();

  type Aba = "resumo" | "historico" | "edicao";
  let aba = $state<Aba>("resumo");

  let exercicio = $state<Exercicio | null>(null);
  let historico = $state<SessaoHistorico[]>([]);
  let loading = $state(true);
  let carregouHistorico = $state(false);

  let nome = $state("");
  let padraoNome = $state("");
  let linhasMusculos = $state<LinhaMusculoInput[]>([{ nome: "", peso: 1 }]);
  let salvando = $state(false);
  let mostrarConfirmExcluir = $state(false);

  async function carregar() {
    loading = true;
    exercicio = await getExercicio(exercicioId);
    if (exercicio) {
      nome = exercicio.nome;
      padraoNome = exercicio.padrao?.nome ?? "";
      linhasMusculos = exercicio.musculos.length
        ? exercicio.musculos.map((m) => ({ nome: m.musculo?.nome ?? "", peso: m.peso_contribuicao }))
        : [{ nome: "", peso: 1 }];
    }
    loading = false;
  }

  void carregar();

  async function abrirHistorico() {
    aba = "historico";
    if (carregouHistorico) return;
    carregouHistorico = true;
    historico = await getHistoricoDetalhadoExercicio(exercicioId);
  }

  function formatDataHora(iso: string): string {
    const d = new Date(iso);
    const dataStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dataStr}, ${horaStr}`;
  }

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do exercício.");
      return;
    }
    const musculosInput = await construirMusculosInput(linhasMusculos);
    if (!musculosInput.length) {
      alert("Informe ao menos um músculo envolvido.");
      return;
    }
    salvando = true;
    try {
      const padrao = padraoNome.trim() ? await findOrCreatePadraoMovimento(padraoNome) : null;
      await updateExercicio(exercicioId, {
        nome: nome.trim(),
        padrao_id: padrao?.id ?? null,
        musculos: musculosInput,
      });
      await carregar();
      aba = "resumo";
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function excluir() {
    mostrarConfirmExcluir = false;
    await deleteExercicio(exercicioId);
    navigate("/treino/exercicios");
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
    <h1>{exercicio?.nome ?? ""}</h1>
    {#if aba === "edicao"}
      <button class="atualizar" disabled={salvando} onclick={salvar}>Atualizar</button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </div>

  <div class="tabs">
    <button class:active={aba === "resumo"} onclick={() => (aba = "resumo")}>Resumo</button>
    <button class:active={aba === "historico"} onclick={abrirHistorico}>Histórico</button>
    <button class:active={aba === "edicao"} onclick={() => (aba = "edicao")}>Edição</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !exercicio}
    <p class="muted">Exercício não encontrado.</p>
  {:else if aba === "resumo"}
    <p class="musculos">
      <strong>Músculos:</strong>
      {exercicio.musculos
        .slice()
        .sort((a, b) => b.peso_contribuicao - a.peso_contribuicao)
        .map((m) => `${m.musculo?.nome} (${m.peso_contribuicao})`)
        .join(", ")}
    </p>
    <ExercicioChart {exercicioId} />
  {:else if aba === "historico"}
    {#if !historico.length}
      <p class="muted">Nenhum registro ainda.</p>
    {:else}
      {#each historico as sessao (sessao.treinoNome + sessao.data)}
        <div class="sessao-card">
          <div class="sessao-header">
            <strong>{sessao.treinoNome || "Treino avulso"}</strong>
            <span class="sessao-data">{formatDataHora(sessao.criadoEm)}</span>
          </div>
          <div class="sessao-tabela">
            <div class="sessao-linha sessao-cabecalho">
              <span>Série</span>
              <span>Peso &amp; Repetições</span>
            </div>
            {#each sessao.sets as s (s.serie)}
              <div class="sessao-linha">
                <span class="sessao-serie">{s.serie}</span>
                <span>{s.peso != null && s.repeticoes != null ? `${s.peso} kg x ${s.repeticoes}` : "—"}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {:else if aba === "edicao"}
    <ExercicioCampos bind:nome bind:padraoNome bind:linhasMusculos />
    <button class="excluir-btn" onclick={() => (mostrarConfirmExcluir = true)}>Excluir Exercício</button>
  {/if}
</div>

{#if mostrarConfirmExcluir}
  <ConfirmDialog
    titulo="Tem certeza de que quer excluir este exercício?"
    textoConfirmar="Excluir Exercício"
    onConfirmar={excluir}
    onCancelar={() => (mostrarConfirmExcluir = false)}
  />
{/if}

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
    margin-bottom: var(--space-4);
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
  .header-spacer {
    width: 40px;
    flex-shrink: 0;
  }
  .back,
  .atualizar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--surface-border);
    margin-bottom: var(--space-4);
  }
  .tabs button {
    flex: 1;
    padding: var(--space-3);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }
  .musculos {
    color: var(--surface-muted);
    margin: 0 0 var(--space-4);
  }
  .sessao-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-4);
  }
  .sessao-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
    gap: var(--space-2);
  }
  .sessao-data {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    flex-shrink: 0;
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
  .excluir-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-danger);
    background: none;
    color: var(--color-danger);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
