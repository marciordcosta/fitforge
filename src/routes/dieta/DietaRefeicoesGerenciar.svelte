<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import {
    listRefeicoesModelo,
    criarRefeicaoModelo,
    excluirRefeicaoModelo,
    reordenarRefeicoesModelo,
    getPerfilDietaEditavel,
    salvarPerfilDieta,
    LIMITES_MACROS_G_KG,
    RATIOS_NUTRIENTES_AUTOMATICOS,
    CALORIA_MINIMA_KCAL_KG,
    getModoCalorias,
    getCaloriasDiaManuais,
    resolverDistribuicao,
    definirModoCalorias,
    definirCaloriasDias,
    removerCaloriasDia,
    listMetasDiaModelo,
    type RefeicaoModelo,
    type CaloriasPorDia,
    type CaloriasDiaManual,
    type MetaDiaModelo,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";
  import { DIAS_SEMANA_ABREV } from "../../lib/treinoApi";
  import { navigate } from "../../lib/router.svelte";

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
  let caloriasInput = $state<number | null>(null);
  let proteinaGKg = $state(2.17);
  let proteinaGInput = $state<number | null>(null);
  let gorduraGKg = $state(0.66);
  let gorduraGInput = $state<number | null>(null);
  let carboidratoGKg = $state(2.93);
  let carboidratoGInput = $state<number | null>(null);

  let modoCalorias = $state<"fixa" | "ondulatoria">("fixa");
  let manuaisCompletos = $state<Map<number, CaloriasDiaManual>>(new Map());
  const manuaisDias = $derived(new Map([...manuaisCompletos].map(([dia, v]) => [dia, v.calorias])));
  let diasSelecionados = $state<Set<number>>(new Set());
  let mostrarDefinirCalorias = $state(false);
  let salvandoDistribuicao = $state(false);

  let grupoProteinaG = $state(0);
  let grupoGorduraG = $state(0);
  let grupoCarboidratoG = $state(0);
  const caloriasGrupoCalc = $derived(Math.round(4 * grupoProteinaG + 9 * grupoGorduraG + 4 * grupoCarboidratoG));

  function gKgGrupo(gramas: number): string {
    return pesoAtual > 0 ? (gramas / pesoAtual).toFixed(2) : "0.00";
  }
  type CampoMacroGrupo =
    | "calorias"
    | "proteina"
    | "gordura"
    | "carboidrato"
    | "proteinaGKg"
    | "gorduraGKg"
    | "carboidratoGKg";
  let campoEditandoGrupo = $state<CampoMacroGrupo | null>(null);

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

  /** Metas de consumo puramente informativas — calculadas a partir do peso, sem input manual por enquanto. */
  const fibrasG = $derived(Math.round(RATIOS_NUTRIENTES_AUTOMATICOS.fibrasGKg * pesoAtual));
  const gorduraInsaturadaG = $derived(Math.round(RATIOS_NUTRIENTES_AUTOMATICOS.gordurasInsaturadasGKg * pesoAtual));
  const aguaL = $derived(Math.round(RATIOS_NUTRIENTES_AUTOMATICOS.aguaLKg * pesoAtual * 10) / 10);

  const minimoCalorias = $derived(CALORIA_MINIMA_KCAL_KG * pesoAtual);

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
  }

  /** Dias com a mesma meta de calorias viram um único bloco de refeições — não faz sentido configurar cada dia igual separadamente. Ordem preservada pela primeira ocorrência (Dom..Sáb). */
  const gruposDias = $derived.by((): GrupoDias[] => {
    const grupos = new Map<number, GrupoDias>();
    for (const d of diasResolvidos) {
      const chave = Math.round(d.calorias);
      let g = grupos.get(chave);
      if (!g) {
        g = { dias: [], calorias: d.calorias, manual: d.manual, cor: d.manual ? (corPorGrupoManual.get(chave) ?? null) : null };
        grupos.set(chave, g);
      }
      g.dias.push(d.diaSemana);
    }
    return [...grupos.values()];
  });

  async function carregarMetas() {
    try {
      const [perfil, pesoMedio, modo, manuais] = await Promise.all([
        getPerfilDietaEditavel(),
        getPesoMedioAtual(),
        getModoCalorias(),
        getCaloriasDiaManuais(),
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
      manuaisCompletos = manuais;
      perfilCarregado = true;
    } catch (err) {
      erroMetas = (err as Error).message;
    }
  }

  void carregarMetas();

  function alterarModoCalorias(modo: "fixa" | "ondulatoria") {
    modoCalorias = modo;
    diasSelecionados = new Set();
    definirModoCalorias(modo).catch((err) => alert("Erro ao salvar o modo: " + (err as Error).message));
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

  function infoCampoGrupo(campo: CampoMacroGrupo) {
    switch (campo) {
      case "calorias":
        return {
          titulo: "Calorias (kcal)",
          opcoes: opcoesCaloriasGrupo(),
          valorAtual: caloriasGrupoCalc,
          onSelecionar: (v: number) => {
            grupoCarboidratoG = Math.max(0, Math.round((v - 4 * grupoProteinaG - 9 * grupoGorduraG) / 4));
          },
        };
      case "proteina":
        return {
          titulo: "Proteína (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.proteina.min, LIMITES_MACROS_G_KG.proteina.max),
          valorAtual: grupoProteinaG,
          onSelecionar: (v: number) => (grupoProteinaG = v),
        };
      case "gordura":
        return {
          titulo: "Gordura (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.gordura.min, LIMITES_MACROS_G_KG.gordura.max),
          valorAtual: grupoGorduraG,
          onSelecionar: (v: number) => (grupoGorduraG = v),
        };
      case "carboidrato":
        return {
          titulo: "Carboidrato (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.carboidrato.min, LIMITES_MACROS_G_KG.carboidrato.max),
          valorAtual: grupoCarboidratoG,
          onSelecionar: (v: number) => (grupoCarboidratoG = v),
        };
      case "proteinaGKg":
        return {
          titulo: "Proteína (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.proteina.min, LIMITES_MACROS_G_KG.proteina.max),
          valorAtual: pesoAtual > 0 ? Math.round((grupoProteinaG / pesoAtual) * 100) / 100 : 0,
          onSelecionar: (v: number) => (grupoProteinaG = Math.round(v * pesoAtual)),
        };
      case "gorduraGKg":
        return {
          titulo: "Gordura (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.gordura.min, LIMITES_MACROS_G_KG.gordura.max),
          valorAtual: pesoAtual > 0 ? Math.round((grupoGorduraG / pesoAtual) * 100) / 100 : 0,
          onSelecionar: (v: number) => (grupoGorduraG = Math.round(v * pesoAtual)),
        };
      case "carboidratoGKg":
        return {
          titulo: "Carboidrato (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.carboidrato.min, LIMITES_MACROS_G_KG.carboidrato.max),
          valorAtual: pesoAtual > 0 ? Math.round((grupoCarboidratoG / pesoAtual) * 100) / 100 : 0,
          onSelecionar: (v: number) => (grupoCarboidratoG = Math.round(v * pesoAtual)),
        };
    }
  }

  async function confirmarCaloriasGrupo() {
    if (caloriasGrupoCalc <= 0) return;
    salvandoDistribuicao = true;
    try {
      await definirCaloriasDias(
        [...diasSelecionados],
        grupoProteinaG,
        grupoGorduraG,
        grupoCarboidratoG,
        caloriasCalc,
        minimoCalorias,
        manuaisDias,
      );
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
    } catch (err) {
      alert("Erro ao definir calorias: " + (err as Error).message);
    } finally {
      salvandoDistribuicao = false;
    }
  }

  async function removerAjusteDia(dia: number) {
    try {
      await removerCaloriasDia(dia);
      const novoManual = new Map(manuaisCompletos);
      novoManual.delete(dia);
      manuaisCompletos = novoManual;
    } catch (err) {
      alert("Erro ao remover ajuste: " + (err as Error).message);
    }
  }

  function recalcularCaloriasDosMacros() {
    caloriasInput = caloriasCalc;
  }

  function aoEditarProteinaGKg() {
    proteinaGInput = Math.round(proteinaGKg * pesoAtual);
    recalcularCaloriasDosMacros();
  }
  function aoEditarProteinaGramas() {
    proteinaGKg = pesoAtual > 0 ? Math.round(((proteinaGInput ?? 0) / pesoAtual) * 100) / 100 : 0;
    recalcularCaloriasDosMacros();
  }
  function aoEditarGorduraGKg() {
    gorduraGInput = Math.round(gorduraGKg * pesoAtual);
    recalcularCaloriasDosMacros();
  }
  function aoEditarGorduraGramas() {
    gorduraGKg = pesoAtual > 0 ? Math.round(((gorduraGInput ?? 0) / pesoAtual) * 100) / 100 : 0;
    recalcularCaloriasDosMacros();
  }
  function aoEditarCarboidratoGKg() {
    carboidratoGInput = Math.round(carboidratoGKg * pesoAtual);
    recalcularCaloriasDosMacros();
  }
  function aoEditarCarboidratoGramas() {
    carboidratoGKg = pesoAtual > 0 ? Math.round(((carboidratoGInput ?? 0) / pesoAtual) * 100) / 100 : 0;
    recalcularCaloriasDosMacros();
  }
  function aoEditarCalorias() {
    if (caloriasInput == null) return;
    const novoCarboG = Math.max(0, Math.round((caloriasInput - 4 * (proteinaGInput ?? 0) - 9 * (gorduraGInput ?? 0)) / 4));
    carboidratoGInput = novoCarboG;
    carboidratoGKg = pesoAtual > 0 ? Math.round((novoCarboG / pesoAtual) * 100) / 100 : 0;
  }

  type CampoMacro =
    | "calorias"
    | "proteinaGKg"
    | "proteinaG"
    | "gorduraGKg"
    | "gorduraG"
    | "carboidratoGKg"
    | "carboidratoG";
  let campoEditando = $state<CampoMacro | null>(null);

  function opcoesGKg(min: number, max: number): { valor: number; label: string }[] {
    const opcoes: { valor: number; label: string }[] = [];
    for (let v = Math.round(min * 100); v <= Math.round(max * 100); v += 1) {
      const valor = v / 100;
      opcoes.push({ valor, label: valor.toFixed(2).replace(".", ",") });
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

  function infoCampo(campo: CampoMacro) {
    switch (campo) {
      case "calorias":
        return {
          titulo: "Calorias (kcal)",
          opcoes: opcoesCalorias(),
          valorAtual: Math.round((caloriasInput ?? caloriasCalc) / 10) * 10,
          onSelecionar: (v: number) => {
            caloriasInput = v;
            aoEditarCalorias();
          },
        };
      case "proteinaGKg":
        return {
          titulo: "Proteína (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.proteina.min, LIMITES_MACROS_G_KG.proteina.max),
          valorAtual: proteinaGKg,
          onSelecionar: (v: number) => {
            proteinaGKg = v;
            aoEditarProteinaGKg();
          },
        };
      case "proteinaG":
        return {
          titulo: "Proteína (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.proteina.min, LIMITES_MACROS_G_KG.proteina.max),
          valorAtual: proteinaGInput ?? 0,
          onSelecionar: (v: number) => {
            proteinaGInput = v;
            aoEditarProteinaGramas();
          },
        };
      case "gorduraGKg":
        return {
          titulo: "Gordura (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.gordura.min, LIMITES_MACROS_G_KG.gordura.max),
          valorAtual: gorduraGKg,
          onSelecionar: (v: number) => {
            gorduraGKg = v;
            aoEditarGorduraGKg();
          },
        };
      case "gorduraG":
        return {
          titulo: "Gordura (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.gordura.min, LIMITES_MACROS_G_KG.gordura.max),
          valorAtual: gorduraGInput ?? 0,
          onSelecionar: (v: number) => {
            gorduraGInput = v;
            aoEditarGorduraGramas();
          },
        };
      case "carboidratoGKg":
        return {
          titulo: "Carboidrato (g/kg)",
          opcoes: opcoesGKg(LIMITES_MACROS_G_KG.carboidrato.min, LIMITES_MACROS_G_KG.carboidrato.max),
          valorAtual: carboidratoGKg,
          onSelecionar: (v: number) => {
            carboidratoGKg = v;
            aoEditarCarboidratoGKg();
          },
        };
      case "carboidratoG":
        return {
          titulo: "Carboidrato (g)",
          opcoes: opcoesGramas(LIMITES_MACROS_G_KG.carboidrato.min, LIMITES_MACROS_G_KG.carboidrato.max),
          valorAtual: carboidratoGInput ?? 0,
          onSelecionar: (v: number) => {
            carboidratoGInput = v;
            aoEditarCarboidratoGramas();
          },
        };
    }
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
        fibrasG,
        aguaL,
      });
    } catch (err) {
      alert("Erro ao salvar metas: " + (err as Error).message);
    } finally {
      salvandoCalorias = false;
    }
  }

  let modelos = $state<RefeicaoModelo[]>([]);
  let metasDiaModelo = $state<MetaDiaModelo[]>([]);
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

  /** Soma das calorias já configuradas nas refeições desse dia — pra comparar com a meta total do dia. */
  function somaCaloriasInformadas(dia: number): number {
    return modelos.reduce((acc, m) => acc + (metaEfetivaDoDia(m, dia).calorias ?? 0), 0);
  }

  async function carregar() {
    loading = true;
    erro = null;
    try {
      [modelos, metasDiaModelo] = await Promise.all([listRefeicoesModelo(), listMetasDiaModelo()]);
    } catch (err) {
      erro = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  void carregar();

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

  function aoPointerDownHandle(e: PointerEvent, index: number, dia: number | null = null) {
    e.preventDefault();
    const el = dia == null ? itemRefs[index] : itemRefsDia[dia][index];
    if (!el) return;
    alturaLinha = el.getBoundingClientRect().height;
    startY = e.clientY;
    arrastandoDia = dia;
    arrastandoIndex = index;
    arrastarOffsetY = 0;
    ordemMudou = false;
    window.addEventListener("pointermove", aoPointerMove);
    window.addEventListener("pointerup", aoPointerUp);
  }

  function aoPointerMove(e: PointerEvent) {
    if (arrastandoIndex === null || !alturaLinha) return;
    const delta = e.clientY - startY;
    arrastarOffsetY = delta;
    const passos = Math.round(delta / alturaLinha);
    if (passos !== 0) {
      const novoIndex = Math.min(modelos.length - 1, Math.max(0, arrastandoIndex + passos));
      if (novoIndex !== arrastandoIndex) {
        const copia = modelos.slice();
        const [item] = copia.splice(arrastandoIndex, 1);
        copia.splice(novoIndex, 0, item);
        modelos = copia;
        arrastandoIndex = novoIndex;
        startY = e.clientY;
        arrastarOffsetY = 0;
        ordemMudou = true;
      }
    }
  }

  async function aoPointerUp() {
    window.removeEventListener("pointermove", aoPointerMove);
    window.removeEventListener("pointerup", aoPointerUp);
    arrastandoDia = null;
    arrastandoIndex = null;
    arrastarOffsetY = 0;
    if (!ordemMudou) return;
    try {
      await reordenarRefeicoesModelo(modelos.map((m) => m.id));
    } catch (err) {
      alert("Erro ao salvar a nova ordem: " + (err as Error).message);
      await carregar();
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
    <button class="back" onclick={() => navigate("/dieta")} aria-label="Voltar">←</button>
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
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "carboidratoG")}>
            <strong class="pct" style={`color:${COR_CARBO}`}>{pctCarboidrato.toFixed(0)}%</strong>
            <span class="valor-g">{carboidratoGInput ?? 0} g</span>
            <span class="rotulo-macro">Carb</span>
          </button>
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "gorduraG")}>
            <strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong>
            <span class="valor-g">{gorduraGInput ?? 0} g</span>
            <span class="rotulo-macro">Gorduras</span>
          </button>
          <button type="button" class="macro-col" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "proteinaG")}>
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
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "proteinaGKg")}>
              {proteinaGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Gordura</span>
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "gorduraGKg")}>
              {gorduraGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Carboidrato</span>
            <button type="button" class="tabela-input" disabled={modoCalorias === "ondulatoria"} onclick={() => (campoEditando = "carboidratoGKg")}>
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

      <p class="nutrientes-titulo">Metas de Consumo</p>
      <div class="nutrientes-lista">
        <div class="nutriente-item">
          <span>Fibras</span>
          <span>{fibrasG} g</span>
        </div>
        <div class="nutriente-item">
          <span>Gorduras Insaturadas</span>
          <span>{gorduraInsaturadaG} g</span>
        </div>
        <div class="nutriente-item">
          <span>Água</span>
          <span>{aguaL.toFixed(1)} L</span>
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
            <div class="dia-card-slot">
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
        Ajustar proteína ou gordura (g/kg ou gramas) recalcula as calorias. Ajustar as calorias reajusta o carboidrato pra fechar a conta. Fibras, gorduras insaturadas e água são calculadas automaticamente com base no peso.
      </p>

      <Button onclick={salvarCalorias} disabled={salvandoCalorias}>Salvar</Button>
    {/if}
  {:else}
    <p class="dica">
      Essas refeições são criadas automaticamente em todo dia que você abrir. Editar ou excluir aqui não afeta as refeições já lançadas em dias passados.
    </p>

    {#if loading}
      <p class="muted">Carregando…</p>
    {:else if erro}
      <p class="erro">Erro ao carregar refeições: {erro}</p>
    {:else if !modelos.length}
      <p class="muted">Nenhuma refeição cadastrada ainda.</p>
    {:else if modoCalorias === "ondulatoria"}
      {#each gruposDias as grupo (grupo.dias[0])}
        <div class="secao-dias-header">
          <div class="dias-lista secao-dias-lista">
            {#each grupo.dias as dia (dia)}
              <div class="dia-card" class:colorido={grupo.cor != null} style={grupo.cor ? `background:${grupo.cor}; border-color:${grupo.cor};` : ""}>
                <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia]}</span>
              </div>
            {/each}
          </div>
          <span class="secao-dias-cal">{Math.round(somaCaloriasInformadas(grupo.dias[0]))} de {Math.round(grupo.calorias)} calorias</span>
        </div>
        <ul class="lista lista-dia">
          {#each modelos as m, i (m.id)}
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
              <button class="remover-btn" onclick={() => (paraExcluir = m)} aria-label={`Remover ${m.nome}`}>✕</button>
            </li>
          {/each}
        </ul>
      {/each}
    {:else}
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
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => (campoEditandoGrupo = "proteinaGKg")}>{gKgGrupo(grupoProteinaG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "proteina")}>{grupoProteinaG} g</button>
      </div>
      <div class="tabela-linha tabela-linha-3col">
        <span class="tabela-rotulo">Gordura</span>
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => (campoEditandoGrupo = "gorduraGKg")}>{gKgGrupo(grupoGorduraG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "gordura")}>{grupoGorduraG} g</button>
      </div>
      <div class="tabela-linha tabela-linha-3col">
        <span class="tabela-rotulo">Carboidrato</span>
        <button type="button" class="tabela-input tabela-input-gkg" onclick={() => (campoEditandoGrupo = "carboidratoGKg")}>{gKgGrupo(grupoCarboidratoG)} g/kg</button>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "carboidrato")}>{grupoCarboidratoG} g</button>
      </div>
    </div>
    <Button onclick={confirmarCaloriasGrupo} disabled={salvandoDistribuicao || caloriasGrupoCalc <= 0}>
      Salvar
    </Button>
  </Sheet>
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
    margin: 0;
    padding: 0;
  }
  .linha {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: 0 var(--space-3);
    margin-bottom: var(--space-2);
    position: relative;
  }
  .linha.arrastando {
    z-index: 10;
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
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--color-danger);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
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
    position: relative;
    flex: 0 0 auto;
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
  .secao-dias-cal {
    flex-shrink: 0;
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
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
