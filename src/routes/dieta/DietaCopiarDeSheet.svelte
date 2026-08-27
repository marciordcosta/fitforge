<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import WheelColuna from "../../components/WheelColuna.svelte";
  import { hojeISO, somarDias, parseISODate } from "../../lib/dates";
  import { getRefeicoesDoDia, getItensDaRefeicao, copiarItensEntreRefeicoes, copiarItemEntreRefeicoes } from "../../lib/dietaApi";

  let {
    refeicaoDestinoId,
    onFechar,
    onCopiado,
  }: {
    refeicaoDestinoId: string;
    onFechar: () => void;
    onCopiado: () => void;
  } = $props();

  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  const hoje = untrack(() => hojeISO());
  const ontem = somarDias(hoje, -1);
  const anteontem = somarDias(hoje, -2);

  const opcoesDia = [
    { valor: hoje, label: "Hoje" },
    { valor: ontem, label: "Ontem" },
    { valor: anteontem, label: DIAS_SEMANA[parseISODate(anteontem).getDay()] },
  ];

  let diaSelecionado = $state(hoje);
  let opcoesRefeicao = $state<{ valor: string; label: string }[]>([]);
  let refeicaoSelecionada = $state("");
  let opcoesAlimento = $state<{ valor: string; label: string }[]>([]);
  let alimentoSelecionado = $state("");
  let salvando = $state(false);
  let carregandoRefeicao = $state(false);
  let carregandoAlimento = $state(false);

  async function carregarAlimentos(refeicaoId: string) {
    if (!refeicaoId) {
      opcoesAlimento = [];
      alimentoSelecionado = "";
      return;
    }
    carregandoAlimento = true;
    opcoesAlimento = [];
    try {
      const itens = await getItensDaRefeicao(refeicaoId);
      opcoesAlimento = [{ valor: "TUDO", label: "Tudo" }, ...itens.map((it) => ({ valor: it.id, label: it.nome }))];
      alimentoSelecionado = "TUDO";
    } finally {
      carregandoAlimento = false;
    }
  }

  async function carregarRefeicoes(dia: string) {
    carregandoRefeicao = true;
    opcoesRefeicao = [];
    refeicaoSelecionada = "";
    try {
      const todas = await getRefeicoesDoDia(dia);
      opcoesRefeicao = todas.filter((r) => r.id !== refeicaoDestinoId).map((r) => ({ valor: r.id, label: r.nome }));
      refeicaoSelecionada = opcoesRefeicao[0]?.valor ?? "";
    } finally {
      carregandoRefeicao = false;
    }
    await carregarAlimentos(refeicaoSelecionada);
  }

  void carregarRefeicoes(untrack(() => diaSelecionado));

  function aoMudarDia(valor: string) {
    diaSelecionado = valor;
    void carregarRefeicoes(valor);
  }

  function aoMudarRefeicao(valor: string) {
    refeicaoSelecionada = valor;
    void carregarAlimentos(valor);
  }

  function aoMudarAlimento(valor: string) {
    alimentoSelecionado = valor;
  }

  async function copiar() {
    if (!refeicaoSelecionada) return;
    salvando = true;
    try {
      if (alimentoSelecionado === "TUDO") {
        await copiarItensEntreRefeicoes(refeicaoSelecionada, refeicaoDestinoId);
      } else {
        await copiarItemEntreRefeicoes(alimentoSelecionado, refeicaoDestinoId);
      }
      onCopiado();
    } catch (err) {
      alert("Erro ao copiar: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Copiar de" {onFechar}>
  <div class="colunas">
    <div class="coluna">
      <p class="coluna-titulo">Dia</p>
      <WheelColuna opcoes={opcoesDia} valorAtual={diaSelecionado} onMudar={aoMudarDia} />
    </div>
    <div class="coluna">
      <p class="coluna-titulo">Refeição</p>
      <WheelColuna
        opcoes={opcoesRefeicao}
        valorAtual={refeicaoSelecionada}
        onMudar={aoMudarRefeicao}
        vazio={carregandoRefeicao ? "Carregando…" : "Nenhuma outra refeição nesse dia"}
      />
    </div>
    <div class="coluna">
      <p class="coluna-titulo">Alimento</p>
      <WheelColuna
        opcoes={opcoesAlimento}
        valorAtual={alimentoSelecionado}
        onMudar={aoMudarAlimento}
        vazio={carregandoAlimento ? "Carregando…" : "Refeição vazia"}
      />
    </div>
  </div>
  <Button onclick={copiar} disabled={salvando || !refeicaoSelecionada}>Copiar</Button>
</Sheet>

<style>
  .colunas {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .coluna {
    flex: 1;
    min-width: 0;
  }
  .coluna-titulo {
    margin: 0 0 var(--space-1);
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--surface-muted);
  }
</style>
