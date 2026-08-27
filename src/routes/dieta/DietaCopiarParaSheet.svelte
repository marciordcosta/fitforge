<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import WheelColuna from "../../components/WheelColuna.svelte";
  import { hojeISO, somarDias, parseISODate } from "../../lib/dates";
  import {
    listRefeicoesModelo,
    getItensDaRefeicao,
    encontrarOuCriarRefeicaoDia,
    copiarItensEntreRefeicoes,
    copiarItemEntreRefeicoes,
  } from "../../lib/dietaApi";

  let {
    refeicaoOrigemId,
    nomeAtual,
    onFechar,
    onCopiado,
  }: {
    refeicaoOrigemId: string;
    nomeAtual: string;
    onFechar: () => void;
    onCopiado: (destinoId: string) => void;
  } = $props();

  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  const hoje = untrack(() => hojeISO());
  const amanha = somarDias(hoje, 1);
  const depoisDeAmanha = somarDias(hoje, 2);

  const opcoesDia = [
    { valor: hoje, label: "Hoje" },
    { valor: amanha, label: "Amanhã" },
    { valor: depoisDeAmanha, label: DIAS_SEMANA[parseISODate(depoisDeAmanha).getDay()] },
  ];

  let diaSelecionado = $state(hoje);
  let opcoesRefeicao = $state<{ valor: string; label: string }[]>([]);
  let refeicaoSelecionada = $state(untrack(() => nomeAtual));
  let opcoesAlimento = $state<{ valor: string; label: string }[]>([]);
  let alimentoSelecionado = $state("TUDO");
  let salvando = $state(false);

  async function carregar() {
    const [modelos, itens] = await Promise.all([listRefeicoesModelo(), getItensDaRefeicao(refeicaoOrigemId)]);
    opcoesRefeicao = modelos.map((m) => ({ valor: m.nome, label: m.nome }));
    if (!opcoesRefeicao.some((o) => o.valor === refeicaoSelecionada)) {
      refeicaoSelecionada = opcoesRefeicao[0]?.valor ?? nomeAtual;
    }
    opcoesAlimento = [{ valor: "TUDO", label: "Tudo" }, ...itens.map((it) => ({ valor: it.id, label: it.nome }))];
  }

  void carregar();

  function aoMudarDia(valor: string) {
    diaSelecionado = valor;
  }

  function aoMudarRefeicao(valor: string) {
    refeicaoSelecionada = valor;
  }

  function aoMudarAlimento(valor: string) {
    alimentoSelecionado = valor;
  }

  async function copiar() {
    if (!refeicaoSelecionada.trim() || !diaSelecionado) return;
    salvando = true;
    try {
      const destinoId = await encontrarOuCriarRefeicaoDia(diaSelecionado, refeicaoSelecionada.trim());
      if (alimentoSelecionado === "TUDO") {
        await copiarItensEntreRefeicoes(refeicaoOrigemId, destinoId);
      } else {
        await copiarItemEntreRefeicoes(alimentoSelecionado, destinoId);
      }
      onCopiado(destinoId);
    } catch (err) {
      alert("Erro ao copiar: " + (err as Error).message);
      salvando = false;
    }
  }
</script>

<Sheet titulo="Copiar para" {onFechar}>
  <div class="colunas">
    <div class="coluna">
      <p class="coluna-titulo">Dia</p>
      <WheelColuna opcoes={opcoesDia} valorAtual={diaSelecionado} onMudar={aoMudarDia} />
    </div>
    <div class="coluna">
      <p class="coluna-titulo">Refeição</p>
      <WheelColuna opcoes={opcoesRefeicao} valorAtual={refeicaoSelecionada} onMudar={aoMudarRefeicao} vazio="Nenhuma refeição cadastrada" />
    </div>
    <div class="coluna">
      <p class="coluna-titulo">Alimento</p>
      <WheelColuna opcoes={opcoesAlimento} valorAtual={alimentoSelecionado} onMudar={aoMudarAlimento} vazio="Refeição vazia" />
    </div>
  </div>
  <Button onclick={copiar} disabled={salvando || !refeicaoSelecionada.trim()}>Copiar</Button>
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
