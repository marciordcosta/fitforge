<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import { toISODate, hojeISO } from "../../lib/dates";
  import TreinoAjusteDiaFluxo from "../../components/TreinoAjusteDiaFluxo.svelte";
  import TreinoMudarDiaSheet from "./TreinoMudarDiaSheet.svelte";
  import { treinoLogSessao } from "../../lib/treinoLogSessao.svelte";
  import {
    listTreinos,
    listMusculos,
    getRegistrosPorTreinoPeriodo,
    getParametrosDistribuicao,
    listOverrideSemana,
    segundaDaSemana,
    statusSemanalDoTreino,
    moverTreinoParaDia,
    DIAS_SEMANA_COMPLETO,
    PARAMETROS_DISTRIBUICAO_PADRAO,
    type TreinoComExercicios,
    type StatusSemanalTreino,
    type Musculo,
    type ParametrosDistribuicao,
  } from "../../lib/treinoApi";
  import { partesFadigaSemanal, partesParaSegmentos, CORES_FAIXA } from "../../lib/fadiga";

  let treinos = $state<TreinoComExercicios[]>([]);
  let parametrosDistribuicao = $state<ParametrosDistribuicao>(PARAMETROS_DISTRIBUICAO_PADRAO);
  let loading = $state(true);
  let erroCarregar = $state<string | null>(null);
  let musculos = $state<Musculo[]>([]);
  let seriesPorTreino = $state<Map<string, number>>(new Map());
  let feitoPorMusculoSalvo = $state<Map<string, number>>(new Map());
  /** exercicio_id -> músculos trabalhados com seu peso_contribuicao — pra cruzar registros salvos
   * e a sessão ao vivo com músculos, ponderando cada série pelo peso configurado no exercício
   * (mesmo critério da coluna "Pond." da Distribuição Semanal). */
  let musculosPorExercicio = $state<Map<string, { musculo_id: string; peso: number }[]>>(new Map());
  let modoRestante = $state(true);
  let mostrarMenuNovo = $state(false);
  let mostrarMudarDiaDireto = $state(false);
  /** Status de cada rotina PRA ESSA SEMANA (normal/reagendado/cancelado — ver statusSemanalDoTreino
   * em treinoApi.ts). Usado pra ordenar a lista, rotular o card com "Reagendado para X"/"Cancelado
   * essa semana" e decidir se mostra o fluxo "Não vai treinar hoje?". */
  let statusPorTreino = $state<Map<string, StatusSemanalTreino>>(new Map());
  let revertendo = $state<string | null>(null);
  /** Id da rotina escolhida como destacada nessa carga (ver escolherDestacada) — o template usa
   * isso, e não só "i === 0", pra não destacar por acidente a primeira rotina sem dia nenhum
   * quando nenhuma rotina tem slot pra hoje. */
  let destacadaId = $state<string | null>(null);
  /** Rotinas com registro salvo HOJE (a única forma de gravar treino_registros é concluindo o
   * treino em TreinoLog.svelte) — usado pra trocar "Iniciar Rotina" por "Concluído" no card
   * destacado. */
  let concluidosHoje = $state<Set<string>>(new Set());
  const hojeSemana = new Date().getDay();
  /** Ação pendente de confirmação no card destacado: reabrir uma rotina já concluída hoje, ou
   * iniciar a "próxima rotina" (que não é a de hoje) antes da hora. */
  let acaoConfirmacao = $state<{ tipo: "reiniciar" | "iniciar"; treino: TreinoComExercicios } | null>(null);

  function diaEfetivoDeStatus(treino: TreinoComExercicios, status: StatusSemanalTreino): number | null {
    if (status.tipo === "reagendado") return status.novoDia;
    if (status.tipo === "cancelado") return null;
    return treino.dia_semana;
  }

  /** Qual rotina ocupa o card grande do topo. Fica fixa o dia todo: concluir ou cancelar a rotina
   * de hoje não entrega o slot pra outra (nem no modo "Por rotina pendente") — só troca se outra
   * rotina passar a ter hoje como dia efetivo (reagendada PRA hoje). Sem nada com dia efetivo
   * hoje, prioriza a rotina cujo dia FIXO é hoje mas foi tocada essa semana (reagendada ou
   * cancelada), pra manter o status visível no topo; por último cai pra próxima rotina futura. */
  function escolherDestacada(
    lista: TreinoComExercicios[],
    diaEfetivo: Map<string, number | null>,
    status: Map<string, StatusSemanalTreino>,
  ): TreinoComExercicios | null {
    const deHoje = lista.find((t) => diaEfetivo.get(t.id) === hojeSemana);
    if (deHoje) return deHoje;
    const tocadaHoje = lista.find((t) => t.dia_semana === hojeSemana && status.get(t.id)?.tipo !== "normal");
    if (tocadaHoje) return tocadaHoje;
    const comDia = lista.filter((t) => diaEfetivo.get(t.id) != null);
    return comDia.length ? ordenarPorDia(comDia, diaEfetivo)[0] : null;
  }

  async function reverter(treino: TreinoComExercicios): Promise<void> {
    if (treino.dia_semana == null) return;
    revertendo = treino.id;
    try {
      await moverTreinoParaDia(treino.id, treino.dia_semana, hojeISO());
      await carregar();
    } catch (err) {
      alert("Erro ao reverter: " + (err as Error).message);
    } finally {
      revertendo = null;
    }
  }

  function confirmarAcao(): void {
    const acao = acaoConfirmacao;
    acaoConfirmacao = null;
    if (!acao) return;
    navigate(`/treino/log/${acao.treino.id}`);
  }

  /** Rotinas com dia efetivo essa semana sobem pro topo, ordenadas pelo dia mais próximo; sem dia
   * essa semana, mantém a ordenação manual. */
  function ordenarPorDia(lista: TreinoComExercicios[], diaEfetivo: Map<string, number | null>): TreinoComExercicios[] {
    const hoje = new Date().getDay();
    const comDia = lista
      .filter((t) => diaEfetivo.get(t.id) != null)
      .sort((a, b) => ((diaEfetivo.get(a.id)! - hoje + 7) % 7) - ((diaEfetivo.get(b.id)! - hoje + 7) % 7));
    const semDia = lista.filter((t) => diaEfetivo.get(t.id) == null);
    return [...comDia, ...semDia];
  }

  /** Parametrização "Por rotina pendente": pula rotinas já executadas essa semana (têm série
   * registrada de segunda até hoje) e sobe a próxima ainda não feita, mesmo que o dia dela não
   * seja o mais próximo — só depois delas voltam as já feitas, ambas na ordem de dia mais próximo
   * entre si. Sem dia efetivo essa semana, entram por último, na ordem manual. */
  function ordenarPorPendente(
    lista: TreinoComExercicios[],
    feitas: Map<string, number>,
    diaEfetivo: Map<string, number | null>,
  ): TreinoComExercicios[] {
    const porDia = ordenarPorDia(lista.filter((t) => diaEfetivo.get(t.id) != null), diaEfetivo);
    const semDia = lista.filter((t) => diaEfetivo.get(t.id) == null);
    const pendentes = porDia.filter((t) => !feitas.has(t.id));
    const jaFeitas = porDia.filter((t) => feitas.has(t.id));
    return [...pendentes, ...jaFeitas, ...semDia];
  }

  /** Semana ancorada em segunda-feira (exceção — o resto do app usa terça, ver inicioSemana em dates.ts), só pros cards de progresso semanal de treino. */
  function segundaISO(): string {
    const hoje = new Date();
    const delta = (hoje.getDay() + 6) % 7;
    return toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - delta));
  }

  async function carregar() {
    loading = true;
    erroCarregar = null;
    try {
      const [treinosCarregados, musculosCarregados, registros, parametros, overridesSemana] = await Promise.all([
        listTreinos(),
        listMusculos(),
        getRegistrosPorTreinoPeriodo(segundaISO(), hojeISO()),
        getParametrosDistribuicao(),
        listOverrideSemana(segundaDaSemana(hojeISO())),
      ]);
      musculos = musculosCarregados;
      statusPorTreino = new Map(treinosCarregados.map((t) => [t.id, statusSemanalDoTreino(t, overridesSemana)]));
      const diaEfetivoPorTreino = new Map(
        treinosCarregados.map((t) => [t.id, diaEfetivoDeStatus(t, statusPorTreino.get(t.id)!)]),
      );
      parametrosDistribuicao = parametros;

      const mapaMusculos = new Map<string, { musculo_id: string; peso: number }[]>();
      for (const t of treinosCarregados) {
        for (const ex of t.exercicios) {
          if (!mapaMusculos.has(ex.exercicio_id)) {
            mapaMusculos.set(
              ex.exercicio_id,
              (ex.exercicio?.musculos ?? []).map((m) => ({ musculo_id: m.musculo_id, peso: m.peso_contribuicao })),
            );
          }
        }
      }
      musculosPorExercicio = mapaMusculos;

      const mapaSeriesPorTreino = new Map<string, number>();
      const mapaFeito = new Map<string, number>();
      const hoje = hojeISO();
      const concluidos = new Set<string>();
      for (const r of registros) {
        if (r.treino_id) {
          mapaSeriesPorTreino.set(r.treino_id, (mapaSeriesPorTreino.get(r.treino_id) ?? 0) + 1);
          if (r.data === hoje) concluidos.add(r.treino_id);
        }
        for (const m of mapaMusculos.get(r.exercicio_id) ?? []) {
          mapaFeito.set(m.musculo_id, (mapaFeito.get(m.musculo_id) ?? 0) + m.peso);
        }
      }
      seriesPorTreino = mapaSeriesPorTreino;
      feitoPorMusculoSalvo = mapaFeito;
      concluidosHoje = concluidos;

      const destacadaEscolhida = escolherDestacada(treinosCarregados, diaEfetivoPorTreino, statusPorTreino);
      destacadaId = destacadaEscolhida?.id ?? null;
      const resto = treinosCarregados.filter((t) => t.id !== destacadaEscolhida?.id);
      const restoOrdenado =
        parametros.ordenacaoHome === "pendente"
          ? ordenarPorPendente(resto, mapaSeriesPorTreino, diaEfetivoPorTreino)
          : ordenarPorDia(resto, diaEfetivoPorTreino);
      treinos = destacadaEscolhida ? [destacadaEscolhida, ...restoOrdenado] : restoOrdenado;
    } catch (e) {
      erroCarregar = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

  /** Séries concluídas na sessão ao vivo (ainda não salvas), contadas por músculo e ponderadas
   * pelo peso_contribuicao — soma em cima do que já está salvo. */
  const feitoAoVivoPorMusculo = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const exSessao of treinoLogSessao.atual?.sessao ?? []) {
      const concluidas = exSessao.sets.filter((s) => s.concluida).length;
      if (!concluidas) continue;
      for (const m of musculosPorExercicio.get(exSessao.exercicio_id) ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + concluidas * m.peso);
      }
    }
    return mapa;
  });

  /** Total de séries concluídas na sessão ao vivo (ainda não salvas). */
  const seriesAoVivo = $derived(
    (treinoLogSessao.atual?.sessao ?? []).reduce((acc, ex) => acc + ex.sets.filter((s) => s.concluida).length, 0),
  );

  /** Feito por músculo ao vivo: o que já está salvo essa semana + o que está sendo feito agora, se houver sessão ativa. */
  const feitoPorMusculo = $derived.by(() => {
    if (!treinoLogSessao.atual) return feitoPorMusculoSalvo;
    const mapa = new Map(feitoPorMusculoSalvo);
    for (const [musculoId, valor] of feitoAoVivoPorMusculo) {
      mapa.set(musculoId, (mapa.get(musculoId) ?? 0) + valor);
    }
    return mapa;
  });

  function preview(t: TreinoComExercicios): string {
    const nomes = t.exercicios
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => e.exercicio?.nome)
      .filter(Boolean);
    if (!nomes.length) return "Nenhum exercício ainda";
    return nomes.join(", ");
  }

  /** Total de séries programadas em todas as rotinas — meta semanal do card (assume 1 execução de cada rotina na semana). */
  const programado = $derived(treinos.reduce((acc, t) => acc + t.exercicios.reduce((a, ex) => a + ex.series.length, 0), 0));

  /** Total de séries feitas na semana (salvas + sessão ao vivo em andamento), somando todas as rotinas. */
  const executado = $derived([...seriesPorTreino.values()].reduce((acc, v) => acc + v, 0) + seriesAoVivo);

  /** Volume planejado por músculo — séries ponderadas pelo peso_contribuicao de cada exercício
   * (mesmo critério da coluna "Pond." da Distribuição Semanal). É a "meta" de cada músculo: as
   * rotinas cadastradas na lista dada. */
  function planejadoPorMusculoDe(lista: TreinoComExercicios[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const t of lista) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    return mapa;
  }

  /** "todos" (padrão) soma o volume planejado de todas as rotinas da semana; "proximo"
   * (Parametrização > Modo de Distribuição) usa só a rotina que já sobe pro topo da lista
   * (ordenarPorDia — dia mais próximo, ou primeira da ordem manual sem dia definido). */
  const planejadoPorMusculo = $derived(
    parametrosDistribuicao.homeModoGrupos === "proximo"
      ? planejadoPorMusculoDe(treinos.slice(0, 1))
      : planejadoPorMusculoDe(treinos),
  );

  /** Mesma distribuição por faixa de fadiga (A/B/C, por posição da série na sessão) usada nas
   * barras de edição de Distribuição Muscular — aqui só pra recolorir o preenchimento do anel,
   * a % total preenchida continua sendo pctMeta(feito, planejado), sem mudança nenhuma nela. */
  const partesPorMusculo = $derived(
    partesFadigaSemanal(
      parametrosDistribuicao.homeModoGrupos === "proximo" ? treinos.slice(0, 1) : treinos,
      parametrosDistribuicao,
    ),
  );

  /** Os 6 músculos com maior volume planejado — só entram os que aparecem em alguma rotina
   * considerada (todas, ou só a próxima, conforme planejadoPorMusculo). */
  const top6 = $derived.by(() =>
    musculos
      .map((m) => ({ musculo: m, planejado: planejadoPorMusculo.get(m.id) ?? 0, feito: feitoPorMusculo.get(m.id) ?? 0 }))
      .filter((item) => item.planejado > 0)
      .sort((a, b) => b.planejado - a.planejado)
      .slice(0, 6),
  );

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  /** Quando o feito passa do planejado, o texto vira "X acima" em vez de ficar travado em "0 restantes". */
  function passouMeta(valor: number, meta: number): boolean {
    return valor > meta;
  }

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  /** Preenchimento do anel dividido pelas faixas de fadiga (A/B/C) do músculo, na mesma
   * proporção das barras de edição — o total preenchido continua sendo `pct`, só a cor
   * interna passa a variar em vez de ser uma única cor sólida. */
  function gradienteFadiga(musculoId: string, pct: number): string {
    const preenchido = larguraBarra(pct);
    const partes = partesPorMusculo.get(musculoId);
    const total = partes ? partes.a + partes.b + partes.c : 0;
    const segmentos = total > 0 ? partesParaSegmentos(partes!) : [{ valor: 1, cor: CORES_FAIXA.a }];

    let acumulado = 0;
    const stops: string[] = [];
    for (const seg of segmentos) {
      if (seg.valor <= 0) continue;
      const inicio = acumulado;
      acumulado += (seg.valor / (total || 1)) * preenchido;
      stops.push(`${seg.cor} ${inicio}% ${acumulado}%`);
    }
    stops.push(`var(--surface-border) ${preenchido}% 100%`);
    return `conic-gradient(${stops.join(", ")})`;
  }
