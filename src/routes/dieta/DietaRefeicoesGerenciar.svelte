<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import WheelPickerMacros from "../../components/WheelPickerMacros.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import {
    listRefeicoesModelo,
    criarRefeicaoModelo,
    excluirRefeicaoModelo,
    reordenarRefeicoesModelo,
    getPerfilDietaEditavel,
    salvarPerfilDieta,
    getParametros,
    PARAMETROS_PADRAO,
    DEFINICOES_PARAMETROS,
    gramasDoParametro,
    getModoCalorias,
    getCaloriasDiaManuais,
    resolverDistribuicao,
    distribuirValorPorDia,
    definirModoCalorias,
    definirCaloriasDias,
    removerCaloriasDia,
    listMetasDiaModelo,
    carboidratoGDoDia,
    listRefeicoesModeloDia,
    definirRefeicoesDoDia,
    type RefeicaoModelo,
    type CaloriasPorDia,
    type CaloriasDiaManual,
    type MetaDiaModelo,
    type RefeicaoModeloDia,
    type LimiteParametro,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";
  import { DIAS_SEMANA_ABREV, listTreinos, type Treino } from "../../lib/treinoApi";
  import { navigate, voltar } from "../../lib/router.svelte";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

  /** Uma cor por meta de calorias distinta nos dias manuais — pra não confundir 2+ ajustes diferentes. */
  const CORES_GRUPOS_DIA = ["#5eead4", "#f9a8d4", "#fbbf24", "#93c5fd", "#c4b5fd", "#fca5a5"];

  /** Guarda a aba ativa na URL (query ?aba=) pra sobreviver ao remount que acontece quando volta de outra tela (ex: detalhamento de um prato). */
  function lerAbaDaUrl(): "calorias" | "refeicoes" {
    return new URLSearchParams(window.location.search).get("aba") === "refeicoes" ? "refeicoes" : "calorias";
  }

  function irParaAba(valor: "calorias" | "refeicoes") {
    aba = valor;
    const url = new URL(window.location.href);
    url.searchParams.set("aba", valor);
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  let aba = $state<"calorias" | "refeicoes">(untrack(() => lerAbaDaUrl()));

  let perfilCarregado = $state(false);
  let erroMetas = $state<string | null>(null);
  let salvandoCalorias = $state(false);

  let pesoAtual = $state(76);
  let parametros = $state<Map<string, LimiteParametro>>(new Map(Object.entries(PARAMETROS_PADRAO)));
  function parametro(chave: string): LimiteParametro {
    return parametros.get(chave) ?? PARAMETROS_PADRAO[chave];
  }
  const defParametro = new Map(DEFINICOES_PARAMETROS.map((d) => [d.chave, d]));
  let caloriasInput = $state<number | null>(null);
  let proteinaGKg = $state(2.17);
  let proteinaGInput = $state<number | null>(null);
  let gorduraGKg = $state(0.66);
  let gorduraGInput = $state<number | null>(null);
  let carboidratoGKg = $state(2.93);
  let carboidratoGInput = $state<number | null>(null);

  let modoCalorias = $state<"fixa" | "ondulatoria">("fixa");
  /** Último valor gravado no banco — pra saber se precisa persistir modo/distribuição no "Salvar" principal. */
  let modoCaloriasOriginal = $state<"fixa" | "ondulatoria">("fixa");
  let manuaisCompletos = $state<Map<number, CaloriasDiaManual>>(new Map());
  let manuaisOriginal = $state<Map<number, CaloriasDiaManual>>(new Map());
  const manuaisDias = $derived(new Map([...manuaisCompletos].map(([dia, v]) => [dia, v.calorias])));
  let diasSelecionados = $state<Set<number>>(new Set());

  const caloriasCalc = $derived(
    Math.round(4 * (proteinaGInput ?? 0) + 9 * (gorduraGInput ?? 0) + 4 * (carboidratoGInput ?? 0)),
  );
  const pctProteina = $derived(caloriasCalc > 0 ? (4 * (proteinaGInput ?? 0) * 100) / caloriasCalc : 0);
  const pctGordura = $derived(caloriasCalc > 0 ? (9 * (gorduraGInput ?? 0) * 100) / caloriasCalc : 0);
  const pctCarboidrato = $derived(caloriasCalc > 0 ? (4 * (carboidratoGInput ?? 0) * 100) / caloriasCalc : 0);
  const donutStyle = $derived(
    `background: conic-gradient(${COR_CARBO} 0% ${pctCarboidrato}%, ${COR_GORDURA} ${pctCarboidrato}% ${pctCarboidrato + pctGordura}%, ${COR_PROTEINA} ${pctCarboidrato + pctGordura}% 100%);`,
  );

  /** Metas de consumo puramente informativas — Fibras e Gordura Saturada vêm da faixa parametrizada em % das calorias do dia; Água continua por kg de peso. */
  const fibrasMinG = $derived(Math.round(gramasDoParametro(defParametro.get("fibras")!, parametro("fibras").min, pesoAtual, caloriasCalc)));
  const fibrasMaxG = $derived(Math.round(gramasDoParametro(defParametro.get("fibras")!, parametro("fibras").max, pesoAtual, caloriasCalc)));
  const gorduraSaturadaMaxG = $derived(Math.round(gramasDoParametro(defParametro.get("gordura_saturada")!, parametro("gordura_saturada").max, pesoAtual, caloriasCalc)));

  /** Mesmas faixas de cima, mas pra calorias de um bloco de dias específico (Ondulatória) — o bloco pode ter uma meta diferente da média semanal. */
  function fibrasMaxDoGrupo(calorias: number): number {
    return Math.round(gramasDoParametro(defParametro.get("fibras")!, parametro("fibras").max, pesoAtual, calorias));
  }
  function gorduraSaturadaMaxDoGrupo(calorias: number): number {
    return Math.round(gramasDoParametro(defParametro.get("gordura_saturada")!, parametro("gordura_saturada").max, pesoAtual, calorias));
  }
  const aguaMinL = $derived(Math.round(parametro("agua").min * pesoAtual * 10) / 10);
  const aguaMaxL = $derived(Math.round(parametro("agua").max * pesoAtual * 10) / 10);

  function formatarFaixa(min: number, max: number, casas: number): string {
    return min === max ? min.toFixed(casas) : `${min.toFixed(casas)}–${max.toFixed(casas)}`;
  }

  const minimoCalorias = $derived(parametro("calorias").min * pesoAtual);

  /** Resolvida 100% localmente — trocar Fixa/Ondulatória ou olhar a tela não bate no banco. */
  const diasResolvidos = $derived.by((): CaloriasPorDia[] => {
    if (modoCalorias === "fixa") {
      return [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ diaSemana: dia, calorias: caloriasCalc, manual: false }));
    }
    try {
      return resolverDistribuicao(caloriasCalc, manuaisDias, minimoCalorias);
    } catch {
      return [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ diaSemana: dia, calorias: caloriasCalc, manual: manuaisDias.has(dia) }));
    }
  });

  /** Cor fixa por nome de bloco distinto — blocos diferentes saem com cores diferentes. */
  const corPorBloco = $derived.by(() => {
    const nomes = blocosNomeados.map((b) => b.nome).sort();
    return new Map(nomes.map((n, i) => [n, CORES_GRUPOS_DIA[i % CORES_GRUPOS_DIA.length]]));
  });

  function corDoDia(dia: CaloriasPorDia): string | null {
    if (dia.manual) {
      const nome = nomeDoDia(dia.diaSemana);
      return nome ? (corPorBloco.get(nome) ?? null) : null;
    }
    if (diasSelecionados.has(dia.diaSemana)) {
      return CORES_GRUPOS_DIA[corPorBloco.size % CORES_GRUPOS_DIA.length];
    }
    return null;
  }

  interface GrupoDias {
    dias: number[];
    calorias: number;
    manual: boolean;
    cor: string | null;
    modelos: RefeicaoModelo[];
  }

  /** Refeições do catálogo que aparecem nesse dia, na ordem salva — sem customização ainda, cai no catálogo global inteiro. */
  function modelosDoDia(dia: number): RefeicaoModelo[] {
    const linhas = modelosPorDia.filter((r) => r.diaSemana === dia);
    if (!linhas.length) return modelos;
    const porId = new Map(modelos.map((m) => [m.id, m]));
    return linhas
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => porId.get(r.modeloId))
      .filter((m): m is RefeicaoModelo => m != null);
  }

  /** Gordura dos dias automáticos é redistribuída pela semana — dias manuais "gastam" da meta semanal, o resto divide igual entre os automáticos. Proteína nunca varia por dia, é sempre o global (proteinaGInput direto). */
  const gorduraResolvidaSemana = $derived.by(() =>
    distribuirValorPorDia(gorduraGInput ?? 0, new Map([...manuaisCompletos].map(([d, v]) => [d, v.gorduraG]))),
  );

  /**
   * Visão "ao vivo" dos blocos já salvos — como a proteína é global e pode ter mudado desde que
   * cada bloco foi configurado, o carboidrato de cada um é recalculado aqui pra fechar a calorias
   * daquele bloco (que fica travada) com a proteína/gordura vigentes. Sempre ler daqui, nunca de
   * manuaisCompletos diretamente, quando precisar do carboidrato ou proteína efetivos de um bloco.
   */
  const manuaisEfetivos = $derived.by(() => {
    const p = proteinaGInput ?? 0;
    return new Map(
      [...manuaisCompletos].map(([dia, v]) => [
        dia,
        { calorias: v.calorias, proteinaG: p, gorduraG: v.gorduraG, carboidratoG: carboidratoGDoDia(v.calorias, p, v.gorduraG), nomeBloco: v.nomeBloco },
      ]),
    );
  });

  function nomeDoDia(dia: number): string | null {
    return manuaisEfetivos.get(dia)?.nomeBloco ?? null;
  }

  interface Bloco {
    nome: string;
    dias: number[];
  }

  /** Um bloco = todo dia com o mesmo nome — só existe depois que "Definir bloco" nomeia a seleção. */
  const blocosNomeados = $derived.by((): Bloco[] => {
    const porNome = new Map<string, number[]>();
    for (const [dia, v] of manuaisEfetivos) {
      if (!v.nomeBloco) continue;
      const lista = porNome.get(v.nomeBloco) ?? [];
      lista.push(dia);
      porNome.set(v.nomeBloco, lista);
    }
    return [...porNome.entries()].map(([nome, dias]) => ({ nome, dias: dias.sort((a, b) => a - b) }));
  });

  const todosOsDiasNomeados = $derived([0, 1, 2, 3, 4, 5, 6].every((d) => manuaisEfetivos.get(d)?.nomeBloco));

  /** Dias com a mesma meta de calorias E as mesmas refeições (na mesma ordem) viram um único bloco — dias diferentes em qualquer um dos dois saem em blocos separados. Ordem preservada pela primeira ocorrência (Dom..Sáb). */
  const gruposDias = $derived.by((): GrupoDias[] => {
    const grupos = new Map<string, GrupoDias>();
    for (const d of diasResolvidos) {
      const chaveCal = Math.round(d.calorias);
      const listaDia = modelosDoDia(d.diaSemana);
      const chave = `${chaveCal}|${listaDia.map((m) => m.id).join(",")}`;
      let g = grupos.get(chave);
      if (!g) {
        const nome = d.manual ? nomeDoDia(d.diaSemana) : null;
        g = {
          dias: [],
          calorias: d.calorias,
          manual: d.manual,
          cor: nome ? (corPorBloco.get(nome) ?? null) : null,
          modelos: listaDia,
        };
        grupos.set(chave, g);
      }
      g.dias.push(d.diaSemana);
    }
    return [...grupos.values()];
  });

  async function carregarMetas() {
    try {
      const [perfil, pesoMedio, modo, manuais, parametrosCarregados] = await Promise.all([
        getPerfilDietaEditavel(),
        getPesoMedioAtual(),
        getModoCalorias(),
        getCaloriasDiaManuais(),
        getParametros(),
      ]);
      pesoAtual = pesoMedio ?? perfil.pesoAtual;
      proteinaGKg = perfil.proteinaGKg;
      gorduraGKg = perfil.gorduraGKg;
      carboidratoGKg = perfil.carboidratoGKg;
      proteinaGInput = Math.round(proteinaGKg * pesoAtual);
      gorduraGInput = Math.round(gorduraGKg * pesoAtual);
      carboidratoGInput = Math.round(carboidratoGKg * pesoAtual);
      caloriasInput = caloriasCalc;
      modoCalorias = modo;
      modoCaloriasOriginal = modo;
      manuaisCompletos = manuais;
      manuaisOriginal = new Map(manuais);
      parametros = parametrosCarregados;
      perfilCarregado = true;
    } catch (err) {
      erroMetas = (err as Error).message;
    }
  }

  void carregarMetas();

  /** Só muda localmente — persiste no banco junto com o resto ao tocar em "Salvar". */
  function alterarModoCalorias(modo: "fixa" | "ondulatoria") {
    modoCalorias = modo;
    diasSelecionados = new Set();
  }

  function alternarModoToggle() {
    alterarModoCalorias(modoCalorias === "fixa" ? "ondulatoria" : "fixa");
  }

  /** Só dias automáticos (sem bloco ainda) entram na seleção — um dia já num bloco só se desvincula pelo "x" do card. */
  function toggleDiaSelecionado(dia: number) {
    if (nomeDoDia(dia) != null) return;
    const novo = new Set(diasSelecionados);
    if (novo.has(dia)) novo.delete(dia);
    else novo.add(dia);
    diasSelecionados = novo;
  }

  let mostrarNomearBloco = $state(false);
  let nomeBlocoInput = $state("");

  function abrirNomearBloco() {
    nomeBlocoInput = "";
    mostrarNomearBloco = true;
  }

  /** Nomeia os dias selecionados como um bloco — dias já manuais mantêm calorias/gordura/carboidrato, dias ainda automáticos são semeados com o valor atual resolvido pra esse dia. */
  function salvarNomeBloco() {
    const nome = nomeBlocoInput.trim();
    if (!nome) return;
    const novoManual = new Map(manuaisCompletos);
    for (const dia of diasSelecionados) {
      const existente = novoManual.get(dia);
      if (existente) {
        novoManual.set(dia, { ...existente, nomeBloco: nome });
      } else {
        const info = diasResolvidos.find((d) => d.diaSemana === dia);
        const gorduraG = gorduraResolvidaSemana.find((d) => d.diaSemana === dia)?.valor ?? gorduraGInput ?? 0;
        const calorias = info?.calorias ?? caloriasCalc;
        const proteinaG = proteinaGInput ?? 0;
        novoManual.set(dia, {
          calorias,
          proteinaG,
          gorduraG,
          carboidratoG: carboidratoGDoDia(calorias, proteinaG, gorduraG),
          nomeBloco: nome,
        });
      }
    }
    manuaisCompletos = novoManual;
    diasSelecionados = new Set();
    mostrarNomearBloco = false;
  }

  interface BlocoEdicao {
    nome: string;
    dias: number[];
    calorias: number;
    gorduraG: number;
    carboidratoG: number;
  }

  let mostrarCaloriasBlocos = $state(false);
  let blocosEdicao = $state<BlocoEdicao[]>([]);
  /** Índice do bloco cuja Calorias está sendo editada (WheelPicker de valor único). */
  let blocoCaloriasEditando = $state<number | null>(null);
  /** Índice do bloco cujo Proteína/Gordura/Carboidrato está sendo editado (seletor de 3 colunas, com % e g/peso ao vivo). */
  let blocoMacrosEditando = $state<number | null>(null);

  function abrirCaloriasBlocos() {
    blocosEdicao = blocosNomeados.map((b) => {
      const dados = manuaisEfetivos.get(b.dias[0])!;
      return { nome: b.nome, dias: b.dias, calorias: dados.calorias, gorduraG: dados.gorduraG, carboidratoG: dados.carboidratoG };
    });
    mostrarCaloriasBlocos = true;
  }

  /**
   * Generaliza resolverDistribuicao/distribuirValorPorDia pra quando TODOS os dias já têm um valor
   * próprio (nenhum "automático" sobrando): editar um bloco desloca todos os OUTROS igualmente por
   * dia (a soma ponderada por dias de cada bloco continua = metaPorDia × 7), preservando a diferença
   * relativa entre eles em vez de nivelar todos num único valor.
   */
  function redistribuirEntreBlocos(
    metaPorDia: number,
    blocos: BlocoEdicao[],
    idxEditado: number,
    novoValor: number,
    campo: "calorias" | "gorduraG",
  ): BlocoEdicao[] {
    const diasEditado = blocos[idxEditado].dias.length;
    const diasOutrosTotal = 7 - diasEditado;
    const valorAntigo = blocos[idxEditado][campo];
    if (diasOutrosTotal === 0) {
      return blocos.map((b, i) => (i === idxEditado ? { ...b, [campo]: novoValor } : b));
    }
    const deltaTotal = (novoValor - valorAntigo) * diasEditado;
    const deltaPorDia = -deltaTotal / diasOutrosTotal;
    return blocos.map((b, i) => (i === idxEditado ? { ...b, [campo]: novoValor } : { ...b, [campo]: Math.max(0, b[campo] + deltaPorDia) }));
  }

  function aplicarEdicaoCalorias(idx: number, valor: number) {
    blocosEdicao = redistribuirEntreBlocos(caloriasCalc, blocosEdicao, idx, valor, "calorias");
    const proteina = proteinaGInput ?? 0;
    blocosEdicao = blocosEdicao.map((b) => ({ ...b, carboidratoG: carboidratoGDoDia(b.calorias, proteina, b.gorduraG) }));
  }

  /**
   * Maior valor de calorias/gordura que dá pra colocar nesse bloco sem empurrar NENHUM outro bloco
   * abaixo do mínimo parametrizado — redistribuirEntreBlocos desloca a diferença igualmente por dia
   * entre os outros, então quem primeiro bate no piso é o bloco com o menor valor atual entre eles.
   */
  function tetoRedistribuicao(blocos: BlocoEdicao[], idxEditado: number, campo: "calorias" | "gorduraG", minimo: number): number {
    const diasEditado = blocos[idxEditado].dias.length;
    const diasOutrosTotal = 7 - diasEditado;
    const valorAntigo = blocos[idxEditado][campo];
    if (diasOutrosTotal === 0) return Infinity;
    const minOutros = Math.min(...blocos.filter((_, i) => i !== idxEditado).map((b) => b[campo]));
    const teto = valorAntigo + ((minOutros - minimo) * diasOutrosTotal) / diasEditado;
    return Math.max(teto, valorAntigo);
  }

  /** Maior proteína que dá pra colocar sem que o carboidrato recalculado de nenhum bloco (fecha calorias−proteína−gordura) fique abaixo do mínimo parametrizado. */
  function tetoProteina(blocos: BlocoEdicao[], carboMinG: number): number {
    const tetos = blocos.map((b) => (b.calorias - 4 * carboMinG - 9 * b.gorduraG) / 4);
    return Math.max(Math.min(...tetos), proteinaGInput ?? 0);
  }

  function infoCelulaCalorias(idx: number) {
    const bloco = blocosEdicao[idx];
    const valorAtual = Math.round(bloco.calorias / 10) * 10;
    const teto = tetoRedistribuicao(blocosEdicao, idx, "calorias", minimoCalorias);
    const piso = Math.min(minimoCalorias, valorAtual);
    return {
      titulo: `Calorias — ${bloco.nome}`,
      opcoes: opcoesCalorias().filter((o) => o.valor >= piso && o.valor <= teto),
      valorAtual,
      onSelecionar: (v: number) => aplicarEdicaoCalorias(idx, v),
    };
  }

  /** 3 colunas de um bloco — Proteína é a coluna do valor GLOBAL, igual ao seletor de macros de fora do modal. Gordura e Proteína têm o teto limitado pra não empurrar nenhum bloco (esse ou os outros) abaixo do mínimo parametrizado. */
  function colunasBloco(idx: number) {
    const bloco = blocosEdicao[idx];
    const gorduraMinG = parametro("gordura").min * pesoAtual;
    const carboMinG = parametro("carboidrato").min * pesoAtual;
    const tetoGordura = tetoRedistribuicao(blocosEdicao, idx, "gorduraG", gorduraMinG);
    const tetoProt = tetoProteina(blocosEdicao, carboMinG);
    return [
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesMacro(parametro("carboidrato").min, parametro("carboidrato").max), valorAtual: bloco.carboidratoG, kcalPorGrama: 4, secundario: secundarioMacro },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesMacro(parametro("gordura").min, parametro("gordura").max).filter((o) => o.valor <= tetoGordura), valorAtual: bloco.gorduraG, kcalPorGrama: 9, secundario: secundarioMacro },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesMacro(parametro("proteina").min, parametro("proteina").max).filter((o) => o.valor <= tetoProt), valorAtual: proteinaGInput ?? 0, kcalPorGrama: 4, secundario: secundarioMacro },
    ];
  }

  function abrirMacrosBloco(idx: number) {
    unidadeMacros = "g";
    blocoMacrosEditando = idx;
  }

  /**
   * Gordura editada nesse bloco redistribui entre os outros (preserva a meta semanal); proteína
   * editada aqui é global (atualiza todos); carboidrato desse bloco vira o valor escolhido direto —
   * os demais blocos recalculam o carboidrato deles pra fechar a conta com a proteína/gordura atuais.
   */
  function confirmarMacrosBloco(idx: number, valores: Record<string, number>) {
    if (valores.proteinaG !== proteinaGInput) {
      proteinaGInput = valores.proteinaG;
      proteinaGKg = pesoAtual > 0 ? Math.round((valores.proteinaG / pesoAtual) * 100) / 100 : 0;
    }
    if (valores.gorduraG !== blocosEdicao[idx].gorduraG) {
      blocosEdicao = redistribuirEntreBlocos(gorduraGInput ?? 0, blocosEdicao, idx, valores.gorduraG, "gorduraG");
    }
    const proteina = proteinaGInput ?? 0;
    blocosEdicao = blocosEdicao.map((b, i) =>
      i === idx ? { ...b, carboidratoG: valores.carboidratoG } : { ...b, carboidratoG: carboidratoGDoDia(b.calorias, proteina, b.gorduraG) },
    );
  }

  /** Só aplica localmente — persiste no banco junto com o resto ao tocar em "Salvar" no fim da tela. */
  function confirmarCaloriasBlocos() {
    const novoManual = new Map(manuaisCompletos);
    const proteina = proteinaGInput ?? 0;
    for (const b of blocosEdicao) {
      for (const dia of b.dias) {
        novoManual.set(dia, { calorias: Math.round(b.calorias), proteinaG: proteina, gorduraG: b.gorduraG, carboidratoG: b.carboidratoG, nomeBloco: b.nome });
      }
    }
    manuaisCompletos = novoManual;
    mostrarCaloriasBlocos = false;
  }

  /** Só remove localmente — persiste no banco junto com o resto ao tocar em "Salvar" no fim da tela. */
  function removerAjusteDia(dia: number) {
    const novoManual = new Map(manuaisCompletos);
    novoManual.delete(dia);
    manuaisCompletos = novoManual;
  }

  function recalcularCaloriasDosMacros() {
    caloriasInput = caloriasCalc;
  }

  function aoEditarCalorias() {
    if (caloriasInput == null) return;
    const novoCarboG = Math.max(0, Math.round((caloriasInput - 4 * (proteinaGInput ?? 0) - 9 * (gorduraGInput ?? 0)) / 4));
    carboidratoGInput = novoCarboG;
    carboidratoGKg = pesoAtual > 0 ? Math.round((novoCarboG / pesoAtual) * 100) / 100 : 0;
    if (modoCalorias === "ondulatoria" && todosOsDiasNomeados) {
      reescalarBlocosParaMedia(caloriasInput);
    }
  }

  /**
   * Com todos os 7 dias já em blocos nomeados, resolverDistribuicao não tem mais dia automático
   * pra absorver a meta semanal — editar a média aqui direto no donut, então, precisa reescalar
   * cada dia proporcionalmente (mesma % pra todos) até a soma bater a nova média × 7. Proteína
   * continua o global constante; o carboidrato de cada dia recalcula pra fechar a conta com a
   * calorias nova e a gordura que já tinha.
   */
  function reescalarBlocosParaMedia(novaMedia: number) {
    const valores = [...manuaisCompletos.values()];
    if (!valores.length) return;
    const mediaAtual = valores.reduce((acc, v) => acc + v.calorias, 0) / 7;
    if (mediaAtual <= 0) return;
    const fator = novaMedia / mediaAtual;
    const proteina = proteinaGInput ?? 0;
    const novoManual = new Map(manuaisCompletos);
    for (const [dia, v] of manuaisCompletos) {
      const novaCalorias = Math.round(v.calorias * fator);
      novoManual.set(dia, {
        calorias: novaCalorias,
        proteinaG: proteina,
        gorduraG: v.gorduraG,
        carboidratoG: carboidratoGDoDia(novaCalorias, proteina, v.gorduraG),
        nomeBloco: v.nomeBloco,
      });
    }
    manuaisCompletos = novoManual;
  }

  let campoEditando = $state<"calorias" | null>(null);
  let mostrarMacros = $state(false);
  /** Qual unidade o modal de 3 colunas mostra — decidido por qual campo foi tocado pra abri-lo (gramas ou g/kg), o valor salvo é sempre em gramas. */
  let unidadeMacros = $state<"g" | "gkg">("g");

  function tituloMacros(): string {
    return unidadeMacros === "gkg" ? "Ajustar Macros (g/kg)" : "Ajustar Macros (g)";
  }

  function abrirMacros(unidade: "g" | "gkg") {
    unidadeMacros = unidade;
    mostrarMacros = true;
  }

  function opcoesMacro(minGKg: number, maxGKg: number): { valor: number; label: string }[] {
    return unidadeMacros === "gkg" ? opcoesGKgComoGramas(minGKg, maxGKg) : opcoesGramas(minGKg, maxGKg);
  }

  /** Texto da unidade oposta à que o seletor está editando — g/kg quando edita em gramas (aberto pelo gráfico), total de gramas quando edita em g/kg (aberto pelo card). */
  function secundarioMacro(valorGramas: number): string {
    if (unidadeMacros === "gkg") return `${Math.round(valorGramas)} g`;
    return pesoAtual > 0 ? `${(valorGramas / pesoAtual).toFixed(2)} g/kg` : "0.00 g/kg";
  }

  function colunasMacros() {
    return [
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesMacro(parametro("carboidrato").min, parametro("carboidrato").max), valorAtual: carboidratoGInput ?? 0, kcalPorGrama: 4, secundario: secundarioMacro },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesMacro(parametro("gordura").min, parametro("gordura").max), valorAtual: gorduraGInput ?? 0, kcalPorGrama: 9, secundario: secundarioMacro },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesMacro(parametro("proteina").min, parametro("proteina").max), valorAtual: proteinaGInput ?? 0, kcalPorGrama: 4, secundario: secundarioMacro },
    ];
  }

  function confirmarMacros(valores: Record<string, number>) {
    carboidratoGInput = valores.carboidratoG;
    gorduraGInput = valores.gorduraG;
    proteinaGInput = valores.proteinaG;
    carboidratoGKg = pesoAtual > 0 ? Math.round((carboidratoGInput / pesoAtual) * 100) / 100 : 0;
    gorduraGKg = pesoAtual > 0 ? Math.round((gorduraGInput / pesoAtual) * 100) / 100 : 0;
    proteinaGKg = pesoAtual > 0 ? Math.round((proteinaGInput / pesoAtual) * 100) / 100 : 0;
    recalcularCaloriasDosMacros();
  }

  /** Grade de g/kg convertida pra gramas (peso atual) — o valor canônico das colunas do modal é sempre gramas; só o rótulo mostra g/kg. */
  function opcoesGKgComoGramas(minGKg: number, maxGKg: number): { valor: number; label: string }[] {
    const opcoes: { valor: number; label: string }[] = [];
    for (let v = Math.round(minGKg * 100); v <= Math.round(maxGKg * 100); v++) {
      const gkg = v / 100;
      opcoes.push({ valor: Math.round(gkg * pesoAtual), label: gkg.toFixed(2).replace(".", ",") });
    }
    return opcoes;
  }

  function opcoesGramas(minGKg: number, maxGKg: number): { valor: number; label: string }[] {
    const minG = Math.round(minGKg * pesoAtual);
    const maxG = Math.round(maxGKg * pesoAtual);
    const opcoes: { valor: number; label: string }[] = [];
    for (let v = minG; v <= maxG; v++) opcoes.push({ valor: v, label: `${v} g` });
    return opcoes;
  }

  function opcoesCalorias(): { valor: number; label: string }[] {
    const opcoes: { valor: number; label: string }[] = [];
    for (let v = 800; v <= 6000; v += 10) opcoes.push({ valor: v, label: `${v} kcal` });
    return opcoes;
  }

  /** Menor média semanal que dá pra colocar sem que a reescala proporcional (reescalarBlocosParaMedia) jogue algum bloco abaixo do mínimo parametrizado — só relevante quando os 7 dias já estão todos em blocos nomeados. */
  function pisoMediaOndulatoria(): number {
    if (!(modoCalorias === "ondulatoria" && todosOsDiasNomeados)) return 0;
    const valores = [...manuaisCompletos.values()].map((v) => v.calorias);
    if (!valores.length) return 0;
    const mediaAtual = valores.reduce((acc, v) => acc + v, 0) / 7;
    const minValorAtual = Math.min(...valores);
    if (minValorAtual <= 0) return 0;
    return (mediaAtual * minimoCalorias) / minValorAtual;
  }

  function infoCampo(campo: "calorias") {
    const valorAtual = Math.round((caloriasInput ?? caloriasCalc) / 10) * 10;
    const piso = Math.min(Math.max(pisoMediaOndulatoria(), minimoCalorias), valorAtual);
    return {
      titulo: "Calorias (kcal)",
      opcoes: opcoesCalorias().filter((o) => o.valor >= piso),
      valorAtual,
      onSelecionar: (v: number) => {
        caloriasInput = v;
        aoEditarCalorias();
      },
    };
  }

  async function salvarCalorias() {
    salvandoCalorias = true;
    try {
      await salvarPerfilDieta({
        pesoAtual,
        metaCalorias: caloriasInput ?? caloriasCalc,
        proteinaGKg,
        gorduraGKg,
        carboidratoGKg,
        fibrasG: Math.round((fibrasMinG + fibrasMaxG) / 2),
        aguaL: Math.round(((aguaMinL + aguaMaxL) / 2) * 10) / 10,
      });

      if (modoCalorias !== modoCaloriasOriginal) {
        await definirModoCalorias(modoCalorias);
      }

      const diasRemovidos = [...manuaisOriginal.keys()].filter((dia) => !manuaisCompletos.has(dia));
      await Promise.all(diasRemovidos.map((dia) => removerCaloriasDia(dia)));
      await Promise.all(
        [...manuaisEfetivos].map(([dia, v]) =>
          definirCaloriasDias([dia], v.proteinaG, v.gorduraG, v.carboidratoG, caloriasCalc, minimoCalorias, manuaisDias, v.nomeBloco),
        ),
      );

      modoCaloriasOriginal = modoCalorias;
      manuaisOriginal = new Map(manuaisCompletos);
    } catch (err) {
      alert("Erro ao salvar metas: " + (err as Error).message);
    } finally {
      salvandoCalorias = false;
    }
  }

  let modelos = $state<RefeicaoModelo[]>([]);
  let metasDiaModelo = $state<MetaDiaModelo[]>([]);
  let modelosPorDia = $state<RefeicaoModeloDia[]>([]);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let mostrarForm = $state(false);
  let nome = $state("");
  let salvando = $state(false);
  let paraExcluir = $state<RefeicaoModelo | null>(null);
  let excluindo = $state(false);

  let itemRefs: (HTMLLIElement | null)[] = [];
  let itemRefsDia: (HTMLLIElement | null)[][] = [[], [], [], [], [], [], []];
  /** null = arrastando na lista única (Fixa); número = arrastando dentro da seção desse dia (Ondulatória). */
  let arrastandoDia = $state<number | null>(null);
  let arrastandoIndex = $state<number | null>(null);
  let arrastarOffsetY = $state(0);
  let alturaLinha = 0;
  let startY = 0;
  let ordemMudou = false;
  /** Cópia local da lista do grupo sendo arrastado (Ondulatória) — não mexe no catálogo global. */
  let arrastoListaDia = $state<RefeicaoModelo[]>([]);
  let arrastandoGrupoDiasCompleto: number[] = [];

  const metaDiaMap = $derived(new Map(metasDiaModelo.map((md) => [`${md.modeloId}:${md.diaSemana}`, md])));

  interface MetaEfetiva {
    receitaId: string | null;
    calorias: number | null;
    proteinaG: number | null;
    gorduraG: number | null;
    carboidratoG: number | null;
    fibraG: number | null;
    gorduraSaturadaG: number | null;
  }

  /** Meta de uma refeição do catálogo num dia específico — usa o override daquele dia se houver, senão cai pra meta global (m). */
  function metaEfetivaDoDia(m: RefeicaoModelo, dia: number): MetaEfetiva {
    const override = metaDiaMap.get(`${m.id}:${dia}`);
    if (override) {
      return {
        receitaId: override.metaReceitaId,
        calorias: override.metaCalorias,
        proteinaG: override.metaProteinaG,
        gorduraG: override.metaGorduraG,
        carboidratoG: override.metaCarboidratoG,
        fibraG: override.metaFibraG,
        gorduraSaturadaG: override.metaGorduraSaturadaG,
      };
    }
    return {
      receitaId: m.metaReceitaId,
      calorias: m.metaCalorias,
      proteinaG: m.metaProteinaG,
      gorduraG: m.metaGorduraG,
      carboidratoG: m.metaCarboidratoG,
      fibraG: m.metaFibraG,
      gorduraSaturadaG: m.metaGorduraSaturadaG,
    };
  }

  /** Soma dos macros já configurados nas refeições desse dia — pra comparar com a meta do dia. */
  function somaMacrosInformados(dia: number) {
    return modelosDoDia(dia).reduce(
      (acc, m) => {
        const meta = metaEfetivaDoDia(m, dia);
        return {
          calorias: acc.calorias + (meta.calorias ?? 0),
          proteinaG: acc.proteinaG + (meta.proteinaG ?? 0),
          gorduraG: acc.gorduraG + (meta.gorduraG ?? 0),
          carboidratoG: acc.carboidratoG + (meta.carboidratoG ?? 0),
          fibraG: acc.fibraG + (meta.fibraG ?? 0),
          gorduraSaturadaG: acc.gorduraSaturadaG + (meta.gorduraSaturadaG ?? 0),
        };
      },
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0, fibraG: 0, gorduraSaturadaG: 0 },
    );
  }

  /** Mesma soma, mas sobre todo o catálogo — usada no topo da aba Refeições em Fixa (não há grupos de dias pra separar). */
  function somaMacrosGlobal() {
    return modelos.reduce(
      (acc, m) => ({
        calorias: acc.calorias + (m.metaCalorias ?? 0),
        proteinaG: acc.proteinaG + (m.metaProteinaG ?? 0),
        gorduraG: acc.gorduraG + (m.metaGorduraG ?? 0),
        carboidratoG: acc.carboidratoG + (m.metaCarboidratoG ?? 0),
        fibraG: acc.fibraG + (m.metaFibraG ?? 0),
        gorduraSaturadaG: acc.gorduraSaturadaG + (m.metaGorduraSaturadaG ?? 0),
      }),
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0, fibraG: 0, gorduraSaturadaG: 0 },
    );
  }

  /**
   * Meta de macros do dia pra esse grupo: proteína é sempre o global atual (nunca varia por dia);
   * se é manual, gordura vem da composição salva e o carboidrato é recalculado ao vivo pra fechar
   * a calorias travada desse bloco com a proteína vigente (manuaisEfetivos); se é automático, a
   * gordura vem da redistribuição semanal, com o carboidrato calculado pra fechar a meta de
   * calorias desse dia.
   */
  function metaMacrosDoGrupo(grupo: GrupoDias) {
    const proteinaG = proteinaGInput ?? 0;
    if (grupo.manual) {
      const dados = manuaisEfetivos.get(grupo.dias[0]);
      if (dados) return dados;
    }
    const gorduraG = gorduraResolvidaSemana.find((d) => d.diaSemana === grupo.dias[0])?.valor ?? gorduraGInput ?? 0;
    return { calorias: grupo.calorias, proteinaG, gorduraG, carboidratoG: carboidratoGDoDia(grupo.calorias, proteinaG, gorduraG) };
  }

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  /** Só pra exibição — arredonda a meta calculada da refeição pra dezena mais próxima (ex: 653 vira 650), sem alterar o valor real usado nos cálculos. */
  function arredondarDezena(valor: number): number {
    return Math.round(valor / 10) * 10;
  }

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  let modoRestanteRefeicoes = $state(false);

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [modelos, metasDiaModelo, modelosPorDia] = await Promise.all([listRefeicoesModelo(), listMetasDiaModelo(), listRefeicoesModeloDia()]);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
      carregouAlgumaVez = true;
    }
  }

  void carregar();

  let treinos = $state<Treino[]>([]);
  let carregouTreinos = $state(false);

  async function carregarTreinos() {
    try {
      treinos = await listTreinos();
    } catch {
      // informativo — só usado pra mostrar o nome do treino em cima dos cards de dia
    } finally {
      carregouTreinos = true;
    }
  }

  void carregarTreinos();

  /** Só libera a tela quando TUDO (metas/calorias, catálogo de refeições e treinos) já carregou —
   * senão a "Refeições" pinta primeiro em modo Fixa e pula pra Ondulatória assim que carregarMetas
   * termina (modoCalorias começa em "fixa" e só é sobrescrito depois), e o nome do treino em cima
   * de cada card de dia aparece com atraso. Preferível segurar tudo e pintar uma vez só, completo. */
  const pronto = $derived(perfilCarregado && carregouAlgumaVez && carregouTreinos);

  function treinoDoDia(dia: number): string | null {
    return treinos.find((t) => t.dia_semana === dia)?.nome_treino ?? null;
  }

  function abrirNovo() {
    nome = "";
    mostrarForm = true;
  }

  function pctDoDia(calorias: number): number {
    return caloriasCalc > 0 ? Math.round((calorias / caloriasCalc) * 100) : 0;
  }

  function pctDeDia(calorias: number, diaCalorias: number): number {
    return diaCalorias > 0 ? Math.round((calorias / diaCalorias) * 100) : 0;
  }

  /** diasGrupo: todos os dias que compartilham essa meta de calorias — vincular um prato aqui vale pro grupo inteiro de uma vez. */
  function abrirMeta(m: RefeicaoModelo, diasGrupo?: number[]) {
    const receitaId = diasGrupo?.length ? metaEfetivaDoDia(m, diasGrupo[0]).receitaId : m.metaReceitaId;
    if (receitaId) {
      navigate(`/dieta/receitas/ver/${receitaId}`);
      return;
    }
    const diaSeg = diasGrupo?.length ? `/${diasGrupo.join(",")}` : "";
    navigate(`/dieta/receitas/buscar/meta/${m.id}/${encodeURIComponent(m.nome)}${diaSeg}`);
  }

  async function salvar() {
    if (!nome.trim()) return;
    salvando = true;
    try {
      await criarRefeicaoModelo(nome.trim());
      mostrarForm = false;
      await carregar();
    } catch (err) {
      alert("Erro ao salvar refeição: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function excluir() {
    if (!paraExcluir) return;
    excluindo = true;
    try {
      await excluirRefeicaoModelo(paraExcluir.id);
      paraExcluir = null;
      await carregar();
    } catch (err) {
      alert("Erro ao excluir refeição: " + (err as Error).message);
    } finally {
      excluindo = false;
    }
  }

  /** Tempo segurando o nome da refeição antes do toque virar "pressionar" (abre confirmação de excluir) — evita disparar sem querer num toque rápido. */
  const ATRASO_PRESSIONAR_MS = 500;
  let timeoutPressionarNome: ReturnType<typeof setTimeout> | undefined;
  let pressionarNomeX = 0;
  let pressionarNomeY = 0;
  let pressionouLongoNome = false;

  function aoPointerDownNome(e: PointerEvent, m: RefeicaoModelo) {
    pressionarNomeX = e.clientX;
    pressionarNomeY = e.clientY;
    pressionouLongoNome = false;
    window.addEventListener("pointermove", aoPointerMovePressionarNome);
    window.addEventListener("pointerup", aoPointerUpPressionarNome);
    timeoutPressionarNome = setTimeout(() => {
      pressionouLongoNome = true;
      cancelarPressionarNome();
      if (navigator.vibrate) navigator.vibrate(10);
      paraExcluir = m;
    }, ATRASO_PRESSIONAR_MS);
  }

  function aoContextMenuNome(e: MouseEvent, m: RefeicaoModelo) {
    e.preventDefault();
    cancelarPressionarNome();
    pressionouLongoNome = false;
    paraExcluir = m;
  }

  function cancelarPressionarNome() {
    clearTimeout(timeoutPressionarNome);
    timeoutPressionarNome = undefined;
    window.removeEventListener("pointermove", aoPointerMovePressionarNome);
    window.removeEventListener("pointerup", aoPointerUpPressionarNome);
  }

  function aoPointerMovePressionarNome(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressionarNomeX, e.clientY - pressionarNomeY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarPressionarNome();
    }
  }

  function aoPointerUpPressionarNome() {
    cancelarPressionarNome();
  }

  function aoClickNome(m: RefeicaoModelo) {
    if (pressionouLongoNome) {
      pressionouLongoNome = false;
      return;
    }
    abrirMeta(m);
  }

  /** Tempo segurando o handle parado antes do arrasto realmente começar — evita que um toque de rolagem vire reordenação sem querer. */
  const ATRASO_ARRASTAR_MS = 250;
  const TOLERANCIA_MOVIMENTO_PX = 8;
  let timeoutArrastar: ReturnType<typeof setTimeout> | undefined;
  let pointerDownX = 0;
  let pointerDownY = 0;

  function aoPointerDownHandle(e: PointerEvent, index: number, dia: number | null = null) {
    const el = dia == null ? itemRefs[index] : itemRefsDia[dia][index];
    if (!el) return;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    window.addEventListener("pointermove", aoPointerMoveEsperando);
    window.addEventListener("pointerup", aoPointerUpEsperando);
    timeoutArrastar = setTimeout(() => iniciarArrasto(el, index, dia), ATRASO_ARRASTAR_MS);
  }

  function cancelarEsperaArrastar() {
    clearTimeout(timeoutArrastar);
    timeoutArrastar = undefined;
    window.removeEventListener("pointermove", aoPointerMoveEsperando);
    window.removeEventListener("pointerup", aoPointerUpEsperando);
  }

  function aoPointerMoveEsperando(e: PointerEvent) {
    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > TOLERANCIA_MOVIMENTO_PX) {
      cancelarEsperaArrastar();
    }
  }

  function aoPointerUpEsperando() {
    cancelarEsperaArrastar();
  }

  function iniciarArrasto(el: HTMLLIElement, index: number, dia: number | null) {
    cancelarEsperaArrastar();
    alturaLinha = el.getBoundingClientRect().height;
    startY = pointerDownY;
    arrastandoIndex = index;
    arrastarOffsetY = 0;
    ordemMudou = false;
    if (dia != null) {
      const grupo = gruposDias.find((g) => g.dias.includes(dia));
      arrastandoGrupoDiasCompleto = grupo?.dias ?? [dia];
      arrastoListaDia = grupo ? grupo.modelos.slice() : [];
    }
    arrastandoDia = dia;
    if (navigator.vibrate) navigator.vibrate(10);
    window.addEventListener("pointermove", aoPointerMove);
    window.addEventListener("pointerup", aoPointerUp);
  }

  function aoPointerMove(e: PointerEvent) {
    if (arrastandoIndex === null || !alturaLinha) return;
    const delta = e.clientY - startY;
    arrastarOffsetY = delta;
    const passos = Math.round(delta / alturaLinha);
    if (passos !== 0) {
      const listaAtual = arrastandoDia == null ? modelos : arrastoListaDia;
      const novoIndex = Math.min(listaAtual.length - 1, Math.max(0, arrastandoIndex + passos));
      if (novoIndex !== arrastandoIndex) {
        const copia = listaAtual.slice();
        const [item] = copia.splice(arrastandoIndex, 1);
        copia.splice(novoIndex, 0, item);
        if (arrastandoDia == null) modelos = copia;
        else arrastoListaDia = copia;
        arrastandoIndex = novoIndex;
        startY = e.clientY;
        arrastarOffsetY = 0;
        ordemMudou = true;
      }
    }
  }

  /** Atualiza o estado local de modelosPorDia depois de gravar uma nova lista pra um grupo de dias, sem precisar recarregar tudo do banco. */
  function aplicarModelosPorDiaLocal(dias: number[], ids: string[]) {
    const novo = modelosPorDia.filter((r) => !dias.includes(r.diaSemana));
    for (const dia of dias) {
      ids.forEach((modeloId, i) => novo.push({ modeloId, diaSemana: dia, ordem: i }));
    }
    modelosPorDia = novo;
  }

  async function aoPointerUp() {
    window.removeEventListener("pointermove", aoPointerMove);
    window.removeEventListener("pointerup", aoPointerUp);
    const diaArrastado = arrastandoDia;
    const diasGrupoArrastado = arrastandoGrupoDiasCompleto;
    const listaFinal = arrastoListaDia;
    arrastandoDia = null;
    arrastandoIndex = null;
    arrastarOffsetY = 0;
    if (!ordemMudou) return;
    try {
      if (diaArrastado == null) {
        await reordenarRefeicoesModelo(modelos.map((m) => m.id));
      } else {
        const ids = listaFinal.map((m) => m.id);
        await Promise.all(diasGrupoArrastado.map((dia) => definirRefeicoesDoDia(dia, ids)));
        aplicarModelosPorDiaLocal(diasGrupoArrastado, ids);
      }
    } catch (err) {
      alert("Erro ao salvar a nova ordem: " + (err as Error).message);
      await carregar();
    }
  }

  async function removerDoGrupo(grupo: GrupoDias, m: RefeicaoModelo) {
    const ids = grupo.modelos.filter((x) => x.id !== m.id).map((x) => x.id);
    try {
      await Promise.all(grupo.dias.map((dia) => definirRefeicoesDoDia(dia, ids)));
      aplicarModelosPorDiaLocal(grupo.dias, ids);
    } catch (err) {
      alert("Erro ao remover refeição desse dia: " + (err as Error).message);
    }
  }

  let mostrarAdicionarRefeicaoGrupo = $state(false);
  let grupoParaAdicionar = $state<GrupoDias | null>(null);

  function abrirAdicionarRefeicao(grupo: GrupoDias) {
    grupoParaAdicionar = grupo;
    mostrarAdicionarRefeicaoGrupo = true;
  }

  const refeicoesDisponiveisParaGrupo = $derived(
    grupoParaAdicionar ? modelos.filter((m) => !grupoParaAdicionar!.modelos.some((x) => x.id === m.id)) : [],
  );

  async function adicionarAoGrupo(m: RefeicaoModelo) {
    if (!grupoParaAdicionar) return;
    const grupo = grupoParaAdicionar;
    const ids = [...grupo.modelos.map((x) => x.id), m.id];
    mostrarAdicionarRefeicaoGrupo = false;
    try {
      await Promise.all(grupo.dias.map((dia) => definirRefeicoesDoDia(dia, ids)));
      aplicarModelosPorDiaLocal(grupo.dias, ids);
    } catch (err) {
      alert("Erro ao adicionar refeição: " + (err as Error).message);
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}

{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconArrastar()}
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
{/snippet}

{#snippet barrasMacrosLinha(
  carboidratoG: number,
  gorduraG: number,
  proteinaG: number,
  carboidratoDiaG: number,
  gorduraDiaG: number,
  proteinaDiaG: number,
  pct: number,
  invisivel: boolean,
)}
  {@const pctCarboDia = carboidratoDiaG > 0 ? Math.round((carboidratoG / carboidratoDiaG) * 100) : 0}
  {@const pctGorduraDia = gorduraDiaG > 0 ? Math.round((gorduraG / gorduraDiaG) * 100) : 0}
  {@const pctProteinaDia = proteinaDiaG > 0 ? Math.round((proteinaG / proteinaDiaG) * 100) : 0}
  <span class="nome-macros" class:invisivel>
    <span class="mini-macro-col">
      <span class="mini-macro-nome">Carb</span>
      <span class="mini-macro-barra-wrap">
        <span class="mini-macro-barra" style={`width:${Math.min(100, pctCarboDia)}%; background:${COR_CARBO};`}></span>
      </span>
      <span class="mini-macro-valor">{carboidratoG.toFixed(0)} g · {pctCarboDia}%</span>
    </span>
    <span class="mini-macro-col">
      <span class="mini-macro-nome">Gorduras</span>
      <span class="mini-macro-barra-wrap">
        <span class="mini-macro-barra" style={`width:${Math.min(100, pctGorduraDia)}%; background:${COR_GORDURA};`}></span>
      </span>
      <span class="mini-macro-valor">{gorduraG.toFixed(0)} g · {pctGorduraDia}%</span>
    </span>
    <span class="mini-macro-col">
      <span class="mini-macro-nome">Proteínas</span>
      <span class="mini-macro-barra-wrap">
        <span class="mini-macro-barra" style={`width:${Math.min(100, pctProteinaDia)}%; background:${COR_PROTEINA};`}></span>
      </span>
      <span class="mini-macro-valor">{proteinaG.toFixed(0)} g · {pctProteinaDia}%</span>
    </span>
    <span class="nome-pct">{pct}%</span>
  </span>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/dieta")} aria-label="Voltar">{@render iconVoltar()}</button>
    <h1>Gerenciar</h1>
    {#if aba === "refeicoes"}
      <button class="criar" onclick={abrirNovo} aria-label="Nova refeição">{@render iconMais()}</button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </div>

  <div class="tabs">
    <button class:active={aba === "calorias"} onclick={() => irParaAba("calorias")}>Calorias</button>
    <button class:active={aba === "refeicoes"} onclick={() => irParaAba("refeicoes")}>Refeições</button>
  </div>

  {#if erroMetas}
    <p class="erro">Erro ao carregar metas: {erroMetas}</p>
  {:else if erro}
    <p class="erro">Erro ao carregar refeições: {erro}</p>
  {:else if !pronto}
    <p class="muted">Carregando…</p>
  {:else if aba === "calorias"}
      <p class="peso-ref">Com base no peso médio atual: <strong>{pesoAtual.toFixed(1)} kg</strong></p>

      <div class="resumo">
        <button
          type="button"
          class="donut"
          style={donutStyle}
          onclick={() => (campoEditando = "calorias")}
          aria-label="Ajustar calorias"
        >
          <div class="donut-centro">
            <strong>{caloriasCalc}</strong>
            <span>Cal</span>
          </div>
        </button>
        <div class="resumo-macros" class:opaco={modoCalorias === "ondulatoria"}>
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("g")}>
            <strong class="pct" style={`color:${COR_CARBO}`}>{pctCarboidrato.toFixed(0)}%</strong>
            <span class="valor-g">{carboidratoGInput ?? 0} g</span>
            <span class="rotulo-macro">Carb</span>
          </button>
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("g")}>
            <strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong>
            <span class="valor-g">{gorduraGInput ?? 0} g</span>
            <span class="rotulo-macro">Gorduras</span>
          </button>
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("g")}>
            <strong class="pct" style={`color:${COR_PROTEINA}`}>{pctProteina.toFixed(0)}%</strong>
            <span class="valor-g">{proteinaGInput ?? 0} g</span>
            <span class="rotulo-macro">Proteínas</span>
          </button>
        </div>
      </div>

      <div class="card-proporcao" class:opaco={modoCalorias === "ondulatoria"}>
        <p class="secao-titulo">Proporção por peso (g/kg)</p>
        <div class="tabela-macros">
          <div class="tabela-linha">
            <span class="tabela-rotulo">Proteína</span>
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("gkg")}>
              {proteinaGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Gordura</span>
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("gkg")}>
              {gorduraGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Carboidrato</span>
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => abrirMacros("gkg")}>
              {carboidratoGKg.toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      {#if campoEditando}
        {@const info = infoCampo(campoEditando)}
        <WheelPicker
          titulo={info.titulo}
          opcoes={info.opcoes}
          valorAtual={info.valorAtual}
          onSelecionar={info.onSelecionar}
          onFechar={() => (campoEditando = null)}
        />
      {/if}

      {#if mostrarMacros}
        <WheelPickerMacros
          titulo={tituloMacros()}
          colunas={colunasMacros()}
          onSelecionar={confirmarMacros}
          onFechar={() => (mostrarMacros = false)}
        />
      {/if}

      <p class="nutrientes-titulo">Metas de Consumo</p>
      <div class="nutrientes-lista">
        <div class="nutriente-item">
          <span>Fibras</span>
          <span>{formatarFaixa(fibrasMinG, fibrasMaxG, 0)} g</span>
        </div>
        <div class="nutriente-item">
          <span>Gordura Saturada</span>
          <span>{gorduraSaturadaMaxG} g</span>
        </div>
        <div class="nutriente-item">
          <span>Água</span>
          <span>{formatarFaixa(aguaMinL, aguaMaxL, 1)} L</span>
        </div>
      </div>

      <div class="separador"></div>

      <div class="distribuicao-header">
        <p class="secao-titulo distribuicao-titulo">Distribuição {modoCalorias === "fixa" ? "Fixa" : "Ondulatória"}</p>
        <button type="button" class="toggle-modo-btn" onclick={alternarModoToggle} aria-label="Alternar modo de distribuição">
          {@render iconToggle()}
        </button>
      </div>

      {#if modoCalorias === "ondulatoria"}
        <div class="dias-lista">
          {#each diasResolvidos as dia (dia.diaSemana)}
            {@const cor = corDoDia(dia)}
            {@const treino = treinoDoDia(dia.diaSemana)}
            {@const nomeBloco = nomeDoDia(dia.diaSemana)}
            <div class="dia-card-slot">
              <div class="dia-card-pill-wrap">
                <div
                  class="dia-card"
                  class:selecionado={diasSelecionados.has(dia.diaSemana)}
                  class:colorido={cor != null}
                  class:travado={nomeBloco != null}
                  style={cor ? `background:${cor}; border-color:${cor};` : ""}
                  role="button"
                  tabindex="0"
                  onclick={() => toggleDiaSelecionado(dia.diaSemana)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleDiaSelecionado(dia.diaSemana);
                  }}
                >
                  <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia.diaSemana]}</span>
                  {#if nomeBloco}
                    <span class="dia-card-cal dia-card-cal-nome">{nomeBloco}</span>
                  {:else}
                    <span class="dia-card-cal">{Math.round(dia.calorias)}</span>
                  {/if}
                </div>
                {#if dia.manual}
                  <button
                    type="button"
                    class="dia-card-x"
                    onclick={() => removerAjusteDia(dia.diaSemana)}
                    aria-label={`Remover ajuste de ${DIAS_SEMANA_ABREV[dia.diaSemana]}`}
                  >
                    ✕
                  </button>
                {/if}
              </div>
              {#if treino}
                <p class="dia-card-treino">{treino}</p>
              {/if}
            </div>
          {/each}
        </div>

        <div class="dias-acoes">
          <button type="button" class="acao-dia-btn" disabled={diasSelecionados.size === 0} onclick={abrirNomearBloco}>Definir bloco</button>
          <button type="button" class="acao-dia-btn" disabled={!todosOsDiasNomeados} onclick={abrirCaloriasBlocos}>Definir calorias</button>
        </div>
      {/if}

      <Button onclick={salvarCalorias} disabled={salvandoCalorias}>Salvar</Button>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    {#if !modelos.length}
      <p class="muted">Nenhuma refeição cadastrada ainda.</p>
    {:else if modoCalorias === "ondulatoria"}
      {#each gruposDias as grupo (grupo.dias[0])}
        {@const somaGrupo = somaMacrosInformados(grupo.dias[0])}
        {@const metaGrupo = metaMacrosDoGrupo(grupo)}
        {@const fibrasMaxGrupo = fibrasMaxDoGrupo(metaGrupo.calorias)}
        {@const gorduraSaturadaMaxGrupo = gorduraSaturadaMaxDoGrupo(metaGrupo.calorias)}
        {#if gruposDias.length > 1}
          <div class="secao-dias-header">
            <div class="dias-lista secao-dias-lista">
              {#each grupo.dias as dia (dia)}
                {@const treino = treinoDoDia(dia)}
                <div class="dia-card-slot">
                  <p class="dia-card-treino-topo">{treino ?? ""}</p>
                  <div class="dia-card" class:colorido={grupo.cor != null} style={grupo.cor ? `background:${grupo.cor}; border-color:${grupo.cor};` : ""}>
                    <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia]}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="card-calorias">
          <p class="card-titulo">Calorias</p>
          <div class="calorias-linha">
            <span class="calorias-valor"><strong>{somaGrupo.calorias.toFixed(0)}</strong> cal <span class="calorias-meta">/ {metaGrupo.calorias.toFixed(0)}</span></span>
            <span class="calorias-restantes"><strong>{restante(somaGrupo.calorias, metaGrupo.calorias).toFixed(0)}</strong> restantes</span>
          </div>
          <div class="barra-wrap-grande">
            <div class="barra-grande" style={`width:${larguraBarra(pctMeta(somaGrupo.calorias, metaGrupo.calorias))}%; background:var(--color-secondary);`}></div>
          </div>
        </div>

        <div class="card-macros">
          <button
            type="button"
            class="toggle-btn"
            onclick={() => (modoRestanteRefeicoes = !modoRestanteRefeicoes)}
            aria-label="Alternar exibição"
          >
            {@render iconToggle()}
          </button>
          <div class="macros-grid">
            <div class="macro-col">
              <p class="macro-nome">Carb</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.carboidratoG, metaGrupo.carboidratoG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.carboidratoG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGrupo.carboidratoG.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.carboidratoG, metaGrupo.carboidratoG))}%; background:${COR_CARBO};`}></div>
              </div>
            </div>
            <div class="macro-col">
              <p class="macro-nome">Gorduras</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.gorduraG, metaGrupo.gorduraG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.gorduraG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGrupo.gorduraG.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.gorduraG, metaGrupo.gorduraG))}%; background:${COR_GORDURA};`}></div>
              </div>
            </div>
            <div class="macro-col">
              <p class="macro-nome">Proteínas</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.proteinaG, metaGrupo.proteinaG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.proteinaG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGrupo.proteinaG.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.proteinaG, metaGrupo.proteinaG))}%; background:${COR_PROTEINA};`}></div>
              </div>
            </div>
            <div class="macro-col">
              <p class="macro-nome">G. satur</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.gorduraSaturadaG, gorduraSaturadaMaxGrupo).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.gorduraSaturadaG.toFixed(0)} g</strong> <span class="macro-meta">/ {gorduraSaturadaMaxGrupo.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.gorduraSaturadaG, gorduraSaturadaMaxGrupo))}%; background:${COR_GORDURA};`}></div>
              </div>
            </div>
            <div class="macro-col">
              <p class="macro-nome">Fibras</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.fibraG, fibrasMaxGrupo).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.fibraG.toFixed(0)} g</strong> <span class="macro-meta">/ {fibrasMaxGrupo.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.fibraG, fibrasMaxGrupo))}%; background:${COR_CARBO};`}></div>
              </div>
            </div>
          </div>
        </div>

        <ul class="lista lista-dia">
          {#each (arrastandoDia === grupo.dias[0] ? arrastoListaDia : grupo.modelos) as m, i (m.id)}
            {@const meta = metaEfetivaDoDia(m, grupo.dias[0])}
            <li
              class="linha"
              class:arrastando={arrastandoDia === grupo.dias[0] && arrastandoIndex === i}
              bind:this={itemRefsDia[grupo.dias[0]][i]}
              style={arrastandoDia === grupo.dias[0] && arrastandoIndex === i ? `transform: translateY(${arrastarOffsetY}px);` : ""}
            >
              <button class="handle" onpointerdown={(e) => aoPointerDownHandle(e, i, grupo.dias[0])} aria-label="Reordenar">
                {@render iconArrastar()}
              </button>
              <button class="nome-btn" onclick={() => abrirMeta(m, grupo.dias)}>
                <span class="nome-linha">
                  <span class="nome">{m.nome}</span>
                  {#if meta.calorias != null}<span class="nome-cal">{arredondarDezena(meta.calorias)} cal</span>{/if}
                </span>
                {@render barrasMacrosLinha(
                  meta.carboidratoG ?? 0,
                  meta.gorduraG ?? 0,
                  meta.proteinaG ?? 0,
                  metaGrupo.carboidratoG,
                  metaGrupo.gorduraG,
                  metaGrupo.proteinaG,
                  pctDeDia(arredondarDezena(meta.calorias ?? 0), grupo.calorias),
                  meta.calorias == null,
                )}
              </button>
              <button class="remover-btn" onclick={() => removerDoGrupo(grupo, m)} aria-label={`Remover ${m.nome} desse dia`}>✕</button>
            </li>
          {/each}
        </ul>
        {#if grupo.modelos.length < modelos.length}
          <button type="button" class="add-refeicao-btn" onclick={() => abrirAdicionarRefeicao(grupo)}>+ Adicionar refeição</button>
        {/if}
      {/each}
    {:else}
      {@const somaGlobal = somaMacrosGlobal()}
      {@const metaGlobal = { calorias: caloriasCalc, proteinaG: proteinaGInput ?? 0, gorduraG: gorduraGInput ?? 0, carboidratoG: carboidratoGInput ?? 0 }}

      <div class="card-calorias">
        <p class="card-titulo">Calorias</p>
        <div class="calorias-linha">
          <span class="calorias-valor"><strong>{somaGlobal.calorias.toFixed(0)}</strong> cal <span class="calorias-meta">/ {metaGlobal.calorias.toFixed(0)}</span></span>
          <span class="calorias-restantes"><strong>{restante(somaGlobal.calorias, metaGlobal.calorias).toFixed(0)}</strong> restantes</span>
        </div>
        <div class="barra-wrap-grande">
          <div class="barra-grande" style={`width:${larguraBarra(pctMeta(somaGlobal.calorias, metaGlobal.calorias))}%; background:var(--color-secondary);`}></div>
        </div>
      </div>

      <div class="card-macros">
        <button
          type="button"
          class="toggle-btn"
          onclick={() => (modoRestanteRefeicoes = !modoRestanteRefeicoes)}
          aria-label="Alternar exibição"
        >
          {@render iconToggle()}
        </button>
        <div class="macros-grid">
          <div class="macro-col">
            <p class="macro-nome">Carb</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.carboidratoG, metaGlobal.carboidratoG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.carboidratoG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGlobal.carboidratoG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.carboidratoG, metaGlobal.carboidratoG))}%; background:${COR_CARBO};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Gorduras</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.gorduraG, metaGlobal.gorduraG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.gorduraG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGlobal.gorduraG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.gorduraG, metaGlobal.gorduraG))}%; background:${COR_GORDURA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Proteínas</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.proteinaG, metaGlobal.proteinaG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.proteinaG.toFixed(0)} g</strong> <span class="macro-meta">/ {metaGlobal.proteinaG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.proteinaG, metaGlobal.proteinaG))}%; background:${COR_PROTEINA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">G. satur</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.gorduraSaturadaG, gorduraSaturadaMaxG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.gorduraSaturadaG.toFixed(0)} g</strong> <span class="macro-meta">/ {gorduraSaturadaMaxG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.gorduraSaturadaG, gorduraSaturadaMaxG))}%; background:${COR_GORDURA};`}></div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Fibras</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.fibraG, fibrasMaxG).toFixed(0)} g</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.fibraG.toFixed(0)} g</strong> <span class="macro-meta">/ {fibrasMaxG.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.fibraG, fibrasMaxG))}%; background:${COR_CARBO};`}></div>
            </div>
          </div>
        </div>
      </div>

      <ul class="lista">
        {#each modelos as m, i (m.id)}
          <li
            class="linha"
            class:arrastando={arrastandoDia === null && arrastandoIndex === i}
            bind:this={itemRefs[i]}
            style={arrastandoDia === null && arrastandoIndex === i ? `transform: translateY(${arrastarOffsetY}px);` : ""}
          >
            <button class="handle" onpointerdown={(e) => aoPointerDownHandle(e, i)} aria-label="Reordenar">
              {@render iconArrastar()}
            </button>
            <button
              class="nome-btn"
              onpointerdown={(e) => aoPointerDownNome(e, m)}
              onclick={() => aoClickNome(m)}
              oncontextmenu={(e) => aoContextMenuNome(e, m)}
            >
              <span class="nome-linha">
                <span class="nome">{m.nome}</span>
                {#if m.metaCalorias != null}<span class="nome-cal">{arredondarDezena(m.metaCalorias)} cal</span>{/if}
              </span>
              {@render barrasMacrosLinha(
                m.metaCarboidratoG ?? 0,
                m.metaGorduraG ?? 0,
                m.metaProteinaG ?? 0,
                metaGlobal.carboidratoG,
                metaGlobal.gorduraG,
                metaGlobal.proteinaG,
                pctDoDia(arredondarDezena(m.metaCalorias ?? 0)),
                m.metaCalorias == null,
              )}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    </div>
  {/if}
</div>

{#if mostrarForm}
  <Sheet titulo="Nova Refeição" onFechar={() => (mostrarForm = false)}>
    <input class="nome-input" type="text" placeholder="Nome da refeição" bind:value={nome} />
    <Button onclick={salvar} disabled={salvando || !nome.trim()}>Salvar</Button>
  </Sheet>
{/if}

{#if paraExcluir}
  <ConfirmDialog
    titulo={`Tem certeza de que quer excluir "${paraExcluir.nome}"?`}
    textoConfirmar="Excluir"
    onConfirmar={excluir}
    onCancelar={() => (paraExcluir = null)}
  />
{/if}

{#if mostrarNomearBloco}
  <Sheet titulo="Definir bloco" onFechar={() => (mostrarNomearBloco = false)}>
    <input class="nome-input" type="text" placeholder="Nome do bloco (ex: Treino A)" bind:value={nomeBlocoInput} />
    <Button onclick={salvarNomeBloco} disabled={!nomeBlocoInput.trim()}>Salvar</Button>
  </Sheet>
{/if}

{#if mostrarCaloriasBlocos}
  <Sheet titulo="Calorias" onFechar={() => (mostrarCaloriasBlocos = false)}>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-rotulo"></th>
            {#each blocosEdicao as bloco (bloco.nome)}
              <th class="grade-bloco-nome">{bloco.nome}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="grade-col-rotulo">Calorias (kcal)</td>
            {#each blocosEdicao as bloco, idx (bloco.nome)}
              <td class="grade-valor">
                <button type="button" class="grade-valor-btn" onclick={() => (blocoCaloriasEditando = idx)}>{Math.round(bloco.calorias)}</button>
              </td>
            {/each}
          </tr>
          <tr>
            <td class="grade-col-rotulo">Proteína (g)</td>
            {#each blocosEdicao as bloco, idx (bloco.nome)}
              <td class="grade-valor">
                <button type="button" class="grade-valor-btn" onclick={() => abrirMacrosBloco(idx)}>{proteinaGInput ?? 0}</button>
              </td>
            {/each}
          </tr>
          <tr>
            <td class="grade-col-rotulo">Gordura (g)</td>
            {#each blocosEdicao as bloco, idx (bloco.nome)}
              <td class="grade-valor">
                <button type="button" class="grade-valor-btn" onclick={() => abrirMacrosBloco(idx)}>{Math.round(bloco.gorduraG)}</button>
              </td>
            {/each}
          </tr>
          <tr>
            <td class="grade-col-rotulo">Carboidrato (g)</td>
            {#each blocosEdicao as bloco, idx (bloco.nome)}
              <td class="grade-valor">
                <button type="button" class="grade-valor-btn" onclick={() => abrirMacrosBloco(idx)}>{Math.round(bloco.carboidratoG)}</button>
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
    <Button onclick={confirmarCaloriasBlocos}>Salvar</Button>
  </Sheet>
{/if}

{#if blocoCaloriasEditando !== null}
  {@const infoCel = infoCelulaCalorias(blocoCaloriasEditando)}
  <WheelPicker
    titulo={infoCel.titulo}
    opcoes={infoCel.opcoes}
    valorAtual={infoCel.valorAtual}
    onSelecionar={infoCel.onSelecionar}
    onFechar={() => (blocoCaloriasEditando = null)}
  />
{/if}

{#if blocoMacrosEditando !== null}
  <WheelPickerMacros
    titulo={tituloMacros()}
    colunas={colunasBloco(blocoMacrosEditando)}
    onSelecionar={(valores) => confirmarMacrosBloco(blocoMacrosEditando!, valores)}
    onFechar={() => (blocoMacrosEditando = null)}
  />
{/if}

{#if mostrarAdicionarRefeicaoGrupo}
  <ActionSheet
    titulo="Adicionar refeição"
    onFechar={() => (mostrarAdicionarRefeicaoGrupo = false)}
    opcoes={refeicoesDisponiveisParaGrupo.map((m) => ({
      label: m.nome,
      onSelect: () => adicionarAoGrupo(m),
    }))}
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
    margin-bottom: var(--space-3);
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
  .header-spacer {
    width: 36px;
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
  .peso-ref {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-3);
  }
  .peso-ref strong {
    color: var(--surface-fg);
  }
  .resumo {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0;
  }
  .donut:disabled,
  .macro-col:disabled,
  .tabela-input:disabled {
    cursor: default;
  }
  .donut {
    position: relative;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    flex-shrink: 0;
    border: none;
    padding: 0;
    color: var(--surface-fg);
    font-family: inherit;
    cursor: pointer;
  }
  .donut-centro {
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: 18px;
  }
  .donut-centro span {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .resumo-macros.opaco,
  .card-proporcao.opaco {
    opacity: 0.4;
  }
  .macro-col {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    text-align: center;
    line-height: 1.5;
    cursor: pointer;
  }
  .macro-col .pct {
    font-size: var(--font-size-base);
  }
  .macro-col .valor-g {
    font-size: 17px;
  }
  .macro-col .rotulo-macro {
    color: var(--surface-muted);
  }
  .secao-titulo {
    font-weight: 600;
    font-size: var(--font-size-base);
    margin: var(--space-2) 0 var(--space-1);
  }
  .card-proporcao {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .card-proporcao .secao-titulo {
    margin-top: 0;
  }
  .tabela-macros {
    margin-bottom: 0;
  }
  .tabela-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .tabela-linha:last-child {
    border-bottom: none;
  }
  .tabela-rotulo {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .tabela-input {
    flex: 0 0 64px;
    box-sizing: border-box;
    text-align: right;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-family: inherit;
    padding: 0;
    cursor: pointer;
  }
  .tabela-input:focus {
    outline: none;
  }
  .separador {
    border-top: 1px solid var(--surface-border);
    margin: 0 0 var(--space-4);
  }
  .nutrientes-titulo {
    font-weight: 600;
    font-size: var(--font-size-base);
    margin: var(--space-2) 0 var(--space-3);
  }
  .nutrientes-lista {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-1);
  }
  .nutriente-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    font-size: var(--font-size-sm);
  }
  .nutriente-item:last-child {
    border-bottom: none;
  }
  .nutriente-item span:first-child {
    color: var(--surface-muted);
  }
  .lista {
    list-style: none;
    margin: 0 0 var(--space-6);
    padding: 0 var(--space-3);
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .add-refeicao-btn {
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .linha {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    border-bottom: 1px solid var(--surface-border);
    position: relative;
  }
  .linha:last-child {
    border-bottom: none;
  }
  .linha.arrastando {
    z-index: 10;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    border-bottom-color: transparent;
    margin: 0 calc(var(--space-3) * -1);
    padding: 0 var(--space-3);
  }
  .handle {
    flex-shrink: 0;
    width: 32px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-muted);
    cursor: grab;
    touch-action: none;
  }
  .handle svg {
    width: 18px;
    height: 18px;
  }
  .nome-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    text-align: left;
    border: none;
    background: none;
    padding: var(--space-3) 0;
    cursor: pointer;
    font-family: inherit;
  }
  .nome-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .nome {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .nome-cal {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--surface-muted);
  }
  .nome-macros {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .nome-macros.invisivel {
    visibility: hidden;
  }
  .nome-pct {
    flex-shrink: 0;
    align-self: flex-end;
  }
  .mini-macro-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mini-macro-nome {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-macro-barra-wrap {
    display: block;
    height: 4px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--surface-border);
  }
  .mini-macro-barra {
    display: block;
    height: 100%;
  }
  .mini-macro-valor {
    font-size: 10px;
    color: var(--surface-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .remover-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-2);
  }
  .conteudo {
    transition: opacity 0.15s;
  }
  .conteudo.carregando {
    opacity: 0.5;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .nome-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .grade-scroll {
    overflow-x: auto;
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .grade-tabela {
    border-collapse: collapse;
    width: 100%;
  }
  .grade-tabela th,
  .grade-tabela td {
    padding: var(--space-2);
    text-align: center;
    white-space: nowrap;
  }
  .grade-tabela th:not(:first-child),
  .grade-tabela td:not(:first-child) {
    border-left: 1px solid var(--surface-border);
  }
  .grade-tabela tbody tr:not(:last-child) td {
    border-bottom: 1px solid var(--surface-border);
  }
  .grade-tabela .grade-col-rotulo {
    text-align: left;
  }
  .grade-col-rotulo {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    position: sticky;
    left: 0;
    background: var(--surface-card);
    padding-left: 0;
    padding-right: var(--space-3);
  }
  .grade-bloco-nome {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-primary);
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-valor-btn {
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-fg);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
  }
  .distribuicao-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }
  .distribuicao-titulo {
    margin: 0;
  }
  .toggle-modo-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-primary);
    padding: var(--space-1);
    cursor: pointer;
  }
  .toggle-modo-btn svg {
    width: 20px;
    height: 20px;
  }
  .card-calorias,
  .card-macros {
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
  .calorias-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .calorias-valor {
    font-size: var(--font-size-lg);
  }
  .calorias-valor strong {
    font-size: 22px;
  }
  .calorias-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .calorias-restantes {
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
  .macros-grid {
    display: flex;
    gap: var(--space-3);
    width: calc(100% - 48px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .macros-grid::-webkit-scrollbar {
    display: none;
  }
  .macros-grid .macro-col {
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .macro-nome {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    white-space: nowrap;
  }
  .macro-valor {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-fg);
  }
  .macro-meta {
    color: var(--surface-muted);
  }
  .barra-wrap {
    height: 8px;
    background: var(--surface-border);
    border-radius: 5px;
    overflow: hidden;
  }
  .barra {
    height: 100%;
    border-radius: 5px;
  }
  .dias-lista {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-top: var(--space-3);
    padding-bottom: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .dia-card {
    flex: 0 0 68px;
    width: 68px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--space-3) var(--space-2);
    border-radius: var(--radius-md);
    border: 2px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-family: inherit;
    cursor: pointer;
  }
  .dia-card.colorido {
    color: var(--color-primary-fg);
  }
  .dia-card.travado {
    cursor: default;
  }
  .dia-card.selecionado {
    box-shadow: 0 0 0 2px #ffffff;
  }
  .dia-card-slot {
    flex: 0 0 auto;
  }
  .dia-card-treino {
    margin: 0 0 4px;
    max-width: 72px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    font-size: 10px;
    color: var(--surface-muted);
  }
  .dia-card-treino-topo {
    margin: 0 0 4px;
    min-height: 12px;
    max-width: 72px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    font-size: 10px;
    color: var(--surface-muted);
  }
  .dia-card-pill-wrap {
    position: relative;
  }
  .dia-card-x {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--color-danger);
    color: #fff;
    font-size: 11px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
  }
  .dia-card-nome {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
  .dia-card-cal {
    font-size: 12px;
    opacity: 0.8;
  }
  .dia-card-cal-nome {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
  }
  .secao-dias-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin: var(--space-5) 0 var(--space-4);
  }
  .secao-dias-lista {
    overflow-x: visible;
    flex-wrap: wrap;
    padding-top: 0;
    padding-bottom: 0;
    margin: 0;
  }
  .secao-dias-lista .dia-card {
    cursor: default;
  }
  .dias-acoes {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .acao-dia-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 2px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .acao-dia-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

</style>
