<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { hojeISO } from "../lib/dates";
  import { getLayoutHome, type HomeCardTipo } from "../lib/homeApi";
  import { getUltimoPeso, getPesoMedioAtual, getDiasParaObjetivo } from "../lib/pesoApi";
  import { listTreinos, type TreinoComExercicios } from "../lib/treinoApi";
  import { getMetasDoDia, getDiarioDoDia, garantirRefeicoesPadraoDoDia, type RefeicaoDia, type ItemDiario } from "../lib/dietaApi";
  import CardPesoAtual from "./home/CardPesoAtual.svelte";
  import CardProximoTreino from "./home/CardProximoTreino.svelte";
  import CardCaloriasDia from "./home/CardCaloriasDia.svelte";
  import CardRefeicoesDia from "./home/CardRefeicoesDia.svelte";

  let layout = $state<HomeCardTipo[]>([]);
  let loading = $state(true);
  let erro = $state<string | null>(null);

  let pesoAtualVal = $state<number | null>(null);
  let pesoMediaVal = $state<number | null>(null);
  let diasObjetivoVal = $state<number | null>(null);
  let treinoHoje = $state<TreinoComExercicios | null>(null);
  let caloriasMeta = $state(0);
  let caloriasConsumido = $state(0);
  let refeicoesDiaVal = $state<RefeicaoDia[]>([]);
  let itensDiaVal = $state<ItemDiario[]>([]);

  /** Busca tudo de uma vez (só as chamadas dos módulos cujos cards estão ativos) e só então libera
   * a tela — evita a Início montar aos pedaços (um card aparecendo antes do outro). */
  async function carregar() {
    loading = true;
    erro = null;
    try {
      const tipos = await getLayoutHome();
      const hoje = hojeISO();
      const diaSemanaHoje = new Date().getDay();
      const precisaDieta = tipos.includes("calorias_dia") || tipos.includes("refeicoes_dia");

      const [pesoAtual, pesoMedia, diasObjetivo, treinos, metasDia, itensDia, refeicoesDia] = await Promise.all([
        tipos.includes("peso_atual") ? getUltimoPeso() : Promise.resolve(null),
        tipos.includes("peso_atual") ? getPesoMedioAtual() : Promise.resolve(null),
        tipos.includes("peso_atual") ? getDiasParaObjetivo() : Promise.resolve(null),
        tipos.includes("proximo_treino") ? listTreinos() : Promise.resolve([]),
        precisaDieta ? getMetasDoDia(hoje) : Promise.resolve(null),
        precisaDieta ? getDiarioDoDia(hoje) : Promise.resolve([]),
        tipos.includes("refeicoes_dia") ? garantirRefeicoesPadraoDoDia(hoje) : Promise.resolve([]),
      ]);

      pesoAtualVal = pesoAtual;
      pesoMediaVal = pesoMedia;
      diasObjetivoVal = diasObjetivo;
      treinoHoje = treinos.find((t) => t.dia_semana === diaSemanaHoje) ?? null;
      caloriasMeta = metasDia?.calorias ?? 0;
      caloriasConsumido = itensDia.reduce((acc, i) => acc + i.calorias, 0);
      refeicoesDiaVal = refeicoesDia;
      itensDiaVal = itensDia;
      layout = tipos;
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  function abrirConfiguracao() {
    navigate("/inicio/configurar");
  }
</script>

{#snippet iconEngrenagem()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Início</h1>
    <button class="icon-btn" onclick={abrirConfiguracao} aria-label="Configurar cards da Início">
      {@render iconEngrenagem()}
    </button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar a Início: {erro}</p>
  {:else if !layout.length}
    <p class="muted">Nenhum card selecionado. Toque na engrenagem pra adicionar.</p>
  {:else}
    {#each layout as tipo (tipo)}
      {#if tipo === "peso_atual"}
        <CardPesoAtual pesoAtual={pesoAtualVal} media={pesoMediaVal} diasObjetivo={diasObjetivoVal} />
      {:else if tipo === "proximo_treino"}
        <CardProximoTreino treino={treinoHoje} />
      {:else if tipo === "calorias_dia"}
        <CardCaloriasDia consumido={caloriasConsumido} meta={caloriasMeta} />
      {:else if tipo === "refeicoes_dia"}
        <CardRefeicoesDia refeicoes={refeicoesDiaVal} itens={itensDiaVal} />
      {/if}
    {/each}
  {/if}
</div>

<style>
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .icon-btn svg {
    width: 22px;
    height: 22px;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
