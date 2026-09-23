<script lang="ts">
  import { navigate, router } from "../lib/router.svelte";
  import { hojeISO } from "../lib/dates";
  import { getLayoutHome, type HomeCardTipo } from "../lib/homeApi";
  import { getUltimoPeso, getPesoMedioAtual, getMeta, getMetaSemanal } from "../lib/pesoApi";
  import {
    listTreinos,
    getTreinosEfetivosDoDia,
    listOverrideSemana,
    segundaDaSemana,
    statusSemanalDoTreino,
    type TreinoComExercicios,
    type StatusSemanalTreino,
  } from "../lib/treinoApi";
  import {
    getMetasDoDia,
    getDiarioDoDia,
    garantirRefeicoesPadraoDoDia,
    getParametros,
    getPerfilDietaEditavel,
    DEFINICOES_PARAMETROS,
    PARAMETROS_PADRAO,
    gramasDoParametro,
    type RefeicaoDia,
    type ItemDiario,
    type LimiteParametro,
  } from "../lib/dietaApi";
  import CardPesoAtual from "./home/CardPesoAtual.svelte";
  import CardProximoTreino from "./home/CardProximoTreino.svelte";
  import CardCaloriasDia from "./home/CardCaloriasDia.svelte";
  import CardRefeicoesDia from "./home/CardRefeicoesDia.svelte";
  import CardFadigaMuscular from "./home/CardFadigaMuscular.svelte";

  let layout = $state<HomeCardTipo[]>([]);
  let loading = $state(true);
  let erro = $state<string | null>(null);

  let pesoAtualVal = $state<number | null>(null);
  let pesoMediaVal = $state<number | null>(null);
  let metaSemanalVal = $state<number | null>(null);
  let pesoAlvoVal = $state<number | null>(null);
  let treinosHoje = $state<TreinoComExercicios[]>([]);
  /** Rotinas cujo dia FIXO é hoje, mas que essa semana foram reagendadas pra outro dia ou
   * canceladas — mostradas como card "fantasma" (ver CardProximoTreino) pra dar como reverter. */
  let fantasmasHoje = $state<{ treino: TreinoComExercicios; status: StatusSemanalTreino }[]>([]);
  let caloriasMeta = $state(0);
  let caloriasConsumido = $state(0);
  let proteinaMetaVal = $state(0);
  let proteinaConsumidoVal = $state(0);
  let gorduraMetaVal = $state(0);
  let gorduraConsumidoVal = $state(0);
  let carboidratoMetaVal = $state(0);
  let carboidratoConsumidoVal = $state(0);
  let fibraMetaVal = $state(0);
  let fibraConsumidoVal = $state(0);
  let gorduraSaturadaMetaVal = $state(0);
  let gorduraSaturadaConsumidoVal = $state(0);
  let pesoParaMacrosVal = $state(0);
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
      const precisaDieta = tipos.includes("calorias_dia") || tipos.includes("refeicoes_dia");

      const precisaPeso = tipos.includes("peso_atual") || precisaDieta;

      const [pesoAtual, pesoMedia, meta, metaSemanal, treinos, metasDia, itensDia, refeicoesDia, parametrosDieta, perfilDieta] =
        await Promise.all([
          tipos.includes("peso_atual") ? getUltimoPeso() : Promise.resolve(null),
          precisaPeso ? getPesoMedioAtual() : Promise.resolve(null),
          tipos.includes("peso_atual") ? getMeta() : Promise.resolve(null),
          tipos.includes("peso_atual") ? getMetaSemanal() : Promise.resolve(null),
          tipos.includes("proximo_treino") ? listTreinos() : Promise.resolve([]),
          precisaDieta ? getMetasDoDia(hoje) : Promise.resolve(null),
          precisaDieta ? getDiarioDoDia(hoje) : Promise.resolve([]),
          tipos.includes("refeicoes_dia") ? garantirRefeicoesPadraoDoDia(hoje) : Promise.resolve([]),
          precisaDieta ? getParametros() : Promise.resolve(new Map<string, LimiteParametro>(Object.entries(PARAMETROS_PADRAO))),
          precisaDieta ? getPerfilDietaEditavel() : Promise.resolve(null),
        ]);

      pesoAtualVal = pesoAtual;
      pesoMediaVal = pesoMedia;
      metaSemanalVal = metaSemanal;
      pesoAlvoVal = meta?.pesoAlvo ?? null;
      if (tipos.includes("proximo_treino")) {
        const diaSemanaHoje = new Date().getDay();
        const overridesSemana = await listOverrideSemana(segundaDaSemana(hoje));
        treinosHoje = await getTreinosEfetivosDoDia(hoje, treinos, overridesSemana);
        fantasmasHoje = treinos
          .filter((t) => t.dia_semana === diaSemanaHoje)
          .map((t) => ({ treino: t, status: statusSemanalDoTreino(t, overridesSemana) }))
          .filter((f) => f.status.tipo !== "normal");
      } else {
        treinosHoje = [];
        fantasmasHoje = [];
      }
      caloriasMeta = metasDia?.calorias ?? 0;
      caloriasConsumido = itensDia.reduce((acc, i) => acc + i.calorias, 0);
      proteinaMetaVal = metasDia?.proteinaG ?? 0;
      proteinaConsumidoVal = itensDia.reduce((acc, i) => acc + i.proteinaG, 0);
      gorduraMetaVal = metasDia?.gorduraG ?? 0;
      gorduraConsumidoVal = itensDia.reduce((acc, i) => acc + i.gorduraG, 0);
      carboidratoMetaVal = metasDia?.carboidratoG ?? 0;
      carboidratoConsumidoVal = itensDia.reduce((acc, i) => acc + i.carboidratoG, 0);
      fibraConsumidoVal = itensDia.reduce((acc, i) => acc + i.fibraG, 0);
      gorduraSaturadaConsumidoVal = itensDia.reduce((acc, i) => acc + i.gorduraSaturadaG, 0);
      pesoParaMacrosVal = pesoMedia ?? perfilDieta?.pesoAtual ?? 0;
      if (metasDia) {
        const pesoParaMacros = pesoParaMacrosVal || 76;
        const defParametro = new Map(DEFINICOES_PARAMETROS.map((d) => [d.chave, d]));
        const parametroEfetivo = (chave: string): LimiteParametro => parametrosDieta.get(chave) ?? PARAMETROS_PADRAO[chave];
        fibraMetaVal = Math.round(gramasDoParametro(defParametro.get("fibras")!, parametroEfetivo("fibras").max, pesoParaMacros, metasDia.calorias));
        gorduraSaturadaMetaVal = Math.round(
          gramasDoParametro(defParametro.get("gordura_saturada")!, parametroEfetivo("gordura_saturada").max, pesoParaMacros, metasDia.calorias),
        );
      } else {
        fibraMetaVal = 0;
        gorduraSaturadaMetaVal = 0;
      }
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

  /** A Início fica sempre montada (só escondida via `hidden`) pra trocar de aba sem refetch — mas
   * isso significa que voltar de "Cards da Início" com uma ordem/seleção nova não recarrega `layout`
   * sozinho. Recarrega só nessa transição específica (configurar → home), não em toda troca de aba. */
  let veioDeConfigurar = false;
  $effect(() => {
    if (router.path === "/inicio/configurar") {
      veioDeConfigurar = true;
    } else if (router.path === "/" && veioDeConfigurar) {
      veioDeConfigurar = false;
      void carregar();
    }
  });

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
        <CardPesoAtual pesoAtual={pesoAtualVal} media={pesoMediaVal} metaSemanal={metaSemanalVal} pesoAlvo={pesoAlvoVal} />
      {:else if tipo === "proximo_treino"}
        <CardProximoTreino treinos={treinosHoje} fantasmas={fantasmasHoje} data={hojeISO()} onMudou={carregar} />
      {:else if tipo === "calorias_dia"}
        <CardCaloriasDia
          caloriasConsumido={caloriasConsumido}
          caloriasMeta={caloriasMeta}
          proteinaConsumido={proteinaConsumidoVal}
          proteinaMeta={proteinaMetaVal}
          gorduraConsumido={gorduraConsumidoVal}
          gorduraMeta={gorduraMetaVal}
          carboidratoConsumido={carboidratoConsumidoVal}
          carboidratoMeta={carboidratoMetaVal}
          fibraConsumido={fibraConsumidoVal}
          fibraMeta={fibraMetaVal}
          gorduraSaturadaConsumido={gorduraSaturadaConsumidoVal}
          gorduraSaturadaMeta={gorduraSaturadaMetaVal}
          pesoAtual={pesoParaMacrosVal}
        />
      {:else if tipo === "refeicoes_dia"}
        <CardRefeicoesDia refeicoes={refeicoesDiaVal} itens={itensDiaVal} />
      {:else if tipo === "fadiga_muscular"}
        <CardFadigaMuscular />
      {/if}
    {/each}
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
