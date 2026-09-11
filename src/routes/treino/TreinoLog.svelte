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
    createExercicioAvulso,
    construirMusculosInput,
    getExercicio,
    type TreinoComExercicios,
    type Exercicio,
    type LinhaMusculoInput,
  } from "../../lib/treinoApi";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import AlertDialog from "../../components/AlertDialog.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DescansoPicker from "../../components/DescansoPicker.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Exercicios from "./Exercicios.svelte";
  import ExercicioCampos from "./ExercicioCampos.svelte";
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
  let alertaMsg = $state<string | null>(null);

  function mostrarAlerta(msg: string): void {
    alertaMsg = msg;
  }

  function formatMMSS(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /** Igual a formatMMSS, mas mostra o sinal de negativo quando o descanso já passou do tempo. */
  function formatMMSSAssinado(segundos: number): string {
    return segundos < 0 ? `-${formatMMSS(-segundos)}` : formatMMSS(segundos);
  }

  function formatDuracao(segundosTotais: number): string {
    const h = Math.floor(segundosTotais / 3600);
    const m = Math.floor((segundosTotais % 3600) / 60);
    const s = Math.floor(segundosTotais % 60);
    if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
    if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`;
    return `${s}s`;
  }

  const duracaoLabel = $derived.by(() => {
    const total = Math.floor((agora - inicio) / 1000);
    return formatDuracao(total);
  });

  const seriesTotal = $derived(sessao.reduce((acc, ex) => acc + ex.sets.filter((s) => s.concluida).length, 0));
  const seriesPlanejadas = $derived(sessao.reduce((acc, ex) => acc + ex.sets.length, 0));

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

  /** O cronômetro (anel ou barra) continua visível depois de zerar, contando o atraso em negativo,
   * até o usuário pular ou uma nova série iniciar outro descanso. */
  const exercicioDescansando = $derived.by(() => {
    const ativo = sessao.find((ex) => ex.descansoAte && ex.descansoAte > agora);
    if (ativo) return ativo;
    return sessao.find((ex) => ex.descansoAte != null) ?? null;
  });

  const restanteDescansoSeg = $derived.by(() => {
    if (!exercicioDescansando?.descansoAte) return 0;
    return Math.ceil((exercicioDescansando.descansoAte - agora) / 1000);
  });

  const descansoAtrasado = $derived(restanteDescansoSeg < 0);

  /** Cronômetro (anel/barra) fica visível o tempo todo, em descanso ou não — fora do descanso mostra
   * o tempo total decorrido do treino, no mesmo formato mm:ss. */
  const duracaoTotalSeg = $derived(Math.floor((agora - inicio) / 1000));

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

  // ---------------- Cronômetro de descanso: anel flutuante arrastável ou barra fixa ----------------

  const CHAVE_FORMATO_DESCANSO = "fitforge_formato_descanso";
  let formatoDescanso = $state<"anel" | "barra">(
    typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_FORMATO_DESCANSO) === "barra"
      ? "barra"
      : "anel",
  );
  $effect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_FORMATO_DESCANSO, formatoDescanso);
  });

  const ANEL_DIAMETRO = 70;
  const ANEL_RAIO = 31;
  const ANEL_CIRCUNFERENCIA = 2 * Math.PI * ANEL_RAIO;

  /** Posição do anel na tela, arrastável pelo usuário — nasce no canto superior direito,
   * acima de onde o teclado costuma cobrir, ao contrário da barra fixa embaixo. */
  let anelPos = $state<{ x: number; y: number }>(
    typeof window !== "undefined" ? { x: window.innerWidth - ANEL_DIAMETRO - 16, y: 84 } : { x: 260, y: 84 },
  );
  let anelExpandido = $state(false);

  $effect(() => {
    if (!exercicioDescansando) anelExpandido = false;
  });

  function iniciarArrasteAnel(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetX = startX - anelPos.x;
    const offsetY = startY - anelPos.y;
    const rect = el.getBoundingClientRect();
    let moveu = false;

    function mover(ev: PointerEvent): void {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) moveu = true;
      anelPos = {
        x: Math.min(Math.max(ev.clientX - offsetX, 4), window.innerWidth - rect.width - 4),
        y: Math.min(Math.max(ev.clientY - offsetY, 4), window.innerHeight - rect.height - 4),
      };
    }
    function soltar(): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      if (!moveu) anelExpandido = !anelExpandido;
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  function estiloPopoverAnel(): string {
    const LARGURA = 210;
    const ALTURA = 100;
    const abaixo = anelPos.y + ANEL_DIAMETRO + 6 + ALTURA <= window.innerHeight;
    const top = abaixo ? anelPos.y + ANEL_DIAMETRO + 6 : anelPos.y - ALTURA - 6;
    const left = Math.min(
      Math.max(anelPos.x + ANEL_DIAMETRO / 2 - LARGURA / 2, 4),
      window.innerWidth - LARGURA - 4,
    );
    return `left:${left}px; top:${top}px; width:${LARGURA}px;`;
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

    if (!serieItem.concluida) {
      const peso = serieItem.peso ?? serieItem.anteriorPeso;
      const repeticoes = serieItem.repeticoes ?? serieItem.anteriorReps;
      if (peso == null || repeticoes == null) {
        mostrarAlerta("Informe peso e repetições antes de concluir a série.");
        return;
      }
      serieItem.peso = peso;
      serieItem.repeticoes = repeticoes;
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
      }
      if (rm > ex.recordes.melhor1rm) {
        serieItem.pr1rm = true;
        serieItem.pr1rmDelta = rm - ex.recordes.melhor1rm;
      }
      if (volume > ex.recordes.melhorVolumeSerie) {
        serieItem.prVolume = true;
        serieItem.prVolumeDelta = volume - ex.recordes.melhorVolumeSerie;
      }
    }
  }

  function classeFaixaRep(serieItem: SetSessao): string {
    return serieItem.concluida ? "concluida" : "";
  }

  /** Faixa alvo de repetições, sempre no mesmo formato — a coluna Meta mostra isso direto, sem variar conforme a série foi concluída ou não. */
  function faixaMeta(serieItem: SetSessao): string {
    return serieItem.repMin != null && serieItem.repMax != null
      ? `${serieItem.repMin} a ${serieItem.repMax}`
      : String(serieItem.repMin ?? serieItem.repMax);
  }

  /** Sempre mostra o total configurado, mesmo com o descanso rodando — o tempo que está
   * correndo de fato aparece no cronômetro flutuante (anel ou barra), não aqui. */
  function descansoLabel(ex: ExercicioSessao): string {
    if (ex.descanso_seg) return `Descanso: ${formatMMSS(ex.descanso_seg)}`;
    return "Descanso: Desativado";
  }

  let descansoEditandoIdx = $state<number | null>(null);
  let recordeAberto = $state<{ exIdx: number; setIdx: number } | null>(null);

  let editandoMetaSerie = $state<{ exIdx: number; setIdx: number } | null>(null);
  let metaRepMinTemp = $state<number | null>(null);
  let metaRepMaxTemp = $state<number | null>(null);

  /** Ajusta a meta de repetições só nessa sessão ao vivo, sem navegar pra rotina salva —
   * a rotina em si só é alterada se o usuário escolher "Rotina ajustada" ao concluir o treino. */
  function abrirEditarMetaSerie(exIdx: number, setIdx: number): void {
    const s = sessao[exIdx].sets[setIdx];
    metaRepMinTemp = s.repMin;
    metaRepMaxTemp = s.repMax;
    editandoMetaSerie = { exIdx, setIdx };
  }

  function salvarMetaSerie(): void {
    if (!editandoMetaSerie) return;
    const s = sessao[editandoMetaSerie.exIdx].sets[editandoMetaSerie.setIdx];
    s.repMin = metaRepMinTemp;
    s.repMax = metaRepMaxTemp;
    editandoMetaSerie = null;
  }

  function formatDelta(delta: number | null): string {
    if (delta == null) return "";
    const arredondado = Math.round(delta * 100) / 100;
    return arredondado > 0 ? `↑ ${arredondado} kg` : "";
  }

  async function salvarDescanso(exIdx: number, novoSeg: number | null) {
    const ex = sessao[exIdx];
    ex.descanso_seg = novoSeg;
    descansoEditandoIdx = null;
    /** Se o descanso desse exercício já está rodando, o ajuste do total reflete na hora
     * no cronômetro corrente, contado a partir do mesmo início. */
    if (ex.descansoAte != null && ex.descansoInicioEm != null) {
      if (novoSeg == null) {
        ex.descansoAte = null;
        ex.descansoInicioEm = null;
      } else {
        ex.descansoAte = ex.descansoInicioEm + novoSeg * 1000;
        ex.descansoNotificado = false;
      }
    }
    try {
      await updateDescansoTreinoExercicio(ex.treino_exercicio_id, novoSeg);
    } catch (e) {
      mostrarAlerta("Erro ao salvar descanso: " + (e as Error).message);
    }
  }

  /** Exercícios adicionados nessa sessão ainda não existem na rotina salva (id sintético), não há o que persistir ainda. */
  async function salvarObservacao(exIdx: number) {
    const ex = sessao[exIdx];
    if (ex.treino_exercicio_id.startsWith("novo-")) return;
    try {
      await updateObservacaoTreinoExercicio(ex.treino_exercicio_id, ex.observacao);
    } catch (e) {
      mostrarAlerta("Erro ao salvar observação: " + (e as Error).message);
    }
  }

  // ---------------- Substituir / reordenar exercícios da sessão ----------------

  let menuExercicioAberto = $state<number | null>(null);
  let substituindoExIdx = $state<number | null>(null);
  let reordenando = $state(false);
  let buscaSubstituir = $state("");

  function abrirSubstituir(exIdx: number) {
    substituindoExIdx = exIdx;
  }

  function fecharSubstituir() {
    substituindoExIdx = null;
    buscaSubstituir = "";
  }

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

  function abrirPicker(): void {
    mostrarPicker = true;
  }

  function fecharPicker(): void {
    mostrarPicker = false;
    buscaPicker = "";
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

  async function adicionarRapido(ex: Exercicio) {
    const novo = await construirExercicioSessao(ex);
    sessao = [...sessao, novo];
    houveAlteracaoEstrutura = true;
  }

  /** Escolha entre buscar na lista (Exercicios.svelte) ou criar um exercício avulso — só pra essa
   * sessão, sem entrar no catálogo reutilizável (ver createExercicioAvulso). */
  let mostrarEscolhaAdicionar = $state(false);

  let mostrarCriarAvulso = $state(false);
  let nomeAvulso = $state("");
  let padraoIdAvulso = $state("");
  let linhasMusculosAvulso = $state<LinhaMusculoInput[]>([]);
  let salvandoAvulso = $state(false);

  function abrirCriarAvulso(): void {
    nomeAvulso = "";
    padraoIdAvulso = "";
    linhasMusculosAvulso = [];
    mostrarCriarAvulso = true;
  }

  async function salvarExercicioAvulso(): Promise<void> {
    if (!nomeAvulso.trim()) {
      mostrarAlerta("Informe o nome do exercício.");
      return;
    }
    const musculosInput = await construirMusculosInput(linhasMusculosAvulso);
    if (!musculosInput.length) {
      mostrarAlerta("Informe ao menos um músculo envolvido.");
      return;
    }
    salvandoAvulso = true;
    try {
      const novoId = await createExercicioAvulso({
        nome: nomeAvulso.trim(),
        padrao_id: padraoIdAvulso || null,
        musculos: musculosInput,
      });
      const novoExercicio = await getExercicio(novoId);
      if (novoExercicio) {
        const novo = await construirExercicioSessao(novoExercicio);
        sessao = [...sessao, novo];
        houveAlteracaoEstrutura = true;
      }
      mostrarCriarAvulso = false;
    } catch (e) {
      mostrarAlerta("Erro ao criar exercício: " + (e as Error).message);
    } finally {
      salvandoAvulso = false;
    }
  }

  let arrastandoIdx = $state<number | null>(null);
  let itemReordenarRefs: (HTMLElement | null)[] = [];

  function iniciarArrasteExercicio(e: PointerEvent, idx: number) {
    arrastandoIdx = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moverDuranteArraste(e: PointerEvent) {
    if (arrastandoIdx === null) return;
    const y = e.clientY;
    for (let i = 0; i < itemReordenarRefs.length; i++) {
      const el = itemReordenarRefs[i];
      if (!el || i === arrastandoIdx) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if ((i < arrastandoIdx && y < meio) || (i > arrastandoIdx && y > meio)) {
        const novas = sessao.slice();
        const [item] = novas.splice(arrastandoIdx, 1);
        novas.splice(i, 0, item);
        sessao = novas;
        arrastandoIdx = i;
        houveAlteracaoEstrutura = true;
        break;
      }
    }
  }

  function finalizarArrasteExercicio() {
    arrastandoIdx = null;
  }

  $effect(() => {
    if (arrastandoIdx === null) return;
    window.addEventListener("pointermove", moverDuranteArraste);
    window.addEventListener("pointerup", finalizarArrasteExercicio);
    return () => {
      window.removeEventListener("pointermove", moverDuranteArraste);
      window.removeEventListener("pointerup", finalizarArrasteExercicio);
    };
  });

  let mostrarEscolhaEstrutura = $state(false);
  let mostrarConfirmConcluir = $state(false);

  function concluirTreino() {
    if (houveAlteracaoEstrutura) {
      mostrarEscolhaEstrutura = true;
    } else {
      mostrarConfirmConcluir = true;
    }
  }

  function registrosDoDiaAtual(): Map<string, { serie: number; peso: number | null; repeticoes: number | null }[]> {
    return new Map(
      sessao.map((ex) => [
        ex.exercicio_id,
        ex.sets.map((s) => ({ serie: s.serie, peso: s.peso, repeticoes: s.repeticoes })),
      ]),
    );
  }

  async function confirmarConcluirTreino() {
    mostrarConfirmConcluir = false;
    salvando = true;
    try {
      await salvarRegistrosDoDia(treinoId, hojeISO(), registrosDoDiaAtual());
      treinoLogSessao.limpar();
      navigate("/treino");
    } catch (e) {
      mostrarAlerta("Erro ao salvar: " + (e as Error).message);
      salvando = false;
    }
  }

  async function finalizarComEscolha(salvarNaRotina: boolean) {
    mostrarEscolhaEstrutura = false;
    salvando = true;
    try {
      await salvarRegistrosDoDia(treinoId, hojeISO(), registrosDoDiaAtual());
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
      mostrarAlerta("Erro ao salvar: " + (e as Error).message);
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
      <span class="stat-valor duracao">{duracaoLabel}</span>
    </div>
    <div class="stat-inline">
      <span class="stat-label">Séries</span>
      <span class="stat-valor">{seriesTotal}/{seriesPlanejadas}</span>
    </div>
    <button class="concluir" disabled={salvando} onclick={concluirTreino} aria-label="Concluir treino">
      {@render iconCheck()}
    </button>
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
            <span>Reps</span>
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
              {#if serieItem.repMin != null || serieItem.repMax != null}
                <button class="meta-cel" onclick={() => abrirEditarMetaSerie(exIdx, setIdx)}>
                  {faixaMeta(serieItem)}
                </button>
              {:else}
                <button
                  class="meta-cel meta-cel-vazia"
                  onclick={() => abrirEditarMetaSerie(exIdx, setIdx)}
                >—</button>
              {/if}
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
                {@render iconCheck()}
              </button>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(exIdx)}>+ Adicionar Série</button>
      </div>
    {/each}

    <button class="adicionar-btn" onclick={() => (mostrarEscolhaAdicionar = true)}>+ Adicionar Exercício</button>

    <button class="descartar" onclick={() => (mostrarConfirmDescartar = true)} disabled={salvando}>Descartar Treino</button>
  {/if}
</div>

{#if !loading && !naoEncontrada}
  {#if formatoDescanso === "anel"}
    <button
      class="descanso-anel"
      class:anel-atrasado={descansoAtrasado}
      style={`left:${anelPos.x}px; top:${anelPos.y}px;`}
      onpointerdown={iniciarArrasteAnel}
      aria-label="Cronômetro"
    >
      <svg viewBox="0 0 70 70" class="anel-svg">
        <circle cx="35" cy="35" r={ANEL_RAIO} class="anel-fundo" />
        <circle
          cx="35"
          cy="35"
          r={ANEL_RAIO}
          class="anel-progresso"
          style={`stroke-dasharray:${ANEL_CIRCUNFERENCIA}; stroke-dashoffset:${ANEL_CIRCUNFERENCIA * (1 - progressoDescanso)};`}
        />
      </svg>
      <span class="anel-centro">
        <span class="anel-tempo">
          {exercicioDescansando ? formatMMSSAssinado(restanteDescansoSeg) : formatMMSS(duracaoTotalSeg)}
        </span>
      </span>
    </button>
    {#if anelExpandido}
      <div class="anel-popover" style={estiloPopoverAnel()}>
        {#if exercicioDescansando}
          <div class="anel-popover-linha">
            <button class="descanso-ajuste" disabled={restanteDescansoSeg < 15} onclick={() => ajustarDescanso(-15)}>-15</button>
            <button class="descanso-pular" onclick={() => { pularDescanso(); anelExpandido = false; }}>Pular</button>
            <button class="descanso-ajuste" onclick={() => ajustarDescanso(15)}>+15</button>
          </div>
        {/if}
        <button class="formato-descanso-btn" onclick={() => (formatoDescanso = "barra")}>Ver como barra</button>
      </div>
    {/if}
  {:else}
    <div class="descanso-bar" class:descanso-atrasado={descansoAtrasado}>
      <div class="descanso-progresso" style={`width: ${progressoDescanso * 100}%`}></div>
      <div class="descanso-bar-conteudo">
        <button class="formato-descanso-btn-icon" onclick={() => (formatoDescanso = "anel")} aria-label="Ver como anel">
          ◯
        </button>
        <div class="descanso-central">
          {#if exercicioDescansando}
            <button class="descanso-ajuste" disabled={restanteDescansoSeg < 15} onclick={() => ajustarDescanso(-15)}>-15</button>
            <span class="descanso-tempo">{formatMMSSAssinado(restanteDescansoSeg)}</span>
            <button class="descanso-ajuste" onclick={() => ajustarDescanso(15)}>+15</button>
          {:else}
            <span class="descanso-tempo">{formatMMSS(duracaoTotalSeg)}</span>
          {/if}
        </div>
        {#if exercicioDescansando}
          <button class="descanso-pular" onclick={pularDescanso}>Pular</button>
        {/if}
      </div>
    </div>
  {/if}
{/if}

{#snippet iconCheck()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <polyline points="4 12 10 18 20 6" />
  </svg>
{/snippet}
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
{#snippet iconLista()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
{/snippet}
{#snippet iconAvulso()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
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
  <ConfirmDialog
    titulo={`Remover a Série ${sessao[exIdxSerie]?.sets[setIdxSerie]?.serie ?? ""}?`}
    textoConfirmar="Excluir"
    textoCancelar="Cancelar"
    onConfirmar={() => {
      removerSerie(exIdxSerie, setIdxSerie);
      menuSerieAberto = null;
    }}
    onCancelar={() => (menuSerieAberto = null)}
  />
{/if}

{#if mostrarEscolhaAdicionar}
  <ActionSheet
    titulo="Adicionar Exercício"
    onFechar={() => (mostrarEscolhaAdicionar = false)}
    opcoes={[
      { label: "Lista", icon: iconLista, onSelect: abrirPicker },
      { label: "Avulso", subtitulo: "Só pra esse treino, não entra no catálogo", icon: iconAvulso, onSelect: abrirCriarAvulso },
    ]}
  />
{/if}

{#if mostrarCriarAvulso}
  <div class="tela-avulso">
    <div class="tela-avulso-conteudo">
      <div class="picker-header">
        <button class="voltar-icon" onclick={() => (mostrarCriarAvulso = false)} aria-label="Cancelar">←</button>
        <h1>Exercício Avulso</h1>
        <button class="criar" disabled={salvandoAvulso} onclick={salvarExercicioAvulso} aria-label="Adicionar">
          {@render iconCheck()}
        </button>
      </div>
      <ExercicioCampos bind:nome={nomeAvulso} bind:padraoId={padraoIdAvulso} bind:linhasMusculos={linhasMusculosAvulso} />
    </div>
  </div>
{/if}

{#if substituindoExIdx !== null}
  {@const idxSubstituir = substituindoExIdx}
  <Exercicios
    modoSelecao
    tituloSelecao="Substituir por"
    substituirExercicioId={sessao[idxSubstituir]?.exercicio_id ?? null}
    bind:busca={buscaSubstituir}
    onSelecionar={substituirExercicio}
    onFechar={fecharSubstituir}
  />
{/if}

{#if mostrarPicker}
  <Exercicios
    modoSelecao
    tituloSelecao="Adicionar Exercício"
    excluirIds={sessao.map((s) => s.exercicio_id)}
    bind:busca={buscaPicker}
    onSelecionar={adicionarRapido}
    onFechar={fecharPicker}
  />
{/if}

{#if mostrarEscolhaEstrutura}
  <ActionSheet
    titulo="Concluir como"
    onFechar={() => (mostrarEscolhaEstrutura = false)}
    opcoes={[
      {
        label: "Rotina padrão",
        subtitulo: "Salva o treino de hoje sem alterar a rotina",
        onSelect: () => finalizarComEscolha(false),
      },
      {
        label: "Rotina ajustada",
        subtitulo: "Salva o treino de hoje e também as mudanças na rotina",
        onSelect: () => finalizarComEscolha(true),
      },
      { label: "Cancelar", onSelect: () => (mostrarEscolhaEstrutura = false) },
    ]}
  />
{/if}

{#if reordenando}
  <div class="tela-reordenar">
    <div class="reordenar-conteudo">
      <div class="picker-header">
        <button class="voltar-icon" onclick={() => (reordenando = false)} aria-label="Voltar">←</button>
        <h1>Reordenar</h1>
        <span class="header-spacer"></span>
      </div>
      <div class="reordenar-lista">
        {#each sessao as ex, idx (ex.exercicio_id)}
          <div
            class="reordenar-item"
            class:arrastando={arrastandoIdx === idx}
            bind:this={itemReordenarRefs[idx]}
          >
            <button class="remover-circulo" onclick={() => removerExercicio(idx)} aria-label="Remover">−</button>
            <span class="reordenar-nome">{ex.nome}</span>
            <button
              class="handle-arraste"
              onpointerdown={(e) => iniciarArrasteExercicio(e, idx)}
              aria-label="Arrastar para reordenar"
            >
              ☰
            </button>
          </div>
        {/each}
      </div>
      <button class="feito-btn" onclick={() => (reordenando = false)}>Feito</button>
    </div>
  </div>
{/if}

{#if mostrarConfirmDescartar}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar este treino?"
    textoConfirmar="Descartar Treino"
    onConfirmar={descartarTreino}
    onCancelar={() => (mostrarConfirmDescartar = false)}
  />
{/if}

{#if mostrarConfirmConcluir}
  <ConfirmDialog
    titulo="Concluir e salvar este treino?"
    textoConfirmar="Concluir Treino"
    destrutivo={false}
    onConfirmar={confirmarConcluirTreino}
    onCancelar={() => (mostrarConfirmConcluir = false)}
  />
{/if}

{#if alertaMsg}
  <AlertDialog mensagem={alertaMsg} onFechar={() => (alertaMsg = null)} />
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

{#if editandoMetaSerie !== null}
  <Sheet titulo="Meta de Repetições" onFechar={() => (editandoMetaSerie = null)}>
    <div class="meta-editor-campos">
      <label class="meta-editor-campo">
        <span>Mínimo</span>
        <input type="number" inputmode="numeric" placeholder="-" bind:value={metaRepMinTemp} />
      </label>
      <span class="meta-editor-a">a</span>
      <label class="meta-editor-campo">
        <span>Máximo</span>
        <input type="number" inputmode="numeric" placeholder="-" bind:value={metaRepMaxTemp} />
      </label>
    </div>
    <button class="meta-editor-salvar" onclick={salvarMetaSerie}>Salvar</button>
  </Sheet>
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
    font-size: 17px;
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
    font-size: 12px;
    color: var(--surface-muted);
  }
  .stat-valor {
    font-size: 17px;
    font-weight: 600;
  }
  .stat-valor.duracao {
    display: inline-block;
    min-width: 84px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .concluir {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border: none;
    border-radius: 50%;
    padding: 0;
    cursor: pointer;
  }
  .concluir svg {
    width: 18px;
    height: 18px;
  }
  .concluir:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .exercicio-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-5);
  }
  .exercicio-card h2 {
    font-size: var(--font-size-md);
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
    color: var(--surface-fg);
  }
  .menu-exercicio-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    line-height: 1;
    cursor: pointer;
  }
  .descanso {
    display: inline-block;
    font-size: var(--font-size-base);
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
    font-size: var(--font-size-base);
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
    grid-template-columns: 40px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 40px;
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
  .linha.cabecalho span {
    text-align: center;
  }
  .linha.concluida {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
    margin: 0 calc(var(--space-4) * -1);
    padding: var(--space-1) var(--space-4);
  }
  .linha.concluida input,
  .linha.concluida .serie-num {
    background: transparent;
    border-color: transparent;
  }
  .serie-num {
    width: 40px;
    height: 36px;
    border-radius: 8px;
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
  .serie-num.medalha svg {
    width: 26px;
    height: 26px;
  }
  .meta-cel {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--surface-muted);
    background: none;
    border: none;
    padding: 0;
    text-align: center;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .meta-cel-vazia {
    color: var(--surface-muted);
  }
  .meta-editor-campos {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: var(--space-3);
    margin: var(--space-2) 0 var(--space-4);
  }
  .meta-editor-campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .meta-editor-campo input {
    width: 88px;
    height: 44px;
    box-sizing: border-box;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    text-align: center;
  }
  .meta-editor-a {
    padding-bottom: var(--space-3);
    color: var(--surface-muted);
  }
  .meta-editor-salvar {
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
  .linha input {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding: 0 var(--space-1);
    border-radius: 8px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-md);
    text-align: center;
  }
  .check {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-muted);
    cursor: pointer;
  }
  .check svg {
    width: 18px;
    height: 18px;
  }
  .check.ativo {
    background: transparent;
    color: #fff;
    border-color: transparent;
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
    height: 40px;
    margin-top: var(--space-3);
    padding: 0 var(--space-3);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: none;
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
  .tela-reordenar {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    overflow: hidden;
  }
  .tela-avulso {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    overflow-y: auto;
  }
  .tela-avulso-conteudo {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
  }
  .criar {
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
  .criar svg {
    width: 18px;
    height: 18px;
  }
  .criar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .reordenar-conteudo {
    max-width: 480px;
    height: 100%;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .voltar-icon {
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: var(--space-1);
  }
  .reordenar-lista {
    overflow-y: auto;
    flex: 1;
  }
  .reordenar-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    touch-action: none;
  }
  .reordenar-item.arrastando {
    background: var(--surface-card);
    opacity: 0.8;
  }
  .remover-circulo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .reordenar-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .handle-arraste {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    cursor: grab;
    touch-action: none;
    padding: var(--space-2);
  }
  .feito-btn {
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
    /* Acima do picker de exercícios (120/130) e das telas cheias de avulso/reordenar (150) desta
       tela — o cronômetro não pode ficar escondido enquanto o usuário navega por elas. */
    z-index: 160;
    background: var(--surface-card);
    border-top: 1px solid var(--surface-border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .descanso-progresso {
    height: 3px;
    background: var(--color-primary);
    transition: width 1s linear, background 0.2s;
  }
  .descanso-bar.descanso-atrasado .descanso-progresso {
    background: var(--color-danger);
  }
  .descanso-bar.descanso-atrasado .descanso-tempo {
    color: var(--color-danger);
  }
  .descanso-bar-conteudo {
    max-width: 520px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .descanso-central {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .descanso-ajuste {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .descanso-ajuste:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .descanso-tempo {
    flex-shrink: 0;
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
  .formato-descanso-btn-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .formato-descanso-btn {
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-1);
  }
  .descanso-anel {
    position: fixed;
    z-index: 160;
    width: 70px;
    height: 70px;
    padding: 0;
    border: none;
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    touch-action: none;
  }
  .anel-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .anel-fundo {
    fill: none;
    stroke: var(--surface-border);
    stroke-width: 6;
  }
  .anel-progresso {
    fill: none;
    stroke: #3b82f6;
    stroke-width: 6;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear, stroke 0.2s;
  }
  .anel-centro {
    position: relative;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--surface-card);
    box-shadow: var(--shadow-float);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .descanso-anel.anel-atrasado .anel-progresso {
    stroke: var(--color-danger);
  }
  .descanso-anel.anel-atrasado .anel-tempo {
    color: var(--color-danger);
  }
  .anel-tempo {
    position: relative;
    font-size: 16px;
    font-weight: 700;
    color: var(--surface-fg);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .anel-popover {
    position: fixed;
    z-index: 161;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    box-shadow: var(--shadow-float);
  }
  .anel-popover-linha {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .anel-popover-linha .descanso-pular {
    padding: var(--space-2) var(--space-3);
  }
</style>
