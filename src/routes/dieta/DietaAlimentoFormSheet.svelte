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
  let calorias = $state<number | null>(untrack(() => alimento?.caloriasPorPorcao ?? null));
  let proteina = $state<number | null>(untrack(() => alimento?.proteinaG ?? null));
  let gordura = $state<number | null>(untrack(() => alimento?.gorduraG ?? null));
  let carboidrato = $state<number | null>(untrack(() => alimento?.carboidratoG ?? null));
  let fibra = $state<number | null>(untrack(() => alimento?.fibraG ?? null));
  let gorduraSaturada = $state<number | null>(untrack(() => alimento?.gorduraSaturadaG ?? null));
  let gorduraInsaturada = $state<number | null>(untrack(() => alimento?.gorduraInsaturadaG ?? null));
  let salvando = $state(false);

  const valido = $derived(
    nome.trim().length > 0 &&
      porcaoQtd != null &&
      porcaoQtd > 0 &&
      calorias != null &&
      proteina != null &&
      gordura != null &&
      carboidrato != null,
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
        caloriasPorPorcao: calorias!,
        proteinaG: proteina!,
        gorduraG: gordura!,
        carboidratoG: carboidrato!,
        fibraG: fibra,
        gorduraSaturadaG: gorduraSaturada,
        gorduraInsaturadaG: gorduraInsaturada,
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

<Sheet titulo={editando ? "Editar Alimento" : "Novo Alimento"} {onFechar}>
  <div class="campo">
    <label for="af-nome">Nome</label>
    <input id="af-nome" type="text" bind:value={nome} />
  </div>

  <div class="campo">
    <label for="af-marca">Marca (opcional)</label>
    <input id="af-marca" type="text" bind:value={marca} />
  </div>

  <div class="linha">
    <div class="campo">
      <label for="af-porcao">Porção</label>
      <input id="af-porcao" type="number" inputmode="decimal" step="1" bind:value={porcaoQtd} />
    </div>
    <div class="campo campo-unidade">
      <label for="af-unidade">Unidade</label>
      <select id="af-unidade" bind:value={porcaoUnidade}>
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="unidade">unidade</option>
      </select>
    </div>
  </div>

  <div class="campo">
    <label for="af-calorias">Calorias (kcal)</label>
    <input id="af-calorias" type="number" inputmode="decimal" step="1" bind:value={calorias} />
  </div>

  <div class="linha">
    <div class="campo">
      <label for="af-proteina">Proteína (g)</label>
      <input id="af-proteina" type="number" inputmode="decimal" step="0.1" bind:value={proteina} />
    </div>
    <div class="campo">
      <label for="af-gordura">Gordura (g)</label>
      <input id="af-gordura" type="number" inputmode="decimal" step="0.1" bind:value={gordura} />
    </div>
    <div class="campo">
      <label for="af-carboidrato">Carbo (g)</label>
      <input id="af-carboidrato" type="number" inputmode="decimal" step="0.1" bind:value={carboidrato} />
    </div>
  </div>

  <div class="linha">
    <div class="campo">
      <label for="af-fibra">Fibra (g, opcional)</label>
      <input id="af-fibra" type="number" inputmode="decimal" step="0.1" bind:value={fibra} />
    </div>
    <div class="campo">
      <label for="af-gordura-sat">G. Saturada (g, opcional)</label>
      <input id="af-gordura-sat" type="number" inputmode="decimal" step="0.1" bind:value={gorduraSaturada} />
    </div>
    <div class="campo">
      <label for="af-gordura-insat">G. Insaturada (g, opcional)</label>
      <input id="af-gordura-insat" type="number" inputmode="decimal" step="0.1" bind:value={gorduraInsaturada} />
    </div>
  </div>

  <Button onclick={salvar} disabled={salvando || !valido}>{editando ? "Salvar Alterações" : "Criar Alimento"}</Button>
</Sheet>

<style>
  .campo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .campo label {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .campo input,
  .campo select {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .linha {
    display: flex;
    gap: var(--space-2);
  }
  .linha .campo {
    flex: 1;
    min-width: 0;
  }
  .campo-unidade {
    flex: 0 0 90px;
  }
</style>
