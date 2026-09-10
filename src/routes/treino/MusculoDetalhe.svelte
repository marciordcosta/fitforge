<script lang="ts">
  import { navigate, voltar } from "../../lib/router.svelte";
  import {
    getMusculo,
    updateMusculo,
    deleteMusculo,
    listAgrupamentosMusculares,
    listExercicios,
    type AgrupamentoMuscular,
    type Exercicio,
  } from "../../lib/treinoApi";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";

  let { musculoId }: { musculoId: string } = $props();

  let nome = $state("");
  let agrupamentoId = $state("");
  let seriesMinimas = $state("");
  let encontrado = $state(true);
  let loading = $state(true);
  let salvando = $state(false);
  let mostrarConfirmExcluir = $state(false);

  let agrupamentos = $state<AgrupamentoMuscular[]>([]);
  let mostrarAgrupamentoPicker = $state(false);
  let exercicios = $state<Exercicio[]>([]);

  async function carregar() {
    loading = true;
    const [musculo, listaAgrupamentos, listaExercicios] = await Promise.all([
      getMusculo(musculoId),
      listAgrupamentosMusculares(),
      listExercicios(),
    ]);
    agrupamentos = listaAgrupamentos;
    exercicios = listaExercicios;
    if (musculo) {
      nome = musculo.nome;
      agrupamentoId = musculo.agrupamento_id ?? "";
      seriesMinimas = musculo.series_minimas != null ? String(musculo.series_minimas) : "";
    } else {
      encontrado = false;
    }
    loading = false;
  }

  void carregar();

  const exerciciosDoMusculo = $derived.by(() =>
    exercicios
      .map((ex) => ({ ex, pct: (ex.musculos.find((m) => m.musculo_id === musculoId)?.peso_contribuicao ?? 0) * 100 }))
      .filter((item) => item.pct > 0)
      .sort((a, b) => b.pct - a.pct),
  );

  const opcoesAgrupamento = $derived([
    { valor: "", label: "Nenhum" },
    ...agrupamentos
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((a) => ({ valor: a.id, label: a.nome })),
  ]);

  async function salvar() {
    if (!nome.trim()) {
      alert("Informe o nome do músculo.");
      return;
    }
    salvando = true;
    try {
      const seriesMinimasNum = seriesMinimas.trim() ? Number(seriesMinimas) : null;
      await updateMusculo(musculoId, nome, agrupamentoId || null, seriesMinimasNum);
      voltar("/treino/musculos");
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function excluir() {
    mostrarConfirmExcluir = false;
    try {
      await deleteMusculo(musculoId);
      navigate("/treino/musculos");
    } catch (e) {
      alert("Erro ao excluir: " + (e as Error).message);
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino/musculos")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>{nome || "Músculo"}</h1>
    <button class="atualizar" disabled={salvando} onclick={salvar} aria-label="Atualizar">{@render iconCheck()}</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if !encontrado}
    <p class="muted">Músculo não encontrado.</p>
  {:else}
    <label class="field">
      <span>Nome</span>
      <input type="text" bind:value={nome} placeholder="Ex: Deltoide Posterior" />
    </label>

    <div class="field">
      <span>Agrupamento (opcional)</span>
      <button type="button" class="select-btn" onclick={() => (mostrarAgrupamentoPicker = true)}>
        {agrupamentos.find((a) => a.id === agrupamentoId)?.nome ?? "Nenhum"}
      </button>
    </div>

    <label class="field">
      <span>Séries mínimas (opcional)</span>
      <input type="number" inputmode="numeric" min="0" step="1" placeholder="Usa o mínimo geral de Parametrização" bind:value={seriesMinimas} />
    </label>

    {#if exerciciosDoMusculo.length}
      <div class="field">
        <span>Exercícios que trabalham esse músculo</span>
        <ul class="lista-exercicios">
          {#each exerciciosDoMusculo as item (item.ex.id)}
            <li>
              <button type="button" class="exercicio-item" onclick={() => navigate(`/treino/exercicios/${item.ex.id}`)}>
                <span class="exercicio-nome">{item.ex.nome}</span>
                <div
                  class="exercicio-anel"
                  style={`background: conic-gradient(var(--color-primary) 0% ${item.pct}%, var(--surface-border) ${item.pct}% 100%);`}
                >
                  <div class="exercicio-anel-centro">{item.pct.toFixed(0)}%</div>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <button class="excluir-btn" onclick={() => (mostrarConfirmExcluir = true)}>Excluir Músculo</button>
  {/if}
</div>

{#if mostrarAgrupamentoPicker}
  <WheelPicker
    titulo="Agrupamento"
    opcoes={opcoesAgrupamento}
    valorAtual={agrupamentoId}
    onSelecionar={(v) => (agrupamentoId = v)}
    onFechar={() => (mostrarAgrupamentoPicker = false)}
  />
{/if}

{#if mostrarConfirmExcluir}
  <ConfirmDialog
    titulo="Excluir esse músculo remove ele de todos os exercícios e movimentos que o usam. Tem certeza?"
    textoConfirmar="Excluir Músculo"
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
  .atualizar {
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
  .atualizar svg {
    width: 18px;
    height: 18px;
  }
  .atualizar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
  .field > span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .field input,
  .select-btn {
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
  }
  .select-btn {
    width: 100%;
    text-align: left;
    cursor: pointer;
  }
  .lista-exercicios {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .exercicio-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    cursor: pointer;
    text-align: left;
  }
  .exercicio-nome {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .exercicio-anel {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 50%;
  }
  .exercicio-anel-centro {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--surface-card);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--surface-fg);
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
