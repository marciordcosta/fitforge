<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import {
    listRefeicoesModelo,
    criarRefeicaoModelo,
    atualizarRefeicaoModelo,
    excluirRefeicaoModelo,
    reordenarRefeicoesModelo,
    getPerfilDietaEditavel,
    salvarPerfilDieta,
    type RefeicaoModelo,
  } from "../../lib/dietaApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";

  let aba = $state<"calorias" | "refeicoes">("refeicoes");

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
  let gordurasSaturadasG = $state<number | null>(null);
  let fibrasG = $state<number | null>(null);
  let aguaL = $state<number | null>(null);

  const caloriasCalc = $derived(
    Math.round(4 * (proteinaGInput ?? 0) + 9 * (gorduraGInput ?? 0) + 4 * (carboidratoGInput ?? 0)),
  );
  const pctProteina = $derived(caloriasCalc > 0 ? (4 * (proteinaGInput ?? 0) * 100) / caloriasCalc : 0);
  const pctGordura = $derived(caloriasCalc > 0 ? (9 * (gorduraGInput ?? 0) * 100) / caloriasCalc : 0);
  const pctCarboidrato = $derived(caloriasCalc > 0 ? (4 * (carboidratoGInput ?? 0) * 100) / caloriasCalc : 0);

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
      gordurasSaturadasG = perfil.gordurasSaturadasG;
      fibrasG = perfil.fibrasG;
      aguaL = perfil.aguaL;
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

  async function salvarCalorias() {
    salvandoCalorias = true;
    try {
      await salvarPerfilDieta({
        pesoAtual,
        metaCalorias: caloriasInput ?? caloriasCalc,
        proteinaGKg,
        gorduraGKg,
        carboidratoGKg,
        gordurasSaturadasG,
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

      <div class="lista-metas">
        <div class="linha-meta">
          <label for="meta-calorias">Calorias (kcal)</label>
          <input
            id="meta-calorias"
            class="valor-meta"
            type="number"
            inputmode="decimal"
            step="1"
            min="0"
            bind:value={caloriasInput}
            oninput={aoEditarCalorias}
          />
        </div>
      </div>

      <div class="tabela-macros">
        <div class="tabela-cabecalho">
          <span></span>
          <span>g/kg</span>
          <span>%</span>
          <span>g</span>
        </div>
        <div class="tabela-linha">
          <span class="tabela-rotulo">Proteína</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0"
            bind:value={proteinaGKg}
            oninput={aoEditarProteinaGKg}
          />
          <span class="tabela-calc">{pctProteina.toFixed(0)}%</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="1"
            min="0"
            bind:value={proteinaGInput}
            oninput={aoEditarProteinaGramas}
          />
        </div>
        <div class="tabela-linha">
          <span class="tabela-rotulo">Gordura</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0"
            bind:value={gorduraGKg}
            oninput={aoEditarGorduraGKg}
          />
          <span class="tabela-calc">{pctGordura.toFixed(0)}%</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="1"
            min="0"
            bind:value={gorduraGInput}
            oninput={aoEditarGorduraGramas}
          />
        </div>
        <div class="tabela-linha">
          <span class="tabela-rotulo">Carboidrato</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0"
            bind:value={carboidratoGKg}
            oninput={aoEditarCarboidratoGKg}
          />
          <span class="tabela-calc">{pctCarboidrato.toFixed(0)}%</span>
          <input
            class="tabela-input"
            type="number"
            inputmode="decimal"
            step="1"
            min="0"
            bind:value={carboidratoGInput}
            oninput={aoEditarCarboidratoGramas}
          />
        </div>
      </div>

      <div class="lista-metas">
        <div class="linha-meta">
          <label for="meta-gord-sat">Gorduras Saturadas (g)</label>
          <input id="meta-gord-sat" class="valor-meta" type="number" inputmode="decimal" step="1" min="0" bind:value={gordurasSaturadasG} />
        </div>
        <div class="linha-meta">
          <label for="meta-fibras">Fibras (g)</label>
          <input id="meta-fibras" class="valor-meta" type="number" inputmode="decimal" step="1" min="0" bind:value={fibrasG} />
        </div>
        <div class="linha-meta">
          <label for="meta-agua">Água (L)</label>
          <input id="meta-agua" class="valor-meta" type="number" inputmode="decimal" step="0.1" min="0" bind:value={aguaL} />
        </div>
      </div>

      <p class="dica">
        Ajustar proteína ou gordura (g/kg ou gramas) recalcula as calorias. Ajustar as calorias reajusta o carboidrato pra fechar a conta.
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
  .lista-metas {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-4);
  }
  .linha-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .linha-meta:last-child {
    border-bottom: none;
  }
  .linha-meta label {
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .valor-meta {
    flex: 0 0 90px;
    min-width: 0;
    box-sizing: border-box;
    text-align: right;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    padding: 0;
  }
  .valor-meta:focus {
    outline: none;
  }
  .tabela-macros {
    margin-bottom: var(--space-4);
  }
  .tabela-cabecalho,
  .tabela-linha {
    display: grid;
    grid-template-columns: 1fr 64px 48px 64px;
    align-items: center;
    gap: var(--space-2);
  }
  .tabela-cabecalho {
    padding-bottom: var(--space-2);
    color: var(--surface-muted);
    font-size: 11px;
    text-transform: uppercase;
  }
  .tabela-cabecalho span:not(:first-child) {
    text-align: right;
  }
  .tabela-linha {
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
    box-sizing: border-box;
    width: 100%;
    text-align: right;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    padding: 0;
  }
  .tabela-input:focus {
    outline: none;
  }
  .tabela-calc {
    text-align: right;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
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
