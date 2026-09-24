<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
  import { parseISODate, toISODate, hojeISO } from "../../lib/dates";
  import Sheet from "../../components/Sheet.svelte";
  import Button from "../../components/Button.svelte";
  import ActionSheet from "../../components/ActionSheet.svelte";
  import ConfirmDialog from "../../components/ConfirmDialog.svelte";
  import DietaRefeicaoDiaFormSheet from "./DietaRefeicaoDiaFormSheet.svelte";
  import DietaResumoModal from "./DietaResumoModal.svelte";
  import DietaListaItens from "./DietaListaItens.svelte";
  import {
    garantirRefeicoesPadraoDoDia,
    getDiarioDoDia,
    getMetasDoDia,
    listRefeicoesModelo,
    listMetasDiaModelo,
    listRefeicoesModeloDia,
    getMetasDoDiaSemana,
    getParametros,
    getPerfilDietaEditavel,
    getStatusAdesaoDieta,
    reordenarRefeicoesDoDia,
    getPreferenciasRefeicoesHome,
    getAcumularCalorias,
    getSaldoCaloricoEntrando,
    getDeltasRefeicaoDoDia,
    salvarDiluicaoSaldo,
    salvarAjusteSaldoCalorico,
    DEFINICOES_PARAMETROS,
    PARAMETROS_PADRAO,
    gramasDoParametro,
    type RefeicaoDia,
    type ItemDiario,
    type MetasDiarias,
    type LimiteParametro,
    type RefeicaoModelo,
    type StatusAdesaoDieta,
    type PreferenciasRefeicoesHome,
    type BaseReferenciaRefeicao,
  } from "../../lib/dietaApi";
  import { mostrarToast } from "../../lib/toast.svelte";
  import { dietaInvalidacao } from "../../lib/dietaInvalidacao.svelte";
  import { listTreinos, type Treino } from "../../lib/treinoApi";
  import { getPesoMedioAtual } from "../../lib/pesoApi";

  const COR_CARBO = "#5eead4";
  const COR_GORDURA = "#f9a8d4";
  const COR_PROTEINA = "#fbbf24";
  const COR_ALERTA = "#f87171";

  const MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  ];
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  let dataAtual = $state(hojeISO());
  let refeicoes = $state<RefeicaoDia[]>([]);
  let itens = $state<ItemDiario[]>([]);
  let metas = $state<MetasDiarias | null>(null);
  let loading = $state(true);
  let carregouAlgumaVez = $state(false);
  let erro = $state<string | null>(null);
  let mostrarCriarRefeicao = $state(false);
  let mostrarMenuMais = $state(false);
  let mostrarData = $state(false);
  type ModoExibicaoMacro = "restante" | "absoluto" | "porPeso";
  let modoExibicao = $state<ModoExibicaoMacro>("restante");
  /** Expande/recolhe a lista de alimentos de TODAS as refeições do dia de uma vez (ícone ao lado
   * do título "Diário") — mesma lista/funcionalidades da tela da refeição (DietaListaItens). */
  let refeicoesExpandidas = $state(false);

  // ---------------- Reordenar refeições do dia (segurar o card) ----------------
  let reordenando = $state(false);
  let refeicoesReordenando = $state<RefeicaoDia[]>([]);
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressAtivouReordenar = false;

  function abrirReordenar(): void {
    refeicoesReordenando = refeicoes.slice();
    reordenando = true;
  }

  function iniciarPressao(): void {
    pressAtivouReordenar = false;
    pressTimer = setTimeout(() => {
      pressAtivouReordenar = true;
      if (navigator.vibrate) navigator.vibrate(15);
      abrirReordenar();
    }, 500);
  }

  function cancelarPressao(): void {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  /** Botão direito no PC — equivalente a segurar o card no celular. */
  function aoClicarComBotaoDireito(e: MouseEvent): void {
    e.preventDefault();
    cancelarPressao();
    abrirReordenar();
  }

  /** Segurar o card abre o modo de reordenar em vez de navegar — sem isso, soltar o dedo depois
   * de segurar também disparava o clique normal, abrindo a refeição por baixo do modo. */
  function aoClicarRefeicao(refeicaoId: string): void {
    if (pressAtivouReordenar) {
      pressAtivouReordenar = false;
      return;
    }
    navigate(`/dieta/refeicao/${refeicaoId}`);
  }

  function moverRefeicao(idx: number, delta: number): void {
    const novoIdx = idx + delta;
    if (novoIdx < 0 || novoIdx >= refeicoesReordenando.length) return;
    const lista = refeicoesReordenando.slice();
    const [item] = lista.splice(idx, 1);
    lista.splice(novoIdx, 0, item);
    refeicoesReordenando = lista;
  }

  /** Fecha e já aplica a nova ordem na tela — a gravação acontece por baixo, sem travar o fechar
   * do sheet; só essa data muda, o catálogo/padrão configurado nunca é tocado. */
  function fecharReordenar(): void {
    reordenando = false;
    const ordemAnterior = refeicoes;
    const idsFinal = refeicoesReordenando.map((r) => r.id);
    refeicoes = refeicoesReordenando;
    void reordenarRefeicoesDoDia(idsFinal)
      .then(() => mostrarToast("Salvo"))
      .catch((err) => {
        refeicoes = ordemAnterior;
        alert("Erro ao reordenar: " + (err as Error).message);
      });
  }

  function proximoModoExibicao(atual: ModoExibicaoMacro): ModoExibicaoMacro {
    if (atual === "restante") return "absoluto";
    if (atual === "absoluto") return "porPeso";
    return "restante";
  }

  /** Consumido por kg de peso corporal — mesma métrica usada em DietaResumoModal.svelte, mas ali
   * pra meta; aqui pro que já foi de fato consumido no dia. */
  function gPorKg(valor: number): string {
    return pesoAtual > 0 ? (valor / pesoAtual).toFixed(1).replace(".", ",") : "—";
  }
  let rotinaHoje = $state<Treino | null>(null);
  let mostrarResumo = $state(false);
  /** Status de aderência à dieta (ritmo real de peso vs. ritmo esperado pela meta) — mesmo chip
   * que antes mostrava "X dias para o objetivo". */
  let statusAdesao = $state<StatusAdesaoDieta | null>(null);
  const TEXTO_STATUS_ADESAO: Record<StatusAdesaoDieta, string> = {
    dentro_do_plano: "Dentro do plano",
    ajustar_calorias: "Ajustar calorias",
    calibrando: "Calibrando…",
  };
  let metasRefeicaoPorNome = $state<Map<string, RefeicaoModelo>>(new Map());
  let parametros = $state<Map<string, LimiteParametro>>(new Map(Object.entries(PARAMETROS_PADRAO)));

  // ---------------- Saldo calórico acumulado (Parametrização > Calorias > Acumular calorias) ----------------

  let acumularAtivo = $state(false);
  /** Quanto ainda falta diluir hoje (kcal) — positivo = sobrou (a favor), negativo = estourou
   * (precisa tirar). 0/não mostrado quando já foi todo diluído ou o dia é o de reinício. */
  let saldoPendente = $state(0);
  let mostrarMenuSaldo = $state(false);
  let mostrarDiluirManual = $state(false);
  let mostrarEditarSaldo = $state(false);
  let mostrarConfirmExcluirSaldo = $state(false);
  let valorEditarSaldo = $state("");
  let salvandoSaldo = $state(false);

  interface ItemDiluicaoManual {
    nome: string;
    /** Delta já aplicado (grama de carboidrato) — editado via o campo em kcal na tela. */
    deltaG: number;
    /** Meta de carboidrato ORIGINAL da refeição (sem delta nenhum) — teto pra não deixar o campo
     * "retirar" passar de 0. */
    metaCarboidratoG: number;
  }
  let itensDiluicaoManual = $state<ItemDiluicaoManual[]>([]);

  const restanteManualKcal = $derived(saldoPendente - itensDiluicaoManual.reduce((acc, i) => acc + i.deltaG * 4, 0));

  function abrirMenuSaldo(): void {
    mostrarMenuSaldo = true;
  }

  /** Refeições elegíveis pra diluição: têm meta configurada e não são a automática (que já absorve
   * sozinha qualquer sobra/falta do total do dia via metasRedistribuidas — um delta atribuído a ela
   * diretamente não teria efeito nenhum no card dela, já que ela nunca lê a própria meta). */
  function refeicoesElegiveisDiluicao(): { nome: string; metaCalorias: number; metaCarboidratoG: number }[] {
    return [...metasRefeicaoPorNome.entries()]
      .filter(([nome, m]) => nome !== refeicaoAutomaticaNome && m.metaCalorias != null)
      .map(([nome, m]) => ({ nome, metaCalorias: m.metaCalorias ?? 0, metaCarboidratoG: m.metaCarboidratoG ?? 0 }));
  }

  /** Cada refeição elegível recebe uma fatia do saldo proporcional ao tamanho (calorias) da própria
   * meta. Retirando (saldo negativo), trava em 0 — o que não coube continua pendente e rola pro dia
   * seguinte sozinho (getSaldoCaloricoEntrando). */
  async function diluirProporcional(): Promise<void> {
    const elegiveis = refeicoesElegiveisDiluicao();
    const somaCalorias = elegiveis.reduce((acc, r) => acc + r.metaCalorias, 0);
    if (!elegiveis.length || somaCalorias <= 0) return;
    salvandoSaldo = true;
    try {
      const deltas = new Map<string, number>();
      for (const r of elegiveis) {
        const deltaG = (saldoPendente * r.metaCalorias) / somaCalorias / 4;
        deltas.set(r.nome, deltaG < 0 ? Math.max(deltaG, -r.metaCarboidratoG) : deltaG);
      }
      await salvarDiluicaoSaldo(dataAtual, deltas);
      mostrarToast("Salvo");
      void carregar();
    } catch (err) {
      alert("Erro ao diluir o saldo: " + (err as Error).message);
    } finally {
      salvandoSaldo = false;
    }
  }

  function abrirDiluirManual(): void {
    itensDiluicaoManual = refeicoesElegiveisDiluicao().map((r) => ({ nome: r.nome, deltaG: 0, metaCarboidratoG: r.metaCarboidratoG }));
    mostrarDiluirManual = true;
  }

  async function salvarDiluirManual(): Promise<void> {
    salvandoSaldo = true;
    try {
      const deltas = new Map(itensDiluicaoManual.filter((i) => i.deltaG !== 0).map((i) => [i.nome, i.deltaG]));
      await salvarDiluicaoSaldo(dataAtual, deltas);
      mostrarDiluirManual = false;
      mostrarToast("Salvo");
      void carregar();
    } catch (err) {
      alert("Erro ao diluir o saldo: " + (err as Error).message);
    } finally {
      salvandoSaldo = false;
    }
  }

  function abrirEditarSaldo(): void {
    valorEditarSaldo = String(saldoPendente);
    mostrarEditarSaldo = true;
  }

  async function salvarEditarSaldo(): Promise<void> {
    const novo = Number(valorEditarSaldo);
    if (!Number.isFinite(novo)) return;
    salvandoSaldo = true;
    try {
      await salvarAjusteSaldoCalorico(dataAtual, Math.round(novo));
      mostrarEditarSaldo = false;
      mostrarToast("Salvo");
      void carregar();
    } catch (err) {
      alert("Erro ao editar o saldo: " + (err as Error).message);
    } finally {
      salvandoSaldo = false;
    }
  }

  function abrirExcluirSaldo(): void {
    mostrarConfirmExcluirSaldo = true;
  }

  async function confirmarExcluirSaldo(): Promise<void> {
    mostrarConfirmExcluirSaldo = false;
    salvandoSaldo = true;
    try {
      await salvarAjusteSaldoCalorico(dataAtual, 0);
      mostrarToast("Salvo");
      void carregar();
    } catch (err) {
      alert("Erro ao excluir o saldo: " + (err as Error).message);
    } finally {
      salvandoSaldo = false;
    }
  }
  let pesoAtual = $state(76);
  let prefsRefeicoes = $state<PreferenciasRefeicoesHome>({ barraBase: "refeicao", valoresFormato: "restante_acima" });
  const defParametro = new Map(DEFINICOES_PARAMETROS.map((d) => [d.chave, d]));

  function parametro(chave: string): LimiteParametro {
    return parametros.get(chave) ?? PARAMETROS_PADRAO[chave];
  }

  /** Compara o consumido (em g/kg de peso corporal) contra a faixa Mín/Máx definida em
   * Parametrização > Macronutrientes — usado pra colorir os anéis de Carb/Gorduras/Proteínas. */
  function statusMacroPorPeso(totalG: number, chave: string): "abaixo" | "acima" | "dentro" {
    if (pesoAtual <= 0) return "dentro";
    const gkg = totalG / pesoAtual;
    const { min, max } = parametro(chave);
    if (gkg < min) return "abaixo";
    if (gkg > max) return "acima";
    return "dentro";
  }

  /** Meta efetiva de cada refeição do catálogo PRO DIA sendo exibido — respeita override do dia da
   * semana (Ondulatória) e a automática (sobra do dia) da última refeição, igual já faz o resto do
   * app (Gerenciar, tela de refeição, Adicionar Alimento). Antes só olhava a meta global do
   * catálogo, então uma refeição configurada só por grupo de dias (sem meta global) nunca aparecia
   * aqui, mesmo tendo meta de verdade nesse dia.
   *
   * Resolve tudo numa passada só (em vez de chamar getContextoMetaCatalogo por refeição, que
   * refaria as mesmas 3 consultas do catálogo várias vezes) — soma uma vez só as refeições que não
   * são a última do dia, e a partir dela deriva o "disponível" de cada uma. */
  async function carregarMetasRefeicoes(data: string): Promise<{ mapa: Map<string, RefeicaoModelo>; ultimaNome: string | null } | null> {
    try {
      const [modelos, metasDia, modelosPorDia] = await Promise.all([
        listRefeicoesModelo(),
        listMetasDiaModelo(),
        listRefeicoesModeloDia(),
      ]);
      const diaSemana = parseISODate(data).getDay();
      const linhasDoDia = modelosPorDia.filter((r) => r.diaSemana === diaSemana);
      const porId = new Map(modelos.map((m) => [m.id, m]));
      const siblings = linhasDoDia.length
        ? linhasDoDia
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((r) => porId.get(r.modeloId))
            .filter((m): m is RefeicaoModelo => m != null)
        : modelos;
      const ultima = siblings[siblings.length - 1] ?? null;
      const overridePorModelo = new Map(metasDia.filter((md) => md.diaSemana === diaSemana).map((md) => [md.modeloId, md]));

      function bruta(m: RefeicaoModelo) {
        const o = overridePorModelo.get(m.id);
        return {
          calorias: o?.metaCalorias ?? m.metaCalorias ?? 0,
          proteinaG: o?.metaProteinaG ?? m.metaProteinaG ?? 0,
          gorduraG: o?.metaGorduraG ?? m.metaGorduraG ?? 0,
          carboidratoG: o?.metaCarboidratoG ?? m.metaCarboidratoG ?? 0,
        };
      }

      const semUltima = ultima ? siblings.slice(0, -1) : siblings;
      const somaSemUltima = semUltima.reduce(
        (acc, m) => {
          const v = bruta(m);
          return {
            calorias: acc.calorias + v.calorias,
            proteinaG: acc.proteinaG + v.proteinaG,
            gorduraG: acc.gorduraG + v.gorduraG,
            carboidratoG: acc.carboidratoG + v.carboidratoG,
          };
        },
        { calorias: 0, proteinaG: 0, gorduraG: 0, carboidratoG: 0 },
      );
      const metaDiaria = ultima ? await getMetasDoDiaSemana(diaSemana) : null;

      const mapa = new Map<string, RefeicaoModelo>();
      for (const m of modelos) {
        let efetivo: RefeicaoModelo;
        if (ultima && m.id === ultima.id && metaDiaria) {
          efetivo = {
            ...m,
            metaCalorias: Math.max(0, metaDiaria.calorias - somaSemUltima.calorias),
            metaProteinaG: Math.max(0, metaDiaria.proteinaG - somaSemUltima.proteinaG),
            metaGorduraG: Math.max(0, metaDiaria.gorduraG - somaSemUltima.gorduraG),
            metaCarboidratoG: Math.max(0, metaDiaria.carboidratoG - somaSemUltima.carboidratoG),
          };
        } else {
          const override = overridePorModelo.get(m.id);
          efetivo = {
            ...m,
            metaCalorias: override?.metaCalorias ?? m.metaCalorias,
            metaProteinaG: override?.metaProteinaG ?? m.metaProteinaG,
            metaGorduraG: override?.metaGorduraG ?? m.metaGorduraG,
            metaCarboidratoG: override?.metaCarboidratoG ?? m.metaCarboidratoG,
          };
        }
        if (efetivo.metaCalorias !== null) mapa.set(m.nome, efetivo);
      }
      return { mapa, ultimaNome: ultima?.nome ?? null };
    } catch {
      // opcional — sem meta cadastrada, os cards seguem mostrando só o percentual da meta diária
      return null;
    }
  }

  async function carregarParametros() {
    try {
      const [params, pesoMedio, perfil, prefs] = await Promise.all([
        getParametros(),
        getPesoMedioAtual(),
        getPerfilDietaEditavel(),
        getPreferenciasRefeicoesHome(),
      ]);
      parametros = params;
      pesoAtual = pesoMedio ?? perfil.pesoAtual;
      prefsRefeicoes = prefs;
    } catch {
      // informativo — Gordura Saturada/Fibras seguem com os padrões se falhar
    }
  }

  void carregarParametros();

  async function carregarInfoTopo() {
    try {
      const [treinos, status] = await Promise.all([listTreinos(), getStatusAdesaoDieta()]);
      const diaSemanaHoje = new Date().getDay();
      rotinaHoje = treinos.find((t: Treino) => t.dia_semana === diaSemanaHoje) ?? null;
      statusAdesao = status;
    } catch {
      // informativo, não impede o uso do diário se falhar
    }
  }

  void carregarInfoTopo();

  /** Contador de chamadas — trocar de data rapidamente (setas/seletor) dispara um novo carregar()
   * antes do anterior terminar; sem isso, a resposta mais lenta podia chegar por último e
   * sobrescrever a tela com os dados do dia errado. Cada carregar() só aplica o resultado se
   * ninguém mais novo começou entretanto. */
  let tokenCarregar = 0;

  async function carregar() {
    const meuToken = ++tokenCarregar;
    const dataAlvo = dataAtual;
    loading = true;
    erro = null;
    try {
      const refeicoesRes = await garantirRefeicoesPadraoDoDia(dataAlvo);
      const [itensRes, metasRes, metasRefeicoesRes, acumular, saldoEntrando, deltasHojeRes] = await Promise.all([
        getDiarioDoDia(dataAlvo),
        getMetasDoDia(dataAlvo),
        carregarMetasRefeicoes(dataAlvo),
        getAcumularCalorias(),
        getSaldoCaloricoEntrando(dataAlvo),
        getDeltasRefeicaoDoDia(dataAlvo),
      ]);
      if (meuToken !== tokenCarregar) return;
      refeicoes = refeicoesRes;
      itens = itensRes;
      if (metasRefeicoesRes) {
        metasRefeicaoPorNome = metasRefeicoesRes.mapa;
        refeicaoAutomaticaNome = metasRefeicoesRes.ultimaNome;
      }
      acumularAtivo = acumular.ativo;
      // Diluído hoje entra no total (metas) e na meta da refeição pra quem recebeu — o que ainda
      // não foi diluído fica só no card do saldo, sem mexer em nenhuma meta (ver Confirmar antes de
      // codar: total do dia só muda depois que o usuário decide diluir).
      const diluidoHojeKcal = [...deltasHojeRes.values()].reduce((acc, g) => acc + g * 4, 0);
      saldoPendente = Math.round(saldoEntrando - diluidoHojeKcal);
      metas = { ...metasRes, calorias: metasRes.calorias + diluidoHojeKcal, carboidratoG: metasRes.carboidratoG + diluidoHojeKcal / 4 };
      if (deltasHojeRes.size) {
        const novoMapa = new Map(metasRefeicaoPorNome);
        for (const [nome, deltaG] of deltasHojeRes) {
          if (nome === refeicaoAutomaticaNome) continue;
          const m = novoMapa.get(nome);
          if (!m) continue;
          novoMapa.set(nome, { ...m, metaCalorias: (m.metaCalorias ?? 0) + deltaG * 4, metaCarboidratoG: (m.metaCarboidratoG ?? 0) + deltaG });
        }
        metasRefeicaoPorNome = novoMapa;
      }
    } catch (err) {
      if (meuToken === tokenCarregar) erro = (err as Error).message;
    } finally {
      if (meuToken === tokenCarregar) {
        loading = false;
        carregouAlgumaVez = true;
      }
    }
  }

  void carregar();

  /** A aba Dieta fica sempre montada (ver App.svelte) — sem isso, ajustar as calorias da semana
   * pelo fluxo "Não vai treinar hoje?" (iniciado no Home/Treino) não aparecia aqui até recarregar
   * a página. */
  let versaoDietaVista = dietaInvalidacao.versao;
  $effect(() => {
    if (dietaInvalidacao.versao !== versaoDietaVista) {
      versaoDietaVista = dietaInvalidacao.versao;
      void carregar();
    }
  });

  const dataLabel = $derived.by(() => {
    if (dataAtual === hojeISO()) return "Hoje";
    const d = parseISODate(dataAtual);
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_ABREV[d.getMonth()]}`;
  });

  function selecionarData(iso: string) {
    dataAtual = iso;
    mostrarData = false;
    void carregar();
  }

  function totaisRefeicao(refeicaoId: string) {
    const doItens = itens.filter((i) => i.refeicaoId === refeicaoId);
    return {
      calorias: doItens.reduce((acc, i) => acc + i.calorias, 0),
      proteinaG: doItens.reduce((acc, i) => acc + i.proteinaG, 0),
      gorduraG: doItens.reduce((acc, i) => acc + i.gorduraG, 0),
      carboidratoG: doItens.reduce((acc, i) => acc + i.carboidratoG, 0),
    };
  }

  interface MetaRedistribuida {
    calorias: number;
    carboidratoG: number;
    gorduraG: number;
    proteinaG: number;
  }

  /** Nome da refeição automática do dia (a última do catálogo, cuja meta é sempre "a sobra do
   * dia") — setado por carregarMetasRefeicoes, junto com metasRefeicaoPorNome. */
  let refeicaoAutomaticaNome = $state<string | null>(null);

  /** Meta AO VIVO da refeição automática: sobra do dia inteiro menos, pra CADA outra refeição de
   * hoje, o que já foi realmente comido nela SE ela já tem algo lançado, senão a META dela (se
   * tiver) — nunca zero. Uma refeição só "abre mão" do que sobrou da própria meta depois de ser
   * de fato registrada; enquanto ainda não foi, o espaço dela continua reservado. Diferente do
   * cálculo estático usado em Gerenciar (que soma sempre as METAS configuradas, nunca olha o que
   * já foi comido): aqui, uma vez que uma refeição é lançada, o consumo real dela (que pode ser
   * maior ou menor que a meta) que passa a valer pro resto do dia. */
  const metasRedistribuidas = $derived.by((): Map<string, MetaRedistribuida> => {
    const resultado = new Map<string, MetaRedistribuida>();
    if (!refeicaoAutomaticaNome || !metas) return resultado;
    const automatica = refeicoes.find((r) => r.nome === refeicaoAutomaticaNome);
    if (!automatica) return resultado;

    const consumidoOutras = refeicoes
      .filter((r) => r.id !== automatica.id)
      .reduce(
        (acc, r) => {
          const temItensR = itens.some((i) => i.refeicaoId === r.id);
          const metaR = metasRefeicaoPorNome.get(r.nome);
          const t = temItensR
            ? totaisRefeicao(r.id)
            : {
                calorias: metaR?.metaCalorias ?? 0,
                carboidratoG: metaR?.metaCarboidratoG ?? 0,
                gorduraG: metaR?.metaGorduraG ?? 0,
                proteinaG: metaR?.metaProteinaG ?? 0,
              };
          return {
            calorias: acc.calorias + t.calorias,
            carboidratoG: acc.carboidratoG + t.carboidratoG,
            gorduraG: acc.gorduraG + t.gorduraG,
            proteinaG: acc.proteinaG + t.proteinaG,
          };
        },
        { calorias: 0, carboidratoG: 0, gorduraG: 0, proteinaG: 0 },
      );

    resultado.set(automatica.id, {
      calorias: Math.max(0, metas.calorias - consumidoOutras.calorias),
      carboidratoG: Math.max(0, metas.carboidratoG - consumidoOutras.carboidratoG),
      gorduraG: Math.max(0, metas.gorduraG - consumidoOutras.gorduraG),
      proteinaG: Math.max(0, metas.proteinaG - consumidoOutras.proteinaG),
    });
    return resultado;
  });

  function aoCriarRefeicao(id: string) {
    mostrarCriarRefeicao = false;
    navigate(`/dieta/refeicao/${id}`);
  }

  const totalCalorias = $derived(itens.reduce((acc, i) => acc + i.calorias, 0));
  const totalProteina = $derived(itens.reduce((acc, i) => acc + i.proteinaG, 0));
  const totalGordura = $derived(itens.reduce((acc, i) => acc + i.gorduraG, 0));
  const totalCarboidrato = $derived(itens.reduce((acc, i) => acc + i.carboidratoG, 0));
  const totalFibras = $derived(itens.reduce((acc, i) => acc + i.fibraG, 0));
  const totalGorduraSaturada = $derived(itens.reduce((acc, i) => acc + i.gorduraSaturadaG, 0));

  const statusCarbo = $derived(statusMacroPorPeso(totalCarboidrato, "carboidrato"));
  const statusGordura = $derived(statusMacroPorPeso(totalGordura, "gordura"));
  const statusProteina = $derived(statusMacroPorPeso(totalProteina, "proteina"));

  function pctMeta(valor: number, meta: number): number {
    return meta > 0 ? (valor / meta) * 100 : 0;
  }

  /** Resolve a que a barra/valor de um macro do card de refeição correspondem como "100%",
   * conforme a Parametrização (Exibição das Refeições): a meta redistribuída DAQUELA refeição
   * (padrão) ou a meta diária inteira — permite ver, ex., que a proteína "estourou" a meta da
   * refeição mas ainda está OK no total do dia. */
  function metaCardPara(campo: keyof MetaRedistribuida, metaRef: MetaRedistribuida, base: BaseReferenciaRefeicao): number {
    if (base === "diaria" && metas) return metas[campo];
    return metaRef[campo];
  }

  function larguraBarra(pct: number): number {
    return Math.min(100, pct);
  }

  /** Hachura diagonal usada pra marcar "quanto passou" quando um macro estoura a meta. */
  function hachuraEstouro(cor: string): string {
    return `repeating-linear-gradient(45deg, ${cor} 0px, ${cor} 3px, transparent 3px, transparent 6px)`;
  }

  /** Fundo da barra linear grande (Calorias): dentro da meta, preenchimento sólido normal (a
   * largura do elemento já cuida da proporção). Acima da meta, o elemento passa a representar o
   * VALOR (não a meta) como 100% de largura — o trecho sólido marca onde a meta ficou (mais
   * estreito quanto maior o excesso) e o resto vira hachurado, deixando visível "quanto" passou. */
  function fundoBarraComEstouro(valor: number, meta: number, cor: string): string {
    const pct = pctMeta(valor, meta);
    if (pct <= 100 || meta <= 0) return cor;
    const solidPct = (meta / valor) * 100;
    return `linear-gradient(to right, ${cor} 0%, ${cor} ${solidPct}%, transparent ${solidPct}%), ${hachuraEstouro(cor)}`;
  }

  /** Mesma ideia de fundoBarraComEstouro, só que pro anel (conic-gradient) dos macros. */
  function fundoAnelComEstouro(valor: number, meta: number, cor: string): string {
    const pct = pctMeta(valor, meta);
    if (pct <= 100 || meta <= 0) {
      return `conic-gradient(${cor} 0% ${larguraBarra(pct)}%, var(--surface-border) ${larguraBarra(pct)}% 100%)`;
    }
    const solidPct = (meta / valor) * 100;
    return `conic-gradient(${cor} 0% ${solidPct}%, transparent ${solidPct}% 100%), ${hachuraEstouro(cor)}`;
  }

  function restante(valor: number, meta: number): number {
    return Math.max(0, meta - valor);
  }

  /** Quando o consumido passa da meta, o texto vira "X acima" em vez de ficar travado em "0 restantes". */
  function passouMeta(valor: number, meta: number): boolean {
    return valor > meta;
  }

  interface ValorRefeicaoTexto {
    principal: string;
    /** Linha de baixo (rest./acima/%) — fica embaixo do valor consumido pra não quebrar no meio
     * do texto em telas estreitas; vazio quando o valor já é auto-suficiente numa linha só. */
    secundario: string;
  }

  /** Valor mostrado nos cards de refeição da home — formato definido em Parametrização > Exibição
   * das Refeições (independente do toggle restante/absoluto/por peso do topo, que só afeta os
   * anéis de macro do topo do Diário). Percentual tem variante refeição/diária; resto-ou-acima e
   * a meta em gramas são sempre contra a meta DAQUELA refeição (não têm variante diária). Sem
   * nenhum item lançado ainda, mostra só a própria meta (nada pra chamar de "restante"). */
  function labelValorRefeicao(valor: number, metaRefeicao: number, metaDiaria: number, unidade: string, temItens: boolean): ValorRefeicaoTexto {
    if (!temItens && !passouMeta(valor, metaRefeicao)) {
      if (prefsRefeicoes.valoresFormato === "meta_refeicao") return { principal: `${valor.toFixed(0)}/${metaRefeicao.toFixed(0)}${unidade}`, secundario: "" };
      return { principal: `${restante(valor, metaRefeicao).toFixed(0)}${unidade}`, secundario: "" };
    }
    switch (prefsRefeicoes.valoresFormato) {
      case "percentual_refeicao": {
        const pct = metaRefeicao > 0 ? (valor / metaRefeicao) * 100 : 0;
        return { principal: `${valor.toFixed(0)}${unidade}`, secundario: `${pct.toFixed(0)}% da meta` };
      }
      case "percentual_diario": {
        const pct = metaDiaria > 0 ? (valor / metaDiaria) * 100 : 0;
        return { principal: `${valor.toFixed(0)}${unidade}`, secundario: `${pct.toFixed(0)}% da meta` };
      }
      case "meta_refeicao":
        return { principal: `${valor.toFixed(0)}/${metaRefeicao.toFixed(0)}${unidade}`, secundario: "" };
      case "restante_acima":
      default:
        if (passouMeta(valor, metaRefeicao)) return { principal: `${valor.toFixed(0)}${unidade}`, secundario: `${(valor - metaRefeicao).toFixed(0)}${unidade} acima` };
        return { principal: `${valor.toFixed(0)}${unidade}`, secundario: `${restante(valor, metaRefeicao).toFixed(0)}${unidade} rest.` };
    }
  }

  /** Texto do card de refeição sem meta cadastrada — sem meta pra comparar, "restante"/"absoluto"
   * não fazem sentido (sempre mostra só o valor), mas o modo por peso ainda se aplica aos macros. */
  function labelSemMeta(valor: number, unidade: string): ValorRefeicaoTexto {
    if (modoExibicao === "porPeso" && unidade) return { principal: `${gPorKg(valor)}${unidade}/kg`, secundario: "" };
    return { principal: `${valor.toFixed(0)}${unidade}`, secundario: "" };
  }

  /** Barra de uma refeição sem meta própria: sem denominador seu, usa a meta DIÁRIA do macro pra
   * calcular a % preenchida — mesma fórmula das refeições com meta (pctMeta + larguraBarra), só
   * que sempre contra o total do dia (não faz sentido esse toggle de Parametrização aqui, já que
   * não existe "meta da refeição" nenhuma pra escolher). */
  function larguraSemMeta(valor: number, metaDiaria: number | undefined): number {
    return larguraBarra(pctMeta(valor, metaDiaria ?? 0));
  }

  /** Só pra exibição — arredonda a meta de calorias pra dezena mais próxima (ex: 653 vira 650), sem alterar o valor real usado nos cálculos. */
  function arredondarDezena(valor: number): number {
    return Math.round(valor / 10) * 10;
  }

  const fibrasMaxG = $derived(metas ? Math.round(gramasDoParametro(defParametro.get("fibras")!, parametro("fibras").max, pesoAtual, metas.calorias)) : 0);
  const gorduraSaturadaMaxG = $derived(
    metas ? Math.round(gramasDoParametro(defParametro.get("gordura_saturada")!, parametro("gordura_saturada").max, pesoAtual, metas.calorias)) : 0,
  );
</script>

{#snippet iconChevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
{/snippet}
{#snippet iconSetaCima()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
{/snippet}
{#snippet iconSetaBaixo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
{/snippet}
{#snippet iconExpandirDiario()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
{/snippet}
{#snippet anelCentroMacro(valor: number, meta: number, corTexto: string | null = null)}
  {@const estilo = corTexto ? `color:${corTexto};` : ""}
  {#if modoExibicao === "restante" && passouMeta(valor, meta)}
    <strong style={estilo}>{(valor - meta).toFixed(0)}g</strong>
    <span class="macro-meta">acima</span>
  {:else if modoExibicao === "restante"}
    <strong style={estilo}>{restante(valor, meta).toFixed(0)}g</strong>
    <span class="macro-meta">rest.</span>
  {:else if modoExibicao === "absoluto"}
    <strong style={estilo}>{valor.toFixed(0)}g</strong>
    <span class="macro-meta">/{meta.toFixed(0)}</span>
  {:else}
    <strong style={estilo}>{gPorKg(valor)}</strong>
    <span class="macro-meta">g/kg</span>
  {/if}
{/snippet}
{#snippet iconToggle()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3l4 4-4 4" />
    <path d="M21 7H7a4 4 0 0 0-4 4v1" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M3 17h14a4 4 0 0 0 4-4v-1" />
  </svg>
{/snippet}
{#snippet iconRefeicaoAvulsa()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18" />
    <path d="M12 13v5" />
    <path d="M9.5 15.5h5" />
  </svg>
{/snippet}
{#snippet iconGerenciar()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </svg>
{/snippet}
{#snippet iconScanner()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 7V5a1 1 0 0 1 1-1h2" />
    <path d="M17 4h2a1 1 0 0 1 1 1v2" />
    <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
    <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
    <path d="M7 8v8" />
    <path d="M10 8v8" />
    <path d="M13.5 8v8" />
    <path d="M17 8v8" />
  </svg>
{/snippet}
{#snippet iconRotina()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 7v10M2 9v6M18 7v10M22 9v6" />
    <path d="M6 12h12" />
  </svg>
{/snippet}
{#snippet iconPesoMeta()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="2" />
  </svg>
{/snippet}
{#snippet iconQuickAlimentos()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v7a2 2 0 0 0 2 2v9" />
    <path d="M7 3v4M11 3v4" />
    <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
  </svg>
{/snippet}
{#snippet iconQuickRefeicoes()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </svg>
{/snippet}
{#snippet iconQuickParametrizacao()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
{/snippet}
{#snippet iconDiluir()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2s6 7 6 11.5a6 6 0 0 1-12 0C6 9 12 2 12 2Z" />
  </svg>
{/snippet}
{#snippet iconEditarSaldo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}
{#snippet iconExcluirSaldo()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
{/snippet}

<div class="container has-bottom-nav">
  <div class="topo">
    <button class="dia-btn" onclick={() => (mostrarData = true)}>
      <span class="dia-texto">{dataLabel}</span>
      {@render iconChevron()}
    </button>
    {#if dataAtual === hojeISO()}
      <div class="info-hoje">
        {#if rotinaHoje}
          <button class="chip-info" onclick={() => navigate(`/treino/rotina/${rotinaHoje!.id}/ver`)}>
            {@render iconRotina()}
            <span class="chip-texto">{rotinaHoje.nome_treino}</span>
          </button>
        {/if}
        {#if statusAdesao}
          <button
            class="chip-info"
            onclick={() => {
              if (statusAdesao === "ajustar_calorias") navigate("/dieta/refeicoes/gerenciar");
              else mostrarResumo = true;
            }}
          >
            {@render iconPesoMeta()}
            <span
              class="chip-texto"
              class:status-dentro={statusAdesao === "dentro_do_plano"}
              class:status-calibrando={statusAdesao === "calibrando"}
              class:status-ajustar={statusAdesao === "ajustar_calorias"}
            >{TEXTO_STATUS_ADESAO[statusAdesao]}</span>
          </button>
        {/if}
      </div>
    {/if}
    <button class="icon-btn" onclick={() => (mostrarMenuMais = true)} aria-label="Adicionar">+</button>
  </div>

  {#if loading && !carregouAlgumaVez}
    <p class="muted">Carregando…</p>
  {:else if erro}
    <p class="erro">Erro ao carregar o diário: {erro}</p>
  {:else}
    <div class="conteudo" class:carregando={loading}>
    {#if metas}
      <div class="card-calorias">
        <p class="card-titulo">Calorias</p>
        <div class="calorias-linha">
          {#if modoExibicao === "absoluto"}
            <span class="calorias-valor"><strong>{totalCalorias.toFixed(0)}</strong> cal <span class="calorias-meta">/ {metas.calorias.toFixed(0)}</span></span>
            <span class="calorias-restantes">
              {#if passouMeta(totalCalorias, metas.calorias)}
                <strong>{(totalCalorias - metas.calorias).toFixed(0)}</strong> acima
              {:else}
                <strong>{restante(totalCalorias, metas.calorias).toFixed(0)}</strong> restantes
              {/if}
            </span>
          {:else}
            <!-- "porPeso" não se aplica a calorias (kcal/kg não é uma métrica que faz sentido
                 aqui como faz pros macros em g/kg) — o card de calorias fica na visualização
                 padrão (restante) nesse modo, só os macros abaixo mudam. -->
            <span class="calorias-valor">
              {#if passouMeta(totalCalorias, metas.calorias)}
                <strong>{(totalCalorias - metas.calorias).toFixed(0)}</strong> acima
              {:else}
                <strong>{restante(totalCalorias, metas.calorias).toFixed(0)}</strong> restantes
              {/if}
            </span>
            <span class="calorias-restantes">{totalCalorias.toFixed(0)} cal <span class="calorias-meta">/ {metas.calorias.toFixed(0)}</span></span>
          {/if}
        </div>
        <div class="barra-wrap-grande">
          <div
            class="barra-grande"
            style={`width:${larguraBarra(pctMeta(totalCalorias, metas.calorias))}%; background:${fundoBarraComEstouro(totalCalorias, metas.calorias, "var(--color-secondary)")};`}
          ></div>
        </div>
      </div>

      <div class="card-macros">
        <button class="toggle-btn" onclick={() => (modoExibicao = proximoModoExibicao(modoExibicao))} aria-label="Alternar exibição">
          {@render iconToggle()}
        </button>
        <div class="macros-grid">
          <div class="macro-col">
            <p class="macro-nome">Carb</p>
            <div
              class="macro-anel"
              style={`background: ${fundoAnelComEstouro(totalCarboidrato, metas.carboidratoG, statusCarbo === "abaixo" ? COR_ALERTA : COR_CARBO)};`}
            >
              <div class="macro-anel-centro">
                {@render anelCentroMacro(totalCarboidrato, metas.carboidratoG, statusCarbo === "acima" ? COR_ALERTA : null)}
              </div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Gorduras</p>
            <div
              class="macro-anel"
              style={`background: ${fundoAnelComEstouro(totalGordura, metas.gorduraG, statusGordura === "abaixo" ? COR_ALERTA : COR_GORDURA)};`}
            >
              <div class="macro-anel-centro">
                {@render anelCentroMacro(totalGordura, metas.gorduraG, statusGordura === "acima" ? COR_ALERTA : null)}
              </div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Proteínas</p>
            <div
              class="macro-anel"
              style={`background: ${fundoAnelComEstouro(totalProteina, metas.proteinaG, statusProteina === "abaixo" ? COR_ALERTA : COR_PROTEINA)};`}
            >
              <div class="macro-anel-centro">
                {@render anelCentroMacro(totalProteina, metas.proteinaG, statusProteina === "acima" ? COR_ALERTA : null)}
              </div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Gordura Sat.</p>
            <div class="macro-anel" style={`background: ${fundoAnelComEstouro(totalGorduraSaturada, gorduraSaturadaMaxG, COR_GORDURA)};`}>
              <div class="macro-anel-centro">
                {@render anelCentroMacro(totalGorduraSaturada, gorduraSaturadaMaxG)}
              </div>
            </div>
          </div>
          <div class="macro-col">
            <p class="macro-nome">Fibras</p>
            <div class="macro-anel" style={`background: ${fundoAnelComEstouro(totalFibras, fibrasMaxG, COR_CARBO)};`}>
              <div class="macro-anel-centro">
                {@render anelCentroMacro(totalFibras, fibrasMaxG)}
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <div class="quick-actions">
      <button class="quick-btn" onclick={() => navigate("/dieta/alimentos")}>
        <span class="quick-btn-label">Alimentos</span>
        {@render iconQuickAlimentos()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/receitas")}>
        <span class="quick-btn-label">Refeições</span>
        {@render iconQuickRefeicoes()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/refeicoes/gerenciar")}>
        <span class="quick-btn-label">Gerenciar</span>
        {@render iconGerenciar()}
      </button>
      <button class="quick-btn" onclick={() => navigate("/dieta/parametrizacao")}>
        <span class="quick-btn-label">Parâmetros</span>
        {@render iconQuickParametrizacao()}
      </button>
    </div>

    <div class="diario-titulo-linha">
      <p class="diario-titulo">Diário</p>
      {#if refeicoes.length}
        <button
          type="button"
          class="expandir-btn"
          class:expandir-btn-ativo={refeicoesExpandidas}
          onclick={() => (refeicoesExpandidas = !refeicoesExpandidas)}
          aria-label={refeicoesExpandidas ? "Recolher refeições" : "Expandir refeições"}
        >
          {@render iconExpandirDiario()}
        </button>
      {/if}
    </div>

    {#if !refeicoes.length}
      <p class="muted">Nenhuma refeição ainda. Toque em + pra criar.</p>
    {:else}
      {#each refeicoes as refeicao (refeicao.id)}
        {@const totais = totaisRefeicao(refeicao.id)}
        {@const temItens = itens.some((i) => i.refeicaoId === refeicao.id)}
        {@const metaRef = metasRefeicaoPorNome.get(refeicao.nome)}
        {@const metaAtual = metaRef
          ? (metasRedistribuidas.get(refeicao.id) ?? {
              calorias: metaRef.metaCalorias ?? 0,
              carboidratoG: metaRef.metaCarboidratoG ?? 0,
              gorduraG: metaRef.metaGorduraG ?? 0,
              proteinaG: metaRef.metaProteinaG ?? 0,
            })
          : null}
        <div
          class="refeicao-item"
          class:sem-itens={!temItens}
          role="button"
          tabindex="0"
          onclick={() => aoClicarRefeicao(refeicao.id)}
          onkeydown={(e) => e.key === "Enter" && navigate(`/dieta/refeicao/${refeicao.id}`)}
          onpointerdown={iniciarPressao}
          onpointerup={cancelarPressao}
          onpointerleave={cancelarPressao}
          onpointercancel={cancelarPressao}
          oncontextmenu={aoClicarComBotaoDireito}
        >
          <div class="card-header">
            <span class="card-header-nome">
              <h2>{refeicao.nome}</h2>
              {#if metaAtual}<span class="card-header-cal">{totais.calorias.toFixed(0)} de {arredondarDezena(metaAtual.calorias)} cal</span>{/if}
            </span>
          </div>
          {#if metaAtual}
            {@const metaBarra = {
              calorias: arredondarDezena(metaCardPara("calorias", metaAtual, prefsRefeicoes.barraBase)),
              carboidratoG: metaCardPara("carboidratoG", metaAtual, prefsRefeicoes.barraBase),
              gorduraG: metaCardPara("gorduraG", metaAtual, prefsRefeicoes.barraBase),
              proteinaG: metaCardPara("proteinaG", metaAtual, prefsRefeicoes.barraBase),
            }}
            <p class="pct-titulo" aria-hidden="true">&nbsp;</p>
            <div class="pct-grid">
              {@render pctColuna("Calorias", "var(--color-secondary)", larguraBarra(pctMeta(totais.calorias, metaBarra.calorias)), labelValorRefeicao(totais.calorias, arredondarDezena(metaAtual.calorias), arredondarDezena(metas?.calorias ?? 0), "", temItens))}
              {@render pctColuna("Carb", COR_CARBO, larguraBarra(pctMeta(totais.carboidratoG, metaBarra.carboidratoG)), labelValorRefeicao(totais.carboidratoG, metaAtual.carboidratoG, metas?.carboidratoG ?? 0, "g", temItens))}
              {@render pctColuna("Gorduras", COR_GORDURA, larguraBarra(pctMeta(totais.gorduraG, metaBarra.gorduraG)), labelValorRefeicao(totais.gorduraG, metaAtual.gorduraG, metas?.gorduraG ?? 0, "g", temItens))}
              {@render pctColuna("Proteínas", COR_PROTEINA, larguraBarra(pctMeta(totais.proteinaG, metaBarra.proteinaG)), labelValorRefeicao(totais.proteinaG, metaAtual.proteinaG, metas?.proteinaG ?? 0, "g", temItens))}
            </div>
          {:else if temItens}
            <p class="pct-titulo">Refeição sem meta</p>
            <div class="pct-grid">
              {@render pctColuna("Calorias", "var(--color-secondary)", larguraSemMeta(totais.calorias, metas?.calorias), labelSemMeta(totais.calorias, ""))}
              {@render pctColuna("Carb", COR_CARBO, larguraSemMeta(totais.carboidratoG, metas?.carboidratoG), labelSemMeta(totais.carboidratoG, "g"))}
              {@render pctColuna("Gorduras", COR_GORDURA, larguraSemMeta(totais.gorduraG, metas?.gorduraG), labelSemMeta(totais.gorduraG, "g"))}
              {@render pctColuna("Proteínas", COR_PROTEINA, larguraSemMeta(totais.proteinaG, metas?.proteinaG), labelSemMeta(totais.proteinaG, "g"))}
            </div>
          {:else}
            <p class="pct-titulo">Refeição sem meta</p>
            <div class="pct-grid">
              {@render pctColuna("Calorias", "var(--color-secondary)", 0, { principal: "0", secundario: "" })}
              {@render pctColuna("Carb", COR_CARBO, 0, { principal: "0g", secundario: "" })}
              {@render pctColuna("Gorduras", COR_GORDURA, 0, { principal: "0g", secundario: "" })}
              {@render pctColuna("Proteínas", COR_PROTEINA, 0, { principal: "0g", secundario: "" })}
            </div>
          {/if}
          {#if refeicoesExpandidas && temItens}
            {@const itensRefeicao = itens.filter((i) => i.refeicaoId === refeicao.id)}
            <div
              class="lista-itens-wrap"
              role="presentation"
              onclick={(e) => e.stopPropagation()}
              onpointerdown={(e) => e.stopPropagation()}
              oncontextmenu={(e) => e.stopPropagation()}
            >
              <DietaListaItens itens={itensRefeicao} refeicaoId={refeicao.id} dataRefeicao={dataAtual} onMudou={carregar} />
            </div>
          {/if}
          <button
            type="button"
            class="acao-adicionar"
            onclick={(e) => {
              e.stopPropagation();
              navigate(`/dieta/alimentos/refeicao/${refeicao.id}`);
            }}
          >
            Adicionar Alimento
          </button>
        </div>
      {/each}
      {#if acumularAtivo && saldoPendente !== 0}
        <button type="button" class="card-saldo" class:negativo={saldoPendente < 0} onclick={abrirMenuSaldo}>
          <span class="card-saldo-label">{saldoPendente > 0 ? "Calorias acumuladas" : "Calorias em falta"}</span>
          <span class="card-saldo-valor">{saldoPendente > 0 ? "+" : ""}{saldoPendente} kcal</span>
        </button>
      {/if}
    {/if}
    </div>
  {/if}
</div>

{#if mostrarResumo}
  <DietaResumoModal onFechar={() => (mostrarResumo = false)} />
{/if}

{#if mostrarMenuSaldo}
  <ActionSheet
    titulo={saldoPendente > 0 ? `+${saldoPendente} kcal acumuladas` : `${saldoPendente} kcal em falta`}
    onFechar={() => (mostrarMenuSaldo = false)}
    opcoes={[
      { label: "Diluir proporcional", subtitulo: "Divide entre as refeições, do tamanho de cada uma", icon: iconDiluir, onSelect: diluirProporcional },
      { label: "Diluir manualmente", subtitulo: "Escolho quanto entra em cada refeição", icon: iconDiluir, onSelect: abrirDiluirManual },
      { label: "Editar", icon: iconEditarSaldo, onSelect: abrirEditarSaldo },
      { label: "Excluir", subtitulo: "Zera o saldo acumulado", icon: iconExcluirSaldo, destructive: true, onSelect: abrirExcluirSaldo },
    ]}
  />
{/if}

{#if mostrarDiluirManual}
  <Sheet titulo="Diluir manualmente" onFechar={() => (mostrarDiluirManual = false)}>
    <p class="diluir-ajuda">
      Quanto entra (ou sai) de cada refeição — sempre no carboidrato. Restante a distribuir:
      <strong>{restanteManualKcal > 0 ? "+" : ""}{restanteManualKcal.toFixed(0)} kcal</strong>
    </p>
    <ul class="diluir-lista">
      {#each itensDiluicaoManual as item, idx (item.nome)}
        <li class="diluir-linha">
          <span class="diluir-nome">{item.nome}</span>
          <input
            class="diluir-input"
            type="number"
            inputmode="decimal"
            step="1"
            value={Math.round(item.deltaG * 4)}
            onchange={(e) => {
              const kcal = Number(e.currentTarget.value) || 0;
              const deltaG = kcal / 4;
              itensDiluicaoManual[idx] = { ...item, deltaG: deltaG < 0 ? Math.max(deltaG, -item.metaCarboidratoG) : deltaG };
            }}
          />
        </li>
      {/each}
    </ul>
    <Button onclick={salvarDiluirManual} disabled={salvandoSaldo}>Salvar</Button>
  </Sheet>
{/if}

{#if mostrarEditarSaldo}
  <Sheet titulo="Editar saldo acumulado" onFechar={() => (mostrarEditarSaldo = false)}>
    <input class="editar-saldo-input" type="number" inputmode="decimal" step="1" bind:value={valorEditarSaldo} />
    <Button onclick={salvarEditarSaldo} disabled={salvandoSaldo || !valorEditarSaldo.trim()}>Salvar</Button>
  </Sheet>
{/if}

{#if mostrarConfirmExcluirSaldo}
  <ConfirmDialog
    titulo="Zerar o saldo de calorias acumulado?"
    textoConfirmar="Excluir"
    onConfirmar={confirmarExcluirSaldo}
    onCancelar={() => (mostrarConfirmExcluirSaldo = false)}
  />
{/if}

{#if reordenando}
  <Sheet titulo="Reordenar Refeições" onFechar={fecharReordenar}>
    <p class="reordenar-refeicoes-ajuda">Vale só para hoje — não muda o padrão configurado.</p>
    <ul class="reordenar-refeicoes-lista">
      {#each refeicoesReordenando as r, idx (r.id)}
        <li class="reordenar-refeicoes-item">
          <span class="reordenar-refeicoes-nome">{r.nome}</span>
          <div class="reordenar-refeicoes-setas">
            <button type="button" disabled={idx === 0} onclick={() => moverRefeicao(idx, -1)} aria-label="Mover para cima">
              {@render iconSetaCima()}
            </button>
            <button
              type="button"
              disabled={idx === refeicoesReordenando.length - 1}
              onclick={() => moverRefeicao(idx, 1)}
              aria-label="Mover para baixo"
            >
              {@render iconSetaBaixo()}
            </button>
          </div>
        </li>
      {/each}
    </ul>
    <Button onclick={fecharReordenar}>Concluir</Button>
  </Sheet>
{/if}

{#if mostrarMenuMais}
  <ActionSheet
    onFechar={() => (mostrarMenuMais = false)}
    opcoes={[
      { label: "Refeição avulsa", subtitulo: "Apenas para hoje", icon: iconRefeicaoAvulsa, onSelect: () => (mostrarCriarRefeicao = true) },
      { label: "Escanear alimento", subtitulo: "Ler código de barras", icon: iconScanner, onSelect: () => navigate(`/dieta/scanear/${dataAtual}`) },
    ]}
  />
{/if}

{#snippet pctColuna(nome: string, cor: string, largura: number, valorTexto: ValorRefeicaoTexto)}
  <div class="pct-col">
    <p class="pct-nome">{nome}</p>
    <div class="pct-barra-wrap">
      <div class="pct-barra" style={`width:${largura}%; background:${cor};`}></div>
    </div>
    <p class="pct-valor">{valorTexto.principal}</p>
    {#if valorTexto.secundario}<p class="pct-valor-sec">{valorTexto.secundario}</p>{/if}
  </div>
{/snippet}

{#if mostrarCriarRefeicao}
  <DietaRefeicaoDiaFormSheet
    data={dataAtual}
    onFechar={() => (mostrarCriarRefeicao = false)}
    onCriada={aoCriarRefeicao}
  />
{/if}

{#if mostrarData}
  <Sheet titulo="Selecionar dia" onFechar={() => (mostrarData = false)}>
    <input class="data-input" type="date" value={dataAtual} onchange={(e) => selecionarData(e.currentTarget.value)} />
    <button class="hoje-btn" onclick={() => selecionarData(hojeISO())}>Hoje</button>
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
  .topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .dia-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: none;
    border: none;
    color: var(--surface-fg);
    font-size: var(--font-size-lg);
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }
  .dia-texto {
    text-transform: capitalize;
  }
  .dia-btn svg {
    width: 18px;
    height: 18px;
    color: var(--surface-muted);
  }
  .info-hoje {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding-right: var(--space-2);
  }
  .chip-info {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 140px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    font-size: 12px;
    cursor: pointer;
  }
  .chip-info svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--color-primary);
  }
  .chip-texto {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-texto.status-dentro {
    color: var(--color-success);
  }
  .chip-texto.status-calibrando {
    color: var(--color-neutral);
  }
  .chip-texto.status-ajustar {
    color: var(--color-negative);
  }
  .icon-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }
  .quick-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .quick-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--surface-fg);
    cursor: pointer;
  }
  .quick-btn-label {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
  .quick-btn svg {
    width: 20px;
    height: 20px;
  }
  .card-calorias,
  .card-macros {
    position: relative;
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
  .card-titulo {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-base);
    color: var(--surface-muted);
  }
  .calorias-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .calorias-valor {
    font-size: var(--font-size-lg);
  }
  .calorias-valor strong {
    font-size: 22px;
  }
  .calorias-meta {
    color: var(--surface-muted);
    font-size: var(--font-size-sm);
  }
  .calorias-restantes {
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .barra-wrap-grande {
    height: 10px;
    background: var(--surface-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .barra-grande {
    height: 100%;
    border-radius: 6px;
  }
  .toggle-btn {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle-btn svg {
    width: 16px;
    height: 16px;
  }
  .macros-grid {
    display: flex;
    gap: var(--space-3);
    width: calc(100% - 40px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .macros-grid::-webkit-scrollbar {
    display: none;
  }
  .macro-col {
    flex: 0 0 calc((100% - 2 * var(--space-3)) / 3);
    min-width: 0;
    scroll-snap-align: start;
  }
  .macro-nome {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--surface-fg);
    white-space: nowrap;
    text-align: center;
  }
  .macro-meta {
    color: var(--surface-muted);
  }
  .macro-anel {
    position: relative;
    width: 68px;
    height: 68px;
    margin: 0 auto;
    border-radius: 50%;
  }
  .macro-anel-centro {
    position: absolute;
    inset: 6px;
    border-radius: 50%;
    background: var(--surface-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.2;
  }
  .macro-anel-centro strong {
    font-size: 14px;
    color: var(--surface-fg);
  }
  .macro-anel-centro .macro-meta {
    font-size: 10px;
  }
  .refeicao-item {
    cursor: pointer;
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
    -webkit-tap-highlight-color: transparent;
    /* Segurar pra reordenar não pode abrir o menu de copiar/selecionar do Android. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .card-header-nome {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }
  .card-header h2 {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-lg);
    margin: 0;
    color: var(--surface-fg);
  }
  .refeicao-item.sem-itens .card-header h2,
  .refeicao-item.sem-itens .pct-nome {
    color: var(--surface-muted);
  }
  .card-header-cal {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .diario-titulo-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 var(--space-3);
  }
  .diario-titulo {
    font-weight: 600;
    margin: 0;
  }
  .expandir-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--surface-muted);
    cursor: pointer;
  }
  .expandir-btn svg {
    width: 18px;
    height: 18px;
    transition: transform 0.15s;
  }
  .expandir-btn-ativo {
    color: var(--color-primary);
  }
  .expandir-btn-ativo svg {
    transform: rotate(180deg);
  }
  .lista-itens-wrap {
    margin-bottom: var(--space-3);
  }
  .acao-adicionar {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--surface-border);
    background: none;
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
  }
  .pct-titulo {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--surface-muted);
  }
  .pct-grid {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .pct-col {
    flex: 1;
    min-width: 0;
  }
  .pct-nome {
    margin: 0 0 var(--space-1);
    font-size: 12px;
    color: var(--surface-fg);
  }
  .pct-barra-wrap {
    height: 6px;
    background: var(--surface-border);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--space-1);
  }
  .pct-barra {
    height: 100%;
    border-radius: 4px;
  }
  .pct-valor {
    margin: 0;
    font-size: 11px;
    color: var(--surface-muted);
  }
  .pct-valor-sec {
    margin: var(--space-1) 0 0;
    padding-top: var(--space-1);
    border-top: 1px solid var(--surface-border);
    font-size: 11px;
    color: var(--surface-muted);
  }
  .conteudo {
    transition: opacity 0.15s;
  }
  .conteudo.carregando {
    opacity: 0.5;
  }
  .muted {
    color: var(--surface-muted);
  }
  .erro {
    color: var(--color-danger);
  }
  .data-input {
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    color-scheme: dark;
  }
  .hoje-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--color-primary);
    font-weight: 600;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  .reordenar-refeicoes-ajuda {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
    text-align: center;
  }
  .reordenar-refeicoes-lista {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
  }
  .reordenar-refeicoes-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .reordenar-refeicoes-item:last-child {
    border-bottom: none;
  }
  .reordenar-refeicoes-nome {
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  .reordenar-refeicoes-setas {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }
  .reordenar-refeicoes-setas button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-bg);
    color: var(--surface-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .reordenar-refeicoes-setas button svg {
    width: 16px;
    height: 16px;
  }
  .reordenar-refeicoes-setas button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .card-saldo {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    margin-top: var(--space-2);
    border-radius: var(--radius-lg);
    border: 1px dashed var(--color-success);
    background: color-mix(in srgb, var(--color-success) 10%, var(--surface-card));
    color: var(--color-success);
    font-family: inherit;
    cursor: pointer;
  }
  .card-saldo.negativo {
    border-color: var(--color-negative);
    background: color-mix(in srgb, var(--color-negative) 10%, var(--surface-card));
    color: var(--color-negative);
  }
  .card-saldo-label {
    font-size: var(--font-size-sm);
  }
  .card-saldo-valor {
    font-size: var(--font-size-base);
    font-weight: 700;
  }
  .diluir-ajuda {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--surface-muted);
  }
  .diluir-lista {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
  }
  .diluir-linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--surface-border);
  }
  .diluir-nome {
    font-size: var(--font-size-base);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .diluir-input,
  .editar-saldo-input {
    box-sizing: border-box;
    width: 96px;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-size: var(--font-size-base);
    text-align: center;
  }
  .editar-saldo-input {
    width: 100%;
    margin-bottom: var(--space-3);
  }
</style>
