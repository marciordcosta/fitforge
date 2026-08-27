<script lang="ts">
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

  let aba = $state<"calorias" | "refeicoes">("calorias");

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
  let mostrarDefinirCalorias = $state(false);

  let grupoProteinaG = $state(0);
  let grupoGorduraG = $state(0);
  let grupoCarboidratoG = $state(0);
  const caloriasGrupoCalc = $derived(Math.round(4 * grupoProteinaG + 9 * grupoGorduraG + 4 * grupoCarboidratoG));

  function gKgGrupo(gramas: number): string {
    return pesoAtual > 0 ? (gramas / pesoAtual).toFixed(2) : "0.00";
  }
  let campoEditandoGrupo = $state<"calorias" | null>(null);
  let mostrarMacrosGrupo = $state(false);

  /** Calorias só de proteína+gordura — piso do total ao editar calorias manualmente (carboidrato não pode ficar negativo). */
  const caloriasGrupoMin = $derived(Math.round(4 * grupoProteinaG + 9 * grupoGorduraG));

  function opcoesCaloriasGrupo(): { valor: number; label: string }[] {
    const min = caloriasGrupoMin;
    const max = Math.max(min + 10, 6000);
    const opcoes: { valor: number; label: string }[] = [];
    for (let v = min; v <= max; v += 10) opcoes.push({ valor: v, label: `${v} kcal` });
    return opcoes;
  }

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

  /** Cor fixa por valor de calorias manual distinto — grupos diferentes de dias saem com cores diferentes. */
  const corPorGrupoManual = $derived.by(() => {
    const valores = [...new Set(diasResolvidos.filter((d) => d.manual).map((d) => Math.round(d.calorias)))].sort((a, b) => a - b);
    return new Map(valores.map((v, i) => [v, CORES_GRUPOS_DIA[i % CORES_GRUPOS_DIA.length]]));
  });

  function corDoDia(dia: CaloriasPorDia): string | null {
    if (dia.manual) return corPorGrupoManual.get(Math.round(dia.calorias)) ?? null;
    if (diasSelecionados.has(dia.diaSemana)) {
      return CORES_GRUPOS_DIA[corPorGrupoManual.size % CORES_GRUPOS_DIA.length];
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

  /** Dias com a mesma meta de calorias E as mesmas refeições (na mesma ordem) viram um único bloco — dias diferentes em qualquer um dos dois saem em blocos separados. Ordem preservada pela primeira ocorrência (Dom..Sáb). */
  const gruposDias = $derived.by((): GrupoDias[] => {
    const grupos = new Map<string, GrupoDias>();
    for (const d of diasResolvidos) {
      const chaveCal = Math.round(d.calorias);
      const listaDia = modelosDoDia(d.diaSemana);
      const chave = `${chaveCal}|${listaDia.map((m) => m.id).join(",")}`;
      let g = grupos.get(chave);
      if (!g) {
        g = {
          dias: [],
          calorias: d.calorias,
          manual: d.manual,
          cor: d.manual ? (corPorGrupoManual.get(chaveCal) ?? null) : null,
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

  /**
   * Um dia já configurado (manual) nunca entra numa seleção nova pra definir outra meta — o "x"
   * no card é o único jeito de desvincular. Tocar o card em si: se não há nenhuma seleção em
   * andamento, seleciona todo o grupo de dias com essa mesma meta (não só o dia tocado) e abre
   * direto a edição; se já tem outros dias sendo selecionados pra uma meta nova, o toque é
   * ignorado (não mistura um dia já configurado numa seleção nova).
   */
  function toggleDiaSelecionado(dia: number) {
    const info = diasResolvidos.find((d) => d.diaSemana === dia);
    if (!info) return;

    if (info.manual) {
      if (diasSelecionados.size === 0) {
        const chave = Math.round(info.calorias);
        const grupo = diasResolvidos.filter((d) => d.manual && Math.round(d.calorias) === chave).map((d) => d.diaSemana);
        diasSelecionados = new Set(grupo);
        abrirDefinirCalorias();
      }
      return;
    }

    const novo = new Set(diasSelecionados);
    if (novo.has(dia)) novo.delete(dia);
    else novo.add(dia);
    diasSelecionados = novo;
  }

  /** Dias automáticos (sem configuração própria) que ainda não estão na seleção em andamento — candidatos pro "+" no modal. */
  const diasDisponiveisParaAdicionar = $derived(
    diasResolvidos.filter((d) => !d.manual && !diasSelecionados.has(d.diaSemana)),
  );
  let mostrarAdicionarDiaGrupo = $state(false);

  function adicionarDiaAoGrupo(dia: number) {
    diasSelecionados = new Set([...diasSelecionados, dia]);
  }

  function abrirDefinirCalorias() {
    const dias = [...diasSelecionados];
    const existente = dias.length ? manuaisCompletos.get(dias[0]) : undefined;
    grupoProteinaG = existente?.proteinaG ?? proteinaGInput ?? 0;
    grupoGorduraG = existente?.gorduraG ?? gorduraGInput ?? 0;
    grupoCarboidratoG = existente?.carboidratoG ?? carboidratoGInput ?? 0;
    mostrarDefinirCalorias = true;
  }

  function infoCampoGrupo(campo: "calorias") {
    return {
      titulo: "Calorias (kcal)",
      opcoes: opcoesCaloriasGrupo(),
      valorAtual: caloriasGrupoCalc,
      onSelecionar: (v: number) => {
        grupoCarboidratoG = Math.max(0, Math.round((v - 4 * grupoProteinaG - 9 * grupoGorduraG) / 4));
      },
    };
  }

  function colunasMacrosGrupo() {
    return [
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesMacro(parametro("carboidrato").min, parametro("carboidrato").max), valorAtual: grupoCarboidratoG, kcalPorGrama: 4 },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesMacro(parametro("gordura").min, parametro("gordura").max), valorAtual: grupoGorduraG, kcalPorGrama: 9 },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesMacro(parametro("proteina").min, parametro("proteina").max), valorAtual: grupoProteinaG, kcalPorGrama: 4 },
    ];
  }

  function confirmarMacrosGrupo(valores: Record<string, number>) {
    grupoCarboidratoG = valores.carboidratoG;
    grupoGorduraG = valores.gorduraG;
    grupoProteinaG = valores.proteinaG;
  }

  /** Só aplica localmente (valida a distribuição antes) — persiste no banco junto com o resto ao tocar em "Salvar" no fim da tela. */
  function confirmarCaloriasGrupo() {
    if (caloriasGrupoCalc <= 0) return;
    const manuaisTeste = new Map(manuaisDias);
    for (const dia of diasSelecionados) manuaisTeste.set(dia, caloriasGrupoCalc);
    try {
      resolverDistribuicao(caloriasCalc, manuaisTeste, minimoCalorias);
    } catch (err) {
      alert((err as Error).message);
      return;
    }
    const novoManual = new Map(manuaisCompletos);
    for (const dia of diasSelecionados) {
      novoManual.set(dia, {
        calorias: caloriasGrupoCalc,
        proteinaG: grupoProteinaG,
        gorduraG: grupoGorduraG,
        carboidratoG: grupoCarboidratoG,
      });
    }
    manuaisCompletos = novoManual;
    diasSelecionados = new Set();
    mostrarDefinirCalorias = false;
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

  function abrirMacrosGrupo(unidade: "g" | "gkg") {
    unidadeMacros = unidade;
    mostrarMacrosGrupo = true;
  }

  function opcoesMacro(minGKg: number, maxGKg: number): { valor: number; label: string }[] {
    return unidadeMacros === "gkg" ? opcoesGKgComoGramas(minGKg, maxGKg) : opcoesGramas(minGKg, maxGKg);
  }

  function colunasMacros() {
    return [
      { chave: "carboidratoG", titulo: "Carboidrato", cor: COR_CARBO, opcoes: opcoesMacro(parametro("carboidrato").min, parametro("carboidrato").max), valorAtual: carboidratoGInput ?? 0, kcalPorGrama: 4 },
      { chave: "gorduraG", titulo: "Gordura", cor: COR_GORDURA, opcoes: opcoesMacro(parametro("gordura").min, parametro("gordura").max), valorAtual: gorduraGInput ?? 0, kcalPorGrama: 9 },
      { chave: "proteinaG", titulo: "Proteína", cor: COR_PROTEINA, opcoes: opcoesMacro(parametro("proteina").min, parametro("proteina").max), valorAtual: proteinaGInput ?? 0, kcalPorGrama: 4 },
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

  function infoCampo(campo: "calorias") {
    return {
      titulo: "Calorias (kcal)",
      opcoes: opcoesCalorias(),
      valorAtual: Math.round((caloriasInput ?? caloriasCalc) / 10) * 10,
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
        [...manuaisCompletos].map(([dia, v]) =>
          definirCaloriasDias([dia], v.proteinaG, v.gorduraG, v.carboidratoG, caloriasCalc, minimoCalorias, manuaisDias),
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
      };
    }
    return { receitaId: m.metaReceitaId, calorias: m.metaCalorias, proteinaG: m.metaProteinaG, gorduraG: m.metaGorduraG, carboidratoG: m.metaCarboidratoG };
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
        };
      },
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
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
      }),
      { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
    );
  }

  /**
   * Meta de macros do dia pra esse grupo: se é manual, usa a composição salva (proteína/gordura/
   * carboidrato explícitos daquele ajuste); se é automático, usa os padrões globais de proteína/
   * gordura com o carboidrato calculado pra fechar a meta de calorias desse dia.
   */
  function metaMacrosDoGrupo(grupo: GrupoDias) {
    if (grupo.manual) {
      const dados = manuaisCompletos.get(grupo.dias[0]);
      if (dados) return dados;
    }
    const proteinaG = proteinaGInput ?? 0;
    const gorduraG = gorduraGInput ?? 0;
    return { calorias: grupo.calorias, proteinaG, gorduraG, carboidratoG: carboidratoGDoDia(grupo.calorias, proteinaG, gorduraG) };
  }

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
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
    }
  }

  void carregar();

  let treinos = $state<Treino[]>([]);

  async function carregarTreinos() {
    try {
      treinos = await listTreinos();
    } catch {
      // informativo — só usado pra mostrar o nome do treino em cima dos cards de dia
    }
  }

  void carregarTreinos();

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

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => voltar("/dieta")} aria-label="Voltar">←</button>
    <h1>Gerenciar</h1>
    {#if aba === "refeicoes"}
      <button class="criar" onclick={abrirNovo} aria-label="Nova refeição">+</button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </div>

  <div class="tabs">
    <button class:active={aba === "calorias"} onclick={() => (aba = "calorias")}>Calorias</button>
    <button class:active={aba === "refeicoes"} onclick={() => (aba = "refeicoes")}>Refeições</button>
  </div>

  {#if aba === "calorias"}
    {#if erroMetas}
      <p class="erro">Erro ao carregar metas: {erroMetas}</p>
    {:else if !perfilCarregado}
      <p class="muted">Carregando…</p>
    {:else}
      <p class="peso-ref">Com base no peso médio atual: <strong>{pesoAtual.toFixed(1)} kg</strong></p>

      <div class="resumo">
        <button
          type="button"
          class="donut"
          style={donutStyle}
          disabled={modoCalorias === "ondulatoria"}
          onclick={() => (campoEditando = "calorias")}
          aria-label="Ajustar calorias"
        >
          <div class="donut-centro">
            <strong>{caloriasCalc}</strong>
            <span>Cal</span>
          </div>
        </button>
        <div class="resumo-macros">
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

      <div class="card-proporcao">
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
            <div class="dia-card-slot">
              <div class="dia-card-pill-wrap">
                <div
                  class="dia-card"
                  class:selecionado={diasSelecionados.has(dia.diaSemana)}
                  class:colorido={cor != null}
                  style={cor ? `background:${cor}; border-color:${cor};` : ""}
                  role="button"
                  tabindex="0"
                  onclick={() => toggleDiaSelecionado(dia.diaSemana)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleDiaSelecionado(dia.diaSemana);
                  }}
                >
                  <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia.diaSemana]}</span>
                  <span class="dia-card-cal">{Math.round(dia.calorias)}</span>
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

        {#if diasSelecionados.size > 0}
          <div class="dias-acoes">
            <button type="button" class="acao-dia-btn" onclick={abrirDefinirCalorias}>Definir calorias</button>
            <button type="button" class="acao-dia-btn" onclick={() => (diasSelecionados = new Set())}>Limpar seleção</button>
          </div>
        {/if}
      {/if}

      <p class="dica">
        Ajustar proteína ou gordura (g/kg ou gramas) recalcula as calorias. Ajustar as calorias reajusta o carboidrato pra fechar a conta. Fibras e gordura saturada são calculadas com base nas calorias do dia; água, com base no peso.
      </p>

      <Button onclick={salvarCalorias} disabled={salvandoCalorias}>Salvar</Button>
    {/if}
  {:else}
    {#if loading}
      <p class="muted">Carregando…</p>
    {:else if erro}
      <p class="erro">Erro ao carregar refeições: {erro}</p>
    {:else if !modelos.length}
      <p class="muted">Nenhuma refeição cadastrada ainda.</p>
    {:else if modoCalorias === "ondulatoria"}
      {#each gruposDias as grupo (grupo.dias[0])}
        {@const somaGrupo = somaMacrosInformados(grupo.dias[0])}
        {@const metaGrupo = metaMacrosDoGrupo(grupo)}
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
          <button
            type="button"
            class="toggle-btn"
            onclick={() => (modoRestanteRefeicoes = !modoRestanteRefeicoes)}
            aria-label="Alternar exibição"
          >
            {@render iconToggle()}
          </button>
        </div>

        <div class="card-macros">
          <div class="macros-grid macros-grid-4">
            <div class="macro-col">
              <p class="macro-nome">Calorias</p>
              <p class="macro-valor">
                {#if modoRestanteRefeicoes}
                  <strong>{restante(somaGrupo.calorias, metaGrupo.calorias).toFixed(0)}</strong> <span class="macro-meta">restantes</span>
                {:else}
                  <strong>{somaGrupo.calorias.toFixed(0)}</strong> <span class="macro-meta">/ {metaGrupo.calorias.toFixed(0)}</span>
                {/if}
              </p>
              <div class="barra-wrap">
                <div class="barra" style={`width:${larguraBarra(pctMeta(somaGrupo.calorias, metaGrupo.calorias))}%; background:var(--color-secondary);`}></div>
              </div>
            </div>
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
                  {#if meta.calorias != null}<span class="nome-cal">{Math.round(meta.calorias)} cal</span>{/if}
                </span>
                <span class="nome-macros" class:invisivel={meta.calorias == null}>
                  <span>carb {(meta.carboidratoG ?? 0).toFixed(0)}g · gord {(meta.gorduraG ?? 0).toFixed(0)}g · prot {(meta.proteinaG ?? 0).toFixed(0)}g</span>
                  <span class="nome-pct">{pctDeDia(meta.calorias ?? 0, grupo.calorias)}%</span>
                </span>
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
      <div class="secao-dias-header">
        <span></span>
        <button
          type="button"
          class="toggle-btn"
          onclick={() => (modoRestanteRefeicoes = !modoRestanteRefeicoes)}
          aria-label="Alternar exibição"
        >
          {@render iconToggle()}
        </button>
      </div>

      <div class="card-macros">
        <div class="macros-grid macros-grid-4">
          <div class="macro-col">
            <p class="macro-nome">Calorias</p>
            <p class="macro-valor">
              {#if modoRestanteRefeicoes}
                <strong>{restante(somaGlobal.calorias, metaGlobal.calorias).toFixed(0)}</strong> <span class="macro-meta">restantes</span>
              {:else}
                <strong>{somaGlobal.calorias.toFixed(0)}</strong> <span class="macro-meta">/ {metaGlobal.calorias.toFixed(0)}</span>
              {/if}
            </p>
            <div class="barra-wrap">
              <div class="barra" style={`width:${larguraBarra(pctMeta(somaGlobal.calorias, metaGlobal.calorias))}%; background:var(--color-secondary);`}></div>
            </div>
          </div>
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
            <button class="nome-btn" onclick={() => abrirMeta(m)}>
              <span class="nome-linha">
                <span class="nome">{m.nome}</span>
                {#if m.metaCalorias != null}<span class="nome-cal">{Math.round(m.metaCalorias)} cal</span>{/if}
              </span>
              <span class="nome-macros" class:invisivel={m.metaCalorias == null}>
                <span>carb {(m.metaCarboidratoG ?? 0).toFixed(0)}g · gord {(m.metaGorduraG ?? 0).toFixed(0)}g · prot {(m.metaProteinaG ?? 0).toFixed(0)}g</span>
                <span class="nome-pct">{pctDoDia(m.metaCalorias ?? 0)}%</span>
              </span>
            </button>
            <button class="remover-btn" onclick={() => (paraExcluir = m)} aria-label={`Remover ${m.nome}`}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}
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

{#if mostrarDefinirCalorias}
  <Sheet
    titulo="Calorias"
    onFechar={() => {
      mostrarDefinirCalorias = false;
      diasSelecionados = new Set();
    }}
  >
    <div class="dias-lista modal-dias-lista">
      {#each [...diasSelecionados].sort((a, b) => a - b) as dia (dia)}
        <div class="dia-card">
          <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia]}</span>
        </div>
      {/each}
      {#if diasDisponiveisParaAdicionar.length > 0}
        <button
          type="button"
          class="dia-card dia-card-add"
          onclick={() => (mostrarAdicionarDiaGrupo = true)}
          aria-label="Adicionar dia a essa configuração"
        >
          +
        </button>
      {/if}
    </div>
    <div class="tabela-macros calorias-grupo-tabela">
      <div class="tabela-linha">
        <span class="tabela-rotulo">Calorias (kcal)</span>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "calorias")}>{caloriasGrupoCalc}</button>
      </div>
      <div class="tabela-linha tabela-linha-3col">
        <span class="tabela-rotulo">Proteína</span>
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => abrirMacrosGrupo("gkg")}>{gKgGrupo(grupoProteinaG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => abrirMacrosGrupo("g")}>{grupoProteinaG} g</button>
      </div>
      <div class="tabela-linha tabela-linha-3col">
        <span class="tabela-rotulo">Gordura</span>
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => abrirMacrosGrupo("gkg")}>{gKgGrupo(grupoGorduraG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => abrirMacrosGrupo("g")}>{grupoGorduraG} g</button>
      </div>
      <div class="tabela-linha tabela-linha-3col">
        <span class="tabela-rotulo">Carboidrato</span>
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => abrirMacrosGrupo("gkg")}>{gKgGrupo(grupoCarboidratoG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => abrirMacrosGrupo("g")}>{grupoCarboidratoG} g</button>
      </div>
    </div>
    <p class="dica">Toque em "Aplicar" pra ver o resultado; a mudança só grava de verdade quando você tocar em "Salvar" no fim da tela.</p>
    <Button onclick={confirmarCaloriasGrupo} disabled={caloriasGrupoCalc <= 0}>
      Aplicar
    </Button>
  </Sheet>
{/if}

{#if mostrarMacrosGrupo}
  <WheelPickerMacros
    titulo={tituloMacros()}
    colunas={colunasMacrosGrupo()}
    onSelecionar={confirmarMacrosGrupo}
    onFechar={() => (mostrarMacrosGrupo = false)}
  />
{/if}

{#if mostrarAdicionarDiaGrupo}
  <ActionSheet
    titulo="Adicionar dia"
    onFechar={() => (mostrarAdicionarDiaGrupo = false)}
    opcoes={diasDisponiveisParaAdicionar.map((d) => ({
      label: DIAS_SEMANA_ABREV[d.diaSemana],
      onSelect: () => adicionarDiaAoGrupo(d.diaSemana),
    }))}
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

{#if campoEditandoGrupo}
  {@const infoGrupo = infoCampoGrupo(campoEditandoGrupo)}
  <WheelPicker
    titulo={infoGrupo.titulo}
    opcoes={infoGrupo.opcoes}
    valorAtual={infoGrupo.valorAtual}
    onSelecionar={infoGrupo.onSelecionar}
    onFechar={() => (campoEditandoGrupo = null)}
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
  .back,
  .criar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .header-spacer {
    width: 24px;
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
    width: 100px;
    height: 100px;
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
    inset: 12px;
    border-radius: 50%;
    background: var(--surface-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-centro strong {
    font-size: var(--font-size-lg);
  }
  .donut-centro span {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .resumo-macros {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
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
  .tabela-linha-3col {
    display: grid;
    grid-template-columns: 1fr 88px 64px;
    align-items: center;
    gap: var(--space-2);
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
  .tabela-input-gkg {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    font-weight: 400;
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
  .dica {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-4);
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
    align-items: baseline;
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
  .calorias-grupo-tabela {
    margin-bottom: var(--space-3);
  }
  .modal-dias-lista {
    padding-top: 0;
    padding-bottom: 0;
    margin-bottom: var(--space-2);
    overflow-x: visible;
    flex-wrap: wrap;
  }
  .modal-dias-lista .dia-card {
    min-width: 48px;
    padding: var(--space-2);
    gap: 0;
  }
  .modal-dias-lista .dia-card-add {
    padding: var(--space-2);
  }
  .dia-card-add {
    background: #ffffff;
    border-color: #ffffff;
    color: #05221c;
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
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
  .card-macros {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .toggle-btn {
    flex-shrink: 0;
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
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }
  .macros-grid-4 {
    grid-template-columns: repeat(4, 1fr);
  }
  .macro-nome {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
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
    flex: 0 0 auto;
    min-width: 60px;
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
  .secao-dias-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin: var(--space-5) 0 var(--space-2);
  }
  .secao-dias-lista {
    overflow-x: visible;
    flex-wrap: wrap;
    padding-top: 0;
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

</style>
