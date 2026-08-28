<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { formatMinSeg } from "../../lib/tempo";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DescansoPicker from "../../components/DescansoPicker.svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";
  import {
    getTreino,
    createTreino,
    renameTreino,
    salvarExerciciosRotina,
    listExercicios,
    listPadroesMovimento,
    listMusculos,
    getUltimoRegistro,
    DIAS_SEMANA_ABREV,
    DIAS_SEMANA_COMPLETO,
    type Exercicio,
    type PadraoMovimento,
    type Musculo,
    type SetRegistro,
  } from "../../lib/treinoApi";
  import { rotinaEditorSessao, type Linha, type LinhaSerie } from "../../lib/rotinaEditorSessao.svelte";

  let { treinoId }: { treinoId: string | null } = $props();

  let nomeTreino = $state("");
  let diaSemana = $state<number | null>(null);
  let linhas = $state<Linha[]>([]);
  let todosExercicios = $state<Exercicio[]>([]);
  let padroes = $state<PadraoMovimento[]>([]);
  let musculos = $state<Musculo[]>([]);
  let loading = $state(true);
  let salvando = $state(false);
  let mostrarPicker = $state(false);
  let buscaPicker = $state("");
  let filtroPadraoPicker = $state("");
  let filtroMusculoPicker = $state("");
  let mostrarDiaPicker = $state(false);

  function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  }

  function subtitulo(ex: Exercicio): string {
    if (!ex.musculos.length) return "Sem músculo definido";
    return ex.musculos
      .slice()
      .sort((a, b) => b.peso_contribuicao - a.peso_contribuicao)
      .map((m) => m.musculo?.nome)
      .join(", ");
  }

  const opcoesDia = [
    { valor: null, label: "Sem dia fixo" },
    ...DIAS_SEMANA_COMPLETO.map((label, idx) => ({ valor: idx, label })),
  ];

  const anteriorCache = new Map<string, SetRegistro[]>();

  async function getAnteriorCached(exercicioId: string): Promise<SetRegistro[]> {
    let anterior = anteriorCache.get(exercicioId);
    if (!anterior) {
      anterior = await getUltimoRegistro(exercicioId);
      anteriorCache.set(exercicioId, anterior);
    }
    return anterior;
  }

  let erroCarregar = $state<string | null>(null);

  async function carregar() {
    loading = true;
    erroCarregar = null;
    try {
      [todosExercicios, padroes, musculos] = await Promise.all([
        listExercicios(),
        listPadroesMovimento(),
        listMusculos(),
      ]);

      const salva = rotinaEditorSessao.atual;
      if (salva && salva.treinoId === treinoId) {
        nomeTreino = salva.nomeTreino;
        diaSemana = salva.diaSemana;
        linhas = salva.linhas;
        loading = false;
        return;
      }

      if (treinoId) {
        const t = await getTreino(treinoId);
        if (t) {
          nomeTreino = t.nome_treino;
          diaSemana = t.dia_semana;
          linhas = t.exercicios.map((e) => ({
            exercicio_id: e.exercicio_id,
            nome: e.exercicio?.nome ?? "",
            descanso_seg: e.descanso_seg,
            observacao: e.observacao,
            series: e.series.map((s) => ({
              serie: s.serie,
              peso_alvo: s.peso_alvo,
              rep_min: s.rep_min,
              rep_max: s.rep_max,
            })),
          }));
        }
      }
      rotinaEditorSessao.definirOriginal(JSON.stringify({ nomeTreino, diaSemana, linhas }));
    } catch (e) {
      erroCarregar = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function temAlteracoes(): boolean {
    const original = rotinaEditorSessao.original;
    if (original == null) return true;
    return JSON.stringify({ nomeTreino, diaSemana, linhas }) !== original;
  }

  function aoClicarCancelar() {
    if (temAlteracoes()) {
      mostrarConfirmCancelar = true;
    } else {
      rotinaEditorSessao.limpar();
      window.history.back();
    }
  }

  $effect(() => {
    if (loading || erroCarregar) return;
    rotinaEditorSessao.iniciar({ treinoId, nomeTreino, diaSemana, linhas });
  });

  void carregar();

  const disponiveis = $derived(
    todosExercicios.filter((ex) => {
      if (linhas.some((l) => l.exercicio_id === ex.id)) return false;
      if (buscaPicker.trim() && !ex.nome.toLowerCase().includes(buscaPicker.trim().toLowerCase())) return false;
      if (filtroPadraoPicker && ex.padrao_id !== filtroPadraoPicker) return false;
      if (filtroMusculoPicker && !ex.musculos.some((m) => m.musculo_id === filtroMusculoPicker)) return false;
      return true;
    }),
  );

  let adicionandoId = $state<string | null>(null);

  async function construirLinha(ex: Exercicio): Promise<Linha> {
    const anterior = await getAnteriorCached(ex.id);
    const series: LinhaSerie[] = Array.from({ length: 3 }, (_, i) => {
      const ant = anterior.find((a) => a.serie === i + 1);
      return {
        serie: i + 1,
        peso_alvo: ant?.peso ?? null,
        rep_min: ant?.repeticoes ?? null,
        rep_max: ant?.repeticoes ?? null,
      };
    });
    return {
      exercicio_id: ex.id,
      nome: ex.nome,
      descanso_seg: ex.descanso_padrao_seg ?? 180,
      observacao: null,
      series,
    };
  }

  async function adicionarRapido(ex: Exercicio) {
    adicionandoId = ex.id;
    try {
      const novaLinha = await construirLinha(ex);
      linhas = [...linhas, novaLinha];
    } finally {
      adicionandoId = null;
    }
  }

  function remover(idx: number) {
    linhas = linhas.filter((_, i) => i !== idx);
  }

  async function adicionarSerie(idx: number) {
    const linha = linhas[idx];
    const anterior = await getAnteriorCached(linha.exercicio_id);
    const proxSerie = linha.series.length + 1;
    const ant = anterior.find((a) => a.serie === proxSerie);
    linha.series = [
      ...linha.series,
      {
        serie: proxSerie,
        peso_alvo: ant?.peso ?? null,
        rep_min: ant?.repeticoes ?? null,
        rep_max: ant?.repeticoes ?? null,
      },
    ];
  }

  function removerSerie(idx: number, setIdx: number) {
    const linha = linhas[idx];
    linha.series = linha.series.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, serie: i + 1 }));
  }

  let menuExercicioAberto = $state<number | null>(null);
  let menuSerieAberto = $state<{ idx: number; setIdx: number } | null>(null);
  let mostrarConfirmCancelar = $state(false);
  let descansoEditandoIdx = $state<number | null>(null);
  let reordenando = $state(false);
  let arrastandoIdx = $state<number | null>(null);
  let itemRefs: (HTMLElement | null)[] = [];

  function toggleMenuSerie(idx: number, setIdx: number) {
    menuSerieAberto =
      menuSerieAberto?.idx === idx && menuSerieAberto?.setIdx === setIdx ? null : { idx, setIdx };
  }

  function iniciarArraste(e: PointerEvent, idx: number) {
    arrastandoIdx = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moverDurante(e: PointerEvent) {
    if (arrastandoIdx === null) return;
    const y = e.clientY;
    for (let i = 0; i < itemRefs.length; i++) {
      const el = itemRefs[i];
      if (!el || i === arrastandoIdx) continue;
      const rect = el.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if ((i < arrastandoIdx && y < meio) || (i > arrastandoIdx && y > meio)) {
        const novas = linhas.slice();
        const [item] = novas.splice(arrastandoIdx, 1);
        novas.splice(i, 0, item);
        linhas = novas;
        arrastandoIdx = i;
        break;
      }
    }
  }

  function finalizarArraste() {
    arrastandoIdx = null;
  }

  $effect(() => {
    if (arrastandoIdx === null) return;
    window.addEventListener("pointermove", moverDurante);
    window.addEventListener("pointerup", finalizarArraste);
    return () => {
      window.removeEventListener("pointermove", moverDurante);
      window.removeEventListener("pointerup", finalizarArraste);
    };
  });

  async function salvar() {
    if (!nomeTreino.trim()) {
      alert("Informe o nome da rotina.");
      return;
    }
    salvando = true;
    try {
      const id = treinoId ?? (await createTreino(nomeTreino.trim(), diaSemana));
      if (treinoId) await renameTreino(treinoId, nomeTreino.trim(), diaSemana);
      await salvarExerciciosRotina(
        id,
        linhas.map((l) => ({
          exercicio_id: l.exercicio_id,
          descanso_seg: l.descanso_seg,
          observacao: l.observacao,
          series: l.series,
        })),
      );
      rotinaEditorSessao.limpar();
      window.history.back();
    } catch (e) {
      alert("Erro ao salvar: " + (e as Error).message);
    } finally {
      salvando = false;
    }
  }
</script>

{#snippet iconVoltar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
{/snippet}
{#snippet iconMais()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
{/snippet}
{#snippet iconReordenar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 7l-4 4 4 4M16 7l4 4-4 4" />
    <path d="M4 11h16" />
  </svg>
{/snippet}
{#snippet iconRemoverExercicio()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}
{#snippet iconRemoverSerie()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="header">
    <button class="cancelar" onclick={aoClicarCancelar}>Cancelar</button>
    <h1>{treinoId ? "Editar rotina" : "Nova rotina"}</h1>
    <button class="atualizar" disabled={salvando} onclick={salvar}>{treinoId ? "Atualizar" : "Criar"}</button>
  </div>

  {#if loading}
    <p class="muted">Carregando…</p>
  {:else if erroCarregar}
    <p class="erro">Erro ao carregar: {erroCarregar}</p>
  {:else}
    <div class="nome-linha">
      <input class="nome-input" type="text" placeholder="Nome da rotina (ex: Upper A)" bind:value={nomeTreino} />
      <button class="dia-select" onclick={() => (mostrarDiaPicker = true)}>
        {diaSemana != null ? DIAS_SEMANA_ABREV[diaSemana] : "—"}
      </button>
    </div>

    {#each linhas as linha, idx (linha.exercicio_id)}
      <div class="linha-card">
        <div class="linha-header">
          <button class="nome" onclick={() => navigate(`/treino/exercicios/${linha.exercicio_id}`)}>
            {linha.nome}
          </button>
          <button class="menu-btn" onclick={() => (menuExercicioAberto = idx)} aria-label="Mais opções">⋮</button>
        </div>
        <input
          class="observacao-input"
          type="text"
          placeholder="Adicionar notas de rotina aqui"
          bind:value={linha.observacao}
        />
        <button class="descanso-select" onclick={() => (descansoEditandoIdx = idx)}>
          ⏱ Descanso: {linha.descanso_seg != null ? formatMinSeg(linha.descanso_seg) : "Desativado"}
        </button>

        <div class="series-tabela">
          <div class="series-cabecalho">
            <span>Série</span>
            <span>Kg</span>
            <span>Intervalo de repetição</span>
          </div>
          {#each linha.series as serie, setIdx (serie.serie)}
            <div class="series-linha">
              <button class="serie-num" onclick={() => toggleMenuSerie(idx, setIdx)}>{serie.serie}</button>
              <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.peso_alvo} />
              <div class="rep-range">
                <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.rep_min} />
                <span>a</span>
                <input type="number" inputmode="decimal" placeholder="-" bind:value={serie.rep_max} />
              </div>
            </div>
          {/each}
        </div>
        <button class="add-serie" onclick={() => adicionarSerie(idx)}>+ Adicionar Série</button>
      </div>
    {/each}

    {#if !linhas.length}
      <p class="muted">Nenhum exercício adicionado ainda.</p>
    {/if}

    <button class="adicionar-btn" onclick={() => (mostrarPicker = true)}>+ Adicionar Exercício</button>
  {/if}
</div>

{#if menuExercicioAberto !== null}
  {@const idxMenu = menuExercicioAberto}
  <ActionSheet
    titulo={linhas[idxMenu]?.nome}
    onFechar={() => (menuExercicioAberto = null)}
    opcoes={[
      { label: "Reordenar Exercícios", icon: iconReordenar, onSelect: () => (reordenando = true) },
      { label: "Remover Exercício", icon: iconRemoverExercicio, destructive: true, onSelect: () => remover(idxMenu) },
    ]}
  />
{/if}

{#if menuSerieAberto !== null}
  {@const { idx: idxSerie, setIdx: setIdxSerie } = menuSerieAberto}
  <ActionSheet
    titulo={`Série ${linhas[idxSerie]?.series[setIdxSerie]?.serie ?? ""}`}
    onFechar={() => (menuSerieAberto = null)}
    opcoes={[
      { label: "Remover Série", icon: iconRemoverSerie, destructive: true, onSelect: () => removerSerie(idxSerie, setIdxSerie) },
    ]}
  />
{/if}

{#if mostrarConfirmCancelar}
  <ConfirmDialog
    titulo="Tem certeza de que quer descartar todas as alterações à rotina?"
    textoConfirmar="Descartar alterações"
    onConfirmar={() => {
      rotinaEditorSessao.limpar();
      window.history.back();
    }}
    onCancelar={() => (mostrarConfirmCancelar = false)}
  />
{/if}

{#if mostrarDiaPicker}
  <WheelPicker
    titulo="Dia da Semana"
    opcoes={opcoesDia}
    valorAtual={diaSemana}
    onSelecionar={(v) => (diaSemana = v)}
    onFechar={() => (mostrarDiaPicker = false)}
  />
{/if}

{#if descansoEditandoIdx !== null}
  {@const idxDescanso = descansoEditandoIdx}
  <DescansoPicker
    nomeExercicio={linhas[idxDescanso]?.nome ?? ""}
    valorAtual={linhas[idxDescanso]?.descanso_seg ?? null}
    onSelecionar={(seg) => (linhas[idxDescanso].descanso_seg = seg)}
    onFechar={() => (descansoEditandoIdx = null)}
  />
{/if}

{#if mostrarPicker}
  <div class="tela-picker">
    <div class="tela-picker-conteudo">
      <div class="header">
        <button
          class="back"
          onclick={() => {
            mostrarPicker = false;
            buscaPicker = "";
            filtroPadraoPicker = "";
            filtroMusculoPicker = "";
          }}
          aria-label="Cancelar"
        >
          {@render iconVoltar()}
        </button>
        <h1>Adicionar Exercício</h1>
        <button class="criar" onclick={() => navigate("/treino/exercicios/novo")}>Criar</button>
      </div>
      <input class="search" type="text" placeholder="Procurar exercício" bind:value={buscaPicker} />
      <div class="filters">
        <select bind:value={filtroPadraoPicker}>
          <option value="">Todo padrão</option>
          {#each padroes as p (p.id)}
            <option value={p.id}>{p.nome}</option>
          {/each}
        </select>
        <select bind:value={filtroMusculoPicker}>
          <option value="">Todos os músculos</option>
          {#each musculos as m (m.id)}
            <option value={m.id}>{m.nome}</option>
          {/each}
        </select>
      </div>
      <ul class="picker-lista">
        {#each disponiveis as ex (ex.id)}
          <li class="picker-item">
            <span class="avatar">{iniciais(ex.nome)}</span>
            <span class="info">
              <span class="nome">{ex.nome}</span>
              <span class="sub">{subtitulo(ex)}</span>
            </span>
            <button class="add-btn" onclick={() => adicionarRapido(ex)} disabled={adicionandoId === ex.id} aria-label={`Adicionar ${ex.nome}`}>
              {#if adicionandoId === ex.id}…{:else}{@render iconMais()}{/if}
            </button>
          </li>
        {/each}
        {#if !disponiveis.length}
          <li class="muted-item">Nenhum exercício encontrado.</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}

{#if reordenando}
  <div class="tela-reordenar">
    <div class="tela-picker-conteudo">
      <div class="header">
        <button class="voltar-icon" onclick={() => (reordenando = false)} aria-label="Voltar">←</button>
        <h1>Reordenar</h1>
        <span class="header-spacer"></span>
      </div>
      <div class="reordenar-lista">
        {#each linhas as linha, idx (linha.exercicio_id)}
          <div
            class="reordenar-item"
            class:arrastando={arrastandoIdx === idx}
            bind:this={itemRefs[idx]}
          >
            <button class="remover-circulo" onclick={() => remover(idx)} aria-label="Remover">−</button>
            <span class="reordenar-nome">{linha.nome}</span>
            <button
              class="handle-arraste"
              onpointerdown={(e) => iniciarArraste(e, idx)}
              aria-label="Arrastar para reordenar"
            >
              ☰
            </button>
          </div>
        {/each}
      </div>
      <button class="feito-btn" onclick={() => (reordenando = false)}>Feito</button>
    </div>
  </div>
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
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-base);
    margin: 0;
    text-align: center;
  }
  .cancelar,
  .atualizar {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
    flex-shrink: 0;
  }
  .nome-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-4);
  }
  .nome-linha {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .nome-linha .nome-input {
    flex: 1;
    margin-bottom: 0;
  }
  .dia-select {
    flex-shrink: 0;
    width: 64px;
    box-sizing: border-box;
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    text-align: center;
  }
  .linha-card {
    padding: var(--space-3) 0;
    margin-bottom: var(--space-4);
  }
  .linha-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }
  .linha-header .nome {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-base);
    font-family: inherit;
    font-weight: 600;
    color: var(--color-primary);
    cursor: pointer;
  }
  .menu-btn {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .observacao-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: none;
    border: none;
    padding: 0;
    margin: 0 0 var(--space-2);
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
    font-family: inherit;
  }
  .observacao-input::placeholder {
    color: var(--surface-muted);
  }
  .descanso-select {
    display: block;
    background: none;
    border: none;
    padding: 0;
    margin: 0 0 var(--space-3);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
  }
  .series-tabela {
    display: flex;
    flex-direction: column;
  }
  .series-cabecalho {
    display: grid;
    grid-template-columns: 32px 1fr 1.4fr;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--surface-muted);
    text-transform: uppercase;
    padding-bottom: var(--space-1);
  }
  .series-linha {
    display: grid;
    grid-template-columns: 36px 1fr 1.4fr;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
  }
  .serie-num {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: var(--surface-card);
    border: none;
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .series-linha input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2);
    border-radius: 6px;
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .rep-range {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .rep-range span {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .add-serie {
    width: 100%;
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .adicionar-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .tela-picker,
  .tela-reordenar {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    z-index: 150;
    overflow: hidden;
  }
  .tela-picker-conteudo {
    max-width: 480px;
    height: 100%;
    margin: 0 auto;
    padding: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .tela-picker .header,
  .tela-reordenar .header {
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }
  .header-spacer {
    width: 56px;
    flex-shrink: 0;
  }
  .voltar-icon {
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: var(--space-1);
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
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    margin-bottom: var(--space-3);
    flex-shrink: 0;
  }
  .filters {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }
  .filters select {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-sm);
  }
  .picker-lista {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }
  .picker-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
  }
  .picker-item .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-border);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .picker-item .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .picker-item .nome {
    font-size: var(--font-size-base);
    color: var(--surface-fg);
  }
  .picker-item .sub {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .add-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .add-btn svg {
    width: 16px;
    height: 16px;
  }
  .add-btn:disabled {
    opacity: 0.6;
  }
  .muted-item {
    color: var(--surface-muted);
    padding: var(--space-2);
    font-size: var(--font-size-sm);
  }
  .reordenar-lista {
    overflow-y: auto;
    flex: 1;
  }
  .reordenar-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
    touch-action: none;
  }
  .reordenar-item.arrastando {
    background: var(--surface-card);
    opacity: 0.8;
  }
  .remover-circulo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    border: none;
    background: var(--color-danger);
    color: #fff;
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .reordenar-nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .handle-arraste {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--surface-muted);
    font-size: var(--font-size-lg);
    cursor: grab;
    touch-action: none;
    padding: var(--space-2);
  }
  .feito-btn {
    flex-shrink: 0;
    margin-top: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-fg);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
</style>
