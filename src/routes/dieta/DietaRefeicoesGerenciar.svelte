<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
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
    type RefeicaoModelo,
    type CaloriasPorDia,
    type CaloriasDiaManual,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";
  import { DIAS_SEMANA_ABREV } from "../../lib/treinoApi";
  import { navigate } from "../../lib/router.svelte";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";

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
  type CampoMacroGrupo = "proteina" | "gordura" | "carboidrato";
  let campoEditandoGrupo = $state<CampoMacroGrupo | null>(null);

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

  function toggleDiaSelecionado(dia: number) {
    const novo = new Set(diasSelecionados);
    if (novo.has(dia)) novo.delete(dia);
    else novo.add(dia);
    diasSelecionados = novo;
  }

  function abrirDefinirCalorias() {
    const dias = [...diasSelecionados];
    const existente = dias.length === 1 ? manuaisCompletos.get(dias[0]) : undefined;
    grupoProteinaG = existente?.proteinaG ?? proteinaGInput ?? 0;
    grupoGorduraG = existente?.gorduraG ?? gorduraGInput ?? 0;
    grupoCarboidratoG = existente?.carboidratoG ?? carboidratoGInput ?? 0;
    mostrarDefinirCalorias = true;
  }

  function infoCampoGrupo(campo: CampoMacroGrupo) {
    switch (campo) {
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
  let loading = $state(true);
  let erro = $state<string | null>(null);
  let mostrarForm = $state(false);
  let nome = $state("");
  let salvando = $state(false);
  let paraExcluir = $state<RefeicaoModelo | null>(null);
  let excluindo = $state(false);

  let itemRefs: (HTMLLIElement | null)[] = [];
  let arrastandoIndex = $state<number | null>(null);
  let arrastarOffsetY = $state(0);
  let alturaLinha = 0;
  let startY = 0;
  let ordemMudou = false;

  async function carregar() {
    loading = true;
    erro = null;
    try {
      modelos = await listRefeicoesModelo();
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

  function abrirMeta(m: RefeicaoModelo) {
    if (m.metaReceitaId) {
      navigate(`/dieta/receitas/ver/${m.metaReceitaId}`);
      return;
    }
    navigate(`/dieta/receitas/buscar/meta/${m.id}/${encodeURIComponent(m.nome)}`);
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

  function aoPointerDownHandle(e: PointerEvent, index: number) {
    e.preventDefault();
    const el = itemRefs[index];
    if (!el) return;
    alturaLinha = el.getBoundingClientRect().height;
    startY = e.clientY;
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

      <p class="secao-titulo">Distribuição Semanal</p>
      <div class="tabs modo-toggle">
        <button class:active={modoCalorias === "fixa"} onclick={() => alterarModoCalorias("fixa")}>Fixa</button>
        <button class:active={modoCalorias === "ondulatoria"} onclick={() => alterarModoCalorias("ondulatoria")}>Ondulatória</button>
      </div>

      {#if modoCalorias === "ondulatoria"}
        <div class="dias-lista">
          {#each diasResolvidos as dia (dia.diaSemana)}
            <button
              type="button"
              class="dia-card"
              class:selecionado={diasSelecionados.has(dia.diaSemana)}
              class:manual={dia.manual}
              onclick={() => toggleDiaSelecionado(dia.diaSemana)}
            >
              <span class="dia-card-nome">{DIAS_SEMANA_ABREV[dia.diaSemana]}</span>
              <span class="dia-card-cal">{Math.round(dia.calorias)}</span>
            </button>
          {/each}
        </div>

        {#if diasSelecionados.size > 0}
          <div class="dias-acoes">
            <Button onclick={abrirDefinirCalorias}>
              Definir calorias pra {diasSelecionados.size} {diasSelecionados.size === 1 ? "dia" : "dias"}
            </Button>
            {#if diasSelecionados.size === 1 && diasResolvidos.find((d) => diasSelecionados.has(d.diaSemana))?.manual}
              <button type="button" class="link-remover" onclick={() => removerAjusteDia([...diasSelecionados][0])}>
                Remover ajuste
              </button>
            {/if}
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
    {:else}
      <ul class="lista">
        {#each modelos as m, i (m.id)}
          <li
            class="linha"
            class:arrastando={arrastandoIndex === i}
            bind:this={itemRefs[i]}
            style={arrastandoIndex === i ? `transform: translateY(${arrastarOffsetY}px);` : ""}
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
    titulo={`Calorias para ${diasSelecionados.size} ${diasSelecionados.size === 1 ? "dia" : "dias"}`}
    onFechar={() => (mostrarDefinirCalorias = false)}
  >
    <div class="tabela-macros calorias-grupo-tabela">
      <div class="tabela-linha">
        <span class="tabela-rotulo">Calorias (kcal)</span>
        <span class="tabela-input tabela-valor-calculado">{caloriasGrupoCalc}</span>
      </div>
      <div class="tabela-linha">
        <span class="tabela-rotulo">Proteína</span>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "proteina")}>{grupoProteinaG} g</button>
      </div>
      <div class="tabela-linha">
        <span class="tabela-rotulo">Gordura</span>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "gordura")}>{grupoGorduraG} g</button>
      </div>
      <div class="tabela-linha">
        <span class="tabela-rotulo">Carboidrato</span>
        <button type="button" class="tabela-input" onclick={() => (campoEditandoGrupo = "carboidrato")}>{grupoCarboidratoG} g</button>
      </div>
    </div>
    <Button onclick={confirmarCaloriasGrupo} disabled={salvandoDistribuicao || caloriasGrupoCalc <= 0}>
      Salvar
    </Button>
  </Sheet>
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
  .nutrientes-titulo {
    font-weight: 600;
    margin: var(--space-2) 0 var(--space-3);
  }
  .nutrientes-lista {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-4);
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
    margin-bottom: var(--space-4);
  }
  .tabela-valor-calculado {
    cursor: default;
    color: var(--surface-muted);
    font-weight: 600;
  }
  .modo-toggle {
    margin-bottom: var(--space-5);
  }
  .dias-lista {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-top: var(--space-1);
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
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-family: inherit;
    cursor: pointer;
  }
  .dia-card.manual {
    border-color: var(--color-primary);
  }
  .dia-card.selecionado {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .dia-card-nome {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
  .dia-card-cal {
    font-size: 12px;
    opacity: 0.8;
  }
  .dias-acoes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .link-remover {
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: var(--font-size-sm);
    text-align: center;
    cursor: pointer;
    padding: var(--space-1);
  }
</style>
