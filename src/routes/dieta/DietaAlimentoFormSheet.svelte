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
      <input id="af-porcao" class="valor-num" type="number" inputmode="decimal" step="1" bind:value={porcaoQtd} />
      <select class="valor-extra" bind:value={porcaoUnidade}>
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="unidade">unidade</option>
      </select>
    </div>

    <div class="linha">
      <span class="rotulo-estatico">Calorias (kcal)</span>
      <span class="valor-num valor-calculado">{calorias}</span>
    </div>

    <div class="linha">
      <label for="af-proteina">Proteína (g)</label>
      <input id="af-proteina" class="valor-num" type="number" inputmode="decimal" step="0.1" bind:value={proteina} />
    </div>

    <div class="linha">
      <label for="af-carboidrato">Carboidrato (g)</label>
      <input id="af-carboidrato" class="valor-num" type="number" inputmode="decimal" step="0.1" bind:value={carboidrato} />
    </div>

    <div class="linha">
      <span class="rotulo-com-seta">
        <label for="af-gordura">Gordura (g)</label>
        <button
          type="button"
          class="chevron"
          class:aberto={gorduraExpandida}
          onclick={alternarGordura}
          aria-label="Detalhar tipos de gordura"
        >
          {@render iconChevron()}
        </button>
      </span>
      <input
        id="af-gordura"
        class="valor-num"
        class:opaca={gorduraExpandida}
        type="number"
        inputmode="decimal"
        step="0.1"
        bind:value={gordura}
        disabled={gorduraExpandida}
      />
    </div>

    {#if gorduraExpandida}
      <div class="linha sub">
        <label for="af-gordura-sat">Saturada (g)</label>
        <input id="af-gordura-sat" class="valor-num" type="number" inputmode="decimal" step="0.1" bind:value={gorduraSaturada} />
      </div>
      <div class="linha sub">
        <label for="af-gordura-insat">Insaturada (g)</label>
        <input id="af-gordura-insat" class="valor-num" type="number" inputmode="decimal" step="0.1" bind:value={gorduraInsaturada} />
      </div>
    {/if}

    <div class="linha">
      <label for="af-fibra">Fibra (g, opcional)</label>
      <input id="af-fibra" class="valor-num" type="number" inputmode="decimal" step="0.1" bind:value={fibra} />
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
    display: grid;
    grid-template-columns: 1fr 68px 74px;
    align-items: center;
    column-gap: var(--space-2);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .linha:last-child {
    border-bottom: none;
  }
  .linha label,
  .rotulo-estatico,
  .rotulo-com-seta {
    grid-column: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .linha input[type="text"] {
    grid-column: 2 / span 2;
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
  .valor-num {
    grid-column: 2;
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
  .valor-extra {
    grid-column: 3;
    justify-self: end;
    border: none;
    background: none;
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .valor-extra:focus {
    outline: none;
  }
  .valor-extra option {
    background: var(--surface-card);
    color: var(--surface-fg);
  }
  .linha input:focus {
    outline: none;
  }
  .valor-calculado {
    color: var(--surface-muted);
    font-weight: 600;
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