</script>

{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconExercicios()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.4 14.4 9.6 9.6" />
    <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
    <path d="m21.5 21.5-1.4-1.4" />
    <path d="M3.9 3.9 2.5 2.5" />
    <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
  </svg>
{/snippet}
{#snippet iconDistribuicao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
{/snippet}
{#snippet iconHistorico()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
{/snippet}
{#snippet iconNovaRotina()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
{/snippet}
{#snippet iconTreinoAvulso()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 11 14 11 22 21 10 13 10 13 2" />
  </svg>
{/snippet}
{#snippet iconEngrenagem()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <h1>Treino</h1>
    <button class="icon-btn" onclick={() => (mostrarMenuNovo = true)} aria-label="Novo">+</button>
  </div>

  {#if !loading}
    <div class="card-series">
      <p class="card-titulo">Séries</p>
      <div class="series-linha">
        {#if modoRestante}
          <span class="series-valor"><strong>{pctMeta(executado, programado).toFixed(0)}%</strong></span>
          <span class="series-restantes">
            {#if passouMeta(executado, programado)}
              <strong>{executado - programado}</strong> acima
            {:else}
              <strong>{restante(executado, programado)}</strong> restantes
            {/if}
          </span>
        {:else}
          <span class="series-valor"><strong>{executado}</strong> <span class="series-meta">/ {programado}</span></span>
          <span class="series-restantes">
            {#if passouMeta(executado, programado)}
              <strong>{executado - programado}</strong> acima
            {:else}
              <strong>{restante(executado, programado)}</strong> restantes
            {/if}
          </span>
        {/if}
      </div>
      <div class="barra-wrap-grande">
        <div class="barra-grande" style={`width:${larguraBarra(pctMeta(executado, programado))}%; background:var(--color-secondary);`}></div>
      </div>
    </div>

    <div class="card-musculos">
      <button type="button" class="toggle-btn" onclick={() => (modoRestante = !modoRestante)} aria-label="Alternar exibição">
        {@render iconToggle()}
      </button>
      {#if !top6.length}
        <p class="card-titulo">Grupos Musculares</p>
        <p class="muted">Nenhum músculo planejado ainda — adicione exercícios às rotinas.</p>
      {:else}
        <div class="musculos-grid">
          {#each top6 as item (item.musculo.id)}
            <div class="musculo-col">
              <p class="musculo-nome">{item.musculo.nome}</p>
              <div
                class="musculo-anel"
                style={`background: ${gradienteFadiga(item.musculo.id, pctMeta(item.feito, item.planejado))};`}
              >
                <div class="musculo-anel-centro">
                  {#if modoRestante && passouMeta(item.feito, item.planejado)}
                    <strong>{pctMeta(item.feito, item.planejado).toFixed(0)}%</strong>
                    <span class="musculo-meta">{(item.feito - item.planejado).toFixed(0)} acima</span>
                  {:else if modoRestante}
                    <strong>{pctMeta(item.feito, item.planejado).toFixed(0)}%</strong>
                    <span class="musculo-meta">{restante(item.feito, item.planejado).toFixed(0)} rest.</span>
                  {:else}
                    <strong>{item.feito.toFixed(0)}</strong>
                    <span class="musculo-meta">/{item.planejado.toFixed(0)}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="quick-actions">
    <button class="quick-btn" onclick={() => navigate("/treino/distribuicao")}>
      <span class="quick-btn-label">Distribuição</span>
      {@render iconDistribuicao()}
    </button>
    <button class="quick-btn" onclick={() => navigate("/treino/exercicios")}>
      <span class="quick-btn-label">Exercícios</span>
      {@render iconExercicios()}
    </button>
    <button class="quick-btn" onclick={() => navigate("/treino/historico")}>
      <span class="quick-btn-label">Histórico</span>
      {@render iconHistorico()}
    </button>
    <button class="quick-btn" onclick={() => navigate("/treino/parametrizacao")}>
      <span class="quick-btn-label">Parâmetros</span>
      {@render iconEngrenagem()}
    </button>
  </div>

  <p class="rotinas-titulo">Rotinas</p>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erroCarregar}
    <p class="erro">Erro ao carregar: {erroCarregar}</p>
  {:else if !treinos.length}
    <p class="muted">Nenhuma rotina ainda. Crie a primeira.</p>
  {:else}
    {#each treinos as treino, i (treino.id)}
      {@const status = statusPorTreino.get(treino.id) ?? { tipo: "normal" }}
      {@const diaEfetivo = diaEfetivoDeStatus(treino, status)}
      {@const destacada = i === 0 && treino.id === destacadaId}
      {@const ehHoje = diaEfetivo === hojeSemana}
      {@const concluidaHoje = concluidosHoje.has(treino.id)}
      <div
        class="rotina-item"
        role="button"
        tabindex="0"
        onclick={() => navigate(`/treino/rotina/${treino.id}/ver`)}
        onkeydown={(e) => e.key === "Enter" && navigate(`/treino/rotina/${treino.id}/ver`)}
      >
        {#if destacada && ehHoje && !concluidaHoje}
          <div class="canto-superior" role="presentation" onclick={(e) => e.stopPropagation()}>
            <TreinoAjusteDiaFluxo data={hojeISO()} onMudou={carregar} />
          </div>
        {/if}
        <div class="card-header">
          <h2 class:nome-neutro={!destacada}>
            {treino.nome_treino}
            {#if treino.dia_semana != null}
              <span class="dia-tag">{DIAS_SEMANA_COMPLETO[treino.dia_semana]}</span>
            {/if}
          </h2>
        </div>
        {#if status.tipo !== "normal"}
          <div class="status-semana" role="presentation" onclick={(e) => e.stopPropagation()}>
            <span class="status-semana-texto">
              {status.tipo === "reagendado" ? `Reagendado para ${DIAS_SEMANA_COMPLETO[status.novoDia]}` : "Cancelado essa semana"}
            </span>
            <button type="button" class="status-semana-link" disabled={revertendo === treino.id} onclick={() => reverter(treino)}>
              Reverter
            </button>
            <button type="button" class="status-semana-link" onclick={() => (mostrarMudarDiaDireto = true)}> Mudar </button>
          </div>
        {/if}
        <p class="preview">{preview(treino)}</p>
        {#if destacada}
          {#if status.tipo !== "normal"}
            <Button onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
          {:else if ehHoje && concluidaHoje}
            <Button variant="secondary" onclick={(e) => { e.stopPropagation(); acaoConfirmacao = { tipo: "reiniciar", treino }; }}>Concluído</Button>
          {:else if ehHoje}
            <Button onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</Button>
          {:else}
            <Button onclick={(e) => { e.stopPropagation(); acaoConfirmacao = { tipo: "iniciar", treino }; }}>Próxima rotina</Button>
          {/if}
        {:else}
          <button type="button" class="iniciar-secundario" onclick={(e) => { e.stopPropagation(); navigate(`/treino/log/${treino.id}`); }}>Iniciar Rotina</button>
        {/if}
      </div>
    {/each}
  {/if}
</div>

{#if mostrarMudarDiaDireto}
  <TreinoMudarDiaSheet
    data={hojeISO()}
    onFechar={() => (mostrarMudarDiaDireto = false)}
    onSalvo={() => {
      mostrarMudarDiaDireto = false;
      void carregar();
    }}
  />
{/if}

{#if mostrarMenuNovo}
  <ActionSheet
    onFechar={() => (mostrarMenuNovo = false)}
    opcoes={[
      { label: "Nova Rotina", subtitulo: "Cadastro completo, com dias e metas", icon: iconNovaRotina, onSelect: () => navigate("/treino/rotina/nova") },
      { label: "Treino Avulso", subtitulo: "Sessão livre de hoje, sem rotina fixa", icon: iconTreinoAvulso, onSelect: () => navigate("/treino/avulso") },
    ]}
  />
{/if}

{#if acaoConfirmacao}
  <ConfirmDialog
    titulo={acaoConfirmacao.tipo === "reiniciar" ? "Deseja reiniciar a rotina?" : "Deseja iniciar a rotina?"}
    textoConfirmar={acaoConfirmacao.tipo === "reiniciar" ? "Reiniciar" : "Iniciar"}
    destrutivo={false}
    onConfirmar={confirmarAcao}
    onCancelar={() => (acaoConfirmacao = null)}
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
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header h1 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .icon-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }
  .card-series,
  .card-musculos {
    position: relative;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .series-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .series-valor {
    font-size: var(--font-size-lg);
  }
  .series-valor strong {
    font-size: 22px;
  }
  .series-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .series-restantes {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .barra-wrap-grande {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
  .toggle-btn {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn svg {
    width: 16px;
    height: 16px;
  }
  .musculos-grid {
    display: flex;
    gap: var(--space-3);
    width: calc(100% - 48px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .musculos-grid::-webkit-scrollbar {
    display: none;
  }
  .musculo-col {
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .musculo-nome {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  .musculo-meta {
    color: var(--surface-muted);
  }
  .musculo-anel {
    position: relative;
    width: 68px;
    height: 68px;
    margin: 0 auto;
    border-radius: 50%;
  }
  .musculo-anel-centro {
    position: absolute;
    inset: 6px;
    border-radius: 50%;
    background: var(--surface-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.2;
  }
  .musculo-anel-centro strong {
    font-size: 14px;
    color: var(--surface-fg);
  }
  .musculo-anel-centro .musculo-meta {
    font-size: 10px;
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .quick-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .quick-btn-label {
    max-width: 100%;
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quick-btn svg {
    width: 20px;
    height: 20px;
  }
  .rotinas-titulo {
    font-weight: 600;
    margin: 0 0 var(--space-3);
  }
  .rotina-item {
    position: relative;
    cursor: pointer;
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .canto-superior {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .status-semana {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0 0 var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-secondary) 12%, var(--surface-bg));
  }
  .status-semana-texto {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-sm);
    color: var(--color-secondary);
  }
  .status-semana-link {
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--color-secondary);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }
  .status-semana-link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .iniciar-secundario {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .card-header h2 {
    font-size: var(--font-size-lg);
    margin: 0;
  }
  .nome-neutro {
    color: var(--surface-muted);
  }
  .dia-tag {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--surface-muted);
    margin-left: var(--space-1);
  }
  .preview {
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    margin: 0 0 var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
