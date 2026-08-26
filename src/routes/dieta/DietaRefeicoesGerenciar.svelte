<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import {
    listRefeicoesModelo,
    criarRefeicaoModelo,
    atualizarRefeicaoModelo,
    excluirRefeicaoModelo,
    reordenarRefeicoesModelo,
    getPerfilDietaEditavel,
    salvarPerfilDieta,
    LIMITES_MACROS_G_KG,
    RATIOS_NUTRIENTES_AUTOMATICOS,
    type RefeicaoModelo,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";

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

  async function carregarMetas() {
    try {
      const [perfil, pesoMedio] = await Promise.all([getPerfilDietaEditavel(), getPesoMedioAtual()]);
      pesoAtual = pesoMedio ?? perfil.pesoAtual;
      proteinaGKg = perfil.proteinaGKg;
      gorduraGKg = perfil.gorduraGKg;
      carboidratoGKg = perfil.carboidratoGKg;
      proteinaGInput = Math.round(proteinaGKg * pesoAtual);
      gorduraGInput = Math.round(gorduraGKg * pesoAtual);
      carboidratoGInput = Math.round(carboidratoGKg * pesoAtual);
      caloriasInput = caloriasCalc;
      perfilCarregado = true;
    } catch (err) {
      erroMetas = (err as Error).message;
    }
  }

  void carregarMetas();

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
  let editando = $state<RefeicaoModelo | null>(null);
  let nome = $state("");
  let salvando = $state(false);
  let paraExcluir = $state<RefeicaoModelo | null>(null);
  let excluindo = $state(false);
  let itemMenu = $state<RefeicaoModelo | null>(null);

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
    editando = null;
    nome = "";
    mostrarForm = true;
  }

  function abrirEdicao(m: RefeicaoModelo) {
    editando = m;
    nome = m.nome;
    mostrarForm = true;
  }

  async function salvar() {
    if (!nome.trim()) return;
    salvando = true;
    try {
      if (editando) {
        await atualizarRefeicaoModelo(editando.id, nome.trim());
      } else {
        await criarRefeicaoModelo(nome.trim());
      }
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

{#snippet iconEditar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconExcluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
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
    <button class="back" onclick={() => window.history.back()} aria-label="Voltar">←</button>
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
        <button type="button" class="donut" style={donutStyle} onclick={() => (campoEditando = "calorias")} aria-label="Ajustar calorias">
          <div class="donut-centro">
            <strong>{caloriasCalc}</strong>
            <span>Cal</span>
          </div>
        </button>
        <div class="resumo-macros">
          <button type="button" class="macro-col" onclick={() => (campoEditando = "carboidratoG")}>
            <strong class="pct" style={`color:${COR_CARBO}`}>{pctCarboidrato.toFixed(0)}%</strong>
            <span class="valor-g">{carboidratoGInput ?? 0} g</span>
            <span class="rotulo-macro">Carb</span>
          </button>
          <button type="button" class="macro-col" onclick={() => (campoEditando = "gorduraG")}>
            <strong class="pct" style={`color:${COR_GORDURA}`}>{pctGordura.toFixed(0)}%</strong>
            <span class="valor-g">{gorduraGInput ?? 0} g</span>
            <span class="rotulo-macro">Gorduras</span>
          </button>
          <button type="button" class="macro-col" onclick={() => (campoEditando = "proteinaG")}>
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
            <button type="button" class="tabela-input" onclick={() => (campoEditando = "proteinaGKg")}>
              {proteinaGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Gordura</span>
            <button type="button" class="tabela-input" onclick={() => (campoEditando = "gorduraGKg")}>
              {gorduraGKg.toFixed(2)}
            </button>
          </div>
          <div class="tabela-linha">
            <span class="tabela-rotulo">Carboidrato</span>
            <button type="button" class="tabela-input" onclick={() => (campoEditando = "carboidratoGKg")}>
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
            <button class="nome-btn" onclick={() => (itemMenu = m)}>
              <span class="nome">{m.nome}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if itemMenu}
  <ActionSheet
    titulo={itemMenu.nome}
    onFechar={() => (itemMenu = null)}
    opcoes={[
      { label: "Editar", icon: iconEditar, onSelect: () => abrirEdicao(itemMenu!) },
      { label: "Excluir", icon: iconExcluir, destructive: true, onSelect: () => (paraExcluir = itemMenu) },
    ]}
  />
{/if}

{#if mostrarForm}
  <Sheet titulo={editando ? "Editar Refeição" : "Nova Refeição"} onFechar={() => (mostrarForm = false)}>
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
    border-bottom: 1px solid var(--surface-border);
    background: var(--surface-bg);
    position: relative;
  }
  .linha.arrastando {
    z-index: 10;
    background: var(--surface-card);
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
    text-align: left;
    border: none;
    background: none;
    padding: var(--space-3) 0;
    cursor: pointer;
    font-family: inherit;
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base);
    color: var(--surface-fg);
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
</style>
