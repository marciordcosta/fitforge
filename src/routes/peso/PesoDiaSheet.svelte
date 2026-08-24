<script lang="ts">
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import { parseISODate } from "../../lib/dates";
  import { getDiasComTreino, listTreinos } from "../../lib/treinoApi";
  import { navigate } from "../../lib/router.svelte";
  import {
    getPesoDoDia,
    getFotoDoDia,
    getUrlAssinadaFoto,
    salvarPeso,
    excluirPeso,
    salvarFotoDoDia,
    excluirFotoDoDia,
    type FotoRegistro,
  } from "../../lib/pesoApi";

  let {
    data,
    onFechar,
    onSalvo,
  }: {
    data: string;
    onFechar: () => void;
    onSalvo: () => void;
  } = $props();

  let peso = $state<number | null>(null);
  let pesoOriginal = $state<number | null>(null);
  let salvando = $state(false);
  let carregando = $state(true);
  let foto = $state<FotoRegistro | null>(null);
  let fotoUrl = $state<string | null>(null);
  let nomeRotina = $state<string | null>(null);
  let treinoIdRotina = $state<string | null>(null);
  let treinoEfetuado = $state(false);
  let mostrarOpcoesFoto = $state(false);
  let inputCamera = $state<HTMLInputElement | undefined>();
  let inputGaleria = $state<HTMLInputElement | undefined>();

  const diaSemanaLabel = $derived.by(() => {
    const texto = parseISODate(data).toLocaleDateString("pt-BR", { weekday: "long" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  const dataComplementoLabel = $derived.by(() =>
    parseISODate(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
  );

  async function carregar() {
    carregando = true;
    try {
      const [p, f, treinosNoDia, todosTreinos] = await Promise.all([
        getPesoDoDia(data),
        getFotoDoDia(data),
        getDiasComTreino(data, data),
        listTreinos(),
      ]);
      peso = p;
      pesoOriginal = p;
      foto = f;
      fotoUrl = f ? await getUrlAssinadaFoto(f.path) : null;

      if (treinosNoDia[0]) {
        nomeRotina = treinosNoDia[0].treinoNome;
        treinoIdRotina = treinosNoDia[0].treinoId;
        treinoEfetuado = true;
      } else {
        const diaSemana = parseISODate(data).getDay();
        const agendado = todosTreinos.find((t) => t.dia_semana === diaSemana);
        nomeRotina = agendado?.nome_treino ?? null;
        treinoIdRotina = agendado?.id ?? null;
        treinoEfetuado = false;
      }
    } finally {
      carregando = false;
    }
  }

  void carregar();

  async function selecionarFoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    salvando = true;
    try {
      foto = await salvarFotoDoDia(data, arquivo, foto);
      fotoUrl = await getUrlAssinadaFoto(foto.path);
    } catch (err) {
      alert("Erro ao salvar foto: " + (err as Error).message);
    } finally {
      salvando = false;
      input.value = "";
    }
  }

  async function removerFoto() {
    if (!foto) return;
    salvando = true;
    try {
      await excluirFotoDoDia(foto);
      foto = null;
      fotoUrl = null;
    } catch (err) {
      alert("Erro ao remover foto: " + (err as Error).message);
    } finally {
      salvando = false;
    }
  }

  async function salvar() {
    if (peso == null) return;
    salvando = true;
    try {
      await salvarPeso(data, peso);
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao salvar: " + (err as Error).message);
      salvando = false;
    }
  }

  async function excluir() {
    salvando = true;
    try {
      await excluirPeso(data);
      onSalvo();
      onFechar();
    } catch (err) {
      alert("Erro ao excluir: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

{#snippet iconCamera()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
{/snippet}
{#snippet iconGaleria()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15l-5-5-9 9" />
  </svg>
{/snippet}

<Sheet {onFechar}>
  <div class="titulo-dia">
    <strong>{diaSemanaLabel}</strong><span class="titulo-data-complemento">, {dataComplementoLabel}</span>
  </div>
  {#if nomeRotina && treinoIdRotina}
    <button
      class="link-rotina"
      onclick={() =>
        navigate(treinoEfetuado ? `/treino/historico/${treinoIdRotina}/${data}` : `/treino/rotina/${treinoIdRotina}/ver`)}
    >
      Dia de <span class="link-rotina-nome">"{nomeRotina}"</span>
    </button>
  {/if}

  <div class="campo">
    <label for="peso-input">Peso (kg)</label>
    <input id="peso-input" type="number" inputmode="decimal" step="0.1" placeholder="-" bind:value={peso} />
  </div>

  <div class="foto-secao">
    <span class="foto-label">Foto de acompanhamento</span>
    {#if carregando}
      <p class="muted">Carregando…</p>
    {:else if fotoUrl}
      <div class="foto-preview">
        <img src={fotoUrl} alt="Foto de acompanhamento" />
        <button class="foto-remover" onclick={removerFoto} disabled={salvando} aria-label="Remover foto">✕</button>
      </div>
    {:else}
      <button class="foto-btn" onclick={() => (mostrarOpcoesFoto = true)} disabled={salvando} aria-label="Adicionar foto">
        {@render iconCamera()}
      </button>
    {/if}
    <input bind:this={inputCamera} type="file" accept="image/*" capture="environment" class="foto-input" onchange={selecionarFoto} />
    <input bind:this={inputGaleria} type="file" accept="image/*" class="foto-input" onchange={selecionarFoto} />
  </div>

  <div class="acoes">
    <Button onclick={salvar} disabled={salvando || carregando || peso == null}>Salvar</Button>
    {#if pesoOriginal != null}
      <Button variant="danger" onclick={excluir} disabled={salvando}>Excluir Registro</Button>
    {/if}
  </div>
</Sheet>

{#if mostrarOpcoesFoto}
  <ActionSheet
    titulo="Adicionar foto"
    onFechar={() => (mostrarOpcoesFoto = false)}
    opcoes={[
      { label: "Câmera", icon: iconCamera, onSelect: () => inputCamera?.click() },
      { label: "Galeria", icon: iconGaleria, onSelect: () => inputGaleria?.click() },
    ]}
  />
{/if}

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
  .campo input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .titulo-dia {
    text-align: left;
    margin: 0 0 2px;
  }
  .titulo-dia strong {
    font-size: var(--font-size-base);
    font-weight: 700;
  }
  .titulo-data-complemento {
    font-size: var(--font-size-base);
    font-weight: 400;
    color: var(--surface-muted);
  }
  .link-rotina {
    display: block;
    width: 100%;
    margin: 0 0 var(--space-4);
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    color: #fff;
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
  }
  .link-rotina-nome {
    color: var(--color-primary);
    font-weight: 600;
  }
  .foto-secao {
    margin-bottom: var(--space-5);
  }
  .foto-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    margin-bottom: var(--space-2);
  }
  .foto-btn {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .foto-btn svg {
    width: 28px;
    height: 28px;
  }
  .foto-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .foto-preview {
    position: relative;
    width: 96px;
    height: 96px;
  }
  .foto-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-md);
  }
  .foto-remover {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .foto-input {
    display: none;
  }
  .acoes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .muted {
    color: var(--surface-muted);
  }
</style>
