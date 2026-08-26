<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import { criarAlimentoManual, atualizarAlimentoManual, type Alimento } from "../../lib/dietaApi";

  let {
    alimento,
    onFechar,
    onSalvo,
  }: { alimento?: Alimento; onFechar: () => void; onSalvo: () => void } = $props();

  const editando = untrack(() => alimento != null);

  let nome = $state(untrack(() => alimento?.nome ?? ""));
  let marca = $state(untrack(() => alimento?.marca ?? ""));
  let porcaoQtd = $state<number | null>(untrack(() => alimento?.porcaoPadraoQtd ?? 100));
  let porcaoUnidade = $state<"g" | "ml" | "unidade">(untrack(() => (alimento?.porcaoPadraoUnidade as "g" | "ml" | "unidade") ?? "g"));
  let proteina = $state<number | null>(untrack(() => alimento?.proteinaG ?? null));
  let gordura = $state<number | null>(untrack(() => alimento?.gorduraG ?? null));
  let carboidrato = $state<number | null>(untrack(() => alimento?.carboidratoG ?? null));
  let fibra = $state<number | null>(untrack(() => alimento?.fibraG ?? null));
  let gorduraSaturada = $state<number | null>(untrack(() => alimento?.gorduraSaturadaG ?? null));
  let gorduraInsaturada = $state<number | null>(untrack(() => alimento?.gorduraInsaturadaG ?? null));
  let gorduraExpandida = $state(
    untrack(() => alimento?.gorduraSaturadaG != null || alimento?.gorduraInsaturadaG != null),
  );
  let salvando = $state(false);

  $effect(() => {
    if (gorduraExpandida) {
      gordura = Math.round(((gorduraSaturada ?? 0) + (gorduraInsaturada ?? 0)) * 10) / 10;
    }
  });

  function alternarGordura() {
    gorduraExpandida = !gorduraExpandida;
  }

  const calorias = $derived(
    Math.round(4 * (proteina ?? 0) + 4 * (carboidrato ?? 0) + 9 * (gordura ?? 0)),
  );

  const valido = $derived(
    nome.trim().length > 0 &&
      porcaoQtd != null &&
      porcaoQtd > 0 &&
      proteina != null &&
      carboidrato != null &&
      (gorduraExpandida ? gorduraSaturada != null || gorduraInsaturada != null : gordura != null),
  );

  async function salvar() {
    if (!valido) return;
    salvando = true;
    try {
      const input = {
        nome: nome.trim(),
        marca: marca.trim() || null,
        porcaoPadraoQtd: porcaoQtd!,
        porcaoPadraoUnidade: porcaoUnidade,
        caloriasPorPorcao: calorias,
        proteinaG: proteina!,
        gorduraG: gordura ?? 0,
        carboidratoG: carboidrato!,
        fibraG: fibra,
        gorduraSaturadaG: gorduraExpandida ? gorduraSaturada : null,
        gorduraInsaturadaG: gorduraExpandida ? gorduraInsaturada : null,
      };
      if (editando) {
        await atualizarAlimentoManual(alimento!.id, input);
      } else {
        await criarAlimentoManual(input);
      }
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao salvar alimento: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconChevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
{/snippet}

<Sheet titulo={editando ? "Editar Alimento" : "Novo Alimento"} {onFechar}>
  <div class="lista">
    <div class="linha">
      <label for="af-nome">Nome</label>
      <input id="af-nome" type="text" bind:value={nome} />
    </div>

    <div class="linha">
      <label for="af-marca">Marca (opcional)</label>
      <input id="af-marca" type="text" bind:value={marca} />
    </div>

    <div class="linha">
      <label for="af-porcao">Porção</label>
      <div class="par">
        <input id="af-porcao" class="campo-curto" type="number" inputmode="decimal" step="1" bind:value={porcaoQtd} />
        <select bind:value={porcaoUnidade}>
          <option value="g">g</option>
          <option value="ml">ml</option>
          <option value="unidade">unidade</option>
        </select>
      </div>
    </div>

    <div class="linha">
      <span class="rotulo-estatico">Calorias (kcal)</span>
      <span class="valor-calculado">{calorias}</span>
    </div>

    <div class="linha">
      <label for="af-proteina">Proteína (g)</label>
      <input id="af-proteina" type="number" inputmode="decimal" step="0.1" bind:value={proteina} />
    </div>

    <div class="linha">
      <label for="af-carboidrato">Carboidrato (g)</label>
      <input id="af-carboidrato" type="number" inputmode="decimal" step="0.1" bind:value={carboidrato} />
    </div>

    <div class="linha">
      <label for="af-gordura">Gordura (g)</label>
      <div class="par">
        <input
          id="af-gordura"
          type="number"
          inputmode="decimal"
          step="0.1"
          bind:value={gordura}
          disabled={gorduraExpandida}
          class:opaca={gorduraExpandida}
        />
        <button
          type="button"
          class="chevron"
          class:aberto={gorduraExpandida}
          onclick={alternarGordura}
          aria-label="Detalhar tipos de gordura"
        >
          {@render iconChevron()}
        </button>
      </div>
    </div>

    {#if gorduraExpandida}
      <div class="linha sub">
        <label for="af-gordura-sat">Saturada (g)</label>
        <input id="af-gordura-sat" type="number" inputmode="decimal" step="0.1" bind:value={gorduraSaturada} />
      </div>
      <div class="linha sub">
        <label for="af-gordura-insat">Insaturada (g)</label>
        <input id="af-gordura-insat" type="number" inputmode="decimal" step="0.1" bind:value={gorduraInsaturada} />
      </div>
    {/if}

    <div class="linha">
      <label for="af-fibra">Fibra (g, opcional)</label>
      <input id="af-fibra" type="number" inputmode="decimal" step="0.1" bind:value={fibra} />
    </div>
  </div>

  <Button onclick={salvar} disabled={salvando || !valido}>{editando ? "Salvar Alterações" : "Criar Alimento"}</Button>
</Sheet>

<style>
  .lista {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-4);
  }
  .linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .linha:last-child {
    border-bottom: none;
  }
  .linha label,
  .rotulo-estatico {
    flex-shrink: 0;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .linha input[type="text"],
  .linha input[type="number"] {
    flex: 1;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: right;
    padding: 0;
  }
  .linha input:focus {
    outline: none;
  }
  .valor-calculado {
    color: var(--surface-muted);
    font-weight: 600;
  }
  .par {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }
  .par input {
    flex: 0 1 64px;
  }
  .par select {
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .par select:focus {
    outline: none;
  }
  .opaca {
    opacity: 0.5;
  }
  .chevron {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    color: var(--surface-muted);
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .chevron svg {
    width: 18px;
    height: 18px;
  }
  .chevron.aberto {
    transform: rotate(180deg);
    color: var(--color-primary);
  }
  .sub label {
    padding-left: var(--space-4);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
</style>
