<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { toISODate, parseISODate } from "../../lib/dates";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import Sheet from "../../components/Sheet.svelte";
  import PieChart from "../../components/PieChart.svelte";
  import {
    listMusculos,
    listTreinos,
    getVolumeRealizadoBruto,
    DIAS_SEMANA_ABREV,
    type Musculo,
    type TreinoComExercicios,
  } from "../../lib/treinoApi";

  let aba = $state<"planejado" | "realizado">("planejado");
  let musculos = $state<Musculo[]>([]);
  let treinos = $state<TreinoComExercicios[]>([]);

  let mesBase = $state(new Date());
  let linhasRealizadoMes = $state<{ data: string; musculo_id: string; series_equivalentes: number }[]>([]);
  let carregandoRealizado = $state(false);

  async function carregarBase() {
    [musculos, treinos] = await Promise.all([listMusculos(), listTreinos()]);
    await carregarRealizado();
  }

  void carregarBase();

  /** 1 série conta 1 para cada músculo trabalhado no exercício, sem ponderar por papel/peso (visão da sessão, não semanal). */
  function contarSeriesPorMusculo(treino: TreinoComExercicios): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const ex of treino.exercicios) {
      const numSeries = ex.series.length;
      if (!numSeries) continue;
      for (const m of ex.exercicio?.musculos ?? []) {
        mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries);
      }
    }
    return mapa;
  }

  const distribuicaoPorTreino = $derived.by(() => {
    return treinos.map((t) => {
      const mapa = contarSeriesPorMusculo(t);
      const lista = musculos
        .map((m) => ({ musculo: m, valor: mapa.get(m.id) ?? 0 }))
        .filter((item) => item.valor > 0)
        .sort((a, b) => b.valor - a.valor);
      return { treino: t, lista };
    });
  });

  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

  let mostrarGradeSemanal = $state(false);
  /** null = mostra todos os músculos; caso contrário, restringe a grade a esses ids (série clicada ou rotina do card). */
  let filtroMusculosGrade = $state<Set<string> | null>(null);

  function abrirGradeSemanal(musculoIds: string[] | null): void {
    filtroMusculosGrade = musculoIds ? new Set(musculoIds) : null;
    mostrarGradeSemanal = true;
  }

  /** Grade semanal: uma coluna por dia (seg→dom), com a rotina daquele dia (ou descanso) e as séries por músculo. */
  const gradeSemanal = $derived.by(() => {
    const colunas = ORDEM_DIAS.map((dia) => {
      const treino = treinos.find((t) => t.dia_semana === dia) ?? null;
      return { dia, treinoNome: treino?.nome_treino ?? null, mapa: treino ? contarSeriesPorMusculo(treino) : new Map<string, number>() };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [musculoId, valor] of col.mapa) {
        totais.set(musculoId, (totais.get(musculoId) ?? 0) + valor);
      }
    }

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => (totais.get(b.id) ?? 0) - (totais.get(a.id) ?? 0))
      .map((m) => ({ musculo: m, valores: colunas.map((col) => col.mapa.get(m.id) ?? 0) }));

    return { colunas, linhas };
  });

  /** Distribuição semanal (todas as rotinas somadas), ponderada pelo peso de contribuição parametrizado de cada músculo. */
  const distribuicaoSemanal = $derived.by(() => {
    const mapa = new Map<string, number>();
    for (const t of treinos) {
      for (const ex of t.exercicios) {
        const numSeries = ex.series.length;
        if (!numSeries) continue;
        for (const m of ex.exercicio?.musculos ?? []) {
          mapa.set(m.musculo_id, (mapa.get(m.musculo_id) ?? 0) + numSeries * m.peso_contribuicao);
        }
      }
    }
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round(mapa.get(m.id) ?? 0) }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const mesInicio = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth(), 1));
  const mesFim = $derived(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0));
  const mesLabel = $derived(`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`);

  async function carregarRealizado() {
    carregandoRealizado = true;
    linhasRealizadoMes = await getVolumeRealizadoBruto(toISODate(mesInicio), toISODate(mesFim));
    carregandoRealizado = false;
  }

  function trocarMes(delta: number) {
    mesBase = new Date(mesBase.getFullYear(), mesBase.getMonth() + delta, 1);
    void carregarRealizado();
  }

  function corVolume(v: number): string {
    if (v > 10) return "var(--color-negative)";
    if (v >= 5) return "var(--color-success)";
    return "var(--color-neutral)";
  }

  /** Nomes com 2+ palavras abreviam cada uma (ex: "Deltoide Anterior" -> "Delt. Ant."), pra caber na coluna estreita da grade. */
  function abreviarMusculo(nome: string): string {
    const partes = nome.split(" ");
    if (partes.length < 2) return nome;
    return partes.map((p) => (p.length > 4 ? `${p.slice(0, 4)}.` : p)).join(" ");
  }

  const SEMANAS_MES = [
    { label: "Semana 1", subtitulo: "01–07", diaIni: 1, diaFim: 7 },
    { label: "Semana 2", subtitulo: "08–14", diaIni: 8, diaFim: 14 },
    { label: "Semana 3", subtitulo: "15–21", diaIni: 15, diaFim: 21 },
    { label: "Semana 4", subtitulo: "22–fim", diaIni: 22, diaFim: 31 },
  ];

  /** Quantas das 4 semanas do mês tiveram ao menos um treino registrado (base pra calcular a média semanal). */
  const semanasComTreino = $derived.by(() => {
    return SEMANAS_MES.filter((sem) =>
      linhasRealizadoMes.some((l) => {
        const dia = parseISODate(l.data).getDate();
        return dia >= sem.diaIni && dia <= sem.diaFim;
      }),
    ).length;
  });

  /** Distribuição realizada no mês: média semanal (soma do mês ÷ semanas com treino), com o peso de contribuição parametrizado. */
  const listaRealizado = $derived.by(() => {
    const divisor = Math.max(semanasComTreino, 1);
    const mapa = new Map<string, number>();
    for (const l of linhasRealizadoMes) {
      mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
    }
    return musculos
      .map((m) => ({ musculo: m, valor: Math.round((mapa.get(m.id) ?? 0) / divisor) }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  });

  let mostrarGradeRealizado = $state(false);

  /** Grade do mês: uma coluna por semana (1 a 4), com as séries válidas realizadas por músculo. */
  const gradeRealizado = $derived.by(() => {
    const colunas = SEMANAS_MES.map((sem) => {
      const mapa = new Map<string, number>();
      for (const l of linhasRealizadoMes) {
        const dia = parseISODate(l.data).getDate();
        if (dia >= sem.diaIni && dia <= sem.diaFim) {
          mapa.set(l.musculo_id, (mapa.get(l.musculo_id) ?? 0) + Number(l.series_equivalentes));
        }
      }
      return { label: sem.label, subtitulo: sem.subtitulo, mapa };
    });

    const totais = new Map<string, number>();
    for (const col of colunas) {
      for (const [id, v] of col.mapa) totais.set(id, (totais.get(id) ?? 0) + v);
    }

    const linhas = musculos
      .filter((m) => (totais.get(m.id) ?? 0) > 0)
      .filter((m) => filtroMusculosGrade === null || filtroMusculosGrade.has(m.id))
      .sort((a, b) => (totais.get(b.id) ?? 0) - (totais.get(a.id) ?? 0))
      .map((m) => ({ musculo: m, valores: colunas.map((c) => Math.round(c.mapa.get(m.id) ?? 0)) }));

    return { colunas, linhas };
  });

  function abrirMenuRealizado(): void {
    modalAberto = {
      titulo: "Realizado",
      opcoes: [
        { label: "Mês", onSelect: () => (mostrarGradeRealizado = true) },
        { label: "Gráfico", onSelect: () => abrirDetalheRotina(mesLabel, listaRealizado, null) },
      ],
    };
  }

  // ---------------- Modal: exercícios/rotinas que trabalham um músculo ----------------

  let modalAberto = $state<{ titulo: string; opcoes: { label: string; subtitulo?: string; onSelect: () => void }[] } | null>(null);

  /** Um item por (rotina, exercício) — o mesmo exercício pode aparecer em rotinas diferentes. */
  function exerciciosDoMusculo(
    lista: TreinoComExercicios[],
    musculoId: string,
  ): { exercicioNome: string; treinoId: string; treinoNome: string }[] {
    const resultado: { exercicioNome: string; treinoId: string; treinoNome: string }[] = [];
    for (const t of lista) {
      for (const ex of t.exercicios) {
        if (!ex.exercicio) continue;
        if (ex.exercicio.musculos.some((m) => m.musculo_id === musculoId)) {
          resultado.push({ exercicioNome: ex.exercicio.nome, treinoId: t.id, treinoNome: t.nome_treino });
        }
      }
    }
    return resultado;
  }

  function abrirExercicios(lista: TreinoComExercicios[], musculo: Musculo): void {
    modalAberto = {
      titulo: musculo.nome,
      opcoes: exerciciosDoMusculo(lista, musculo.id).map((e) => ({
        label: e.exercicioNome,
        subtitulo: e.treinoNome,
        onSelect: () => navigate(`/treino/rotina/${e.treinoId}`),
      })),
    };
  }

  function abrirMenuSemanal(): void {
    modalAberto = {
      titulo: "Distribuição Semanal",
      opcoes: [
        { label: "Semana", onSelect: () => abrirGradeSemanal(null) },
        { label: "Gráfico", onSelect: () => abrirDetalheRotina("Distribuição Semanal", distribuicaoSemanal, treinos) },
      ],
    };
  }

  // ---------------- Modal: gráfico de pizza da distribuição de uma rotina ----------------

  interface ItemDetalheRotina {
    musculo: Musculo;
    valor: number;
    detalhe: { exercicio: string; series: number }[] | null;
  }

  let modalDetalheRotina = $state<{ titulo: string; itens: ItemDetalheRotina[] } | null>(null);

  /** Quantas séries cada exercício contribui pra esse músculo, dentro do escopo de rotinas informado. */
  function detalhePorMusculo(lista: TreinoComExercicios[], musculoId: string): { exercicio: string; series: number }[] {
    const mapa = new Map<string, number>();
    for (const t of lista) {
      for (const ex of t.exercicios) {
        if (!ex.exercicio) continue;
        if (ex.exercicio.musculos.some((m) => m.musculo_id === musculoId)) {
          mapa.set(ex.exercicio.nome, (mapa.get(ex.exercicio.nome) ?? 0) + ex.series.length);
        }
      }
    }
    return Array.from(mapa, ([exercicio, series]) => ({ exercicio, series }));
  }

  function abrirDetalheRotina(
    titulo: string,
    itens: { musculo: Musculo; valor: number }[],
    escopo: TreinoComExercicios[] | null,
  ): void {
    modalDetalheRotina = {
      titulo,
      itens: itens.map((item) => ({
        ...item,
        detalhe: escopo ? detalhePorMusculo(escopo, item.musculo.id) : null,
      })),
    };
  }
</script>

<div class="container has-bottom-nav">
  <div class="header">
    <button class="back" onclick={() => navigate("/treino")} aria-label="Voltar">←</button>
    <h1>Distribuição Muscular</h1>
    <span class="spacer"></span>
  </div>

  <div class="tabs">
    <button class:active={aba === "planejado"} onclick={() => (aba = "planejado")}>Planejado</button>
    <button class:active={aba === "realizado"} onclick={() => (aba = "realizado")}>Realizado</button>
  </div>

  {#if aba === "planejado"}
    {#if !treinos.length}
      <p class="muted">Nenhuma rotina cadastrada ainda.</p>
    {:else}
      <div class="lista-rotinas">
        <div class="rotina-card">
          <div class="rotina-cabecalho">
            <h2 class="rotina-nome">Distribuição Semanal</h2>
            <button class="icon-btn" onclick={() => abrirMenuSemanal()} aria-label="Mais opções">⋮</button>
          </div>
          {#if !distribuicaoSemanal.length}
            <p class="muted">Nenhum volume planejado ainda.</p>
          {:else}
            <div class="lista">
              {#each distribuicaoSemanal as item (item.musculo.id)}
                <div class="item">
                  <button class="nome-btn" onclick={() => abrirExercicios(treinos, item.musculo)}>{item.musculo.nome}</button>
                  <div class="barra-wrap">
                    <div class="barra" style={`width: ${Math.min(item.valor * 8, 100)}%; background: ${corVolume(item.valor)};`}></div>
                  </div>
                  <button class="valor-btn" style={`color: ${corVolume(item.valor)};`} onclick={() => abrirGradeSemanal([item.musculo.id])}>{item.valor}</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#each distribuicaoPorTreino as { treino, lista } (treino.id)}
          <div
            class="rotina-card"
            class:clicavel={lista.length > 0}
            role="button"
            tabindex={0}
            onclick={() => lista.length && abrirDetalheRotina(treino.nome_treino, lista, [treino])}
            onkeydown={(e) => lista.length && e.key === "Enter" && abrirDetalheRotina(treino.nome_treino, lista, [treino])}
          >
            <div class="rotina-cabecalho">
              <h2 class="rotina-nome">{treino.nome_treino}</h2>
              {#if treino.dia_semana != null}
                <span class="dia-tag">{DIAS_SEMANA_ABREV[treino.dia_semana]}</span>
              {/if}
            </div>
            {#if !lista.length}
              <p class="muted">Nenhuma série definida ainda.</p>
            {:else}
              <div class="lista">
                {#each lista as item (item.musculo.id)}
                  <div class="item">
                    <span class="nome">{item.musculo.nome}</span>
                    <div class="barra-wrap">
                      <div class="barra" style={`width: ${Math.min(item.valor * 8, 100)}%; background: ${corVolume(item.valor)};`}></div>
                    </div>
                    <span class="valor" style={`color: ${corVolume(item.valor)};`}>{item.valor}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="rotina-totais">
              {treino.exercicios.length} {treino.exercicios.length === 1 ? "exercício" : "exercícios"} · {treino.exercicios.reduce(
                (acc, ex) => acc + ex.series.length,
                0,
              )} séries
            </p>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="semana-nav">
      <button onclick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
      <span>{mesLabel}</span>
      <button onclick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
    </div>

    <div class="rotina-card">
      <div class="rotina-cabecalho">
        <h2 class="rotina-nome">Realizado <span class="dia-tag">(média semanal)</span></h2>
        <button class="icon-btn" onclick={() => abrirMenuRealizado()} aria-label="Mais opções">⋮</button>
      </div>
      {#if carregandoRealizado}
        <p class="muted">Carregando…</p>
      {:else if !listaRealizado.length}
        <p class="muted">Nenhum treino registrado nesse mês.</p>
      {:else}
        <div class="lista">
          {#each listaRealizado as item (item.musculo.id)}
            <div class="item">
              <span class="nome">{item.musculo.nome}</span>
              <div class="barra-wrap">
                <div class="barra" style={`width: ${Math.min(item.valor * 8, 100)}%; background: ${corVolume(item.valor)};`}></div>
              </div>
              <span class="valor" style={`color: ${corVolume(item.valor)};`}>{item.valor}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if modalAberto}
  <ActionSheet titulo={modalAberto.titulo} opcoes={modalAberto.opcoes} onFechar={() => (modalAberto = null)} />
{/if}

{#if mostrarGradeSemanal}
  <Sheet titulo="Distribuição na Semana" onFechar={() => (mostrarGradeSemanal = false)}>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeSemanal.colunas as col (col.dia)}
              <th>
                <div class="grade-dia" class:com-treino={col.treinoNome != null}>{DIAS_SEMANA_ABREV[col.dia]}</div>
                <div class="grade-rotina-nome">{col.treinoNome ?? "💤"}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeSemanal.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                <td class="grade-valor">
                  {#if valor > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                    >{valor}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
{/if}

{#if mostrarGradeRealizado}
  <Sheet titulo={`Realizado em ${mesLabel}`} onFechar={() => (mostrarGradeRealizado = false)}>
    <div class="grade-scroll">
      <table class="grade-tabela">
        <thead>
          <tr>
            <th class="grade-col-musculo"></th>
            {#each gradeRealizado.colunas as col (col.label)}
              <th>
                <div class="grade-dia">{col.label}</div>
                <div class="grade-rotina-nome">{col.subtitulo}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each gradeRealizado.linhas as linha (linha.musculo.id)}
            <tr>
              <td class="grade-col-musculo">{abreviarMusculo(linha.musculo.nome)}</td>
              {#each linha.valores as valor, i (i)}
                <td class="grade-valor">
                  {#if valor > 0}
                    <span
                      class="grade-valor-caixa"
                      style={`color: ${corVolume(valor)}; background: color-mix(in srgb, ${corVolume(valor)} 20%, transparent);`}
                    >{valor}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Sheet>
{/if}

{#if modalDetalheRotina}
  <Sheet titulo={modalDetalheRotina.titulo} onFechar={() => (modalDetalheRotina = null)}>
    <div class="pizza-wrap">
      <PieChart
        dados={modalDetalheRotina.itens.map((i) => ({ nome: i.musculo.nome, valor: i.valor, detalhe: i.detalhe }))}
      />
    </div>
  </Sheet>
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
    margin-bottom: var(--space-4);
  }
  .header h1 {
    flex: 1;
    font-size: var(--font-size-lg);
    margin: 0;
    text-align: center;
  }
  .back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    padding: var(--space-1);
  }
  .spacer {
    width: 24px;
  }
  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .tabs button {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-weight: 600;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--color-primary);
    color: var(--color-primary-fg);
    border-color: var(--color-primary);
  }
  .lista-rotinas {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .rotina-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
  }
  .rotina-card.clicavel {
    cursor: pointer;
  }
  .rotina-cabecalho {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .rotina-cabecalho .rotina-nome {
    flex: 1;
  }
  .rotina-nome {
    font-size: var(--font-size-base);
    margin: 0;
  }
  .dia-tag {
    font-size: 11px;
    color: var(--surface-muted);
  }
  .icon-btn {
    margin-left: auto;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--surface-muted);
    font-size: var(--font-size-base);
    line-height: 1;
    cursor: pointer;
  }
  .semana-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .semana-nav button {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .item {
    display: grid;
    grid-template-columns: 100px 1fr 32px;
    align-items: center;
    gap: var(--space-3);
  }
  .item .nome {
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nome-btn,
  .valor-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .nome-btn {
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .valor-btn {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .barra-wrap {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra {
    height: 100%;
    border-radius: 6px;
  }
  .item .valor {
    text-align: right;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .muted {
    color: var(--surface-muted);
  }
  .rotina-totais {
    margin: var(--space-3) 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--surface-border);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }

  .grade-scroll {
    overflow-x: auto;
    padding-bottom: var(--space-3);
  }
  .grade-tabela {
    border-collapse: collapse;
    width: 100%;
  }
  .grade-tabela th,
  .grade-tabela td {
    padding: var(--space-1);
    text-align: center;
    white-space: nowrap;
  }
  .grade-dia {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-fg);
  }
  .grade-dia.com-treino {
    color: var(--color-primary);
  }
  .grade-rotina-nome {
    font-size: 11px;
    font-weight: 400;
    color: var(--surface-muted);
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-tabela .grade-col-musculo {
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    position: sticky;
    left: 0;
    background: var(--surface-card);
    padding-left: 0;
    max-width: 68px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grade-valor-caixa {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .grade-tabela tbody tr:not(:last-child) td {
    border-bottom: 1px solid var(--surface-border);
  }
  .pizza-wrap {
    width: 100%;
    max-width: 420px;
    aspect-ratio: 1;
    overflow: hidden;
    margin: var(--space-2) auto 0;
  }
</style>
