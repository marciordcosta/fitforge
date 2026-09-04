<script lang="ts">
  import { navigate, voltar, router } from "../../lib/router.svelte";
  import { toISODate, parseISODate } from "../../lib/dates";
  import ActionSheet, { type AcaoSheet } from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import PieChart from "../../components/PieChart.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import Exercicios from "./Exercicios.svelte";
  import {
    listMusculos,
    listTreinos,
    getTreino,
    getVolumeRealizadoBruto,
    getUltimoRegistro,
    getHistoricoExercicio,
    salvarExerciciosRotina,
    trocarExercicioTreinoExercicio,
    trocarExercicioEntreRotinas,
    renameTreino,
    listMetasMusculo,
    salvarMetaMusculo,
    limparMetasMusculoRotina,
    getRegistrosPorTreinoDesde,
    DIAS_SEMANA_ABREV,
    DIAS_SEMANA_COMPLETO,
    abreviarMusculo,
    type Musculo,
    type TreinoComExercicios,
    type TreinoExercicio,
    type Exercicio,
  } from "../../lib/treinoApi";

  let aba = $state<"planejado" | "realizado">("planejado");
  let musculos = $state<Musculo[]>([]);
  let treinos = $state<TreinoComExercicios[]>([]);

  let mesBase = $state(new Date());
  let linhasRealizadoMes = $state<{ data: string; musculo_id: string; series_equivalentes: number }[]>([]);
  let carregandoRealizado = $state(false);
  let carregouRealizadoAlgumaVez = $state(false);

  /** Rotinas com dia informado sobem pro topo, ordenadas pelo dia mais próximo; sem dia, mantém a ordenação manual (mesma lógica da tela inicial de Treino). */
  function ordenarPorDia(lista: TreinoComExercicios[]): TreinoComExercicios[] {
    const hoje = new Date().getDay();
    const comDia = lista
      .filter((t) => t.dia_semana != null)
      .sort((a, b) => ((a.dia_semana! - hoje + 7) % 7) - ((b.dia_semana! - hoje + 7) % 7));
    const semDia = lista.filter((t) => t.dia_semana == null);
    return [...comDia, ...semDia];
  }

  /** 1RM histórico de cada exercício usado em alguma rotina — carregado uma vez, em paralelo,
   * pra alimentar a setinha de tendência de cada músculo sem precisar reconsultar por linha. */
  let historicoPorExercicio = $state<Map<string, { melhor1rm: number }[]>>(new Map());

  /** Busca em lotes pequenos (não tudo de uma vez via Promise.all) — muitas rotinas/exercícios
   * juntos saturavam o limite de conexões simultâneas do navegador, deixando outras requisições
   * (tipo salvar um ajuste de série) na fila atrás dessa busca em massa. */
  async function carregarHistoricoTodos(treinosCarregados: TreinoComExercicios[]): Promise<void> {
    const ids = new Set<string>();
    for (const t of treinosCarregados) {
      for (const ex of t.exercicios) ids.add(ex.exercicio_id);
    }
    const lista = Array.from(ids);
    const TAMANHO_LOTE = 4;
    for (let i = 0; i < lista.length; i += TAMANHO_LOTE) {
      const lote = lista.slice(i, i + TAMANHO_LOTE);
      const resultados = await Promise.all(lote.map(async (id) => [id, await getHistoricoExercicio(id)] as const));
      const mapa = new Map(historicoPorExercicio);
      for (const [id, pontos] of resultados) mapa.set(id, pontos);
      historicoPorExercicio = mapa;
    }
  }

  /** Quantas sessões (dias distintos de treino_registros) cada rotina teve DEPOIS da última vez
   * que sua composição foi editada — "registros" no rodapé do card, zera sozinho a cada Salvar
   * (o backend atualiza treinos.composicao_atualizada_em via trigger, cobrindo qualquer forma de
   * editar a rotina, não só o editor completo). */
  let registrosPorTreino = $state<Map<string, number>>(new Map());

  async function carregarRegistrosPorTreino(treinosCarregados: TreinoComExercicios[]): Promise<void> {
    if (!treinosCarregados.length) {
      registrosPorTreino = new Map();
      return;
    }
    const dataMinima = toISODate(
      new Date(Math.min(...treinosCarregados.map((t) => new Date(t.composicao_atualizada_em).getTime()))),
    );
    const registros = await getRegistrosPorTreinoDesde(dataMinima);
    const diasPorTreino = new Map<string, Set<string>>();
    for (const r of registros) {
      if (!r.treino_id) continue;
      const dias = diasPorTreino.get(r.treino_id) ?? new Set<string>();
      dias.add(r.data);
      diasPorTreino.set(r.treino_id, dias);
    }
    const mapa = new Map<string, number>();
    for (const t of treinosCarregados) {
      const desde = toISODate(new Date(t.composicao_atualizada_em));
      const dias = diasPorTreino.get(t.id);
      const count = dias ? Array.from(dias).filter((d) => d >= desde).length : 0;
      mapa.set(t.id, count);
    }
    registrosPorTreino = mapa;
  }

  async function carregarBase() {
    const [musculosCarregados, treinosCarregados, metasCarregadas] = await Promise.all([
      listMusculos(),
      listTreinos(),
      listMetasMusculo(),
    ]);
    musculos = musculosCarregados;
    treinos = ordenarPorDia(treinosCarregados);
    metasMusculo = new Map(metasCarregadas.map((m) => [chaveMeta(m.treino_id, m.musculo_id), m.meta_series]));
    void carregarHistoricoTodos(treinosCarregados);
    void carregarRegistrosPorTreino(treinosCarregados);
    await carregarRealizado();
  }

  void carregarBase();

  /** 1 série conta 1 para cada músculo trabalhado no exercício, sem ponderar por papel/peso — usado só na grade semanal (quantidade por dia), que fica de fora do modo de contribuição de propósito. */
  function contarSeriesPorMusculo(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries) continue;
      for (const m of ex.exercicio?.musculos ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries);
      }
    }
    return mapa;
  }

  /** Modo de contribuição: cada série soma peso_contribuicao (0.25 a 1) pra cada músculo que
   * trabalha — igual à Distribuição Semanal — em vez de contar a série inteira pra todo mundo.
   * Um músculo secundário (ex: tríceps no supino, peso 0.25) aparece proporcional ao quanto ele
   * realmente participa, não como se tivesse recebido o mesmo estímulo do músculo primário. Sem
   * normalizar pra somar 1 (o primário mantém quase o valor cheio); a soma por músculo pode ficar
   * abaixo do total de séries da rotina, mas não mais inflada como na contagem bruta. */
  function contarSeriesPorMusculoPonderado(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries) continue;
      for (const m of ex.exercicio?.musculos ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
      }
    }
    return mapa;
  }

  /** Números do modo de contribuição costumam vir com decimais (0.25, 4.3...) — arredonda pro
   * 0.5 mais próximo pra não mostrar frações estranhas tipo 0.3, e mostra inteiro quando cai redondo. */
  /** Arredonda pro 0.5 mais próximo — usado tanto pro texto (formatValor) quanto pro cálculo da
   * largura das barras da Distribuição Semanal, pra dois valores que mostram o mesmo número
   * exibido (ex: os dois "6" arredondados de 5.8 e 6.2) renderizarem a MESMA largura de barra. */
  function arredondarValor(valor: number): number {
    return Math.round(valor * 2) / 2;
  }

  function formatValor(valor: number): string {
    const arred = arredondarValor(valor);
    return Number.isInteger(arred) ? String(arred) : arred.toFixed(1);
  }

  /**
   * Cor por faixa do percentual ACUMULADO (regra 80/20 — corte em 20%/50%), com margem
   * de tolerância pra não trocar de cor por pouca diferença perto do corte. A lista já
   * vem ordenada do músculo mais dominante pro menos — o acumulado soma na ordem, então
   * mostra visualmente quantos músculos concentram a maior parte do volume da rotina.
   * Faixa B alargada (20-50, não 20-30): com poucos músculos por rotina, um salto de um
   * músculo pro outro costuma passar de 10 pontos — numa janela estreita, o acumulado
   * pula direto de A pra C sem nunca cair em B.
   */
  const CORTE_A = 20;
  const CORTE_B = 50;
  const MARGEM_FAIXA = 5;
  const CORES_FAIXA = { a: "#60a5fa", b: "#fbbf24", c: "#f87171" };

  function corPorFaixa(acumulado: number): string {
    if (acumulado <= CORTE_A + MARGEM_FAIXA) return CORES_FAIXA.a;
    if (acumulado <= CORTE_B + MARGEM_FAIXA) return CORES_FAIXA.b;
    return CORES_FAIXA.c;
  }

  interface Partes {
    a: number;
    b: number;
    c: number;
  }

  function partesVazias(): Partes {
    return { a: 0, b: 0, c: 0 };
  }

  function somarPartes(...listas: Partes[]): Partes {
    return listas.reduce((acc, p) => ({ a: acc.a + p.a, b: acc.b + p.b, c: acc.c + p.c }), partesVazias());
  }

  function partesParaSegmentos(p: Partes): { valor: number; cor: string }[] {
    return [
      { valor: p.a, cor: CORES_FAIXA.a },
      { valor: p.b, cor: CORES_FAIXA.b },
      { valor: p.c, cor: CORES_FAIXA.c },
    ];
  }

  /**
   * Classifica cada série da rotina pela POSIÇÃO no treino (não pelo músculo) — a fadiga
   * acumula ao longo do treino, então uma série no início vale mais que uma no fim. Usa a
   * mesma regra 80/20 (corPorFaixa) sobre o percentual acumulado de séries já feitas na
   * ordem dos exercícios. Modo de contribuição: cada série soma peso_contribuicao (não 1
   * inteiro) pra cada músculo que ela trabalha, igual contarSeriesPorMusculoPonderado — as
   * partes de cada músculo somam o mesmo total ponderado dele.
   */
  function contarSeriesPorFaixaDePosicao(treino: TreinoComExercicios): Map<string, Partes> {
    const exerciciosOrdenados = treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
    const totalSeries = exerciciosOrdenados.reduce((acc, ex) => acc + ex.series.length, 0);
    const mapa = new Map<string, Partes>();
    if (!totalSeries) return mapa;

    let posicao = 0;
    for (const ex of exerciciosOrdenados) {
      const musculosEx = ex.exercicio?.musculos ?? [];
      for (let s = 0; s < ex.series.length; s++) {
        posicao += 1;
        const cor = corPorFaixa((posicao / totalSeries) * 100);
        for (const m of musculosEx) {
          const atual = mapa.get(m.musculo_id) ?? partesVazias();
          if (cor === CORES_FAIXA.a) atual.a += m.peso_contribuicao;
          else if (cor === CORES_FAIXA.b) atual.b += m.peso_contribuicao;
          else atual.c += m.peso_contribuicao;
          mapa.set(m.musculo_id, atual);
        }
      }
    }
    return mapa;
  }

  /**
   * Distribuição estática de cada rotina (sem acompanhamento ao vivo — isso fica só no
   * card semanal). Modo de contribuição: cada série soma peso_contribuicao pra cada
   * músculo que o exercício trabalha (mesma regra do gráfico/anel), não a série inteira —
   * um músculo secundário aparece proporcional ao quanto participa, não como se tivesse
   * o mesmo estímulo do primário. A barra é dividida nas faixas A/B/C por POSIÇÃO no
   * treino (contarSeriesPorFaixaDePosicao) — não pela dominância do músculo.
   */
  interface LinhaRotina {
    chave: string;
    nome: string;
    valor: number;
    bruto: number;
    pct: number;
    partes: Partes;
    musculo: Musculo | null;
    subItens: { musculo: Musculo; valor: number; bruto: number; partes: Partes }[] | null;
  }

  const distribuicaoPorTreino = $derived.by(() => {
    return treinos.map((t) => {
      const totalSeries = t.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
      const mapaValor = contarSeriesPorMusculoPonderado(t);
      const mapaBruto = contarSeriesPorMusculo(t);
      const mapaFaixaPosicao = contarSeriesPorFaixaDePosicao(t);
      const itens = musculos
        .map((m) => ({
          musculo: m,
          valor: mapaValor.get(m.id) ?? 0,
          bruto: mapaBruto.get(m.id) ?? 0,
          partes: mapaFaixaPosicao.get(m.id) ?? partesVazias(),
        }))
        .filter((item) => item.valor > 0);

      const porGrupo = new Map<string, { nome: string; itens: typeof itens }>();
      const avulsos: typeof itens = [];
      for (const item of itens) {
        const agrupamento = item.musculo.agrupamento;
        if (agrupamento) {
          const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
          grupo.itens.push(item);
          porGrupo.set(agrupamento.id, grupo);
        } else {
          avulsos.push(item);
        }
      }

      const base: Omit<LinhaRotina, "pct">[] = [];
      for (const [id, grupo] of porGrupo) {
        base.push({
          chave: id,
          nome: grupo.nome,
          valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
          bruto: grupo.itens.reduce((acc, i) => acc + i.bruto, 0),
          partes: somarPartes(...grupo.itens.map((i) => i.partes)),
          musculo: null,
          subItens: grupo.itens,
        });
      }
      for (const item of avulsos) {
        base.push({
          chave: item.musculo.id,
          nome: item.musculo.nome,
          valor: item.valor,
          bruto: item.bruto,
          partes: item.partes,
          musculo: item.musculo,
          subItens: null,
        });
      }
      base.sort((a, b) => b.valor - a.valor);

      const lista: LinhaRotina[] = base.map((item) => ({
        ...item,
        pct: totalSeries > 0 ? (item.valor / totalSeries) * 100 : 0,
      }));
      return { treino: t, lista };
    });
  });

  /** Qual coluna (Total/Pond./Acum.) está ordenando o card de cada rotina — toca em qualquer
   * valor/rótulo da coluna pra escolher. Ausência no mapa = padrão ("ponderado"). */
  let ordemPorTreino = $state<Map<string, CampoOrdenacaoSeries>>(new Map());

  function definirOrdemTreino(treinoId: string, campo: CampoOrdenacaoSeries): void {
    const copia = new Map(ordemPorTreino);
    copia.set(treinoId, campo);
    ordemPorTreino = copia;
  }

  /** Cards de rotina começam ocultos (só o cabeçalho) — tocar no cabeçalho expande/recolhe. */
  let treinosExpandidos = $state<Set<string>>(new Set());

  function alternarExpandidoTreino(treinoId: string): void {
    const copia = new Set(treinosExpandidos);
    if (copia.has(treinoId)) copia.delete(treinoId);
    else copia.add(treinoId);
    treinosExpandidos = copia;
  }

  /** Número de séries "efetivo" no modo por fadiga: desconta pela faixa em que cada série caiu
   * (A = fresco, conta cheio; B = meio, 70%; C = mais fatigado, 40%) — uma forma de aproximar
   * quanto do volume bruto realmente equivale a estímulo de qualidade. */
  function valorEfetivoFadiga(partes: Partes): number {
    return partes.a * 1 + partes.b * 0.7 + partes.c * 0.4;
  }

  type CampoOrdenacaoSeries = "total" | "ponderado" | "acumulado";

  /** Qual coluna (Total/Pond./Acum.) está ordenando a Distribuição Semanal — toca em qualquer
   * rótulo/valor da coluna pra escolher. */
  let ordemSemanal = $state<CampoOrdenacaoSeries>("ponderado");

  function valorPorCampoOrdenacao(item: { valor: number; bruto: number; partes: Partes }, campo: CampoOrdenacaoSeries): number {
    if (campo === "total") return item.bruto;
    if (campo === "acumulado") return valorEfetivoFadiga(item.partes);
    return item.valor;
  }

  /** Ordena pela coluna escolhida (total bruto, ponderado ou acumulado/fadiga) — usado tanto na
   * Distribuição Semanal quanto nos cards de cada rotina, pra manter os 2 lugares consistentes. */
  function ordenarPorCampo<
    T extends { valor: number; bruto: number; partes: Partes; subItens: { valor: number; bruto: number; partes: Partes }[] | null },
  >(lista: T[], campo: CampoOrdenacaoSeries): T[] {
    return lista
      .map((item) =>
        item.subItens
          ? {
              ...item,
              subItens: item.subItens
                .slice()
                .sort((a, b) => valorPorCampoOrdenacao(b, campo) - valorPorCampoOrdenacao(a, campo)),
            }
          : item,
      )
      .sort((a, b) => valorPorCampoOrdenacao(b, campo) - valorPorCampoOrdenacao(a, campo));
  }

  /** Dados pros anéis de dominância (Distribuição Semanal e por rotina) na coluna escolhida —
   * mesma lista já usada pelos cards (bruto/ponderado/acumulado embutidos em cada linha/subitem),
   * só reprojetada pro valor da coluna em vez de sempre ponderado. `itensGrupo` soma por
   * agrupamento (modo padrão do anel); `itens` é por músculo individual (modo dominância/ABC). */
  function itensParaGrafico<
    T extends {
      nome: string;
      valor: number;
      bruto: number;
      partes: Partes;
      musculo: Musculo | null;
      subItens: { musculo: Musculo; valor: number; bruto: number; partes: Partes }[] | null;
    },
  >(lista: T[], campo: CampoOrdenacaoSeries): { itensGrupo: { nome: string; valor: number }[]; itens: { musculo: Musculo; valor: number }[]; total: number } {
    const itensGrupo = lista
      .map((item) => ({ nome: item.nome, valor: valorPorCampoOrdenacao(item, campo) }))
      .filter((i) => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    const itens = lista
      .flatMap((item) => item.subItens ?? (item.musculo ? [{ musculo: item.musculo, valor: item.valor, bruto: item.bruto, partes: item.partes }] : []))
      .map((item) => ({ musculo: item.musculo, valor: valorPorCampoOrdenacao(item, campo) }))
      .filter((i) => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((acc, i) => acc + i.valor, 0);
    return { itensGrupo, itens, total };
  }

  const totaisSemanais = $derived.by(() => {
    let exercicios = 0;
    let series = 0;
    for (const t of treinos) {
      exercicios += t.exercicios.length;
      series += t.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
    }
    return { exercicios, series };
  });

  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

  let mostrarGradeSemanal = $state(false);
  /** null = mostra todos os músculos; caso contrário, restringe a grade a esses ids (série clicada ou rotina do card). */
  let filtroMusculosGrade = $state<Set<string> | null>(null);

  function abrirGradeSemanal(musculoIds: string[] | null): void {
    filtroMusculosGrade = musculoIds ? new Set(musculoIds) : null;
    modoEdicaoMetas = false;
    mostrarGradeSemanal = true;
  }

  /** Meta manual de séries por músculo dentro de uma rotina (opcional, célula a célula na grade
   * "Distribuição na Semana"), chave `${treinoId}:${musculoId}`. Puramente informativa: some na
   * grade como "atual/meta" e vira o saldo mostrado na edição de rotina — nada aqui trava a
   * gravação se o saldo ficar negativo (o usuário só vê em vermelho). */
  let metasMusculo = $state<Map<string, number>>(new Map());
  let modoEdicaoMetas = $state(false);
  let editandoMeta = $state<{ treinoId: string; musculo: Musculo; valorAtual: number | null; valorAtualSeries: number } | null>(null);

  function chaveMeta(treinoId: string, musculoId: string): string {
    return `${treinoId}:${musculoId}`;
  }

  /** `valorAtualSeries` é o número de séries JÁ FEITAS naquela célula (não a meta) — guardado à
   * parte pra, ao salvar, detectar quando a meta escolhida bate com o que já foi feito. */
  function abrirEditarMeta(treinoId: string, musculo: Musculo, valorAtualSeries: number): void {
    editandoMeta = {
      treinoId,
      musculo,
      valorAtual: metasMusculo.get(chaveMeta(treinoId, musculo.id)) ?? valorAtualSeries,
      valorAtualSeries,
    };
  }

  const OPCOES_META: { valor: number | null; label: string }[] = [
    { valor: null, label: "Sem meta" },
    ...Array.from({ length: 31 }, (_, i) => ({ valor: i, label: String(i) })),
  ];

  async function salvarMetaSelecionada(valorSelecionado: number | null): Promise<void> {
    if (!editandoMeta) return;
    const { treinoId, musculo, valorAtualSeries } = editandoMeta;
    // Meta igual ao que já foi feito já está "batida" — limpa em vez de mostrar "6/6".
    const valor = valorSelecionado === valorAtualSeries ? null : valorSelecionado;
    try {
      await salvarMetaMusculo(treinoId, musculo.id, valor);
      const mapa = new Map(metasMusculo);
      const chave = chaveMeta(treinoId, musculo.id);
      if (valor == null) mapa.delete(chave);
      else mapa.set(chave, valor);
      metasMusculo = mapa;
    } catch (e) {
      alert("Erro ao salvar meta: " + (e as Error).message);
    }
  }

  /** Dia (na roleta) e o próprio treino cujo dia está sendo movido, dentro da grade semanal. */
  let movendoDiaTreino = $state<{ treinoId: string; treinoNome: string; diaAtual: number } | null>(null);
  let salvandoDiaTreino = $state(false);

  function abrirMoverDiaTreino(treinoId: string, treinoNome: string, diaAtual: number): void {
    movendoDiaTreino = { treinoId, treinoNome, diaAtual };
  }

  const opcoesDiaSemana = ORDEM_DIAS.map((dia) => ({ valor: dia, label: DIAS_SEMANA_COMPLETO[dia] }));

  async function moverTreinoParaDia(novoDia: number): Promise<void> {
    if (!movendoDiaTreino) return;
    const { treinoId, treinoNome } = movendoDiaTreino;
    salvandoDiaTreino = true;
    try {
      await renameTreino(treinoId, treinoNome, novoDia);
      const atualizado = await getTreino(treinoId);
      if (atualizado) treinos = treinos.map((t) => (t.id === treinoId ? atualizado : t));
      // O editor completo é um rascunho à parte (cópia local) — sem isso o cabeçalho dele
      // continuava mostrando o dia antigo até fechar e abrir de novo.
      if (modalEditorRotina?.id === treinoId) modalEditorRotina = { ...modalEditorRotina, dia_semana: novoDia };
      movendoDiaTreino = null;
    } catch (e) {
      alert("Erro ao mover rotina de dia: " + (e as Error).message);
    } finally {
      salvandoDiaTreino = false;
    }
  }

  /** Grade semanal: uma coluna por dia (seg→dom), com a rotina daquele dia (ou descanso) e as séries por músculo. */
  const gradeSemanal = $derived.by(() => {
    const colunas = ORDEM_DIAS.map((dia) => {
      const treino = treinos.find((t) => t.dia_semana === dia) ?? null;
      return {
        dia,
        treinoId: treino?.id ?? null,
        treinoNome: treino?.nome_treino ?? null,
        mapa: treino ? contarSeriesPorMusculo(treino) : new Map<string, number>(),
        mapaPonderado: treino ? contarSeriesPorMusculoPonderado(treino) : new Map<string, number>(),
        mapaPartes: treino ? contarSeriesPorFaixaDePosicao(treino) : new Map<string, Partes>(),
      };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [musculoId, valor] of col.mapa) {
        totais.set(musculoId, (totais.get(musculoId) ?? 0) + valor);
      }
    }

    // Mesma coluna (Total/Pond./Acum.) escolhida no card "Distribuição Semanal" — a grade abre a
    // partir dele, então tanto a ordem dos músculos quanto o número mostrado em cada célula tem
    // que bater com o que está lá (o modo de editar meta é a única exceção: meta é sempre bruta,
    // então mostra/edita sempre o total, nunca ponderado/acumulado).
    const totaisPonderado = new Map<string, number>();
    for (const t of treinos) {
      for (const [id, v] of contarSeriesPorMusculoPonderado(t)) {
        totaisPonderado.set(id, (totaisPonderado.get(id) ?? 0) + v);
      }
    }
    const partesPorMusculo = partesFadigaSemanal();
    const campo = ordemSemanal;

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => {
        const va = valorPorCampoOrdenacao(
          { valor: totaisPonderado.get(a.id) ?? 0, bruto: totais.get(a.id) ?? 0, partes: partesPorMusculo.get(a.id) ?? partesVazias() },
          campo,
        );
        const vb = valorPorCampoOrdenacao(
          { valor: totaisPonderado.get(b.id) ?? 0, bruto: totais.get(b.id) ?? 0, partes: partesPorMusculo.get(b.id) ?? partesVazias() },
          campo,
        );
        return vb - va;
      })
      .map((m) => ({
        musculo: m,
        valores: colunas.map((col) => {
          const bruto = col.mapa.get(m.id) ?? 0;
          const ponderado = col.mapaPonderado.get(m.id) ?? 0;
          const acumulado = valorEfetivoFadiga(col.mapaPartes.get(m.id) ?? partesVazias());
          const display = campo === "total" ? bruto : campo === "ponderado" ? ponderado : acumulado;
          return { bruto, display };
        }),
      }));

    return { colunas, linhas };
  });

  /** Distribuição semanal (todas as rotinas somadas), ponderada pelo peso de contribuição parametrizado de cada músculo. */
  /** Partes (A/B/C por POSIÇÃO no treino — igual às rotinas individuais) de cada músculo, somadas
   * entre TODAS as rotinas da semana: cada rotina já classifica suas próprias séries pela posição
   * dela mesma (contarSeriesPorFaixaDePosicao) — aqui só soma isso músculo a músculo entre as
   * rotinas, sem tentar achar uma "posição única" entre rotinas diferentes (que não existiria).
   * Mesma regra 20/30/50 das barras de cada rotina, agora funcionando com rotinas diferentes
   * porque a soma acontece DEPOIS de cada rotina já ter feito sua própria classificação. */
  function partesFadigaSemanal(): Map<string, Partes> {
    const mapa = new Map<string, Partes>();
    for (const t of treinos) {
      for (const [musculoId, partes] of contarSeriesPorFaixaDePosicao(t)) {
        mapa.set(musculoId, somarPartes(mapa.get(musculoId) ?? partesVazias(), partes));
      }
    }
    return mapa;
  }

  const distribuicaoSemanal = $derived.by(() => {
    const mapa = new Map<string, number>();
    const mapaBruto = new Map<string, number>();
    for (const t of treinos) {
      for (const [id, v] of contarSeriesPorMusculo(t)) {
        mapaBruto.set(id, (mapaBruto.get(id) ?? 0) + v);
      }
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    const partesPorMusculo = partesFadigaSemanal();
    return musculos
      .map((m) => {
        const valor = Math.round(mapa.get(m.id) ?? 0);
        const bruto = Math.round(mapaBruto.get(m.id) ?? 0);
        const partes = partesPorMusculo.get(m.id) ?? partesVazias();
        return { musculo: m, valor, bruto, partes };
      })
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  interface LinhaSemanal {
    chave: string;
    nome: string;
    valor: number;
    bruto: number;
    partes: Partes;
    /** Preenchido só quando a linha é um músculo avulso (sem agrupamento) — usado pra abrir os exercícios dele. */
    musculo: Musculo | null;
    /** null = músculo avulso; senão, os músculos que compõem o total do grupo. */
    subItens: { musculo: Musculo; valor: number; bruto: number; partes: Partes }[] | null;
  }

  let gruposExpandidos = $state<Set<string>>(new Set());

  function alternarGrupo(chave: string): void {
    const copia = new Set(gruposExpandidos);
    if (copia.has(chave)) copia.delete(chave);
    else copia.add(chave);
    gruposExpandidos = copia;
  }

  /** Junta na Distribuição Semanal os músculos que têm o mesmo agrupamento (ex: Deltoide
   * Anterior/Lateral/Posterior somados em "Deltoide") — os músculos separados continuam
   * disponíveis expandindo o grupo. Músculos sem agrupamento ficam como estão. */
  const linhasSemanal = $derived.by(() => {
    const porGrupo = new Map<string, { nome: string; itens: typeof distribuicaoSemanal }>();
    const avulsos: typeof distribuicaoSemanal = [];
    for (const item of distribuicaoSemanal) {
      const agrupamento = item.musculo.agrupamento;
      if (agrupamento) {
        const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
        grupo.itens.push(item);
        porGrupo.set(agrupamento.id, grupo);
      } else {
        avulsos.push(item);
      }
    }

    const linhas: LinhaSemanal[] = [];
    for (const [id, grupo] of porGrupo) {
      linhas.push({
        chave: id,
        nome: grupo.nome,
        valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
        bruto: grupo.itens.reduce((acc, i) => acc + i.bruto, 0),
        partes: somarPartes(...grupo.itens.map((i) => i.partes)),
        musculo: null,
        subItens: grupo.itens.map((i) => ({ musculo: i.musculo, valor: i.valor, bruto: i.bruto, partes: i.partes })),
      });
    }
    for (const item of avulsos) {
      linhas.push({
        chave: item.musculo.id,
        nome: item.musculo.nome,
        valor: item.valor,
        bruto: item.bruto,
        partes: item.partes,
        musculo: item.musculo,
        subItens: null,
      });
    }
    return linhas.sort((a, b) => b.valor - a.valor);
  });

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));
  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);

  async function carregarRealizado() {
    carregandoRealizado = true;
    linhasRealizadoMes = await getVolumeRealizadoBruto(toISODate(mesInicio), toISODate(mesFim));
    carregandoRealizado = false;
    carregouRealizadoAlgumaVez = true;
  }

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregarRealizado();
  }

  function corVolume(v: number): string {
    if (v > 10) return "var(--color-negative)";
    if (v >= 5) return "var(--color-success)";
    return "var(--color-neutral)";
  }

  const SEMANAS_MES = [
    { label: "Semana 1", subtitulo: "01–07", diaIni: 1, diaFim: 7 },
    { label: "Semana 2", subtitulo: "08–14", diaIni: 8, diaFim: 14 },
    { label: "Semana 3", subtitulo: "15–21", diaIni: 15, diaFim: 21 },
    { label: "Semana 4", subtitulo: "22–fim", diaIni: 22, diaFim: 31 },
  ];

  /** Quantas das 4 semanas do mês tiveram ao menos um treino registrado (base pra calcular a média semanal). */
  const semanasComTreino = $derived.by(() => {
    return SEMANAS_MES.filter((sem) =>
      linhasRealizadoMes.some((l) => {
        const dia = parseISODate(l.data).getDate();
        return dia >= sem.diaIni && dia <= sem.diaFim;
      }),
    ).length;
  });

  /** Meta semanal por músculo (mesmo valor de distribuicaoSemanal, só num Map pra achar rápido) — usada pra comparar com o realizado do mês. */
  const metaPorMusculo = $derived(new Map(distribuicaoSemanal.map((item) => [item.musculo.id, item.valor])));

  /** Distribuição realizada no mês: média semanal (soma do mês ÷ semanas com treino), com o peso de contribuição parametrizado. */
  const listaRealizado = $derived.by(() => {
    const divisor = Math.max(semanasComTreino, 1);
    const mapa = new Map<string, number>();
    for (const l of linhasRealizadoMes) {
      mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
    }
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round((mapa.get(m.id) ?? 0) / divisor) }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  interface LinhaRealizado {
    chave: string;
    nome: string;
    valor: number;
    meta: number;
    musculo: Musculo | null;
    subItens: { musculo: Musculo; valor: number; meta: number }[] | null;
  }

  /** Mesmo agrupamento por musculos.agrupamento_id usado na Distribuição Semanal, aplicado ao Realizado. */
  const linhasRealizado = $derived.by(() => {
    const porGrupo = new Map<string, { nome: string; itens: typeof listaRealizado }>();
    const avulsos: typeof listaRealizado = [];
    for (const item of listaRealizado) {
      const agrupamento = item.musculo.agrupamento;
      if (agrupamento) {
        const grupo = porGrupo.get(agrupamento.id) ?? { nome: agrupamento.nome, itens: [] };
        grupo.itens.push(item);
        porGrupo.set(agrupamento.id, grupo);
      } else {
        avulsos.push(item);
      }
    }

    const linhas: LinhaRealizado[] = [];
    for (const [id, grupo] of porGrupo) {
      linhas.push({
        chave: id,
        nome: grupo.nome,
        valor: grupo.itens.reduce((acc, i) => acc + i.valor, 0),
        meta: grupo.itens.reduce((acc, i) => acc + (metaPorMusculo.get(i.musculo.id) ?? 0), 0),
        musculo: null,
        subItens: grupo.itens.map((i) => ({
          musculo: i.musculo,
          valor: i.valor,
          meta: metaPorMusculo.get(i.musculo.id) ?? 0,
        })),
      });
    }
    for (const item of avulsos) {
      linhas.push({
        chave: item.musculo.id,
        nome: item.musculo.nome,
        valor: item.valor,
        meta: metaPorMusculo.get(item.musculo.id) ?? 0,
        musculo: item.musculo,
        subItens: null,
      });
    }
    return linhas.sort((a, b) => b.valor - a.valor);
  });

  let mostrarGradeRealizado = $state(false);

  /** Grade do mês: uma coluna por semana (1 a 4), com as séries válidas realizadas por músculo. */
  const gradeRealizado = $derived.by(() => {
    const colunas = SEMANAS_MES.map((sem) => {
      const mapa = new Map<string, number>();
      for (const l of linhasRealizadoMes) {
        const dia = parseISODate(l.data).getDate();
        if (dia >= sem.diaIni && dia <= sem.diaFim) {
          mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
        }
      }
      return { label: sem.label, subtitulo: sem.subtitulo, mapa };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [id, v] of col.mapa) totais.set(id, (totais.get(id) ?? 0) + v);
    }

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => (totais.get(b.id) ?? 0) - (totais.get(a.id) ?? 0))
      .map((m) => ({ musculo: m, valores: colunas.map((c) => Math.round(c.mapa.get(m.id) ?? 0)) }));

    return { colunas, linhas };
  });

  function abrirMenuRealizado(): void {
    modalAberto = {
      titulo: "Realizado",
      opcoes: [
        { label: "Mês", icon: iconGrade, onSelect: () => (mostrarGradeRealizado = true) },
        { label: "Gráfico", icon: iconGrafico, onSelect: () => abrirDetalheRotina(mesLabel, listaRealizado) },
      ],
    };
  }

  // ---------------- Modal: menu simples (usado só pelo "Realizado") ----------------

  let modalAberto = $state<{
    titulo: string;
    opcoes: AcaoSheet[];
  } | null>(null);

  // ---------------- Modal: exercícios de um músculo dentro de uma rotina específica, com séries editáveis ----------------

  interface ItemMusculoRotina {
    treinoId: string;
    treinoNome: string;
    treinoExercicioId: string;
    exercicioId: string;
    exercicioNome: string;
    series: number;
  }

  /** multiRotina=true quando aberto a partir da Distribuição Semanal (agrega várias rotinas
   * que trabalham o músculo); false quando aberto a partir do card de uma rotina específica. */
  let modalMusculoRotina = $state<{ musculo: Musculo; itens: ItemMusculoRotina[]; multiRotina: boolean } | null>(null);
  /** Feedback visível no modal sobre o resultado da última troca de exercício. */
  let statusAjusteMusculo = $state<{ tipo: "ok" | "info" | "erro"; texto: string } | null>(null);
  /** Item cujo menu "Ver Exercício / Trocar Exercício" está aberto — usado tanto pelo modal
   * por músculo (read-only) quanto pelo editor completo da rotina. */
  let menuExercicioMusculo = $state<ItemMusculoRotina | null>(null);
  /** Item sendo trocado (o picker abre pra escolher o exercício que vai entrar no lugar dele). */
  let trocandoItemMusculo = $state<ItemMusculoRotina | null>(null);
  let mostrarPickerMusculo = $state(false);
  /** Só preenchido quando a troca parte do modal por músculo (filtra o picker pelo nome dele). */
  let buscaInicialTroca = $state("");

  function itensMusculoRotina(treino: TreinoComExercicios, musculoId: string): ItemMusculoRotina[] {
    return treino.exercicios
      .filter((te) => te.exercicio?.musculos.some((m) => m.musculo_id === musculoId))
      .map((te) => ({
        treinoId: treino.id,
        treinoNome: treino.nome_treino,
        treinoExercicioId: te.id,
        exercicioId: te.exercicio_id,
        exercicioNome: te.exercicio?.nome ?? "",
        series: te.series.length,
      }));
  }

  /** Mesmo item, mas juntando TODAS as rotinas que trabalham o músculo — usado pelo modal
   * aberto a partir da Distribuição Semanal (não fica preso a uma rotina só). */
  function itensMusculoTodasRotinas(musculoId: string): ItemMusculoRotina[] {
    return treinos.flatMap((t) => itensMusculoRotina(t, musculoId));
  }

  function definirModalMusculo(treino: TreinoComExercicios, musculo: Musculo): void {
    if (modalMusculoRotina?.musculo.id !== musculo.id) statusAjusteMusculo = null;
    modalMusculoRotina = { musculo, itens: itensMusculoRotina(treino, musculo.id), multiRotina: false };
  }

  /** Abre o mesmo modal por músculo, mas agregando exercícios de todas as rotinas que o
   * trabalham — usado ao clicar num músculo na Distribuição Semanal. */
  function abrirExercicios(musculo: Musculo): void {
    if (modalMusculoRotina?.musculo.id !== musculo.id) statusAjusteMusculo = null;
    modalMusculoRotina = { musculo, itens: itensMusculoTodasRotinas(musculo.id), multiRotina: true };
  }

  /** As 3 leituras do volume desse músculo na rotina: total bruto (1 série por músculo que ela
   * toca), válidas (ponderado por peso_contribuicao — quanto realmente trabalha) e acumuladas
   * (válidas descontadas pela faixa de fadiga: A=1, B=0.7, C=0.4). */
  const resumoMusculoModal = $derived.by(() => {
    if (!modalMusculoRotina) return null;
    const { musculo, itens } = modalMusculoRotina;
    // Soma sobre todas as rotinas envolvidas nos itens (1 só, no caso do modal por rotina; várias, no caso do modal aberto pela Distribuição Semanal).
    const treinoIds = new Set(itens.map((i) => i.treinoId));
    let totalBruto = 0;
    let totalValido = 0;
    let totalAcumulado = 0;
    for (const treino of treinos) {
      if (!treinoIds.has(treino.id)) continue;
      totalBruto += contarSeriesPorMusculo(treino).get(musculo.id) ?? 0;
      totalValido += contarSeriesPorMusculoPonderado(treino).get(musculo.id) ?? 0;
      const partes = contarSeriesPorFaixaDePosicao(treino).get(musculo.id) ?? partesVazias();
      totalAcumulado += valorEfetivoFadiga(partes);
    }
    return { totalBruto, totalValido, totalAcumulado };
  });

  // ---------------- Tendência de progressão do músculo (1RM médio das últimas sessões) ----------------

  interface TendenciaMusculo {
    status: "subindo" | "estavel" | "caindo";
  }

  let tendenciaMusculo = $state<TendenciaMusculo | null>(null);
  let carregandoTendencia = $state(false);
  let musculoIdTendenciaCarregada = $state<string | null>(null);

  /** Variação % do 1RM médio das últimas 4 sessões vs as 4 anteriores a essas — null se não há
   * histórico suficiente pra comparar. */
  function variacaoExercicio(pontos: { melhor1rm: number }[]): number | null {
    const N = 4;
    if (pontos.length < N + 2) return null;
    const recentes = pontos.slice(-N);
    const anteriores = pontos.slice(-2 * N, -N);
    if (anteriores.length < 2) return null;
    const mediaRecente = recentes.reduce((acc, p) => acc + p.melhor1rm, 0) / recentes.length;
    const mediaAnterior = anteriores.reduce((acc, p) => acc + p.melhor1rm, 0) / anteriores.length;
    if (mediaAnterior <= 0) return null;
    return (mediaRecente - mediaAnterior) / mediaAnterior;
  }

  /** Tendência de um exercício específico (não agregada por músculo) — mostrada como texto
   * discreto embaixo do nome no editor completo da rotina. */
  function tendenciaExercicio(exercicioId: string): "subindo" | "estavel" | "caindo" | null {
    const pontos = historicoPorExercicio.get(exercicioId);
    if (!pontos) return null;
    const v = variacaoExercicio(pontos);
    if (v == null) return null;
    if (v > 0.02) return "subindo";
    if (v < -0.02) return "caindo";
    return "estavel";
  }

  /** Peso de fadiga (0.4 a 1) de cada exercício da rotina, pela posição das séries dele —
   * reaproveita a mesma faixa A/B/C por posição (contarSeriesPorFaixaDePosicao/valorEfetivoFadiga)
   * que já desconta o "Acumulado": um exercício de fim de treino (mais fadigado) pesa menos na
   * tendência por músculo, mas nunca some da conta (nunca zero). */
  function pesosFadigaPorExercicio(treino: TreinoComExercicios): Map<string, number> {
    const exerciciosOrdenados = treino.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
    const totalSeries = exerciciosOrdenados.reduce((acc, ex) => acc + ex.series.length, 0);
    const partesPorExercicio = new Map<string, Partes>();
    if (!totalSeries) return new Map();
    let posicao = 0;
    for (const ex of exerciciosOrdenados) {
      const partes = partesPorExercicio.get(ex.id) ?? partesVazias();
      for (let s = 0; s < ex.series.length; s++) {
        posicao += 1;
        const cor = corPorFaixa((posicao / totalSeries) * 100);
        if (cor === CORES_FAIXA.a) partes.a += 1;
        else if (cor === CORES_FAIXA.b) partes.b += 1;
        else partes.c += 1;
      }
      partesPorExercicio.set(ex.id, partes);
    }
    const pesos = new Map<string, number>();
    for (const [id, partes] of partesPorExercicio) {
      const total = partes.a + partes.b + partes.c;
      pesos.set(id, total > 0 ? valorEfetivoFadiga(partes) / total : 1);
    }
    return pesos;
  }

  /** Tendência de um músculo dentro da rotina aberta no editor — média PONDERADA (pesosFadigaPorExercicio)
   * da variação dos exercícios que o trabalham (mesma regra de tendenciaExercicio): um exercício
   * de fim de treino ainda entra na conta, só que com menos peso. Texto discreto embaixo do nome. */
  function tendenciaMusculoEditor(musculoId: string): "subindo" | "estavel" | "caindo" | null {
    if (!modalEditorRotina) return null;
    const pesos = pesosFadigaPorExercicio(modalEditorRotina);
    let somaPonderada = 0;
    let somaPesos = 0;
    for (const te of modalEditorRotina.exercicios) {
      if (!te.exercicio?.musculos.some((m) => m.musculo_id === musculoId)) continue;
      const pontos = historicoPorExercicio.get(te.exercicio_id);
      if (!pontos) continue;
      const v = variacaoExercicio(pontos);
      if (v == null) continue;
      const peso = pesos.get(te.id) ?? 1;
      somaPonderada += v * peso;
      somaPesos += peso;
    }
    if (somaPesos === 0) return null;
    const media = somaPonderada / somaPesos;
    if (media > 0.02) return "subindo";
    if (media < -0.02) return "caindo";
    return "estavel";
  }

  function textoTendencia(t: "subindo" | "estavel" | "caindo" | null): string | null {
    if (t === "subindo") return "Progredindo";
    if (t === "estavel") return "Estagnado";
    if (t === "caindo") return "Regredindo";
    return null;
  }

  /** Variação % bruta (não só a faixa) de um exercício específico — mostrada ao lado do nome no
   * modal por músculo (read-only), reaproveitando o histórico já pré-carregado. */
  function variacaoExercicioPct(exercicioId: string): number | null {
    const pontos = historicoPorExercicio.get(exercicioId);
    if (!pontos) return null;
    return variacaoExercicio(pontos);
  }

  /** Tendência do músculo = média da variação de 1RM de cada exercício que o trabalha (nessa
   * rotina). Caindo sugere reduzir séries, estável sugere tentar aumentar (pra sair do platô),
   * subindo sugere manter (já está funcionando). */
  async function carregarTendenciaMusculo(itens: ItemMusculoRotina[]): Promise<void> {
    carregandoTendencia = true;
    tendenciaMusculo = null;
    try {
      const variacoes: number[] = [];
      for (const item of itens) {
        // Reaproveita o histórico já pré-carregado (carregarHistoricoTodos) — só busca de novo
        // se esse exercício não estava no cache (ex: acabou de ser adicionado à rotina).
        const pontos = historicoPorExercicio.get(item.exercicioId) ?? (await getHistoricoExercicio(item.exercicioId));
        const v = variacaoExercicio(pontos);
        if (v != null) variacoes.push(v);
      }
      if (!variacoes.length) return;
      const media = variacoes.reduce((acc, v) => acc + v, 0) / variacoes.length;
      if (media > 0.02) tendenciaMusculo = { status: "subindo" };
      else if (media < -0.02) tendenciaMusculo = { status: "caindo" };
      else tendenciaMusculo = { status: "estavel" };
    } finally {
      carregandoTendencia = false;
    }
  }

  /** Carrega a tendência só quando o músculo aberto muda (não a cada ajuste de série). */
  $effect(() => {
    const musculo = modalMusculoRotina?.musculo;
    const itens = modalMusculoRotina?.itens;
    if (!musculo || !itens) {
      musculoIdTendenciaCarregada = null;
      return;
    }
    if (musculoIdTendenciaCarregada === musculo.id) return;
    musculoIdTendenciaCarregada = musculo.id;
    void carregarTendenciaMusculo(itens);
  });

  const TEXTO_TENDENCIA = {
    subindo: "Progredindo",
    estavel: "Estagnado",
    caindo: "Regredindo",
  };

  /** Exercícios dessa rotina específica que trabalham o músculo, com o número de séries editável
   * (abre a roleta) — ajustar aqui atualiza a rotina de verdade, as duas telas ficam ligadas.
   * Navega (em vez de só setar estado) pra sair e voltar do detalhe do exercício reabrir o modal. */
  function abrirExerciciosDaRotina(treino: TreinoComExercicios, musculo: Musculo): void {
    navigate(`/treino/distribuicao/rotina/${treino.id}/musculo/${musculo.id}`);
  }

  /** Recarrega a rotina do banco e propaga pro card/lista, pro modal por músculo e pro editor
   * completo (se algum deles estiver aberto pra essa mesma rotina) — mantém tudo ligado. */
  async function refrescarTreinoMusculo(treinoId: string): Promise<void> {
    const atualizado = await getTreino(treinoId);
    if (!atualizado) return;
    treinos = treinos.map((t) => (t.id === treinoId ? atualizado : t));
    // Trocar/mover exercício muda treino_exercicios de verdade (não é rascunho) — o trigger no
    // banco já reseta composicao_atualizada_em, só falta recontar os "registros" com o novo valor.
    void carregarRegistrosPorTreino(treinos);
    if (modalMusculoRotina?.multiRotina) {
      // `treinos` já está atualizado acima — recalcula juntando todas as rotinas de novo.
      modalMusculoRotina = { ...modalMusculoRotina, itens: itensMusculoTodasRotinas(modalMusculoRotina.musculo.id) };
    } else if (modalMusculoRotina && modalMusculoRotina.itens.some((i) => i.treinoId === treinoId)) {
      modalMusculoRotina = { ...modalMusculoRotina, itens: itensMusculoRotina(atualizado, modalMusculoRotina.musculo.id) };
    }
    // NÃO sincroniza modalEditorRotina aqui: o editor completo agora é um rascunho local
    // (só grava no banco ao Salvar) — sobrescrever apagaria alterações ainda não salvas.
  }

  const opcoesSeries = Array.from({ length: 10 }, (_, i) => ({ valor: i + 1, label: String(i + 1) }));

  /** Confirmação antes de remover um exercício da rotina (só o editor completo usa isso hoje). */
  let confirmandoRemover = $state<{ nome: string; onConfirmar: () => void } | null>(null);

  function pedirConfirmacaoRemover(nome: string, onConfirmar: () => void): void {
    confirmandoRemover = { nome, onConfirmar };
  }

  function confirmarRemocao(): void {
    if (!confirmandoRemover) return;
    const fn = confirmandoRemover.onConfirmar;
    confirmandoRemover = null;
    fn();
  }

  /** Nome do músculo PRIMÁRIO do exercício de um item do editor (cai pro primeiro músculo se
   * nenhum estiver marcado como primário) — usado pra pré-preencher a busca em "Ir para Lista"
   * com algo parecido, em vez de abrir a lista inteira sem filtro. */
  function grupoMuscularPrincipal(treinoExercicioId: string): string {
    const te = modalEditorRotina?.exercicios.find((e) => e.id === treinoExercicioId);
    const musculosEx = te?.exercicio?.musculos ?? [];
    const principal = musculosEx.find((m) => m.papel === "primario") ?? musculosEx[0];
    if (!principal) return "";
    return musculos.find((m) => m.id === principal.musculo_id)?.nome ?? "";
  }

  /** Abre o picker de exercícios (opcionalmente já com um nome no campo de busca, pra filtrar —
   * usado quando parte do modal por músculo) — selecionar um exercício TROCA o
   * item.treinoExercicioId no lugar (mantém ordem/séries). Funciona tanto a partir do modal por
   * músculo quanto do editor completo da rotina, sem depender de qual dos dois está aberto. */
  function abrirTrocarExercicioMusculo(item: ItemMusculoRotina, buscaInicial = ""): void {
    trocandoItemMusculo = item;
    buscaInicialTroca = buscaInicial;
    mostrarPickerMusculo = true;
    menuExercicioMusculo = null;
    menuTrocarSubmenu = null;
  }

  async function trocarExercicioMusculo(ex: Exercicio): Promise<void> {
    if (!trocandoItemMusculo) return;
    const anterior = trocandoItemMusculo;
    // Vindo do editor completo (rascunho local): só troca no rascunho, sem gravar — a gravação
    // de verdade só acontece quando o botão Salvar é tocado.
    if (modalEditorRotina?.id === anterior.treinoId && !modalMusculoRotina) {
      modalEditorRotina = {
        ...modalEditorRotina,
        exercicios: modalEditorRotina.exercicios.map((te) =>
          te.id === anterior.treinoExercicioId ? { ...te, exercicio_id: ex.id, exercicio: ex } : te,
        ),
      };
      editorSujo = true;
      mostrarPickerMusculo = false;
      trocandoItemMusculo = null;
      return;
    }
    try {
      await trocarExercicioTreinoExercicio(anterior.treinoExercicioId, ex.id);
      await refrescarTreinoMusculo(anterior.treinoId);
      mostrarPickerMusculo = false;
      trocandoItemMusculo = null;
      // O banner de status só existe na UI do modal por músculo — no editor, erro vira alert (mesmo padrão das outras ações dele).
      if (modalMusculoRotina) {
        statusAjusteMusculo = { tipo: "ok", texto: `"${anterior.exercicioNome}" foi trocado por "${ex.nome}".` };
      }
    } catch (e) {
      if (modalMusculoRotina) {
        statusAjusteMusculo = { tipo: "erro", texto: "Erro ao trocar exercício: " + (e as Error).message };
      } else {
        alert("Erro ao trocar exercício: " + (e as Error).message);
      }
    }
  }

  // ---------------- Mover exercício pra outra rotina (troca de lugar com um exercício de lá) ----------------

  /** Item cujo submenu "Ir para Lista / Ir para Rotinas" (dentro de Trocar Exercício) está aberto. */
  let menuTrocarSubmenu = $state<ItemMusculoRotina | null>(null);
  /** Item sendo movido — o fluxo abre a lista de rotinas, depois os exercícios da rotina
   * escolhida, pra trocar de lugar com um deles. Sempre é uma ação IMEDIATA (grava na hora),
   * mesmo se aberta a partir do editor completo — envolve DUAS rotinas, uma delas nunca está
   * no rascunho local aberto no momento. */
  let movendoItem = $state<ItemMusculoRotina | null>(null);
  let mostrarPickerMover = $state(false);
  let rotinaMoverEscolhida = $state<TreinoComExercicios | null>(null);
  let trocandoComTreinoExercicioId = $state<string | null>(null);

  function abrirSubmenuTrocar(item: ItemMusculoRotina): void {
    menuTrocarSubmenu = item;
    menuExercicioMusculo = null;
  }

  function abrirMoverExercicio(item: ItemMusculoRotina): void {
    movendoItem = item;
    rotinaMoverEscolhida = null;
    mostrarPickerMover = true;
    menuExercicioMusculo = null;
    menuTrocarSubmenu = null;
  }

  /** Só rotinas diferentes da atual e que ainda não têm esse exercício — trocar de lugar com
   * uma que já tem duplicaria o exercício nela. */
  const rotinasParaMover = $derived(
    movendoItem
      ? treinos.filter(
          (t) => t.id !== movendoItem!.treinoId && !t.exercicios.some((te) => te.exercicio_id === movendoItem!.exercicioId),
        )
      : [],
  );

  function fecharMover(): void {
    mostrarPickerMover = false;
    movendoItem = null;
    rotinaMoverEscolhida = null;
  }

  async function trocarComExercicioDaRotina(destino: TreinoExercicio): Promise<void> {
    if (!movendoItem) return;
    const origem = movendoItem;
    trocandoComTreinoExercicioId = destino.id;
    try {
      await trocarExercicioEntreRotinas(origem.treinoExercicioId, origem.exercicioId, destino.id, destino.exercicio_id);
      await refrescarTreinoMusculo(origem.treinoId);
      await refrescarTreinoMusculo(destino.treino_id);
      // O editor completo é um rascunho local (não sincroniza sozinho) — se a rotina de origem
      // é a que está aberta nele, atualiza a linha ali também (é uma TROCA — a linha continua
      // existindo na rotina, só passa a apontar pro exercício que veio de lá), senão o rascunho
      // fica desatualizado (e Salvar poderia gravar o exercício antigo de volta sem querer).
      if (modalEditorRotina?.id === origem.treinoId) {
        modalEditorRotina = {
          ...modalEditorRotina,
          exercicios: modalEditorRotina.exercicios.map((te) =>
            te.id === origem.treinoExercicioId ? { ...te, exercicio_id: destino.exercicio_id, exercicio: destino.exercicio } : te,
          ),
        };
      }
      if (modalMusculoRotina) {
        statusAjusteMusculo = {
          tipo: "ok",
          texto: `"${origem.exercicioNome}" trocou de lugar com "${destino.exercicio?.nome ?? ""}".`,
        };
      }
      fecharMover();
    } catch (e) {
      alert("Erro ao mover exercício: " + (e as Error).message);
    } finally {
      trocandoComTreinoExercicioId = null;
    }
  }

  // ---------------- Modal: edição visual da rotina inteira (add/remover/reordenar exercícios) ----------------

  let modalEditorRotina = $state<TreinoComExercicios | null>(null);
  let editandoSerieEditor = $state<{ treinoExercicioId: string; exercicioNome: string; series: number } | null>(null);
  let salvandoEditor = $state(false);
  let mostrarPickerEditor = $state(false);
  let arrastandoIdxEditor = $state<number | null>(null);
  let itemEditorRefs: (HTMLElement | null)[] = [];
  /** true assim que alguma alteração (remover/reordenar/ajustar séries/trocar/adicionar) foi
   * feita no rascunho local, mas ainda não foi gravada com o botão Salvar. */
  let editorSujo = $state(false);
  let confirmandoFecharEditor = $state(false);
  /** Preenchido só quando o editor é aberto a partir de uma célula da grade "Distribuição na
   * Semana" — o exercício que trabalha esse músculo fica destacado na cor primária, pra saber
   * quais exercícios compõem as séries daquela célula clicada. */
  let editorDestaqueMusculoId = $state<string | null>(null);
  /** Filtro por toque num card de meta (topo do editor): esconde os exercícios que não trabalham
   * esse músculo e acende o card clicado, pra achar rápido quais compõem aquele total. Clicar de
   * novo no mesmo card limpa o filtro. Reordenar (arrastar) fica desligado enquanto ativo, pra não
   * bagunçar a ordem com itens escondidos no meio da lista. */
  let editorFiltroMusculoId = $state<string | null>(null);

  /** Ligado pelo menu "Reordenar" de qualquer card — mostra a alça de arrastar em todos os
   * exercícios e desliga o toque-pra-abrir-modal enquanto ativo. "Concluído" desliga de volta. */
  let modoReordenarEditor = $state(false);

  /** Qual coluna (Total/Pond./Acum.) está ordenando a lista de músculos do editor — toca em
   * qualquer rótulo/valor da coluna pra escolher, mesmo padrão da Distribuição Semanal e dos
   * cards por rotina. */
  let ordemMusculosEditor = $state<CampoOrdenacaoSeries>("ponderado");

  /** Pressionar-e-segurar (sem soltar cedo, sem arrastar) num card de exercício abre o menu —
   * mesma ideia de qualquer outro long-press do app, só que aqui dispara um menu em vez de um
   * arrasto. `disparouPressionarEditor` evita que o "click" nativo que sempre segue o pointerup,
   * mesmo depois de um toque longo, também abra o modal de séries por cima do menu. */
  const ATRASO_PRESSIONAR_EDITOR_MS = 450;
  const TOLERANCIA_PRESSIONAR_EDITOR_PX = 8;
  let timeoutPressionarEditor: ReturnType<typeof setTimeout> | undefined;
  let pressionarEditorX = 0;
  let pressionarEditorY = 0;
  let disparouPressionarEditor = false;

  function aoPointerDownCardEditor(e: PointerEvent, te: TreinoComExercicios["exercicios"][number]): void {
    disparouPressionarEditor = false;
    pressionarEditorX = e.clientX;
    pressionarEditorY = e.clientY;
    window.addEventListener("pointermove", aoPointerMoveEsperandoPressionarEditor);
    window.addEventListener("pointerup", aoPointerUpEsperandoPressionarEditor);
    timeoutPressionarEditor = setTimeout(() => {
      cancelarEsperaPressionarEditor();
      disparouPressionarEditor = true;
      if (navigator.vibrate) navigator.vibrate(10);
      menuExercicioMusculo = {
        treinoId: modalEditorRotina!.id,
        treinoNome: modalEditorRotina!.nome_treino,
        treinoExercicioId: te.id,
        exercicioId: te.exercicio_id,
        exercicioNome: te.exercicio?.nome ?? "",
        series: te.series.length,
      };
    }, ATRASO_PRESSIONAR_EDITOR_MS);
  }

  function cancelarEsperaPressionarEditor(): void {
    clearTimeout(timeoutPressionarEditor);
    timeoutPressionarEditor = undefined;
    window.removeEventListener("pointermove", aoPointerMoveEsperandoPressionarEditor);
    window.removeEventListener("pointerup", aoPointerUpEsperandoPressionarEditor);
  }

  function aoPointerMoveEsperandoPressionarEditor(e: PointerEvent): void {
    if (Math.hypot(e.clientX - pressionarEditorX, e.clientY - pressionarEditorY) > TOLERANCIA_PRESSIONAR_EDITOR_PX) {
      cancelarEsperaPressionarEditor();
    }
  }

  function aoPointerUpEsperandoPressionarEditor(): void {
    cancelarEsperaPressionarEditor();
  }

  /** Abre o seletor de séries no toque curto — ignora o "click" que segue um long-press que já disparou o menu. */
  function abrirSerieOuIgnorar(te: TreinoComExercicios["exercicios"][number]): void {
    if (disparouPressionarEditor) {
      disparouPressionarEditor = false;
      return;
    }
    editandoSerieEditor = { treinoExercicioId: te.id, exercicioNome: te.exercicio?.nome ?? "", series: te.series.length };
  }

  /** No PC não tem "pressionar e segurar" — o botão direito (contextmenu) abre o mesmo menu direto. */
  function aoContextMenuCardEditor(e: MouseEvent, te: TreinoComExercicios["exercicios"][number]): void {
    e.preventDefault();
    cancelarEsperaPressionarEditor();
    disparouPressionarEditor = false;
    menuExercicioMusculo = {
      treinoId: modalEditorRotina!.id,
      treinoNome: modalEditorRotina!.nome_treino,
      treinoExercicioId: te.id,
      exercicioId: te.exercicio_id,
      exercicioNome: te.exercicio?.nome ?? "",
      series: te.series.length,
    };
  }

  /** Snapshot de séries por exercício e total bruto por músculo, capturado quando o editor é
   * aberto — base FIXA (não ao vivo) pro badge "4-1", pro número congelado até o ajuste, e pro %
   * de impacto do balãozinho nos cards de meta. Sem isso, baixar as séries e depois voltar ao
   * número original mostraria um "aumento" (relativo ao valor intermediário) em vez de sumir. */
  let baselineEditor = $state<{ seriesPorExercicio: Map<string, number>; totalPorMusculo: Map<string, number> } | null>(null);

  function capturarBaselineEditor(treino: TreinoComExercicios): void {
    const seriesPorExercicio = new Map<string, number>();
    for (const te of treino.exercicios) seriesPorExercicio.set(te.id, te.series.length);
    baselineEditor = { seriesPorExercicio, totalPorMusculo: contarSeriesPorMusculo(treino) };
  }

  /** Delta de séries de um exercício comparado à baseline (0 se ele não existia nela, ou seja,
   * foi adicionado depois de abrir o editor — nesse caso o total atual conta como "adicionado"). */
  function deltaSeriesEditor(te: TreinoComExercicios["exercicios"][number]): number {
    if (!baselineEditor) return 0;
    const baseSeries = baselineEditor.seriesPorExercicio.get(te.id) ?? 0;
    return te.series.length - baseSeries;
  }

  /** % de impacto de TODO o rascunho num músculo, comparando as séries ATUAIS com a baseline
   * fixa: soma o delta de séries (ponderado por peso_contribuicao) de TODOS os exercícios que
   * trabalham esse músculo, sobre o total bruto ORIGINAL dele na rotina. Mostrado como o
   * balãozinho no canto do card de meta (mesmo estilo do "x" nos cards de dia da Dieta). 0 se não
   * há baseline ou se as mudanças voltaram a se cancelar. */
  function impactoTotalMusculo(musculoId: string): number {
    if (!baselineEditor || !modalEditorRotina) return 0;
    const totalBase = baselineEditor.totalPorMusculo.get(musculoId) ?? 0;
    if (totalBase <= 0) return 0;
    let deltaPonderado = 0;
    for (const te of modalEditorRotina.exercicios) {
      const deltaSeries = deltaSeriesEditor(te);
      if (deltaSeries === 0) continue;
      const m = te.exercicio?.musculos.find((mm) => mm.musculo_id === musculoId);
      if (!m) continue;
      deltaPonderado += deltaSeries * m.peso_contribuicao;
    }
    return (deltaPonderado / totalBase) * 100;
  }

  /** Metas manuais definidas pra essa rotina (só os músculos que têm uma), com o saldo AO VIVO —
   * refeito a cada mutação do rascunho (adicionar/remover/ajustar série), igual pedido: "a medida
   * que formos adicionando os exercícios, o sistema ia abatendo do saldo de cada músculo". */
  /** Quantos exercícios do rascunho passam pelo filtro ativo (editorFiltroMusculoId) — usado só
   * pra saber se a lista "vazia" é porque não tem NADA na rotina, ou porque o filtro escondeu
   * tudo (ex: removeu o último exercício daquele músculo com o filtro ainda ligado). */
  const exerciciosVisiveisEditor = $derived.by(() => {
    if (!modalEditorRotina) return 0;
    if (!editorFiltroMusculoId) return modalEditorRotina.exercicios.length;
    return modalEditorRotina.exercicios.filter((te) => te.exercicio?.musculos.some((m) => m.musculo_id === editorFiltroMusculoId)).length;
  });

  /** Um card por músculo trabalhado na rotina (com série > 0) OU com meta configurada (mesmo em
   * 0, pra continuar mostrando o alvo vazio) — `meta: null` quando não há meta pra esse músculo,
   * aí o card só mostra o número de séries em vez de "atual/meta". Continua clicável (filtro) pros
   * dois casos. `ponderado` é o mesmo cálculo (peso_contribuicao) usado nos outros gráficos da
   * tela — dá pra calcular ao vivo porque o peso já é conhecido assim que o exercício entra no
   * rascunho, não precisa esperar a rotina "estar pronta". */
  const metasEditor = $derived.by(() => {
    if (!modalEditorRotina) return [];
    const atual = contarSeriesPorMusculo(modalEditorRotina);
    const ponderado = contarSeriesPorMusculoPonderado(modalEditorRotina);
    const posicao = contarSeriesPorFaixaDePosicao(modalEditorRotina);
    const resultado: {
      musculo: Musculo;
      meta: number | null;
      atual: number;
      ponderado: number;
      acumulado: number;
      partes: Partes;
      impactoPct: number;
    }[] = [];
    for (const m of musculos) {
      const valorAtual = atual.get(m.id) ?? 0;
      const meta = metasMusculo.get(chaveMeta(modalEditorRotina.id, m.id)) ?? null;
      if (valorAtual <= 0 && meta == null) continue;
      const partes = posicao.get(m.id) ?? partesVazias();
      resultado.push({
        musculo: m,
        meta,
        atual: valorAtual,
        ponderado: ponderado.get(m.id) ?? 0,
        acumulado: valorEfetivoFadiga(partes),
        partes,
        impactoPct: impactoTotalMusculo(m.id),
      });
    }
    // Ordena pela coluna escolhida (ícone no rodapé) — padrão "ponderado", o valor que melhor
    // reflete o volume real (leva em conta o peso_contribuicao de cada músculo secundário),
    // diferente do bruto que infla exercícios multi-músculo.
    const campo = ordemMusculosEditor;
    return resultado.sort(
      (a, b) =>
        valorPorCampoOrdenacao({ valor: b.ponderado, bruto: b.atual, partes: b.partes }, campo) -
        valorPorCampoOrdenacao({ valor: a.ponderado, bruto: a.atual, partes: a.partes }, campo),
    );
  });

  function definirModalEditor(treino: TreinoComExercicios): void {
    modalEditorRotina = treino;
    capturarBaselineEditor(treino);
    editorSujo = false;
    editorFiltroMusculoId = null;
    modoReordenarEditor = false;
    ordemMusculosEditor = "ponderado";
  }

  /** Navega (em vez de só setar estado) pra sair e voltar do detalhe de um exercício reabrir o
   * editor. `destaqueMusculoId` (opcional) marca qual músculo destacar nos exercícios do editor —
   * usado quando se chega ali pela célula de um músculo específico na grade semanal. */
  function abrirEditorRotina(treino: TreinoComExercicios, destaqueMusculoId: string | null = null): void {
    editorDestaqueMusculoId = destaqueMusculoId;
    navigate(`/treino/distribuicao/rotina/${treino.id}/editor`);
  }

  /** Fecha o editor sem gravar nada (rascunho é descartado) — usado direto quando não há
   * alteração pendente, ou depois de confirmar o descarte quando há. */
  function fecharEditorSemSalvar(): void {
    modalEditorRotina = null;
    editorSujo = false;
    if (editorUrlTreino) window.history.back();
  }

  /** Botão/gesto de voltar do editor: se há alteração não salva, confirma antes de descartar. */
  function tentarFecharEditor(): void {
    if (editorSujo) confirmandoFecharEditor = true;
    else fecharEditorSemSalvar();
  }

  /** Grava o rascunho inteiro de uma vez (substitui a composição da rotina — mesma função usada
   * pela tela básica de edição) e recarrega a lista principal, refletindo nos cards. Só agora,
   * ao Salvar, é que qualquer chamada à API acontece — todas as ações do editor até aqui mexem
   * só no rascunho local. */
  async function salvarEditor(): Promise<void> {
    if (!modalEditorRotina) return;
    const treinoId = modalEditorRotina.id;
    salvandoEditor = true;
    try {
      await salvarExerciciosRotina(
        treinoId,
        modalEditorRotina.exercicios
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((te) => ({
            exercicio_id: te.exercicio_id,
            descanso_seg: te.descanso_seg,
            observacao: te.observacao,
            series: te.series.map((s) => ({ serie: s.serie, peso_alvo: s.peso_alvo, rep_min: s.rep_min, rep_max: s.rep_max })),
          })),
      );
      // A meta é um alvo pra guiar o ajuste — uma vez salvo o resultado, ela deixa de fazer
      // sentido e some, até o usuário definir um novo alvo na grade.
      await limparMetasMusculoRotina(treinoId);
      const prefixo = `${treinoId}:`;
      const mapaMetas = new Map(metasMusculo);
      for (const chave of mapaMetas.keys()) {
        if (chave.startsWith(prefixo)) mapaMetas.delete(chave);
      }
      metasMusculo = mapaMetas;
      const atualizado = await getTreino(treinoId);
      if (atualizado) treinos = treinos.map((t) => (t.id === treinoId ? atualizado : t));
      // O trigger no banco já resetou composicao_atualizada_em — recontar os "registros" do rodapé.
      void carregarRegistrosPorTreino(treinos);
      editorSujo = false;
      modalEditorRotina = null;
      if (editorUrlTreino) window.history.back();
    } catch (e) {
      alert("Erro ao salvar rotina: " + (e as Error).message);
    } finally {
      salvandoEditor = false;
    }
  }

  function removerExercicioEditor(treinoExercicioId: string): void {
    if (!modalEditorRotina) return;
    modalEditorRotina = {
      ...modalEditorRotina,
      exercicios: modalEditorRotina.exercicios.filter((te) => te.id !== treinoExercicioId),
    };
    editorSujo = true;
  }

  function iniciarArrasteEditor(e: PointerEvent, idx: number): void {
    arrastandoIdxEditor = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  /** Cards ficam lado a lado (rolagem horizontal), então a comparação de posição durante o
   * arrasto é pelo eixo X (clientX/rect.left), não Y como seria numa lista vertical. */
  function moverDuranteArrasteEditor(e: PointerEvent): void {
    if (arrastandoIdxEditor === null || !modalEditorRotina) return;
    const x = e.clientX;
    for (let i = 0; i < itemEditorRefs.length; i++) {
      const el = itemEditorRefs[i];
      if (!el || i === arrastandoIdxEditor) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.left + rect.width / 2;
      if ((i < arrastandoIdxEditor && x < meio) || (i > arrastandoIdxEditor && x > meio)) {
        const ordenados = modalEditorRotina.exercicios.slice().sort((a, b) => a.ordem - b.ordem);
        const [item] = ordenados.splice(arrastandoIdxEditor, 1);
        ordenados.splice(i, 0, item);
        modalEditorRotina = {
          ...modalEditorRotina,
          exercicios: ordenados.map((te, idx2) => ({ ...te, ordem: idx2 })),
        };
        arrastandoIdxEditor = i;
        editorSujo = true;
        break;
      }
    }
  }

  function finalizarArrasteEditor(): void {
    arrastandoIdxEditor = null;
  }

  $effect(() => {
    if (arrastandoIdxEditor === null) return;
    window.addEventListener("pointermove", moverDuranteArrasteEditor);
    window.addEventListener("pointerup", finalizarArrasteEditor);
    return () => {
      window.removeEventListener("pointermove", moverDuranteArrasteEditor);
      window.removeEventListener("pointerup", finalizarArrasteEditor);
    };
  });

  async function adicionarExercicioEditor(ex: Exercicio): Promise<void> {
    if (!modalEditorRotina) return;
    try {
      // Só o histórico é consultado aqui (leitura) — grava nada ainda, é pra pré-preencher a
      // meta das séries novas com o que foi feito da última vez.
      const anterior = await getUltimoRegistro(ex.id);
      const proximaOrdem = modalEditorRotina.exercicios.reduce((acc, te) => Math.max(acc, te.ordem), -1) + 1;
      const novoItem: TreinoComExercicios["exercicios"][number] = {
        id: `novo:${crypto.randomUUID()}`,
        treino_id: modalEditorRotina.id,
        exercicio_id: ex.id,
        descanso_seg: null,
        observacao: null,
        ordem: proximaOrdem,
        exercicio: ex,
        series: Array.from({ length: 3 }, (_, i) => {
          const ant = anterior.find((a) => a.serie === i + 1);
          return { id: `novo:${crypto.randomUUID()}`, serie: i + 1, peso_alvo: ant?.peso ?? null, rep_min: ant?.repeticoes ?? null, rep_max: ant?.repeticoes ?? null };
        }),
      };
      modalEditorRotina = { ...modalEditorRotina, exercicios: [...modalEditorRotina.exercicios, novoItem] };
      editorSujo = true;
      mostrarPickerEditor = false;
    } catch (e) {
      alert("Erro ao adicionar exercício: " + (e as Error).message);
    }
  }

  function ajustarSeriesEditor(novoNumero: number): void {
    if (!editandoSerieEditor || !modalEditorRotina) return;
    const item = editandoSerieEditor;
    modalEditorRotina = {
      ...modalEditorRotina,
      exercicios: modalEditorRotina.exercicios.map((te) => {
        if (te.id !== item.treinoExercicioId) return te;
        if (novoNumero < te.series.length) return { ...te, series: te.series.slice(0, novoNumero) };
        if (novoNumero > te.series.length) {
          const ultima = te.series[te.series.length - 1];
          const novas = Array.from({ length: novoNumero - te.series.length }, (_, i) => ({
            id: `novo:${crypto.randomUUID()}`,
            serie: te.series.length + i + 1,
            peso_alvo: ultima?.peso_alvo ?? null,
            rep_min: ultima?.rep_min ?? null,
            rep_max: ultima?.rep_max ?? null,
          }));
          return { ...te, series: [...te.series, ...novas] };
        }
        return te;
      }),
    };
    editorSujo = true;
  }

  /** Abre o gráfico direto (sem passar por menu) quando se entra em
   * /treino/distribuicao/rotina/:id/grafico — usado pela opção "Distribuição" no menu de
   * Visualizar Rotina, e pelo rodapé do card da rotina. "Voltar" do navegador fecha o gráfico
   * e sai dessa rota. */
  const graficoUrlTreino = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/grafico$/);
    if (!m) return null;
    return treinos.find((t) => t.id === m[1]) ?? null;
  });

  /** Só abre uma vez por entrada na URL — sem isso, cada atualização de `treinos` (ex: depois de
   * ajustar uma série) recriava `graficoUrlTreino`/`musculoUrlContexto`/`editorUrlTreino` e o
   * efeito reabria o modal do zero de novo, brigando com a atualização direta que já tinha
   * acabado de acontecer. */
  let urlAbertaChave = $state<string | null>(null);

  $effect(() => {
    if (!graficoUrlTreino) {
      if (urlAbertaChave?.startsWith("grafico:")) urlAbertaChave = null;
      return;
    }
    const chave = `grafico:${graficoUrlTreino.id}`;
    if (urlAbertaChave === chave) return;
    urlAbertaChave = chave;
    abrirGraficoTreino(graficoUrlTreino);
  });

  /** Mesmo padrão do gráfico: reabre o modal de exercícios por músculo ao voltar do detalhe do
   * exercício (ou de qualquer navegação), já que abrirExerciciosDaRotina navega pra essa rota. */
  const musculoUrlContexto = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/musculo\/([^/]+)$/);
    if (!m) return null;
    const treino = treinos.find((t) => t.id === m[1]);
    const musculo = musculos.find((mu) => mu.id === m[2]);
    if (!treino || !musculo) return null;
    return { treino, musculo };
  });

  $effect(() => {
    if (!musculoUrlContexto) {
      if (urlAbertaChave?.startsWith("musculo:")) urlAbertaChave = null;
      return;
    }
    const chave = `musculo:${musculoUrlContexto.treino.id}:${musculoUrlContexto.musculo.id}`;
    if (urlAbertaChave === chave) return;
    urlAbertaChave = chave;
    definirModalMusculo(musculoUrlContexto.treino, musculoUrlContexto.musculo);
  });

  /** Mesmo padrão: reabre o editor completo da rotina ao voltar do detalhe de um exercício. */
  const editorUrlTreino = $derived.by(() => {
    const m = router.path.match(/^\/treino\/distribuicao\/rotina\/([^/]+)\/editor$/);
    if (!m) return null;
    return treinos.find((t) => t.id === m[1]) ?? null;
  });

  $effect(() => {
    if (!editorUrlTreino) {
      if (urlAbertaChave?.startsWith("editor:")) urlAbertaChave = null;
      return;
    }
    const chave = `editor:${editorUrlTreino.id}`;
    if (urlAbertaChave === chave) return;
    urlAbertaChave = chave;
    definirModalEditor(editorUrlTreino);
  });

  /** Abre o anel da Distribuição Semanal direto — mesmo padrão do anel por rotina (bar clicável, sem menu).
   * Segue a mesma coluna (Total/Pond./Acum.) selecionada no card, igual à grade. */
  function abrirGraficoSemanal(): void {
    const { itensGrupo, itens, total } = itensParaGrafico(linhasSemanal, ordemSemanal);
    abrirDetalheRotina(
      "Distribuição Semanal",
      itens,
      formatValor(total),
      "séries",
      coresAbcAcumulado(itens),
      itensGrupo,
      // Acompanha a visualização do card: ordenado por ponderado (padrão) abre no modo Grupo,
      // ordenado por total ou acumulado abre no modo ABC (músculo individual).
      ordemSemanal === "ponderado",
    );
  }


  // ---------------- Modal: gráfico de pizza da distribuição de uma rotina ----------------

  interface ItemDetalheRotina {
    musculo: Musculo;
    valor: number;
  }

  let modalDetalheRotina = $state<{
    titulo: string;
    itens: ItemDetalheRotina[];
    centroValor?: number | string;
    centroLabel?: string;
    cores?: string[];
    itensGrupo?: { nome: string; valor: number }[];
  } | null>(null);

  /** Alterna entre o anel por grupo muscular (Ombro, Costas etc. — soma bruta, uma cor por
   * grupo, padrão) e o anel por músculo individual (dominância, cores A/B/C). Reseta pro
   * modo padrão sempre que um anel novo é aberto. */
  let modoGrupoDetalhe = $state(true);

  function abrirDetalheRotina(
    titulo: string,
    itens: { musculo: Musculo; valor: number }[],
    centroValor?: number | string,
    centroLabel?: string,
    cores?: string[],
    itensGrupo?: { nome: string; valor: number }[],
    modoGrupoInicial = true,
  ): void {
    modalDetalheRotina = { titulo, itens, centroValor, centroLabel, cores, itensGrupo };
    modoGrupoDetalhe = modoGrupoInicial;
  }

  /** Cor de cada fatia pela faixa ABC do percentual acumulado (itens já precisam vir
   * ordenados do mais dominante pro menos) — visual discreto pra saber onde cada músculo
   * se enquadra na curva 80/20, sem depender de abrir a lista de rotina pra ver. */
  function coresAbcAcumulado(itens: { valor: number }[]): string[] {
    const total = itens.reduce((acc, i) => acc + i.valor, 0);
    let acumulado = 0;
    return itens.map((i) => {
      const pct = total > 0 ? (i.valor / total) * 100 : 0;
      acumulado += pct;
      return corPorFaixa(acumulado);
    });
  }

  /** Gráfico de uma rotina específica: mesmos dados do card da rotina (distribuicaoPorTreino
   * — série equivalente, agrupamento por agrupamento_id, faixas A/B/C por posição), só que
   * em anel em vez de barras. Sem isso os dois ficavam mostrando números diferentes pro
   * mesmo músculo (um bruto sem agrupar, outro ponderado agrupado). */
  let modalGraficoTreino = $state<{
    titulo: string;
    totalSeries: number;
    porSerie: LinhaRotina[];
  } | null>(null);

  function abrirGraficoTreino(treino: TreinoComExercicios): void {
    const lista = distribuicaoPorTreino.find((d) => d.treino.id === treino.id)?.lista ?? [];
    const totalSeries = treino.exercicios.reduce((acc, ex) => acc + ex.series.length, 0);
    modalGraficoTreino = { titulo: treino.nome_treino, totalSeries, porSerie: lista };
  }

  /** Anel por dominância (mesma conta da Distribuição Semanal, coresAbcAcumulado), só que
   * dessa rotina isolada — mesma lista já usada pelo card (distribuicaoPorTreino), reprojetada
   * pra coluna (Total/Pond./Acum.) selecionada nele, igual à grade. Diferente do anel por
   * posição/fadiga (abrirGraficoTreino), que é o que a barra já abre. */
  function abrirGraficoTreinoDominancia(treino: TreinoComExercicios, campo: CampoOrdenacaoSeries): void {
    const lista = distribuicaoPorTreino.find((d) => d.treino.id === treino.id)?.lista ?? [];
    const { itensGrupo, itens, total } = itensParaGrafico(lista, campo);
    abrirDetalheRotina(
      treino.nome_treino,
      itens,
      formatValor(total),
      "séries",
      coresAbcAcumulado(itens),
      itensGrupo,
      // Acompanha a visualização do card: ordenado por ponderado (padrão) abre no modo Grupo,
      // ordenado por total ou acumulado abre no modo ABC (músculo individual).
      campo === "ponderado",
    );
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}

