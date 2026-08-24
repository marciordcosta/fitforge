<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { hojeISO } from "../../lib/dates";
  import { formatMinSeg } from "../../lib/tempo";
  import {
    getTreino,
    getUltimoRegistro,
    getHistoricoFonte,
    getRecordesExercicio,
    calcular1RM,
    salvarRegistrosDoDia,
    salvarExerciciosRotina,
    updateDescansoTreinoExercicio,
    updateObservacaoTreinoExercicio,
    listExercicios,
    type TreinoComExercicios,
    type Exercicio,
  } from "../../lib/treinoApi";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DescansoPicker from "../../components/DescansoPicker.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import { treinoLogSessao, type SetSessao, type ExercicioSessao } from "../../lib/treinoLogSessao.svelte";

  let { treinoId }: { treinoId: string } = $props();

  let treino = $state<TreinoComExercicios | null>(null);
  let nomeTreino = $state("");
  let sessao = $state<ExercicioSessao[]>([]);
  let loading = $state(true);
  let salvando = $state(false);
  let inicio = $state(Date.now());
  let agora = $state(Date.now());
  let houveAlteracaoEstrutura = $state(false);
  let naoEncontrada = $state(false);

  function formatMMSS(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const duracaoLabel = $derived.by(() => {
    const total = Math.floor((agora - inicio) / 1000);
    if (total < 60) return `${total}s`;
    return formatMMSS(total);
  });

  const seriesTotal = $derived(sessao.reduce((acc, ex) => acc + ex.sets.filter((s) => s.concluida).length, 0));

  async function carregar() {
    loading = true;
    naoEncontrada = false;

    const salva = treinoLogSessao.atual;
    if (salva && salva.treinoId === treinoId) {
      sessao = salva.sessao;
      nomeTreino = salva.nomeTreino;
      inicio = salva.inicio;
      houveAlteracaoEstrutura = salva.houveAlteracaoEstrutura;
      loading = false;
      return;
    }

    treino = await getTreino(treinoId);
    if (!treino) {
      naoEncontrada = true;
      loading = false;
      return;
    }
    nomeTreino = treino.nome_treino;
    const fonte = await getHistoricoFonte();
    const exerciciosOrdenados = treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem);

    sessao = await Promise.all(
      exerciciosOrdenados.map(async (te) => {
        const [anterior, recordes] = await Promise.all([
          getUltimoRegistro(te.exercicio_id, fonte === "ultima_rotina" ? treinoId : undefined),
          getRecordesExercicio(te.exercicio_id),
        ]);
        const nSets = Math.max(te.series.length, anterior.length, 1);
        const sets: SetSessao[] = Array.from({ length: nSets }, (_, i) => {
          const ant = anterior.find((a) => a.serie === i + 1);
          const alvo = te.series.find((s) => s.serie === i + 1);
          return {
            serie: i + 1,
            peso: null,
            repeticoes: null,
            concluida: false,
            anteriorPeso: ant?.peso ?? null,
            anteriorReps: ant?.repeticoes ?? null,
            pesoAlvo: alvo?.peso_alvo ?? null,
            repMin: alvo?.rep_min ?? null,
            repMax: alvo?.rep_max ?? null,
            prPeso: false,
            prPesoDelta: null,
            pr1rm: false,
            pr1rmDelta: null,
            prVolume: false,
            prVolumeDelta: null,
          };
        });
        return {
          treino_exercicio_id: te.id,
          exercicio_id: te.exercicio_id,
          nome: te.exercicio?.nome ?? "",
          descanso_seg: te.descanso_seg,
          observacao: te.observacao,
          sets,
          descansoAte: null,
          descansoInicioEm: null,
          descansoNotificado: false,
          recordes,
        };
      }),
    );
    loading = false;
  }

  void carregar();

  $effect(() => {
    if (loading || naoEncontrada) return;
    treinoLogSessao.iniciar({ treinoId, nomeTreino, inicio, sessao, houveAlteracaoEstrutura });
  });

  function notificar(titulo: string, corpo: string): void {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(titulo, { body: corpo, tag: "fitforge-descanso", icon: "/icons/icon-192.png" });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((permissao) => {
        if (permissao === "granted") {
          new Notification(titulo, { body: corpo, tag: "fitforge-descanso", icon: "/icons/icon-192.png" });
        }
      });
    }
  }

  function checarDescansosConcluidos(): void {
    for (const ex of sessao) {
      if (ex.descansoAte && !ex.descansoNotificado && Date.now() >= ex.descansoAte) {
        ex.descansoNotificado = true;
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        notificar("Descanso terminado!", `Hora da próxima série — ${ex.nome}`);
      }
    }
  }

  const timerId = setInterval(() => {
    agora = Date.now();
    checarDescansosConcluidos();
  }, 1000);
  $effect(() => () => clearInterval(timerId));

  const exercicioDescansando = $derived.by(() => sessao.find((ex) => ex.descansoAte && ex.descansoAte > agora) ?? null);

  const restanteDescansoSeg = $derived.by(() => {
    if (!exercicioDescansando?.descansoAte) return 0;
    return Math.max(Math.ceil((exercicioDescansando.descansoAte - agora) / 1000), 0);
  });

  const progressoDescanso = $derived.by(() => {
    const ex = exercicioDescansando;
    if (!ex?.descansoAte || !ex.descansoInicioEm) return 0;
    const total = ex.descansoAte - ex.descansoInicioEm;
    if (total <= 0) return 1;
    return Math.min(Math.max((agora - ex.descansoInicioEm) / total, 0), 1);
  });

  function ajustarDescanso(deltaSeg: number): void {
    const ex = exercicioDescansando;
    if (!ex?.descansoAte) return;
    ex.descansoAte = Math.max(ex.descansoAte + deltaSeg * 1000, Date.now());
  }

  function pularDescanso(): void {
    const ex = exercicioDescansando;
    if (!ex) return;
    ex.descansoAte = null;
    ex.descansoInicioEm = null;
  }

  function adicionarSerie(exIdx: number) {
    const ex = sessao[exIdx];
    const proxSerie = ex.sets.length + 1;
    ex.sets = [
      ...ex.sets,
      {
        serie: proxSerie,
        peso: null,
        repeticoes: null,
        concluida: false,
        anteriorPeso: null,
        anteriorReps: null,
        pesoAlvo: null,
        repMin: null,
        repMax: null,
        prPeso: false,
        prPesoDelta: null,
        pr1rm: false,
        pr1rmDelta: null,
        prVolume: false,
        prVolumeDelta: null,
      },
    ];
  }

  let menuSerieAberto = $state<{ exIdx: number; setIdx: number } | null>(null);

  function toggleMenuSerie(exIdx: number, setIdx: number) {
    menuSerieAberto =
      menuSerieAberto?.exIdx === exIdx && menuSerieAberto?.setIdx === setIdx ? null : { exIdx, setIdx };
  }

  function removerSerie(exIdx: number, setIdx: number) {
    const ex = sessao[exIdx];
    ex.sets = ex.sets.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, serie: i + 1 }));
    houveAlteracaoEstrutura = true;
  }

  function toggleConcluida(exIdx: number, setIdx: number) {
    const ex = sessao[exIdx];
    const serieItem = ex.sets[setIdx];

    if (!serieItem.concluida && (serieItem.peso == null || serieItem.repeticoes == null)) {
      alert("Informe peso e repetições antes de concluir a série.");
      return;
    }

    serieItem.concluida = !serieItem.concluida;

    if (!serieItem.concluida) {
      serieItem.prPeso = false;
      serieItem.prPesoDelta = null;
      serieItem.pr1rm = false;
      serieItem.pr1rmDelta = null;
      serieItem.prVolume = false;
      serieItem.prVolumeDelta = null;
      ex.descansoAte = null;
      ex.descansoInicioEm = null;
      return;
    }

    if (ex.descanso_seg) {
      ex.descansoInicioEm = Date.now();
      ex.descansoAte = ex.descansoInicioEm + ex.descanso_seg * 1000;
      ex.descansoNotificado = false;
      notificar("Descanso iniciado", `${ex.nome} — ${formatMinSeg(ex.descanso_seg)}`);
    }

    if (serieItem.peso != null && serieItem.repeticoes != null) {
      const rm = calcular1RM(serieItem.peso, serieItem.repeticoes);
      const volume = serieItem.peso * serieItem.repeticoes;
      if (serieItem.peso > ex.recordes.maiorPeso) {
        serieItem.prPeso = true;
        serieItem.prPesoDelta = serieItem.peso - ex.recordes.maiorPeso;
        ex.recordes.maiorPeso = serieItem.peso;
      }
      if (rm > ex.recordes.melhor1rm) {
        serieItem.pr1rm = true;
        serieItem.pr1rmDelta = rm - ex.recordes.melhor1rm;
        ex.recordes.melhor1rm = rm;
      }
      if (volume > ex.recordes.melhorVolumeSerie) {
        serieItem.prVolume = true;
        serieItem.prVolumeDelta = volume - ex.recordes.melhorVolumeSerie;
        ex.recordes.melhorVolumeSerie = volume;
      }
    }
  }

  function classeFaixaRep(serieItem: SetSessao): string {
    return serieItem.concluida ? "concluida" : "";
  }

  /** Antes de concluir mostra a meta; depois, some se ficou dentro da faixa, ou avisa se ficou fora. */
  function textoMeta(serieItem: SetSessao): string | null {
    if (serieItem.repMin == null && serieItem.repMax == null) return null;
    if (!serieItem.concluida) {
      return `Meta: ${
        serieItem.repMin != null && serieItem.repMax != null
          ? `${serieItem.repMin} a ${serieItem.repMax}`
          : (serieItem.repMin ?? serieItem.repMax)
      }`;
    }
    if (serieItem.repeticoes == null) return null;
    if (serieItem.repMin != null && serieItem.repeticoes < serieItem.repMin) return "abaixo da meta";
    if (serieItem.repMax != null && serieItem.repeticoes > serieItem.repMax) return "acima da meta";
    return null;
  }

  function descansoLabel(ex: ExercicioSessao): string {
    if (ex.descansoAte) {
      const restante = Math.ceil((ex.descansoAte - agora) / 1000);
      if (restante > 0) return `Descanso: ${formatMMSS(restante)}`;
    }
    if (ex.descanso_seg) return `Descanso padrão: ${formatMMSS(ex.descanso_seg)}`;
    return "Descanso: Desativado";
  }

  let descansoEditandoIdx = $state<number | null>(null);
  let recordeAberto = $state<{ exIdx: number; setIdx: number } | null>(null);

  function formatDelta(delta: number | null): string {
    if (delta == null) return "";
    const arredondado = Math.round(delta * 100) / 100;
    return arredondado > 0 ? `↑ ${arredondado} kg` : "";
  }

  async function salvarDescanso(exIdx: number, novoSeg: number | null) {
    const ex = sessao[exIdx];
    ex.descanso_seg = novoSeg;
    descansoEditandoIdx = null;
    try {
      await updateDescansoTreinoExercicio(ex.treino_exercicio_id, novoSeg);
    } catch (e) {
      alert("Erro ao salvar descanso: " + (e as Error).message);
    }
  }

  /** Exercícios adicionados nessa sessão ainda não existem na rotina salva (id sintético), não há o que persistir ainda. */
  async function salvarObservacao(exIdx: number) {
    const ex = sessao[exIdx];
    if (ex.treino_exercicio_id.startsWith("novo-")) return;
    try {
      await updateObservacaoTreinoExercicio(ex.treino_exercicio_id, ex.observacao);
    } catch (e) {
      alert("Erro ao salvar observação: " + (e as Error).message);
    }
  }

  // ---------------- Substituir / reordenar exercícios da sessão ----------------

  let menuExercicioAberto = $state<number | null>(null);
  let substituindoExIdx = $state<number | null>(null);
  let reordenando = $state(false);
  let buscaSubstituir = $state("");
  let todosExercicios = $state<Exercicio[]>([]);

  async function abrirSubstituir(exIdx: number) {
    substituindoExIdx = exIdx;
    if (!todosExercicios.length) todosExercicios = await listExercicios();
  }

  const opcoesSubstituir = $derived(
    todosExercicios.filter((e) => e.nome.toLowerCase().includes(buscaSubstituir.trim().toLowerCase())),
  );

  async function substituirExercicio(novoEx: Exercicio) {
    if (substituindoExIdx == null) return;
    const ex = sessao[substituindoExIdx];
    const fonte = await getHistoricoFonte();
    const [anterior, recordes] = await Promise.all([
      getUltimoRegistro(novoEx.id, fonte === "ultima_rotina" ? treinoId : undefined),
      getRecordesExercicio(novoEx.id),
    ]);
    ex.exercicio_id = novoEx.id;
    ex.nome = novoEx.nome;
    ex.observacao = null;
    ex.recordes = recordes;
    ex.sets = Array.from({ length: ex.sets.length }, (_, i) => {
      const ant = anterior.find((a) => a.serie === i + 1);
      return {
        serie: i + 1,
        peso: null,
        repeticoes: null,
        concluida: false,
        anteriorPeso: ant?.peso ?? null,
        anteriorReps: ant?.repeticoes ?? null,
        pesoAlvo: null,
        repMin: null,
        repMax: null,
        prPeso: false,
        prPesoDelta: null,
        pr1rm: false,
        pr1rmDelta: null,
        prVolume: false,
        prVolumeDelta: null,
      };
    });
    houveAlteracaoEstrutura = true;
    substituindoExIdx = null;
    buscaSubstituir = "";
  }

  function removerExercicio(exIdx: number) {
    sessao = sessao.filter((_, i) => i !== exIdx);
    houveAlteracaoEstrutura = true;
  }

  // ---------------- Adicionar exercício à sessão ----------------

  let mostrarPicker = $state(false);
  let buscaPicker = $state("");
  let selecionadosPicker = $state<Set<string>>(new Set());

  async function abrirPicker() {
    if (!todosExercicios.length) todosExercicios = await listExercicios();
    mostrarPicker = true;
  }

  const disponiveisPicker = $derived(
    todosExercicios.filter(
      (ex) =>
        !sessao.some((s) => s.exercicio_id === ex.id) &&
        ex.nome.toLowerCase().includes(buscaPicker.trim().toLowerCase()),
    ),
  );

  function toggleSelecaoPicker(exercicioId: string) {
    const novo = new Set(selecionadosPicker);
    if (novo.has(exercicioId)) novo.delete(exercicioId);
    else novo.add(exercicioId);
    selecionadosPicker = novo;
  }

  function fecharPicker() {
    mostrarPicker = false;
    buscaPicker = "";
    selecionadosPicker = new Set();
  }

  async function construirExercicioSessao(ex: Exercicio): Promise<ExercicioSessao> {
    const fonte = await getHistoricoFonte();
    const [anterior, recordes] = await Promise.all([
      getUltimoRegistro(ex.id, fonte === "ultima_rotina" ? treinoId : undefined),
      getRecordesExercicio(ex.id),
    ]);
    const nSets = Math.max(anterior.length, 3);
    const sets: SetSessao[] = Array.from({ length: nSets }, (_, i) => {
      const ant = anterior.find((a) => a.serie === i + 1);
      return {
        serie: i + 1,
        peso: null,
        repeticoes: null,
        concluida: false,
        anteriorPeso: ant?.peso ?? null,
        anteriorReps: ant?.repeticoes ?? null,
        pesoAlvo: null,
        repMin: null,
        repMax: null,
        prPeso: false,
        prPesoDelta: null,
        pr1rm: false,
        pr1rmDelta: null,
        prVolume: false,
        prVolumeDelta: null,
      };
    });
    return {
      treino_exercicio_id: `novo-${ex.id}-${Date.now()}`,
      exercicio_id: ex.id,
      nome: ex.nome,
      descanso_seg: ex.descanso_padrao_seg ?? 180,
      observacao: null,
      sets,
      descansoAte: null,
      descansoInicioEm: null,
      descansoNotificado: false,
      recordes,
    };
  }

  async function confirmarSelecaoPicker() {
    const escolhidos = todosExercicios.filter((ex) => selecionadosPicker.has(ex.id));
    const novos = await Promise.all(escolhidos.map(construirExercicioSessao));
    sessao = [...sessao, ...novos];
    houveAlteracaoEstrutura = true;
    fecharPicker();
  }

  function moverExercicio(idx: number, direcao: -1 | 1) {
    const alvo = idx + direcao;
    if (alvo < 0 || alvo >= sessao.length) return;
    const novas = sessao.slice();
    [novas[idx], novas[alvo]] = [novas[alvo], novas[idx]];
    sessao = novas;
    houveAlteracaoEstrutura = true;
  }

  let mostrarEscolhaEstrutura = $state(false);

  async function concluirTreino() {
    if (!confirm("Concluir e salvar este treino?")) return;
    salvando = true;
    try {
      const porExercicio = new Map(
        sessao.map((ex) => [
          ex.exercicio_id,
          ex.sets.map((s) => ({ serie: s.serie, peso: s.peso, repeticoes: s.repeticoes })),
        ]),
      );
      await salvarRegistrosDoDia(treinoId, hojeISO(), porExercicio);

      if (houveAlteracaoEstrutura) {
        salvando = false;
        mostrarEscolhaEstrutura = true;
        return;
      }

      treinoLogSessao.limpar();
      navigate("/treino");
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
      salvando = false;
    }
  }

  async function finalizarComEscolha(salvarNaRotina: boolean) {
    mostrarEscolhaEstrutura = false;
    salvando = true;
    try {
      if (salvarNaRotina) {
        await salvarExerciciosRotina(
          treinoId,
          sessao.map((ex) => ({
            exercicio_id: ex.exercicio_id,
            descanso_seg: ex.descanso_seg,
            observacao: ex.observacao,
            series: ex.sets.map((s) => ({
              serie: s.serie,
              peso_alvo: s.pesoAlvo,
              rep_min: s.repMin,
              rep_max: s.repMax,
            })),
          })),
        );
      }
      treinoLogSessao.limpar();
      navigate("/treino");
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }

  let mostrarConfirmDescartar = $state(false);

  function descartarTreino() {
    mostrarConfirmDescartar = false;
    treinoLogSessao.limpar();
    navigate("/treino");
  }
</script>

<div class="header-fixo">
  <div class="header-fixo-inner">
    <div class="stat-inline stat-treino">
      <span class="stat-label">Treino</span>
      <button class="voltar" onclick={() => navigate("/treino")}>▾ {nomeTreino}</button>
    </div>
    <div class="stat-inline">
      <span class="stat-label">Duração</span>
      <span class="stat-valor destaque">{duracaoLabel}</span>
    </div>
    <div class="stat-inline">
      <span class="stat-label">Séries</span>
      <span class="stat-valor">{seriesTotal}</span>
    </div>
    <button class="concluir" disabled={salvando} onclick={concluirTreino}>Concluir</button>
  </div>
</div>

<div class="container">
  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if naoEncontrada}
    <p class="muted">Rotina não encontrada.</p>
  {:else}
    {#each sessao as ex, exIdx (ex.exercicio_id)}
      <div class="exercicio-card">
        <div class="exercicio-header">
          <button class="nome-exercicio" onclick={() => navigate(`/treino/exercicios/${ex.exercicio_id}`)}>
            <h2>{ex.nome}</h2>
          </button>
          <button class="menu-exercicio-btn" onclick={() => (menuExercicioAberto = exIdx)} aria-label="Mais opções">
            ⋮
          </button>
        </div>
        <input
          class="observacao-input"
          type="text"
          placeholder="Adicionar notas do exercício aqui"
          bind:value={ex.observacao}
          onchange={() => salvarObservacao(exIdx)}
        />
        <button class="descanso" onclick={() => (descansoEditandoIdx = exIdx)}>
          ⏱ {descansoLabel(ex)}
        </button>
        <div class="tabela">
          <div class="linha cabecalho">
            <span>Série</span>
            <span>Anterior</span>
            <span>Kg</span>
            <span>Reps</span>
            <span></span>
          </div>
          {#each ex.sets as serieItem, setIdx (serieItem.serie)}
            <div class="linha {classeFaixaRep(serieItem)}">
              {#if serieItem.prPeso || serieItem.pr1rm || serieItem.prVolume}
                <button
                  class="serie-num medalha"
                  onclick={() => (recordeAberto = { exIdx, setIdx })}
                  aria-label="Ver recorde batido"
                >
                  {@render iconMedalha()}
                </button>
              {:else}
                <button class="serie-num" onclick={() => toggleMenuSerie(exIdx, setIdx)}>
                  {serieItem.serie}
                </button>
              {/if}
              <span class="anterior">
                <span class="anterior-valor">
                  {serieItem.anteriorPeso != null && serieItem.anteriorReps != null
                    ? `${serieItem.anteriorPeso}kg x ${serieItem.anteriorReps}`
                    : "—"}
                </span>
                {#if textoMeta(serieItem)}
                  <span class="anterior-meta">{textoMeta(serieItem)}</span>
                {/if}
              </span>
              <input
                type="number"
                inputmode="decimal"
                placeholder={serieItem.anteriorPeso != null ? String(serieItem.anteriorPeso) : "-"}
                bind:value={serieItem.peso}
              />
              <input
                type="number"
                inputmode="decimal"
                placeholder={serieItem.anteriorReps != null ? String(serieItem.anteriorReps) : "-"}
                bind:value={serieItem.repeticoes}
              />
              <button
                class="check"
                class:ativo={serieItem.concluida}
                onclick={() => toggleConcluida(exIdx, setIdx)}
                aria-label="Marcar série concluída"
              >
                ✓
              </button>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(exIdx)}>+ Adicionar Série</button>
      </div>
    {/each}

    <button class="adicionar-btn" onclick={abrirPicker}>+ Adicionar Exercício</button>

    <button class="descartar" onclick={() => (mostrarConfirmDescartar = true)} disabled={salvando}>Descartar Treino</button>
  {/if}
</div>

{#if exercicioDescansando}
  <div class="descanso-bar">
    <div class="descanso-progresso" style={`width: ${progressoDescanso * 100}%`}></div>
    <div class="descanso-bar-conteudo">
      <button class="descanso-ajuste" onclick={() => ajustarDescanso(-15)}>-15</button>
      <span class="descanso-tempo">{formatMMSS(restanteDescansoSeg)}</span>
      <button class="descanso-ajuste" onclick={() => ajustarDescanso(15)}>+15</button>
      <button class="descanso-pular" onclick={pularDescanso}>Pular</button>
    </div>
  </div>
{/if}

{#snippet iconReordenar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 7l-4 4 4 4M16 7l4 4-4 4" />
    <path d="M4 11h16" />
  </svg>
{/snippet}
{#snippet iconSubstituir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
{/snippet}
{#snippet iconRemover()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}
{#snippet iconMedalha()}
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M7 6H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4" stroke="#d97706" stroke-width="1.4" stroke-linecap="round" />
    <path d="M17 6h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4" stroke="#d97706" stroke-width="1.4" stroke-linecap="round" />
    <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.2" />
    <path d="M12 15v3" stroke="#d97706" stroke-width="1.4" stroke-linecap="round" />
    <path d="M9.3 18h5.4l.6 2.5H8.7Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.2" />
    <path d="M8 21h8" stroke="#d97706" stroke-width="1.4" stroke-linecap="round" />
  </svg>
{/snippet}

{#if menuExercicioAberto !== null}
  {@const exIdxMenu = menuExercicioAberto}
  <ActionSheet
    onFechar={() => (menuExercicioAberto = null)}
    opcoes={[
      { label: "Reordenar Exercícios", icon: iconReordenar, onSelect: () => (reordenando = true) },
      { label: "Substituir Exercício", icon: iconSubstituir, onSelect: () => abrirSubstituir(exIdxMenu) },
      { label: "Remover Exercício", icon: iconRemover, destructive: true, onSelect: () => removerExercicio(exIdxMenu) },
    ]}
  />
{/if}

{#if menuSerieAberto !== null}
  {@const { exIdx: exIdxSerie, setIdx: setIdxSerie } = menuSerieAberto}
  <ActionSheet
    titulo={`Série ${sessao[exIdxSerie]?.sets[setIdxSerie]?.serie ?? ""}`}
    onFechar={() => (menuSerieAberto = null)}
    opcoes={[
      { label: "Remover Série", icon: iconRemover, destructive: true, onSelect: () => removerSerie(exIdxSerie, setIdxSerie) },
    ]}
  />
{/if}

{#if substituindoExIdx !== null}
  <Sheet titulo="Substituir por" onFechar={() => (substituindoExIdx = null)}>
    <input class="sheet-busca" type="text" placeholder="Procurar exercício" bind:value={buscaSubstituir} />
    <ul class="sheet-itens">
      {#each opcoesSubstituir as ex (ex.id)}
        <li><button onclick={() => substituirExercicio(ex)}>{ex.nome}</button></li>
      {/each}
      {#if !opcoesSubstituir.length}
        <li class="sheet-vazio">Nenhum exercício encontrado.</li>
      {/if}
    </ul>
  </Sheet>
{/if}

{#if mostrarPicker}
  <div class="tela-picker">
    <div class="picker-header">
      <button class="cancelar" onclick={fecharPicker}>Cancelar</button>
      <h1>Adicionar Exercício</h1>
      <span class="header-spacer"></span>
    </div>
    <input class="nome-input" type="text" placeholder="Procurar exercício" bind:value={buscaPicker} />
    <ul class="picker-lista">
      {#each disponiveisPicker as ex (ex.id)}
        <li>
          <button class="picker-item" onclick={() => toggleSelecaoPicker(ex.id)}>
            <span class="picker-item-nome">{ex.nome}</span>
            <span class="check-circulo" class:ativo={selecionadosPicker.has(ex.id)}>
              {#if selecionadosPicker.has(ex.id)}✓{/if}
            </span>
          </button>
        </li>
      {/each}
      {#if !disponiveisPicker.length}
        <li class="muted-item">Nenhum exercício encontrado.</li>
      {/if}
    </ul>
    {#if selecionadosPicker.size > 0}
      <button class="adicionar-flutuante" onclick={confirmarSelecaoPicker}>
        Adicionar {selecionadosPicker.size} {selecionadosPicker.size === 1 ? "exercício" : "exercícios"}
      </button>
    {/if}
  </div>
{/if}

{#if mostrarEscolhaEstrutura}
  <ActionSheet
    titulo="Você alterou os exercícios desta sessão"
    onFechar={() => (mostrarEscolhaEstrutura = false)}
    opcoes={[
      { label: "Salvar Nova Rotina", onSelect: () => finalizarComEscolha(true) },
      { label: "Manter Rotina", onSelect: () => finalizarComEscolha(false) },
    ]}
  />
{/if}

{#if reordenando}
  <Sheet titulo="Reordenar Exercícios" onFechar={() => (reordenando = false)}>
    {#each sessao as ex, idx (ex.exercicio_id)}
      <div class="reorder-item">
        <span>{ex.nome}</span>
        <div class="acoes">
          <button onclick={() => moverExercicio(idx, -1)} disabled={idx === 0} aria-label="Mover para cima">▲</button>
          <button onclick={() => moverExercicio(idx, 1)} disabled={idx === sessao.length - 1} aria-label="Mover para baixo">▼</button>
        </div>
      </div>
    {/each}
  </Sheet>
{/if}

{#if mostrarConfirmDescartar}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar este treino?"
    textoConfirmar="Descartar Treino"
    onConfirmar={descartarTreino}
    onCancelar={() => (mostrarConfirmDescartar = false)}
  />
{/if}

{#if descansoEditandoIdx !== null}
  {@const idxDescanso = descansoEditandoIdx}
  <DescansoPicker
    nomeExercicio={sessao[idxDescanso]?.nome ?? ""}
    valorAtual={sessao[idxDescanso]?.descanso_seg ?? null}
    onSelecionar={(seg) => salvarDescanso(idxDescanso, seg)}
    onFechar={() => (descansoEditandoIdx = null)}
  />
{/if}

{#if recordeAberto !== null}
  {@const ex = sessao[recordeAberto.exIdx]}
  {@const s = ex.sets[recordeAberto.setIdx]}
  <Sheet titulo="Novo recorde" onFechar={() => (recordeAberto = null)}>
    <p class="sub">{ex.nome}</p>
    <div class="recordes-lista">
      {#if s.prPeso}
        <div class="recorde-item">
          <span class="recorde-medalha">{@render iconMedalha()}</span>
          <span class="recorde-label">Maior Peso</span>
          <span class="recorde-valor">
            {s.peso} kg
            {#if formatDelta(s.prPesoDelta)}<span class="recorde-delta">{formatDelta(s.prPesoDelta)}</span>{/if}
          </span>
        </div>
      {/if}
      {#if s.prVolume}
        <div class="recorde-item">
          <span class="recorde-medalha">{@render iconMedalha()}</span>
          <span class="recorde-label">Melhor Volume de Série</span>
          <span class="recorde-valor">
            {(s.peso ?? 0) * (s.repeticoes ?? 0)} kg
            {#if formatDelta(s.prVolumeDelta)}<span class="recorde-delta">{formatDelta(s.prVolumeDelta)}</span>{/if}
          </span>
        </div>
      {/if}
      {#if s.pr1rm}
        <div class="recorde-item">
          <span class="recorde-medalha">{@render iconMedalha()}</span>
          <span class="recorde-label">Melhor 1RM</span>
          <span class="recorde-valor">
            {(s.peso != null && s.repeticoes != null ? calcular1RM(s.peso, s.repeticoes) : 0).toFixed(2)} kg
            {#if formatDelta(s.pr1rmDelta)}<span class="recorde-delta">{formatDelta(s.pr1rmDelta)}</span>{/if}
          </span>
        </div>
      {/if}
    </div>
  </Sheet>
{/if}

<style>
  .container {
    max-width: 520px;
    margin: 0 auto;
    padding: var(--space-4);
    padding-bottom: var(--space-6);
  }
  .header-fixo {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
  }
  .header-fixo-inner {
    max-width: 520px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
  }
  .voltar {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .stat-inline {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat-treino {
    min-width: 0;
    max-width: 40%;
    align-items: flex-start;
  }
  .stat-label {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .stat-valor {
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .concluir {
    flex-shrink: 0;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-4);
    font-weight: 600;
    cursor: pointer;
  }
  .concluir:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .stat-valor.destaque {
    color: var(--color-primary);
  }
  .exercicio-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-5);
  }
  .exercicio-card h2 {
    font-size: var(--font-size-base);
    color: var(--color-primary);
    margin: 0;
  }
  .exercicio-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin: 0 0 var(--space-1);
  }
  .nome-exercicio {
    display: block;
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .nome-exercicio h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu-exercicio-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .descanso {
    display: inline-block;
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    background: none;
    border: none;
    padding: 0;
    margin: 0 0 var(--space-2);
    cursor: pointer;
    font-family: inherit;
  }
  .observacao-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: none;
    border: none;
    outline: none;
    padding: 0;
    margin: 0 0 var(--space-2);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    font-family: inherit;
  }
  .observacao-input::placeholder {
    color: var(--surface-muted);
  }
  .tabela {
    display: flex;
    flex-direction: column;
  }
  .linha {
    display: grid;
    grid-template-columns: 36px 1fr 64px 56px 36px;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
    margin: 0;
  }
  .linha.cabecalho {
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
    margin: 0;
    padding: var(--space-1) 0;
  }
  .linha.concluida {
    background: #1e4a2f;
    margin: 0 calc(var(--space-4) * -1);
    padding: var(--space-1) var(--space-4);
  }
  .linha.concluida input,
  .linha.concluida .serie-num {
    background: transparent;
    border-color: transparent;
  }
  .serie-num {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .serie-num.medalha {
    width: 40px;
    height: 40px;
  }
  .serie-num.medalha svg {
    width: 40px;
    height: 40px;
  }
  .anterior {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .anterior-meta {
    font-size: 11px;
    color: var(--surface-muted);
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
  .check {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    cursor: pointer;
  }
  .check.ativo {
    background: var(--color-success);
    color: #fff;
    border-color: var(--color-success);
  }
  .sub {
    text-align: center;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-4);
  }
  .recordes-lista {
    display: flex;
    flex-direction: column;
  }
  .recorde-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .recorde-item:last-child {
    border-bottom: none;
  }
  .recorde-medalha {
    flex-shrink: 0;
    display: flex;
  }
  .recorde-medalha svg {
    width: 24px;
    height: 24px;
  }
  .recorde-label {
    flex: 1;
    font-size: var(--font-size-base);
  }
  .recorde-valor {
    text-align: right;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .recorde-delta {
    color: var(--color-success);
    font-weight: 600;
  }
  .add-serie {
    width: 100%;
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .adicionar-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
  .tela-picker {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    padding: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }
  .picker-header h1 {
    flex: 1;
    font-size: var(--font-size-base);
    margin: 0;
    text-align: center;
  }
  .header-spacer {
    width: 56px;
    flex-shrink: 0;
  }
  .cancelar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-3);
    flex-shrink: 0;
  }
  .picker-lista {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }
  .picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: var(--space-3) 0;
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .picker-item-nome {
    flex: 1;
    min-width: 0;
  }
  .check-circulo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--surface-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: transparent;
  }
  .check-circulo.ativo {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .muted-item {
    color: var(--surface-muted);
    padding: var(--space-2);
    font-size: var(--font-size-sm);
  }
  .adicionar-flutuante {
    flex-shrink: 0;
    margin-top: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .descartar {
    width: 100%;
    margin-top: var(--space-5);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: none;
    color: var(--color-danger);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .descanso-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    background: var(--surface-card);
    border-top: 1px solid var(--surface-border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .descanso-progresso {
    height: 3px;
    background: var(--color-primary);
    transition: width 1s linear;
  }
  .descanso-bar-conteudo {
    max-width: 520px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .descanso-ajuste {
    flex-shrink: 0;
    width: 48px;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .descanso-tempo {
    flex: 1;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    color: var(--surface-fg);
    font-variant-numeric: tabular-nums;
  }
  .descanso-pular {
    flex-shrink: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .sheet-busca {
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
  .sheet-itens {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  .sheet-itens button {
    width: 100%;
    text-align: left;
    padding: var(--space-3);
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .sheet-vazio {
    color: var(--surface-muted);
    padding: var(--space-3);
    font-size: var(--font-size-sm);
  }
  .reorder-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .reorder-item .acoes {
    display: flex;
    gap: var(--space-1);
  }
  .reorder-item .acoes button {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .reorder-item .acoes button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