{#snippet barraFadiga(partes: Partes, valor: number)}
  <div class="barra-wrap-fadiga-col">
    <div class="barra-rotulos">
      {#each partesParaSegmentos(partes) as seg (seg.cor)}
        {@const pctSeg = valor > 0 ? (seg.valor / valor) * 100 : 0}
        {#if seg.valor > 0}
          <span class="barra-rotulo" style={`width: ${pctSeg}%;`}>{Math.round(pctSeg)}%</span>
        {/if}
      {/each}
    </div>
    <div class="barra-wrap-fadiga">
      <div class="barra-segmentos">
        {#each partesParaSegmentos(partes) as seg (seg.cor)}
          {@const pctSeg = valor > 0 ? (seg.valor / valor) * 100 : 0}
          {#if seg.valor > 0}
            <div class="barra-seg" style={`width: ${pctSeg}%; background: ${seg.cor};`}></div>
          {/if}
        {/each}
      </div>
    </div>
  </div>
{/snippet}

{#snippet cabecalhoCaixas(ordenandoPor: CampoOrdenacaoSeries | null, aoTocar: (campo: CampoOrdenacaoSeries) => void)}
  <div class="item item-cabecalho">
    <span></span>
    <span></span>
    <div class="caixas-series caixas-cabecalho">
      <button type="button" class="caixa-cabecalho-label" class:cabecalho-ativo={ordenandoPor === "total"} onclick={() => aoTocar("total")}>Total</button>
      <button type="button" class="caixa-cabecalho-label" class:cabecalho-ativo={ordenandoPor === "ponderado"} onclick={() => aoTocar("ponderado")}>Pond.</button>
      <button type="button" class="caixa-cabecalho-label" class:cabecalho-ativo={ordenandoPor === "acumulado"} onclick={() => aoTocar("acumulado")}>Acum.</button>
    </div>
  </div>
{/snippet}

{#snippet caixasSeries(
  bruto: number,
  ponderado: number,
  acumulado: number,
  ordenandoPor: CampoOrdenacaoSeries | null,
  aoTocar: (campo: CampoOrdenacaoSeries) => void,
  /** Só usado no editor de rotina: a meta manual (bruta, não ponderada) vai junto do total —
   * "atual/meta" no lugar do total sozinho — em vez de uma linha à parte embaixo do nome. */
  totalTexto: string | null = null,
  totalClasse: "valor-subindo" | "valor-estavel" | "valor-caindo" | null = null,
)}
  <div class="caixas-series">
    <button type="button" class="caixa-serie" onclick={(e) => { e.stopPropagation(); aoTocar("total"); }}>
      <span
        class="caixa-serie-valor"
        class:caixa-serie-ativa={ordenandoPor === "total" && totalClasse == null}
        class:valor-subindo={totalClasse === "valor-subindo"}
        class:valor-estavel={totalClasse === "valor-estavel"}
        class:valor-caindo={totalClasse === "valor-caindo"}
      >{totalTexto ?? formatValor(bruto)}</span>
    </button>
    <button type="button" class="caixa-serie" onclick={(e) => { e.stopPropagation(); aoTocar("ponderado"); }}>
      <span class="caixa-serie-valor" class:caixa-serie-ativa={ordenandoPor === "ponderado"}>{formatValor(ponderado)}</span>
    </button>
    <button type="button" class="caixa-serie" onclick={(e) => { e.stopPropagation(); aoTocar("acumulado"); }}>
      <span class="caixa-serie-valor" class:caixa-serie-ativa={ordenandoPor === "acumulado"}>{formatValor(acumulado)}</span>
    </button>
  </div>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/treino")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Distribuição Muscular</h1>
    <span class="spacer"></span>
  </div>

  <div class="tabs">
    <button class:active={aba === "planejado"} onclick={() => (aba = "planejado")}>Planejado</button>
    <button class:active={aba === "realizado"} onclick={() => (aba = "realizado")}>Realizado</button>
  </div>

  {#if aba === "planejado"}
    {#if !treinos.length}
      <p class="muted">Nenhuma rotina cadastrada ainda.</p>
    {:else}
      <div class="lista-rotinas">
        <div class="rotina-card rotina-card-semanal">
          <div class="rotina-cabecalho">
            <h2 class="rotina-nome">Distribuição Semanal</h2>
          </div>
          {#if !distribuicaoSemanal.length}
            <p class="muted">Nenhum volume planejado ainda.</p>
          {:else}
            {@render cabecalhoCaixas(ordemSemanal, (campo) => (ordemSemanal = campo))}
            <div class="lista">
              {#each ordenarPorCampo(linhasSemanal, ordemSemanal) as linha (linha.chave)}
                {@const aberto = linha.subItens != null && gruposExpandidos.has(linha.chave)}
                <div class="item">
                  {#if linha.subItens}
                    <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(linha.chave)}>
                      <span class="nome-grupo-texto">{linha.nome}</span>
                      <span class="chevron-grupo" class:aberto>›</span>
                    </button>
                  {:else}
                    <button class="nome-btn" onclick={() => linha.musculo && abrirExercicios(linha.musculo)}>{linha.nome}</button>
                  {/if}
                  {@render barraFadiga(linha.partes, linha.partes.a + linha.partes.b + linha.partes.c)}
                  {@render caixasSeries(linha.bruto, linha.valor, valorEfetivoFadiga(linha.partes), ordemSemanal, (campo) => (ordemSemanal = campo))}
                </div>
                {#if aberto && linha.subItens}
                  {#each linha.subItens as sub (sub.musculo.id)}
                    <div class="item item-sub">
                      <button class="nome-btn" onclick={() => abrirExercicios(sub.musculo)}>{sub.musculo.nome}</button>
                      {@render barraFadiga(sub.partes, sub.partes.a + sub.partes.b + sub.partes.c)}
                      {@render caixasSeries(sub.bruto, sub.valor, valorEfetivoFadiga(sub.partes), ordemSemanal, (campo) => (ordemSemanal = campo))}
                    </div>
                  {/each}
                {/if}
              {/each}
            </div>
            <div class="rotina-rodape">
              <button class="rotina-totais-texto" onclick={() => abrirGradeSemanal(null)}>
                {totaisSemanais.exercicios} {totaisSemanais.exercicios === 1 ? "exercício" : "exercícios"} · {totaisSemanais.series} séries
              </button>
              <button class="rotina-grafico-btn" onclick={() => abrirGraficoSemanal()} aria-label="Ver anel por dominância">
                {@render iconGrafico()}
              </button>
            </div>
          {/if}
        </div>

        {#each distribuicaoPorTreino as { treino, lista } (treino.id)}
          {@const ordemTreino = ordemPorTreino.get(treino.id) ?? "ponderado"}
          {@const listaExibida = ordenarPorCampo(lista, ordemTreino)}
          {@const expandido = treinosExpandidos.has(treino.id)}
          <div class="rotina-card">
            <div
              class="rotina-cabecalho-clicavel"
              class:colapsado={!expandido}
              role="button"
              tabindex="0"
              onclick={() => alternarExpandidoTreino(treino.id)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  alternarExpandidoTreino(treino.id);
                }
              }}
            >
              <h2 class="rotina-nome">{treino.nome_treino}</h2>
              {#if treino.dia_semana != null}
                <span class="dia-tag">{DIAS_SEMANA_ABREV[treino.dia_semana]}</span>
              {/if}
              <span class="chevron-rotina" class:aberto={expandido}>›</span>
            </div>
            {#if expandido}
              {#if !lista.length}
                <p class="muted">Nenhuma série definida ainda.</p>
              {:else}
                {@render cabecalhoCaixas(ordemTreino, (campo) => definirOrdemTreino(treino.id, campo))}
                <div class="lista">
                  {#each listaExibida as linha (linha.chave)}
                    {@const grupoChave = `${treino.id}:${linha.chave}`}
                    {@const aberto = linha.subItens != null && gruposExpandidos.has(grupoChave)}
                    <div class="item">
                      {#if linha.subItens}
                        <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(grupoChave)}>
                          <span class="nome-grupo-texto">{linha.nome}</span>
                          <span class="chevron-grupo" class:aberto>›</span>
                        </button>
                      {:else}
                        <button class="nome-btn" onclick={() => linha.musculo && abrirExerciciosDaRotina(treino, linha.musculo)}>{linha.nome}</button>
                      {/if}
                      {@render barraFadiga(linha.partes, linha.valor)}
                      {@render caixasSeries(linha.bruto, linha.valor, valorEfetivoFadiga(linha.partes), ordemTreino, (campo) => definirOrdemTreino(treino.id, campo))}
                    </div>
                    {#if aberto && linha.subItens}
                      {#each linha.subItens as sub (sub.musculo.id)}
                        <div class="item item-sub">
                          <button class="nome-btn" onclick={() => abrirExerciciosDaRotina(treino, sub.musculo)}>{sub.musculo.nome}</button>
                          {@render barraFadiga(sub.partes, sub.valor)}
                          {@render caixasSeries(sub.bruto, sub.valor, valorEfetivoFadiga(sub.partes), ordemTreino, (campo) => definirOrdemTreino(treino.id, campo))}
                        </div>
                      {/each}
                    {/if}
                  {/each}
                </div>
              {/if}
              <div class="rotina-rodape">
                <button class="rotina-totais-texto" onclick={() => abrirEditorRotina(treino)}>
                  {treino.exercicios.length} {treino.exercicios.length === 1 ? "exercício" : "exercícios"} · {treino.exercicios.reduce(
                    (acc, ex) => acc + ex.series.length,
                    0,
                  )} séries · {registrosPorTreino.get(treino.id) ?? 0} {(registrosPorTreino.get(treino.id) ?? 0) === 1 ? "registro" : "registros"}
                </button>
                <button class="rotina-grafico-btn" onclick={() => abrirGraficoTreinoDominancia(treino, ordemTreino)} aria-label="Ver anel por dominância">
                  {@render iconGrafico()}
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="semana-nav">
      <button onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
      <span>{mesLabel}</span>
      <button onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
    </div>

    <div class="rotina-card">
      <div class="rotina-cabecalho">
        <h2 class="rotina-nome">Realizado <span class="dia-tag">(média semanal)</span></h2>
        <button class="icon-btn" onclick={() => abrirMenuRealizado()} aria-label="Mais opções">⋮</button>
      </div>
      {#if carregandoRealizado && !carregouRealizadoAlgumaVez}
        <p class="muted">Carregando…</p>
      {:else if !listaRealizado.length}
        <p class="muted">Nenhum treino registrado nesse mês.</p>
      {:else}
        <div class="lista" class:carregando={carregandoRealizado}>
          {#each linhasRealizado as linha (linha.chave)}
            {@const grupoChave = `realizado:${linha.chave}`}
            {@const aberto = linha.subItens != null && gruposExpandidos.has(grupoChave)}
            <div class="item">
              {#if linha.subItens}
                <button class="nome-btn nome-grupo" onclick={() => alternarGrupo(grupoChave)}>
                  <span class="nome-grupo-texto">{linha.nome}</span>
                  <span class="chevron-grupo" class:aberto>›</span>
                </button>
              {:else}
                <span class="nome">{linha.nome}</span>
              {/if}
              {#if linha.meta > 0}
                <div class="barra-wrap">
                  <div class="barra" style={`width: ${Math.min((linha.valor / linha.meta) * 100, 100)}%; background: var(--color-neutral);`}></div>
                </div>
                <span class="valor" style="color: var(--color-neutral);">{linha.valor} / {linha.meta}</span>
              {:else}
                <div class="barra-wrap">
                  <div class="barra" style={`width: ${Math.min(linha.valor * 8, 100)}%; background: ${corVolume(linha.valor)};`}></div>
                </div>
                <span class="valor" style={`color: ${corVolume(linha.valor)};`}>{linha.valor}</span>
              {/if}
            </div>
            {#if aberto && linha.subItens}
              {#each linha.subItens as sub (sub.musculo.id)}
                <div class="item item-sub">
                  <span class="nome">{sub.musculo.nome}</span>
                  {#if sub.meta > 0}
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${Math.min((sub.valor / sub.meta) * 100, 100)}%; background: var(--color-neutral);`}></div>
                    </div>
                    <span class="valor" style="color: var(--color-neutral);">{sub.valor} / {sub.meta}</span>
                  {:else}
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${Math.min(sub.valor * 8, 100)}%; background: ${corVolume(sub.valor)};`}></div>
                    </div>
                    <span class="valor" style={`color: ${corVolume(sub.valor)};`}>{sub.valor}</span>
                  {/if}
                </div>
              {/each}
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet iconGrafico()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
{/snippet}
{#snippet iconVerExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
{/snippet}
{#snippet iconTrocarExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconMover()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="21" y1="3" x2="13" y2="11" />
    <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
  </svg>
{/snippet}
{#snippet iconGrade()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
{/snippet}
{#snippet iconReordenarMenu()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="7 10 12 5 17 10" />
    <polyline points="7 14 12 19 17 14" />
  </svg>
{/snippet}
{#snippet iconRemoverExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
{/snippet}
{#snippet iconEditarMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconConcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
{/snippet}

{#snippet linkDistribuicao()}
  {#if modalMusculoRotina?.multiRotina}
    <button
      class="link-distribuicao"
      onclick={() => abrirGradeSemanal([modalMusculoRotina!.musculo.id])}
      aria-label="Ver distribuição na semana"
    >{@render iconGrade()}</button>
  {/if}
{/snippet}

{#snippet voltarGradeSemanal()}
  <button class="grade-voltar" onclick={() => (mostrarGradeSemanal = false)} aria-label="Voltar">{@render iconVoltar()}</button>
{/snippet}

{#snippet alternarModoDetalhe()}
  <button
    class="abc-toggle-btn"
    onclick={() => (modoGrupoDetalhe = !modoGrupoDetalhe)}
    aria-label={modoGrupoDetalhe ? "Ver por faixa de dominância (ABC)" : "Ver por grupo muscular"}
  >{modoGrupoDetalhe ? "Grupo" : "ABC"}</button>
{/snippet}

{#if modalAberto}
  <ActionSheet titulo={modalAberto.titulo} opcoes={modalAberto.opcoes} onFechar={() => (modalAberto = null)} />
{/if}

{#if mostrarGradeSemanal}
  <!-- Precisa ficar acima do modal por músculo (Sheet, z-index 100), que pode continuar aberto
       por baixo quando essa grade abre a partir do ícone de calendário dele. -->
  <div class="acima-editor">
  <Sheet
    titulo="Distribuição na Semana"
    onFechar={() => {
      mostrarGradeSemanal = false;
      if (modalMusculoRotina?.multiRotina) modalMusculoRotina = null;
    }}
    acaoTitulo={modalMusculoRotina?.multiRotina ? voltarGradeSemanal : undefined}
    acaoTituloLado="esquerda"
  >
    <div class="grade-toolbar">
      <button class="grade-editar-metas-btn" onclick={() => (modoEdicaoMetas = !modoEdicaoMetas)}>
        {#if modoEdicaoMetas}{@render iconConcluir()} Concluir{:else}{@render iconEditarMeta()} Editar{/if}
      </button>
    </div>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeSemanal.colunas as col (col.dia)}
              <th>
                {#if col.treinoId && col.treinoNome && modoEdicaoMetas}
                  <button
                    class="grade-cabecalho-btn"
                    onclick={() => abrirMoverDiaTreino(col.treinoId!, col.treinoNome!, col.dia)}
                    aria-label={`Mover ${col.treinoNome} pra outro dia`}
                  >
                    <span class="grade-dia com-treino">{DIAS_SEMANA_ABREV[col.dia]}</span>
                    <span class="grade-rotina-nome">{col.treinoNome}</span>
                  </button>
                {:else if col.treinoId && col.treinoNome}
                  <div class="grade-dia com-treino">{DIAS_SEMANA_ABREV[col.dia]}</div>
                  <div class="grade-rotina-nome">{col.treinoNome}</div>
                {:else}
                  <div class="grade-dia">{DIAS_SEMANA_ABREV[col.dia]}</div>
                  <div class="grade-rotina-nome">💤</div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeSemanal.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                {@const treinoId = gradeSemanal.colunas[i].treinoId}
                {@const meta = treinoId ? metasMusculo.get(chaveMeta(treinoId, linha.musculo.id)) : undefined}
                {@const mostrado = modoEdicaoMetas ? valor.bruto : valor.display}
                {@const texto = modoEdicaoMetas ? String(mostrado) : formatValor(mostrado)}
                <td class="grade-valor">
                  {#if modoEdicaoMetas && treinoId}
                    <button
                      class="grade-valor-caixa grade-valor-meta-edit"
                      style={`color: ${corVolume(mostrado)}; background: color-mix(in srgb, ${corVolume(mostrado)} 20%, transparent);`}
                      onclick={() => abrirEditarMeta(treinoId!, linha.musculo, valor.bruto)}
                    >{texto}{#if meta != null}<span class="grade-meta-sub">/{meta}</span>{/if}</button>
                  {:else if valor.bruto > 0 && treinoId}
                    <button
                      class="grade-valor-caixa grade-valor-link"
                      style={`color: ${corVolume(mostrado)}; background: color-mix(in srgb, ${corVolume(mostrado)} 20%, transparent);`}
                      onclick={() => {
                        const treino = treinos.find((t) => t.id === treinoId);
                        if (treino) {
                          mostrarGradeSemanal = false;
                          modalMusculoRotina = null;
                          abrirEditorRotina(treino, linha.musculo.id);
                        }
                      }}
                    >{texto}{#if meta != null}<span class="grade-meta-sub">/{meta}</span>{/if}</button>
                  {:else if valor.bruto > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(mostrado)}; background: color-mix(in srgb, ${corVolume(mostrado)} 20%, transparent);`}
                    >{texto}{#if meta != null}<span class="grade-meta-sub">/{meta}</span>{/if}</span>
                  {:else if meta != null}
                    <span
                      class="grade-valor-caixa grade-valor-vazio"
                      style={`color: ${corVolume(0)}; background: color-mix(in srgb, ${corVolume(0)} 20%, transparent);`}
                    >0<span class="grade-meta-sub">/{meta}</span></span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
  </div>
{/if}

{#if movendoDiaTreino}
  <!-- Precisa ficar acima da grade semanal (Sheet dentro de .acima-editor) — vem depois no DOM,
       então já ganha por ordem mesmo com o mesmo z-index. -->
  <div class="acima-editor">
    <WheelPicker
      titulo={movendoDiaTreino.treinoNome}
      subtitulo="Mover pra qual dia?"
      opcoes={opcoesDiaSemana}
      valorAtual={movendoDiaTreino.diaAtual}
      onSelecionar={(v) => moverTreinoParaDia(v)}
      onFechar={() => (movendoDiaTreino = null)}
    />
  </div>
{/if}

{#if editandoMeta}
  <!-- Precisa ficar acima da grade semanal (Sheet dentro de .acima-editor) — vem depois no DOM,
       então já ganha por ordem mesmo com o mesmo z-index. -->
  <div class="acima-editor">
    <WheelPicker
      titulo={editandoMeta.musculo.nome}
      subtitulo="Meta de séries nessa rotina"
      opcoes={OPCOES_META}
      valorAtual={editandoMeta.valorAtual}
      onSelecionar={(v) => salvarMetaSelecionada(v)}
      onFechar={() => (editandoMeta = null)}
    />
  </div>
{/if}

{#if mostrarGradeRealizado}
  <Sheet titulo={`Realizado em ${mesLabel}`} onFechar={() => (mostrarGradeRealizado = false)}>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeRealizado.colunas as col (col.label)}
              <th>
                <div class="grade-dia">{col.label}</div>
                <div class="grade-rotina-nome">{col.subtitulo}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeRealizado.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                <td class="grade-valor">
                  {#if valor > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                    >{valor}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
{/if}

{#if modalDetalheRotina}
  <!-- Pode abrir a partir do rodapé do editor completo (.tela-editor-rotina, z-index 110) —
       precisa ficar por cima dele, não só do resto da página. -->
  <div class="acima-editor">
    <Sheet
      titulo={modalDetalheRotina.titulo}
      onFechar={() => (modalDetalheRotina = null)}
      acaoTitulo={modalDetalheRotina.itensGrupo?.length ? alternarModoDetalhe : undefined}
    >
      <div class="pizza-wrap">
        {#if modoGrupoDetalhe && modalDetalheRotina.itensGrupo}
          <PieChart
            dados={modalDetalheRotina.itensGrupo.map((i) => ({ nome: i.nome, valor: i.valor }))}
            centroValor={modalDetalheRotina.centroValor}
            centroLabel={modalDetalheRotina.centroLabel}
          />
        {:else}
          <PieChart
            dados={modalDetalheRotina.itens.map((i) => ({ nome: i.musculo.nome, valor: i.valor }))}
            cores={modalDetalheRotina.cores}
            centroValor={modalDetalheRotina.centroValor}
            centroLabel={modalDetalheRotina.centroLabel}
          />
        {/if}
      </div>
    </Sheet>
  </div>
{/if}

{#if modalGraficoTreino}
  <Sheet
    titulo={modalGraficoTreino.titulo}
    onFechar={() => {
      modalGraficoTreino = null;
      if (graficoUrlTreino) window.history.back();
    }}
  >
    <div class="pizza-wrap">
      <PieChart
        dados={modalGraficoTreino.porSerie.map((i) => ({
          nome: i.nome,
          valor: i.valor,
          partes: partesParaSegmentos(i.partes),
        }))}
        centroValor={modalGraficoTreino.totalSeries}
        centroLabel="séries"
      />
    </div>
  </Sheet>
{/if}

{#if modalMusculoRotina && !mostrarGradeSemanal}
  <!-- Some da tela (sem perder o estado) enquanto a grade semanal está aberta por cima — dois
       Sheets sobrepostos ao mesmo tempo (mesmo com z-index certo) podia deixar cliques na grade
       sem efeito em alguns casos. Volta a aparecer sozinho quando a grade fecha. -->
  <Sheet
    titulo={modalMusculoRotina.musculo.nome}
    onFechar={() => {
      modalMusculoRotina = null;
      if (musculoUrlContexto) window.history.back();
    }}
    acaoTitulo={modalMusculoRotina.multiRotina ? linkDistribuicao : undefined}
  >
    {#if carregandoTendencia}
      <p class="tendencia-musculo muted">Verificando progressão…</p>
    {:else if tendenciaMusculo}
      <p class="tendencia-musculo tendencia-{tendenciaMusculo.status}">{TEXTO_TENDENCIA[tendenciaMusculo.status]}</p>
    {/if}
    {#if statusAjusteMusculo}
      <p class="status-ajuste status-ajuste-{statusAjusteMusculo.tipo}">{statusAjusteMusculo.texto}</p>
    {/if}
    {#if !modalMusculoRotina.itens.length}
      <p class="muted">Nenhum exercício encontrado.</p>
    {:else}
      <div class="lista-exercicios-musculo">
        {#each modalMusculoRotina.itens as item (item.treinoExercicioId)}
          {@const tendEx = tendenciaExercicio(item.exercicioId)}
          {@const variacaoPct = variacaoExercicioPct(item.exercicioId)}
          <button
            class="exercicio-musculo-item exercicio-musculo-item-btn"
            onclick={() => navigate(`/treino/exercicios/${item.exercicioId}`)}
          >
            <span class="exercicio-musculo-coluna">
              <span class="exercicio-musculo-info">
                <span class="exercicio-musculo-nome">{item.exercicioNome}</span>
                {#if variacaoPct != null}
                  <span
                    class="exercicio-musculo-variacao"
                    class:valor-subindo={variacaoPct > 0.02}
                    class:valor-estavel={variacaoPct >= -0.02 && variacaoPct <= 0.02}
                    class:valor-caindo={variacaoPct < -0.02}
                  >{variacaoPct > 0 ? "+" : ""}{Math.round(variacaoPct * 100)}%</span>
                {/if}
              </span>
              {#if modalMusculoRotina.multiRotina}
                <span class="exercicio-musculo-rotina">{item.treinoNome}</span>
              {/if}
            </span>
            <span
              class="serie-texto-musculo"
              class:valor-subindo={tendEx === "subindo"}
              class:valor-estavel={tendEx === "estavel"}
              class:valor-caindo={tendEx === "caindo"}
            >{item.series} {item.series === 1 ? "série" : "séries"}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if resumoMusculoModal}
      <div class="resumo-musculo">
        <div class="resumo-item">
          <span class="resumo-valor">{formatValor(resumoMusculoModal.totalBruto)}</span>
          <span class="resumo-label">Séries Totais</span>
        </div>
        <div class="resumo-item">
          <span class="resumo-valor">{formatValor(resumoMusculoModal.totalValido)}</span>
          <span class="resumo-label">Séries Ponderadas</span>
        </div>
        <div class="resumo-item">
          <span class="resumo-valor">{formatValor(resumoMusculoModal.totalAcumulado)}</span>
          <span class="resumo-label">Séries Acumuladas</span>
        </div>
      </div>
    {/if}
  </Sheet>
{/if}

{#if menuExercicioMusculo}
  {@const item = menuExercicioMusculo}
  <!-- Precisa ficar acima do editor completo (.tela-editor-rotina, z-index 110) além do
       modal por músculo (Sheet, z-index 100) — pode abrir a partir de qualquer um dos dois. -->
  <div class="acima-editor">
    <ActionSheet
      titulo={item.exercicioNome}
      onFechar={() => (menuExercicioMusculo = null)}
      opcoes={[
        {
          label: "Ver Exercício",
          icon: iconVerExercicio,
          onSelect: () => navigate(`/treino/exercicios/${item.exercicioId}`),
        },
        {
          label: "Trocar Exercício",
          icon: iconTrocarExercicio,
          onSelect: () => abrirSubmenuTrocar(item),
        },
        {
          label: "Mover",
          icon: iconMover,
          onSelect: () => abrirMoverExercicio(item),
        },
        {
          label: "Reordenar",
          icon: iconReordenarMenu,
          // Limpa o filtro por músculo ao entrar em modo de reordenar: com itens escondidos
          // (display:none) no meio da lista, o cálculo de posição do arrasto (moverDuranteArrasteEditor,
          // baseado em getBoundingClientRect de cada item) bagunça a ordem.
          onSelect: () => {
            editorFiltroMusculoId = null;
            modoReordenarEditor = true;
          },
        },
        {
          label: "Remover",
          icon: iconRemoverExercicio,
          destructive: true,
          onSelect: () => pedirConfirmacaoRemover(item.exercicioNome, () => removerExercicioEditor(item.treinoExercicioId)),
        },
      ]}
    />
  </div>
{/if}

{#if menuTrocarSubmenu}
  {@const item = menuTrocarSubmenu}
  <div class="acima-editor">
    <ActionSheet
      titulo={item.exercicioNome}
      onFechar={() => (menuTrocarSubmenu = null)}
      opcoes={[
        {
          label: "Ir para Lista",
          icon: iconGrade,
          onSelect: () => abrirTrocarExercicioMusculo(item, grupoMuscularPrincipal(item.treinoExercicioId)),
        },
        {
          label: "Ir para Rotinas",
          icon: iconMover,
          onSelect: () => abrirMoverExercicio(item),
        },
      ]}
    />
  </div>
{/if}

{#if mostrarPickerMusculo && trocandoItemMusculo}
  {@const treinoTroca =
    modalEditorRotina?.id === trocandoItemMusculo!.treinoId ? modalEditorRotina : treinos.find((t) => t.id === trocandoItemMusculo!.treinoId)}
  <Exercicios
    modoSelecao
    tituloSelecao="Trocar Exercício"
    buscaInicial={buscaInicialTroca}
    excluirIds={treinoTroca?.exercicios.map((te) => te.exercicio_id) ?? []}
    onSelecionar={(ex) => trocarExercicioMusculo(ex)}
    onFechar={() => {
      mostrarPickerMusculo = false;
      trocandoItemMusculo = null;
    }}
  />
{/if}

{#if mostrarPickerMover && movendoItem && !rotinaMoverEscolhida}
  <div class="acima-editor">
    <div class="tela-editor-rotina">
      <div class="editor-conteudo">
        <div class="header">
          <button class="back" onclick={fecharMover} aria-label="Voltar">{@render iconVoltar()}</button>
          <h1>Mover "{movendoItem.exercicioNome}"</h1>
          <span class="spacer"></span>
        </div>
        {#if !rotinasParaMover.length}
          <p class="muted">Nenhuma rotina disponível — todas as outras já têm esse exercício.</p>
        {:else}
          <ul class="picker-lista-mover">
            {#each rotinasParaMover as treinoOpcao (treinoOpcao.id)}
              <li>
                <button class="picker-item-mover" onclick={() => (rotinaMoverEscolhida = treinoOpcao)}>
                  <span class="picker-item-mover-nome">{treinoOpcao.nome_treino}</span>
                  <span class="picker-item-mover-sub"
                  >{treinoOpcao.exercicios.length} {treinoOpcao.exercicios.length === 1 ? "exercício" : "exercícios"}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if mostrarPickerMover && movendoItem && rotinaMoverEscolhida}
  {@const rotina = rotinaMoverEscolhida}
  {@const treinoOrigem = treinos.find((t) => t.id === movendoItem!.treinoId)}
  {@const exerciciosDisponiveis = rotina.exercicios
    .slice()
    .filter((te) => !treinoOrigem?.exercicios.some((oe) => oe.exercicio_id === te.exercicio_id))
    .sort((a, b) => a.ordem - b.ordem)}
  <div class="acima-editor">
    <div class="tela-editor-rotina">
      <div class="editor-conteudo">
        <div class="header">
          <button class="back" onclick={() => (rotinaMoverEscolhida = null)} aria-label="Voltar">{@render iconVoltar()}</button>
          <h1>{rotina.nome_treino}</h1>
          <span class="spacer"></span>
        </div>
        {#if !exerciciosDisponiveis.length}
          <p class="muted">Nenhum exercício disponível — todos já existem na rotina de origem também.</p>
        {:else}
          <ul class="picker-lista-mover">
            {#each exerciciosDisponiveis as te (te.id)}
              <li class="picker-item-mover-linha">
                <span class="picker-item-mover-nome">{te.exercicio?.nome ?? ""}</span>
                <span class="picker-item-mover-series">{te.series.length} {te.series.length === 1 ? "série" : "séries"}</span>
                <button
                  class="picker-item-mover-icone"
                  onclick={() => trocarComExercicioDaRotina(te)}
                  disabled={trocandoComTreinoExercicioId === te.id}
                  aria-label={`Trocar de lugar com ${te.exercicio?.nome ?? ""}`}
                >{@render iconTrocarExercicio()}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if modalEditorRotina}
  <div class="tela-editor-rotina">
    <div class="editor-conteudo">
      <div class="header">
        <button class="back" onclick={tentarFecharEditor} aria-label="Voltar">{@render iconVoltar()}</button>
        <h1>{modalEditorRotina.nome_treino}</h1>
        <button
          class="editor-dia-btn"
          onclick={() =>
            abrirMoverDiaTreino(modalEditorRotina!.id, modalEditorRotina!.nome_treino, modalEditorRotina!.dia_semana ?? 0)}
        >{modalEditorRotina.dia_semana != null ? DIAS_SEMANA_ABREV[modalEditorRotina.dia_semana] : "Dia"}</button>
      </div>
      {#if modoReordenarEditor}
        <div class="editor-modo-reordenar">
          <span>Arraste os cards pra reordenar</span>
          <button type="button" onclick={() => (modoReordenarEditor = false)}>Concluído</button>
        </div>
      {/if}
      {#if !modalEditorRotina.exercicios.length}
        <p class="muted">Nenhum exercício ainda.</p>
      {:else}
        <div class="editor-exercicios-lista" class:carregando={salvandoEditor}>
          {#each modalEditorRotina.exercicios.slice().sort((a, b) => a.ordem - b.ordem) as te, idx (te.id)}
            {@const tendEx = tendenciaExercicio(te.exercicio_id)}
            {@const deltaTotal = deltaSeriesEditor(te)}
            {@const valorAnteriorSeries = baselineEditor?.seriesPorExercicio.get(te.id) ?? 0}
            {@const numeroExibidoSeries = te.series.length}
            {@const destacado = editorDestaqueMusculoId != null && te.exercicio?.musculos.some((m) => m.musculo_id === editorDestaqueMusculoId)}
            {@const foraDoFiltro = editorFiltroMusculoId != null && !te.exercicio?.musculos.some((m) => m.musculo_id === editorFiltroMusculoId)}
            <div
              class="editor-exercicio-card"
              class:arrastando={arrastandoIdxEditor === idx}
              class:editor-item-oculto={foraDoFiltro}
              bind:this={itemEditorRefs[idx]}
            >
              <button
                type="button"
                class="editor-exercicio-conteudo"
                disabled={modoReordenarEditor}
                onpointerdown={(e) => {
                  if (!modoReordenarEditor) aoPointerDownCardEditor(e, te);
                }}
                onclick={() => abrirSerieOuIgnorar(te)}
                oncontextmenu={(e) => {
                  if (!modoReordenarEditor) aoContextMenuCardEditor(e, te);
                }}
              >
                {#if deltaTotal !== 0}
                  <span class="editor-serie-badge">{valorAnteriorSeries}{deltaTotal > 0 ? "+" : ""}{deltaTotal}</span>
                {/if}
                <span class="editor-exercicio-nome-col">
                  <span class="editor-exercicio-nome" class:editor-nome-destacado={destacado}>{te.exercicio?.nome ?? ""}</span>
                  {#if textoTendencia(tendEx)}
                    <span
                      class="editor-tendencia-texto"
                      class:valor-subindo={tendEx === "subindo"}
                      class:valor-estavel={tendEx === "estavel"}
                      class:valor-caindo={tendEx === "caindo"}
                    >{textoTendencia(tendEx)}</span>
                  {/if}
                </span>
                <span class="editor-exercicio-series-col">
                  <span class="editor-serie-numero">{numeroExibidoSeries}</span>
                  <span class="editor-serie-label">{numeroExibidoSeries === 1 ? "série" : "séries"}</span>
                </span>
                <span class="editor-exercicio-posicao">{idx + 1}º</span>
              </button>
              {#if modoReordenarEditor}
                <button
                  class="handle-arraste-card"
                  onpointerdown={(e) => iniciarArrasteEditor(e, idx)}
                  aria-label="Arrastar para reordenar"
                >☰</button>
              {/if}
            </div>
          {/each}
        </div>
        {#if exerciciosVisiveisEditor === 0}
          <p class="muted">Nenhum exercício desse músculo — o filtro ainda está ativo, toca de novo no card pra limpar.</p>
        {/if}
      {/if}
      {#if metasEditor.length}
        {@render cabecalhoCaixas(ordemMusculosEditor, (campo) => (ordemMusculosEditor = campo))}
        <div class="editor-musculos-lista">
          {#each metasEditor as item (item.musculo.id)}
            {@const totalTexto = item.meta != null ? `${item.atual}/${item.meta}` : null}
            {@const totalClasse =
              item.meta == null ? null : item.atual > item.meta ? "valor-caindo" : item.atual === item.meta ? "valor-subindo" : "valor-estavel"}
            {@const tendMusculo = tendenciaMusculoEditor(item.musculo.id)}
            <div class="item editor-musculo-linha" class:editor-musculo-ativo={editorFiltroMusculoId === item.musculo.id}>
              <button
                type="button"
                class="nome-btn"
                disabled={modoReordenarEditor}
                onclick={() => (editorFiltroMusculoId = editorFiltroMusculoId === item.musculo.id ? null : item.musculo.id)}
              >
                <span class="editor-musculo-nome-col">
                  <span class="editor-musculo-nome">{abreviarMusculo(item.musculo.nome)}</span>
                  {#if item.impactoPct !== 0}
                    <span class="editor-meta-badge" class:badge-mais={item.impactoPct > 0} class:badge-menos={item.impactoPct < 0}
                    >{item.impactoPct > 0 ? "+" : ""}{Math.round(item.impactoPct)}%</span>
                  {/if}
                  {#if textoTendencia(tendMusculo)}
                    <span
                      class="editor-tendencia-texto"
                      class:valor-subindo={tendMusculo === "subindo"}
                      class:valor-estavel={tendMusculo === "estavel"}
                      class:valor-caindo={tendMusculo === "caindo"}
                    >{textoTendencia(tendMusculo)}</span>
                  {/if}
                </span>
              </button>
              {@render barraFadiga(item.partes, item.partes.a + item.partes.b + item.partes.c)}
              {@render caixasSeries(item.atual, item.ponderado, item.acumulado, ordemMusculosEditor, (campo) => (ordemMusculosEditor = campo), totalTexto, totalClasse)}
            </div>
          {/each}
        </div>
      {/if}
      <div class="editor-totais">
        <span>
          {modalEditorRotina.exercicios.length} {modalEditorRotina.exercicios.length === 1 ? "exercício" : "exercícios"} · {modalEditorRotina.exercicios.reduce(
            (acc, ex) => acc + ex.series.length,
            0,
          )} séries
        </span>
        <div class="editor-totais-acoes">
          <button class="rotina-grafico-btn" onclick={() => abrirGradeSemanal(null)} aria-label="Ver distribuição na semana">
            {@render iconGrade()}
          </button>
          <button class="rotina-grafico-btn" onclick={() => abrirGraficoTreinoDominancia(modalEditorRotina!, ordemMusculosEditor)} aria-label="Ver anel por dominância">
            {@render iconGrafico()}
          </button>
        </div>
      </div>
      <div class="editor-botoes-fixos">
        <button class="adicionar-exercicio-editor-btn" onclick={() => (mostrarPickerEditor = true)}>+ Adicionar Exercício</button>
        <button class="salvar-editor-btn" onclick={salvarEditor} disabled={salvandoEditor}>{salvandoEditor ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmandoFecharEditor}
  <ConfirmDialog
    titulo="Descartar as alterações não salvas?"
    textoConfirmar="Descartar"
    onConfirmar={() => {
      confirmandoFecharEditor = false;
      fecharEditorSemSalvar();
    }}
    onCancelar={() => (confirmandoFecharEditor = false)}
  />
{/if}

{#if mostrarPickerEditor && modalEditorRotina}
  <Exercicios
    modoSelecao
    tituloSelecao="Adicionar Exercício"
    excluirIds={modalEditorRotina.exercicios.map((te) => te.exercicio_id)}
    onSelecionar={(ex) => adicionarExercicioEditor(ex)}
    onFechar={() => (mostrarPickerEditor = false)}
  />
{/if}

{#if editandoSerieEditor}
  <!-- Abre por cima do editor completo (.tela-editor-rotina, z-index 110) — sem isso o
       WheelPicker (Sheet, z-index 100) ficava escondido atrás da tela cheia. -->
  <div class="acima-editor">
    <WheelPicker
      titulo={editandoSerieEditor.exercicioNome}
      subtitulo="Número de séries"
      opcoes={opcoesSeries}
      valorAtual={editandoSerieEditor.series}
      onSelecionar={(v) => ajustarSeriesEditor(v)}
      onFechar={() => (editandoSerieEditor = null)}
    />
  </div>
{/if}

{#if confirmandoRemover}
  <ConfirmDialog
    titulo={`Remover "${confirmandoRemover.nome}" da rotina?`}
    textoConfirmar="Remover"
    onConfirmar={confirmarRemocao}
    onCancelar={() => (confirmandoRemover = null)}
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
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
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
  .spacer {
    width: 36px;
  }
  .editor-dia-btn {
    flex-shrink: 0;
    min-width: 36px;
    height: 36px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .tabs button {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .lista-rotinas {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .rotina-card {
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    border: 1px solid var(--surface-border);
  }
  /* Só o card da Distribuição Semanal mantém fundo/sombra, pra se diferenciar dos demais. */
  .rotina-card.rotina-card-semanal {
    background: var(--surface-card);
    box-shadow: var(--shadow-card);
  }
  .rotina-cabecalho {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--surface-border);
  }
  .rotina-cabecalho .rotina-nome {
    flex: 1;
  }
  /* Cabeçalho dos cards de rotina (não o Semanal): sangra até a borda do card (compensa o
     padding dele com margem negativa) e fica com o fundo padrão de card — vira o único conteúdo
     visível quando recolhido, com cantos arredondados nos 4 lados; expandido, só os de cima. */
  .rotina-cabecalho-clicavel {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) var(--space-3);
    padding: var(--space-4);
    background: var(--surface-card);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    cursor: pointer;
  }
  .rotina-cabecalho-clicavel.colapsado {
    margin-bottom: calc(-1 * var(--space-4));
    border-radius: var(--radius-lg);
  }
  .rotina-cabecalho-clicavel .rotina-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron-rotina {
    flex-shrink: 0;
    display: inline-block;
    color: var(--surface-muted);
    transition: transform 0.15s;
  }
  .chevron-rotina.aberto {
    transform: rotate(90deg);
  }
  .rotina-nome {
    font-size: var(--font-size-base);
    margin: 0;
  }
  .dia-tag {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .icon-btn {
    margin-left: auto;
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
  .semana-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .semana-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    transition: opacity 0.15s;
  }
  .lista.carregando {
    opacity: 0.5;
  }
  .item {
    display: grid;
    grid-template-columns: 130px 1fr 52px;
    align-items: center;
    gap: var(--space-3);
  }
  .item .nome {
    font-size: var(--font-size-sm);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nome-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nome-grupo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
    font-weight: 700;
  }
  .nome-grupo-texto {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron-grupo {
    display: inline-block;
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .chevron-grupo.aberto {
    transform: rotate(90deg);
  }
  .item-sub {
    padding-left: var(--space-3);
    opacity: 0.85;
  }
  .item-sub .nome-btn {
    color: var(--surface-muted);
  }
  .valor-subindo {
    color: var(--color-success);
  }
  .valor-estavel {
    color: var(--color-neutral);
  }
  .valor-caindo {
    color: var(--color-negative);
  }
  .barra-wrap {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
  }
  .barra {
    position: relative;
    height: 100%;
    border-radius: 6px;
  }
  .barra-wrap-fadiga-col {
    position: relative;
    min-width: 0;
  }
  .barra-rotulos {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    display: flex;
    pointer-events: none;
  }
  .barra-rotulo {
    font-size: 8px;
    line-height: 1.3;
    color: var(--surface-muted);
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
  }
  .barra-wrap-fadiga {
    height: 6px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface-border);
  }
  .barra-segmentos {
    display: flex;
    height: 100%;
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-seg {
    height: 100%;
  }
  .item .valor {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  /* Linhas com as 3 contagens (total/ponderada/acumulada) em vez de um número só — precisa de
     mais espaço na 3ª coluna, então o nome do músculo encolhe e a barra fica com o resto. Pega a
     linha de cabeçalho (item-cabecalho) também, porque ela tem o mesmo .caixas-series dentro. */
  .item:has(.caixas-series) {
    grid-template-columns: 78px 1fr 102px;
  }
  .item-cabecalho {
    margin-bottom: 2px;
  }
  .caixas-series {
    display: flex;
    gap: 3px;
  }
  .caixas-cabecalho {
    gap: 2px;
  }
  .caixa-cabecalho-label {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 9px;
    color: var(--surface-muted);
    white-space: nowrap;
    border: none;
    background: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .caixa-cabecalho-label.cabecalho-ativo {
    color: var(--color-primary);
    font-weight: 700;
  }
  .caixa-serie {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 2px;
    border-radius: var(--radius-sm);
    background: #232a3b;
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .caixa-serie-valor {
    font-size: 11px;
    font-weight: 700;
    color: var(--surface-fg);
    white-space: nowrap;
  }
  .caixa-serie-valor.caixa-serie-ativa {
    color: var(--color-primary);
  }
  .muted {
    color: var(--surface-muted);
  }
  .rotina-totais {
    margin: var(--space-3) 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--surface-border);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .rotina-totais-btn {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-top: 1px solid var(--surface-border);
    padding-top: var(--space-3);
    font-family: inherit;
    cursor: pointer;
  }
  .link-distribuicao {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: var(--color-primary);
    cursor: pointer;
  }
  .link-distribuicao svg {
    width: 20px;
    height: 20px;
  }
  .link-distribuicao.ativo {
    color: var(--color-primary-fg);
    background: var(--color-primary);
    border-radius: 50%;
  }
  .grade-voltar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .abc-toggle-btn {
    flex-shrink: 0;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--surface-fg);
    background: none;
    color: var(--surface-fg);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.3px;
    cursor: pointer;
  }
  .acima-editor {
    position: relative;
    z-index: 115;
  }

  .grade-scroll {
    overflow-x: auto;
    padding-bottom: var(--space-3);
  }
  .grade-tabela {
    border-collapse: collapse;
    width: 100%;
  }
  .grade-tabela th,
  .grade-tabela td {
    padding: var(--space-1);
    text-align: center;
    white-space: nowrap;
  }
  .grade-tabela th:not(:first-child),
  .grade-tabela td:not(:first-child) {
    border-left: 1px solid var(--surface-border);
  }
  .grade-cabecalho-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .grade-dia {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .grade-dia.com-treino {
    color: var(--color-primary);
  }
  .grade-rotina-nome {
    font-size: 11px;
    font-weight: 400;
    color: var(--surface-muted);
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-tabela .grade-col-musculo {
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    position: sticky;
    left: 0;
    background: var(--surface-card);
    padding-left: 0;
    max-width: 68px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-valor-caixa {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .grade-valor-link {
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .grade-valor-meta-edit {
    border: none;
    font-family: inherit;
    cursor: pointer;
    outline: 2px dashed currentColor;
    outline-offset: 1px;
  }
  .grade-meta-sub {
    font-size: 9px;
    font-weight: 400;
    opacity: 0.75;
    margin-left: 1px;
  }
  .grade-valor-vazio {
    opacity: 0.7;
  }
  .grade-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-2);
  }
  .grade-editar-metas-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px var(--space-2);
    border-radius: var(--radius-sm);
    border: none;
    background: var(--surface-card);
    color: var(--surface-fg);
    font-family: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .grade-editar-metas-btn :global(svg) {
    width: 14px;
    height: 14px;
  }
  .grade-tabela tbody tr:not(:last-child) td {
    border-bottom: 1px solid var(--surface-border);
  }
  .pizza-wrap {
    width: 100%;
    max-width: 320px;
    aspect-ratio: 1;
    overflow: hidden;
    margin: var(--space-2) auto 0;
  }
  .tendencia-musculo {
    margin: 0 0 var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    font-size: var(--font-size-sm);
  }
  .tendencia-subindo {
    color: var(--color-success);
  }
  .tendencia-estavel {
    color: var(--color-neutral);
  }
  .tendencia-caindo {
    color: var(--color-negative);
  }
  .resumo-musculo {
    display: flex;
    gap: var(--space-2);
    margin: var(--space-3) 0 0;
  }
  .resumo-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-lg);
    background: #232a3b;
    box-shadow: var(--shadow-card);
  }
  .resumo-valor {
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--surface-fg);
  }
  .resumo-label {
    font-size: 10px;
    color: var(--surface-muted);
    text-align: center;
    line-height: 1.2;
  }
  .status-ajuste {
    margin: 0 0 var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    font-size: var(--font-size-sm);
  }
  .status-ajuste-ok {
    color: var(--color-success);
  }
  .status-ajuste-info {
    color: var(--surface-muted);
  }
  .status-ajuste-erro {
    color: var(--color-negative);
  }
  .lista-exercicios-musculo {
    display: flex;
    flex-direction: column;
    transition: opacity 0.15s;
  }
  .lista-exercicios-musculo.carregando {
    opacity: 0.5;
    pointer-events: none;
  }
  .exercicio-musculo-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .exercicio-musculo-item:last-child {
    border-bottom: none;
  }
  .exercicio-musculo-item-btn {
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .exercicio-musculo-coluna {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .exercicio-musculo-info {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    overflow: hidden;
  }
  .exercicio-musculo-rotina {
    font-size: 12px;
    color: var(--surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .exercicio-musculo-nome {
    min-width: 0;
    flex-shrink: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base);
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .exercicio-musculo-variacao {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
  }
  .editor-serie-numero {
    font-weight: 700;
    font-size: var(--font-size-lg);
    /* Sem color aqui: herda var(--surface-fg) do botão pai por padrão, e .valor-subindo/
       -estavel/-caindo (aplicada como classe extra) sobrescreve — uma declaração direta
       sempre vence a herdada, então não importa a ordem das regras no arquivo. */
  }
  .editor-serie-label {
    font-weight: 400;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .editor-exercicio-series-col {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .editor-serie-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 1;
    padding: 2px 6px;
    border-radius: 999px;
    background: #232a3b;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.3;
    white-space: nowrap;
    color: #fff;
  }
  .serie-texto-musculo {
    flex-shrink: 0;
    font-weight: 600;
    font-size: var(--font-size-sm);
    white-space: nowrap;
  }
  .picker-lista-mover {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .picker-item-mover {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    text-align: left;
    padding: var(--space-3) 0;
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface-border);
    font-family: inherit;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .picker-item-mover-sub {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .picker-item-mover-linha {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .picker-item-mover-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .picker-item-mover-series {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .picker-item-mover-icone {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-card);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .picker-item-mover-icone svg {
    width: 16px;
    height: 16px;
  }
  .picker-item-mover-icone:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .adicionar-exercicio-musculo-btn {
    width: 100%;
    margin-top: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .tela-editor-rotina {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 110;
    overflow-y: auto;
  }
  .editor-conteudo {
    max-width: 480px;
    min-height: 100%;
    margin: 0 auto;
    padding: var(--space-4) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  /* Rolagem horizontal de cards quadrados — mesmo formato que os chips de músculo tinham na
     versão anterior do editor, só que maiores (o conteúdo principal de edição agora é aqui). */
  .editor-exercicios-lista {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    /* Espaço extra em cima: sem isso a alça de arrastar (que estoura pra fora do card, top:-8px)
       e o balãozinho de delta de séries ficavam cortados pelo próprio scroll. */
    padding: 10px 4px var(--space-2);
    margin-bottom: var(--space-4);
    transition: opacity 0.15s;
  }
  .editor-exercicios-lista.carregando {
    opacity: 0.5;
    pointer-events: none;
  }
  .editor-modo-reordenar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) 0 var(--space-3);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .editor-modo-reordenar button {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
  }
  .editor-exercicio-card {
    position: relative;
    flex-shrink: 0;
    width: 118px;
  }
  .editor-exercicio-card.editor-item-oculto {
    display: none;
  }
  .editor-exercicio-card.arrastando {
    opacity: 0.8;
  }
  .editor-exercicio-conteudo {
    position: relative;
    width: 100%;
    min-height: 110px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-card);
    border: none;
    text-align: left;
    font-family: inherit;
    color: var(--surface-fg);
    cursor: pointer;
  }
  .editor-exercicio-conteudo:disabled {
    cursor: default;
  }
  .editor-exercicio-nome-col {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .editor-exercicio-nome {
    flex: 1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    font-size: 12px;
    line-height: 1.25;
  }
  .editor-exercicio-nome.editor-nome-destacado {
    color: var(--color-primary);
    font-weight: 700;
  }
  .editor-tendencia-texto {
    flex-shrink: 0;
    font-size: 9px;
    line-height: 1;
  }
  /* Compound de propósito (mesma pegadinha de cascata de sempre): garante que a cor de
     tendência vence independente de onde .valor-subindo/-estavel/-caindo caírem no arquivo. */
  .editor-tendencia-texto.valor-subindo {
    color: var(--color-success);
  }
  .editor-tendencia-texto.valor-estavel {
    color: var(--color-neutral);
  }
  .editor-tendencia-texto.valor-caindo {
    color: var(--color-negative);
  }
  .editor-exercicio-posicao {
    position: absolute;
    right: 8px;
    bottom: 6px;
    font-size: 9px;
    color: var(--surface-muted);
  }
  .handle-arraste-card {
    position: absolute;
    top: -8px;
    left: -8px;
    z-index: 1;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    touch-action: none;
  }
  .editor-musculos-lista {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .editor-musculo-linha {
    width: 100%;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .editor-musculo-linha:has(.nome-btn:disabled) {
    opacity: 0.5;
  }
  .editor-musculo-linha:last-child {
    border-bottom: none;
  }
  .editor-musculo-ativo {
    background: var(--surface-card);
    border-radius: var(--radius-md);
    border-bottom-color: transparent;
    padding-left: var(--space-2);
    padding-right: var(--space-2);
  }
  .editor-musculo-nome-col {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
  }
  .editor-musculo-nome {
    font-size: var(--font-size-sm);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Balãozinho no canto, mesmo estilo do "x" nos cards de dia da tela de Dieta
     (DietaRefeicoesGerenciar.svelte .dia-card-x) — só que em pílula (o texto "+17%" não cabe
     num círculo de 20px) em vez de círculo. */
  .editor-meta-badge {
    position: absolute;
    top: -8px;
    right: -4px;
    min-width: 20px;
    height: 16px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
  }
  .editor-meta-badge.badge-mais {
    background: var(--color-success);
  }
  .editor-meta-badge.badge-menos {
    background: var(--color-negative);
  }
  .editor-botoes-fixos {
    flex-shrink: 0;
    /* margin-top:auto empurra pro fundo da tela quando a lista é curta (sobra espaço no
       flex-column, já que .editor-conteudo tem min-height:100%); position:sticky mantém
       colado no fundo da tela ao rolar quando a lista é longa. As duas regras juntas cobrem
       os dois casos, sem precisar saber de antemão se a lista cabe na tela ou não. */
    margin-top: auto;
    position: sticky;
    bottom: 0;
    background: var(--surface-bg);
    padding-top: var(--space-2);
  }
  .editor-totais {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .editor-totais-acoes {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .rotina-rodape {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--surface-border);
  }
  .rotina-totais-texto {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    cursor: pointer;
  }
  .rotina-grafico-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
  }
  .rotina-grafico-btn svg {
    width: 18px;
    height: 18px;
  }
  .adicionar-exercicio-editor-btn {
    flex-shrink: 0;
    margin-top: var(--space-4);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .salvar-editor-btn {
    flex-shrink: 0;
    margin-top: var(--space-4);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 700;
    cursor: pointer;
  }
  .salvar-editor-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
