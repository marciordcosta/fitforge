import { supabase } from "./supabase";
import { auth } from "./auth.svelte";
import { toISODate, parseISODate, hojeISO, somarDias } from "./dates";
import { comCache } from "./offline/cache";

export interface PesoRegistro {
  data: string;
  peso: number;
}

export interface FotoRegistro {
  id: string;
  path: string;
}

function uid(): string {
  const id = auth.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

export async function getPesoDoDia(data: string): Promise<number | null> {
  const { data: linha, error } = await supabase
    .from("pesos")
    .select("peso")
    .eq("user_id", uid())
    .eq("data", data)
    .maybeSingle();
  if (error) throw error;
  return linha?.peso ?? null;
}

export async function getPesosDoPeriodo(dataInicio: string, dataFim: string): Promise<PesoRegistro[]> {
  return comCache(`peso:getPesosDoPeriodo:${dataInicio}:${dataFim}`, async () => {
    const { data, error } = await supabase
      .from("pesos")
      .select("data, peso")
      .eq("user_id", uid())
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });
}

export async function salvarPeso(data: string, peso: number): Promise<void> {
  const { error } = await supabase
    .from("pesos")
    .upsert({ user_id: uid(), data, peso }, { onConflict: "user_id,data" });
  if (error) throw error;
}

export async function excluirPeso(data: string): Promise<void> {
  const { error } = await supabase.from("pesos").delete().eq("user_id", uid()).eq("data", data);
  if (error) throw error;
}

/** Foto "atual" de um dia pra exibição no registro de peso: a mais recente adicionada (maior
 * ordem) — um dia pode ter várias fotos (histórico preservado pra galeria/comparação), esse é só
 * o preview de um slot só. */
export async function getFotoDoDia(data: string): Promise<FotoRegistro | null> {
  const { data: linhas, error } = await supabase
    .from("fotos")
    .select("id, url")
    .eq("user_id", uid())
    .eq("data_foto", data)
    .order("ordem", { ascending: false })
    .limit(1);
  if (error) throw error;
  const linha = linhas?.[0];
  return linha ? { id: linha.id, path: linha.url } : null;
}

export async function getUrlAssinadaFoto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("fotos").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function excluirFotoDoDia(foto: FotoRegistro): Promise<void> {
  // Linha do banco primeiro: se isso falhar (RLS, rede), nada é apagado e a foto continua
  // acessível normalmente. Na ordem inversa, uma falha no delete do banco DEPOIS de já ter
  // apagado o arquivo deixava a linha "pendurada" apontando pra um arquivo que não existe mais,
  // aparecendo como miniatura em branco até o usuário notar e excluir de novo.
  const { error } = await supabase.from("fotos").delete().eq("id", foto.id);
  if (error) throw error;
  await supabase.storage.from("fotos").remove([foto.path]);
}

/** Adiciona uma foto a um dia SEM substituir as que já existem — diferente de salvarFotoDoDia
 * (usado pelo registro de peso do dia, que mantém só uma foto "canônica" por dia). Usado pelo
 * "+" da tela de Fotos, que aceita várias fotos por data (carrossel na comparação).
 *
 * `ordem` é opcional: se omitido, é calculado a partir da contagem atual — mas isso RACES quando
 * várias fotos da mesma data são adicionadas em paralelo (cada chamada lê a contagem antes de
 * qualquer INSERT anterior confirmar, gerando `ordem` duplicado). Quem for adicionar várias de
 * uma vez (ex: seleção múltipla na galeria) deve calcular a base uma única vez e passar `ordem`
 * explícito por arquivo. */
export async function adicionarFoto(data: string, arquivo: File, ordem?: number): Promise<FotoItem> {
  const userId = uid();
  const extensao = arquivo.name.split(".").pop() || "jpg";
  const path = `${userId}/${data}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;

  const { error: uploadError } = await supabase.storage.from("fotos").upload(path, arquivo);
  if (uploadError) throw uploadError;

  let ordemFinal = ordem;
  if (ordemFinal == null) {
    const { count } = await supabase
      .from("fotos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("data_foto", data);
    ordemFinal = count ?? 0;
  }

  const { data: linha, error } = await supabase
    .from("fotos")
    .insert({ user_id: userId, data_foto: data, url: path, ordem: ordemFinal })
    .select("id, url, data_foto")
    .single();
  if (error) throw error;
  return { id: linha.id, path: linha.url, data: linha.data_foto };
}

export interface FotoItem {
  id: string;
  path: string;
  data: string;
}

export interface FotoGrupoData {
  data: string;
  fotos: FotoItem[];
}

/** Todas as fotos de acompanhamento, agrupadas por dia (mais recente primeiro) — base da galeria
 * da aba Fotos. Um dia pode ter mais de uma foto (ordenadas por `ordem`), viram o carrossel na
 * tela de comparação. */
export async function listFotosAgrupadas(): Promise<FotoGrupoData[]> {
  return comCache("peso:listFotosAgrupadas", async () => {
    const { data, error } = await supabase
      .from("fotos")
      .select("id, url, data_foto")
      .eq("user_id", uid())
      .order("data_foto", { ascending: false })
      .order("ordem", { ascending: true });
    if (error) throw error;

    const grupos: FotoGrupoData[] = [];
    for (const linha of data ?? []) {
      const item: FotoItem = { id: linha.id, path: linha.url, data: linha.data_foto };
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.data === item.data) ultimo.fotos.push(item);
      else grupos.push({ data: item.data, fotos: [item] });
    }
    return grupos;
  });
}

/** Todas as fotos de um dia específico, na ordem salva — base do carrossel da tela de comparação
 * (trocar de foto sem sair da data selecionada). */
export async function getFotosDaData(data: string): Promise<FotoItem[]> {
  const { data: linhas, error } = await supabase
    .from("fotos")
    .select("id, url, data_foto")
    .eq("user_id", uid())
    .eq("data_foto", data)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (linhas ?? []).map((l) => ({ id: l.id, path: l.url, data: l.data_foto }));
}

/** Dias com pelo menos uma foto dentro do período — usado pra marcar o indicador de foto na grade
 * do calendário de Peso, sem carregar as imagens em si (só as datas). */
export async function getDiasComFoto(dataInicio: string, dataFim: string): Promise<Set<string>> {
  return comCache(`peso:getDiasComFoto:${dataInicio}:${dataFim}`, async () => {
    const { data, error } = await supabase
      .from("fotos")
      .select("data_foto")
      .eq("user_id", uid())
      .gte("data_foto", dataInicio)
      .lte("data_foto", dataFim);
    if (error) throw error;
    return new Set((data ?? []).map((l) => l.data_foto));
  });
}

export async function getFotoPorId(id: string): Promise<FotoItem | null> {
  const { data, error } = await supabase
    .from("fotos")
    .select("id, url, data_foto")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, path: data.url, data: data.data_foto } : null;
}

/** Assina várias fotos de uma vez (1h de validade, mesmo prazo de getUrlAssinadaFoto) — evita uma
 * chamada por foto numa galeria com muitas imagens. */
export async function getUrlsAssinadas(paths: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!paths.length) return mapa;
  const { data, error } = await supabase.storage.from("fotos").createSignedUrls(paths, 3600);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.signedUrl) mapa.set(item.path ?? "", item.signedUrl);
  }
  return mapa;
}

/** Média móvel dos 7 dias terminando na data informada (mesma janela de getPesoMedioAtual, só que
 * ancorada numa data arbitrária em vez de sempre no registro mais recente) — usada na tela de
 * comparação de fotos pra mostrar "a média da semana" daquele dia. null sem pesagem na janela. */
export async function getPesoMedioNaData(data: string): Promise<number | null> {
  const limite = somarDias(data, -6);
  const registros = await getPesosDoPeriodo(limite, data);
  if (!registros.length) return null;
  return registros.reduce((acc, p) => acc + p.peso, 0) / registros.length;
}

export async function getUltimoPeso(): Promise<number | null> {
  const { data, error } = await supabase
    .from("pesos")
    .select("peso")
    .eq("user_id", uid())
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.peso ?? null;
}

/** Quando a meta reseta e recalcula: toda vez que esse dia da semana chega (0=domingo..6=sábado,
 * convenção de Date.getDay()), a meta da semana é recalculada do zero em cima da média real
 * daquele dia — ver calcularLinhaMetaPorDia. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Como "a média" é calculada pra alimentar a meta (e o card "Peso média" da tela de Peso):
 * "diario" = móvel dos últimos 7 dias (janela corrida, recalcula todo dia) — o padrão de sempre.
 * "semanal" = bloco fechado por semana (do dia de reset até o dia de reset seguinte) — reinicia
 * do zero a cada início de semana, mostrando a média PARCIAL dos dias já pesados nela. */
export type ModoMedia = "diario" | "semanal";

/** Meta única por usuário. Para "percentual", o sinal indica a direção: positivo = ganho,
 * negativo = perda — sempre semanal (cutting = negativo, bulking = positivo, derivado do Tipo de
 * Dieta em Dieta > Parâmetros, não escolhido aqui). A meta da semana usa sempre `percentualMin`
 * como ritmo (ver calcularLinhaMetaPorDia) — `percentualMax` não afeta mais o formato da linha,
 * só dispara a observação de "ajustar rota" quando a média real desvia demais dela (ver
 * getObservacaoMeta). `pesoAlvo` é o peso buscado — pro tipo manutenção é o próprio peso de
 * manutenção; pro tipo percentual é o alvo final da perda/ganho, usado pra projetar quantos dias
 * faltam (ver getDiasParaObjetivo) e como teto/piso da linha de meta. */
export interface PesoMeta {
  tipo: "percentual" | "manutencao";
  percentualMin: number | null;
  percentualMax: number | null;
  pesoAlvo: number | null;
  diaResetSemana: DiaSemana;
  modoMedia: ModoMedia;
}

export async function getMeta(): Promise<PesoMeta | null> {
  const { data, error } = await supabase
    .from("peso_metas")
    .select("tipo, percentual_min, percentual_max, peso_alvo, dia_reset_semana, modo_media")
    .eq("user_id", uid())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    tipo: data.tipo,
    percentualMin: data.percentual_min,
    percentualMax: data.percentual_max,
    pesoAlvo: data.peso_alvo,
    diaResetSemana: (data.dia_reset_semana as DiaSemana | null) ?? 1,
    modoMedia: (data.modo_media as ModoMedia | null) ?? "diario",
  };
}

export async function salvarMeta(
  tipo: "percentual" | "manutencao",
  percentualMin: number | null,
  percentualMax: number | null,
  pesoAlvo: number | null,
  diaResetSemana: DiaSemana,
  modoMedia: ModoMedia,
): Promise<void> {
  const { error } = await supabase.from("peso_metas").upsert({
    user_id: uid(),
    tipo,
    percentual_min: tipo === "percentual" ? percentualMin : null,
    percentual_max: tipo === "percentual" ? percentualMax : null,
    peso_alvo: pesoAlvo,
    dia_reset_semana: tipo === "percentual" ? diaResetSemana : null,
    modo_media: tipo === "percentual" ? modoMedia : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  // Registra no histórico com a data de hoje como início de vigência — se já houver uma troca
  // salva hoje, substitui (upsert por user_id+vigente_desde), não acumula duas mudanças no mesmo dia.
  const { error: errHist } = await supabase.from("peso_metas_historico").upsert(
    {
      user_id: uid(),
      tipo,
      percentual_min: tipo === "percentual" ? percentualMin : null,
      percentual_max: tipo === "percentual" ? percentualMax : null,
      peso_alvo: pesoAlvo,
      dia_reset_semana: tipo === "percentual" ? diaResetSemana : null,
      modo_media: tipo === "percentual" ? modoMedia : null,
      vigente_desde: hojeISO(),
    },
    { onConflict: "user_id,vigente_desde" },
  );
  if (errHist) throw errHist;
}

export async function excluirMeta(): Promise<void> {
  const { error } = await supabase.from("peso_metas").delete().eq("user_id", uid());
  if (error) throw error;
}

export interface PesoMetaHistorico extends PesoMeta {
  /** Data (inclusive) a partir da qual essa configuração de meta passou a valer. */
  vigenteDesde: string;
}

/** Todo o histórico de metas do usuário, do mais antigo pro mais recente — usado pra resolver qual
 * meta valia em cada dia do gráfico (ver metaNaData). */
export async function listMetaHistorico(): Promise<PesoMetaHistorico[]> {
  const { data, error } = await supabase
    .from("peso_metas_historico")
    .select("tipo, percentual_min, percentual_max, peso_alvo, dia_reset_semana, modo_media, vigente_desde")
    .eq("user_id", uid())
    .order("vigente_desde", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((l) => ({
    tipo: l.tipo as "percentual" | "manutencao",
    percentualMin: l.percentual_min as number | null,
    percentualMax: l.percentual_max as number | null,
    pesoAlvo: l.peso_alvo as number | null,
    diaResetSemana: (l.dia_reset_semana as DiaSemana | null) ?? 1,
    modoMedia: (l.modo_media as ModoMedia | null) ?? "diario",
    vigenteDesde: l.vigente_desde as string,
  }));
}

/** Meta que estava valendo numa data específica — a mais recente com `vigenteDesde <= data`. Se a
 * data for anterior ao primeiro registro do histórico, assume que essa meta mais antiga já valia
 * desde então (não dá pra saber o que valia antes do histórico existir). `historico` precisa estar
 * ordenado do mais antigo pro mais recente (como listMetaHistorico já retorna). */
export function metaNaData(historico: PesoMetaHistorico[], data: string): PesoMetaHistorico | null {
  if (!historico.length) return null;
  let candidata = historico[0];
  for (const h of historico) {
    if (h.vigenteDesde <= data) candidata = h;
    else break;
  }
  return candidata;
}

/** Quantos dias faltam pra bater o peso alvo, no ritmo semanal atual (só faz sentido pra meta
 * "percentual" — manutenção não tem prazo, é um alvo contínuo). Projeta a partir da MÉDIA MÓVEL
 * mais recente (não de quando a meta foi criada) — por isso o resultado sobe ou desce sozinho
 * conforme o progresso real diverge do ritmo planejado. null quando não há meta/peso registrado,
 * quando o peso já passou do alvo na direção contrária (trajetória impossível de fechar), ou
 * quando o ritmo semanal é zero (nunca chegaria). */
export async function getDiasParaObjetivo(): Promise<number | null> {
  const meta = await getMeta();
  if (!meta || meta.pesoAlvo == null) return null;
  if (meta.tipo === "manutencao") return null;
  if (meta.percentualMin == null || meta.percentualMin === 0) return null;

  const mediaAtual = await getPesoMedioAtual();
  if (mediaAtual == null) return null;

  const EPSILON_KG = 0.05;
  if (Math.abs(meta.pesoAlvo - mediaAtual) <= EPSILON_KG) return 0;

  const razao = meta.pesoAlvo / mediaAtual;
  const base = 1 + meta.percentualMin / 100;
  if (base <= 0) return null;
  const lnRazao = Math.log(razao);
  const lnBase = Math.log(base);
  // Sinais diferentes = a trajetória se afasta do alvo em vez de se aproximar (ex: meta de perda
  // com alvo acima do peso atual) — não dá pra estimar um prazo que nunca chega.
  if (Math.sign(lnRazao) !== Math.sign(lnBase)) return null;

  const dias = Math.round((7 * lnRazao) / lnBase);
  return dias > 0 ? dias : 0;
}

/** "25 dias" | "1 mês" | "1 mês e 10 dias" — mês aproximado em 30 dias, mesmo critério já usado
 * nos filtros do gráfico de Peso ("1 mês" = 30 dias). Com `curto`, abrevia o mês ("2m e 21 dias")
 * pra caber em espaços apertados, como o chip do topo do Diário. */
export function formatDiasObjetivo(dias: number, curto = false): string {
  if (dias <= 0) return "Objetivo alcançado";
  if (dias < 30) return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.floor(dias / 30);
  const diasRestantes = dias % 30;
  const partes = [curto ? `${meses}m` : `${meses} ${meses === 1 ? "mês" : "meses"}`];
  if (diasRestantes > 0) partes.push(`${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`);
  return partes.join(" e ");
}

/** Peso atual (média móvel dos últimos 7 dias, ancorada no registro mais recente). null se não há nenhum peso registrado ainda. */
export async function getPesoMedioAtual(): Promise<number | null> {
  const registros = await getPesosDoPeriodo("1900-01-01", hojeISO());
  if (!registros.length) return null;
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data));
  const dataMaisRecente = ordenados[ordenados.length - 1].data;
  const d = parseISODate(dataMaisRecente);
  const limite = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
  const janela = ordenados.filter((p) => p.data >= limite && p.data <= dataMaisRecente);
  return janela.reduce((acc, p) => acc + p.peso, 0) / janela.length;
}

function inicioDaSemana(data: string, diaReset: DiaSemana): string {
  let d = parseISODate(data);
  while (d.getDay() !== diaReset) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return toISODate(d);
}

function proximoComWeekday(data: string, diaReset: DiaSemana): string {
  let d = parseISODate(data);
  while (d.getDay() !== diaReset) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return toISODate(d);
}

/** Um ponto por dia com peso registrado; a média usa os até 7 dias anteriores (janela corrida,
 * recalcula todo dia) — usada quando `modoMedia` é "diario". */
export function calcularMediaMovelSerie(lista: PesoRegistro[]): PesoRegistro[] {
  const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data));
  return ordenada.map((p) => {
    const limite = somarDias(p.data, -6);
    const janela = ordenada.filter((q) => q.data >= limite && q.data <= p.data);
    const media = janela.reduce((acc, q) => acc + q.peso, 0) / janela.length;
    return { data: p.data, peso: media };
  });
}

/** Um ponto por dia com peso registrado; a média é da SEMANA FECHADA em andamento (do dia
 * `diaReset` mais recente até a data), reiniciando a cada novo início de semana — usada quando
 * `modoMedia` é "semanal". Com só 1 registro na semana, a média é esse próprio valor. */
export function calcularMediaSemanalSerie(lista: PesoRegistro[], diaReset: DiaSemana): PesoRegistro[] {
  const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data));
  return ordenada.map((p) => {
    const inicio = inicioDaSemana(p.data, diaReset);
    const janela = ordenada.filter((q) => q.data >= inicio && q.data <= p.data);
    const media = janela.reduce((acc, q) => acc + q.peso, 0) / janela.length;
    return { data: p.data, peso: media };
  });
}

function limitarPeloAlvo(valor: number, percentualMin: number, pesoAlvo: number | null): number {
  if (pesoAlvo == null) return valor;
  return percentualMin < 0 ? Math.max(valor, pesoAlvo) : Math.min(valor, pesoAlvo);
}

interface SegmentoMeta {
  /** "manutencao": valor constante (peso-alvo). "percentual": interpola de `inicio` até `fim` ao
   * longo da semana — ver calcularLinhaMetaPorDia. */
  tipo: "manutencao" | "percentual";
  valor: number | null;
  inicio: number | null;
  fim: number | null;
  /** Data do limite de semana (início dela) a que esse dia pertence — só preenchido pra "percentual". */
  limiteData: string | null;
}

/**
 * Base compartilhada entre calcularLinhaMetaPorDia (interpola dia a dia) e
 * calcularMetaFimSemanaPorDia (só o alvo final da semana) — os dois só diferem em qual campo do
 * segmento cada um lê, então calculam os limites de semana uma vez só.
 *
 * A cada início de semana (o dia configurado em `diaResetSemana`), a meta da semana é recalculada
 * do zero: pega a média vigente naquele dia (móvel ou de semana fechada, conforme `modoMedia`) e
 * aplica o ritmo MÍNIMO (`percentualMin`) uma única vez pra achar o alvo do FIM da semana — nunca
 * acumula "dívida" de semanas anteriores nem reage dia a dia. O início da semana é sempre onde a
 * semana ANTERIOR terminou (não a média real daquele dia), pra a linha nunca dar salto, só mudar
 * de inclinação. Na primeira semana de uma configuração de meta (sem semana anterior pra herdar),
 * o início é a própria média vigente naquele dia.
 *
 * `percentualMax` NÃO entra nessa conta — só é usado pro alerta de "ajustar rota" (ver
 * getObservacaoMeta), nunca muda o formato da linha.
 *
 * Nunca ultrapassa o peso-alvo — direção (perda/ganho) definida pelo sinal de percentualMin.
 */
function calcularSegmentosPorDia(pesos: PesoRegistro[], historico: PesoMetaHistorico[]): Map<string, SegmentoMeta | null> {
  const mapa = new Map<string, SegmentoMeta | null>();
  if (!historico.length) return mapa;
  const datas = Array.from(new Set(pesos.map((p) => p.data))).sort();
  if (!datas.length) return mapa;

  const movelPorData = new Map(calcularMediaMovelSerie(pesos).map((p) => [p.data, p.peso]));
  const semanalCache = new Map<DiaSemana, Map<string, number>>();
  function serieDoModo(modo: ModoMedia, diaReset: DiaSemana): Map<string, number> {
    if (modo === "diario") return movelPorData;
    let cache = semanalCache.get(diaReset);
    if (!cache) {
      cache = new Map(calcularMediaSemanalSerie(pesos, diaReset).map((p) => [p.data, p.peso]));
      semanalCache.set(diaReset, cache);
    }
    return cache;
  }
  /** Média mais recente conhecida NA data ou antes dela — o dia de reset é um dia fixo da semana,
   * quase nunca coincide com um registro de peso de verdade. */
  function mediaAteData(modo: ModoMedia, diaReset: DiaSemana, data: string): number | null {
    const serieDados = serieDoModo(modo, diaReset);
    let melhor: { data: string; peso: number } | null = null;
    for (const [d, v] of serieDados) {
      if (d <= data && (!melhor || d > melhor.data)) melhor = { data: d, peso: v };
    }
    return melhor?.peso ?? null;
  }

  // Uma "era" por configuração de meta (vigenteDesde), cada uma cobrindo [inicio, fim).
  const eras = historico.map((h, i) => ({ config: h, inicio: h.vigenteDesde, fim: historico[i + 1]?.vigenteDesde ?? null }));

  for (const era of eras) {
    const datasDaEra = datas.filter((d) => d >= era.inicio && (era.fim == null || d < era.fim));
    if (!datasDaEra.length) continue;

    if (era.config.tipo === "manutencao") {
      for (const d of datasDaEra) mapa.set(d, { tipo: "manutencao", valor: era.config.pesoAlvo, inicio: null, fim: null, limiteData: null });
      continue;
    }
    if (era.config.percentualMin == null) {
      for (const d of datasDaEra) mapa.set(d, null);
      continue;
    }

    const { diaResetSemana, modoMedia, percentualMin, pesoAlvo } = era.config;

    // Limites de semana: começa em era.inicio, depois o 1º dia com o weekday configurado, daí em diante de 7 em 7.
    const limites: string[] = [era.inicio];
    let proximo = proximoComWeekday(era.inicio, diaResetSemana);
    if (proximo === era.inicio) proximo = somarDias(proximo, 7);
    const ultimaData = datasDaEra[datasDaEra.length - 1];
    while (proximo <= ultimaData) {
      limites.push(proximo);
      proximo = somarDias(proximo, 7);
    }

    const inicioPorLimite = new Map<string, number>();
    const fimPorLimite = new Map<string, number>();
    let continuidade: number | null = null;
    for (const limite of limites) {
      const mediaNoLimite = mediaAteData(modoMedia, diaResetSemana, limite);
      if (mediaNoLimite == null) continue;
      const inicioValor = continuidade ?? mediaNoLimite;
      const fimValor = limitarPeloAlvo(mediaNoLimite * (1 + percentualMin / 100), percentualMin, pesoAlvo);
      inicioPorLimite.set(limite, inicioValor);
      fimPorLimite.set(limite, fimValor);
      continuidade = fimValor;
    }

    for (const data of datasDaEra) {
      let limiteAtual = limites[0];
      for (const l of limites) {
        if (l <= data) limiteAtual = l;
        else break;
      }
      const inicioValor = inicioPorLimite.get(limiteAtual);
      const fimValor = fimPorLimite.get(limiteAtual);
      if (inicioValor == null || fimValor == null) {
        mapa.set(data, null);
        continue;
      }
      mapa.set(data, { tipo: "percentual", valor: null, inicio: inicioValor, fim: fimValor, limiteData: limiteAtual });
    }
  }

  return mapa;
}

/** Calcula, por dia, a "Meta Semanal" — fonte única usada pela linha vermelha do gráfico de Peso.
 * Ver calcularSegmentosPorDia pro algoritmo completo. */
export function calcularLinhaMetaPorDia(pesos: PesoRegistro[], historico: PesoMetaHistorico[]): Map<string, number | null> {
  const segmentos = calcularSegmentosPorDia(pesos, historico);
  const mapa = new Map<string, number | null>();
  for (const [data, seg] of segmentos) {
    if (!seg) {
      mapa.set(data, null);
    } else if (seg.tipo === "manutencao") {
      mapa.set(data, seg.valor);
    } else {
      const diasNoLimite = Math.round((parseISODate(data).getTime() - parseISODate(seg.limiteData!).getTime()) / 86400000);
      const fracao = Math.min(1, Math.max(0, diasNoLimite / 7));
      mapa.set(data, seg.inicio! + (seg.fim! - seg.inicio!) * fracao);
    }
  }
  return mapa;
}

/** Calcula, por dia, o ALVO FINAL da semana vigente (constante do início ao fim de cada semana,
 * mudando só quando a semana reseta) — diferente de calcularLinhaMetaPorDia, que interpola o
 * caminho até lá. Usado no card "Meta Semanal", que deve mostrar pra onde a semana está indo, não
 * o ponto de hoje na linha. */
export function calcularMetaFimSemanaPorDia(pesos: PesoRegistro[], historico: PesoMetaHistorico[]): Map<string, number | null> {
  const segmentos = calcularSegmentosPorDia(pesos, historico);
  const mapa = new Map<string, number | null>();
  for (const [data, seg] of segmentos) {
    if (!seg) mapa.set(data, null);
    else if (seg.tipo === "manutencao") mapa.set(data, seg.valor);
    else mapa.set(data, seg.fim);
  }
  return mapa;
}

/** Alvo FINAL da semana atual (não o ponto de hoje na linha — ver calcularMetaFimSemanaPorDia),
 * ancorado no dia mais recente com peso registrado (não necessariamente hoje). Pra "manutenção",
 * é o próprio peso-alvo cadastrado. null sem meta ou sem peso suficiente. */
export async function getMetaSemanal(): Promise<number | null> {
  const meta = await getMeta();
  if (!meta) return null;
  if (meta.tipo === "manutencao") return meta.pesoAlvo;
  const [historico, registros] = await Promise.all([listMetaHistorico(), getPesosDoPeriodo("1900-01-01", hojeISO())]);
  if (!registros.length || !historico.length) return null;
  const mapa = calcularMetaFimSemanaPorDia(registros, historico);
  const datas = Array.from(mapa.keys()).sort();
  const ultima = datas[datas.length - 1];
  return ultima != null ? (mapa.get(ultima) ?? null) : null;
}

/** Observação de "ajustar rota" (dieta/treino/cardio): compara a média vigente de HOJE (conforme
 * `modoMedia`) com o ponto de hoje na linha de meta — se o desvio (pra qualquer lado) passar do
 * `percentualMax` configurado, a rota precisa mudar (indo rápido ou devagar demais pro ritmo
 * máximo tolerado, nos três tipos de dieta). null sem meta percentual configurada, sem peso
 * suficiente, ou se o desvio está dentro da tolerância (nada a avisar). */
export async function getObservacaoMeta(): Promise<{ desvioPct: number; direcao: "acima" | "abaixo" } | null> {
  const meta = await getMeta();
  if (!meta || meta.tipo !== "percentual" || meta.percentualMax == null) return null;
  const [historico, registros] = await Promise.all([listMetaHistorico(), getPesosDoPeriodo("1900-01-01", hojeISO())]);
  if (!registros.length || !historico.length) return null;

  const mapa = calcularLinhaMetaPorDia(registros, historico);
  const datas = Array.from(mapa.keys()).sort();
  const hoje = datas[datas.length - 1];
  const metaHoje = hoje != null ? mapa.get(hoje) : null;
  if (hoje == null || metaHoje == null) return null;

  const metaAtiva = metaNaData(historico, hoje);
  if (!metaAtiva || metaAtiva.percentualMax == null) return null;
  const serieMedia =
    metaAtiva.modoMedia === "semanal" ? calcularMediaSemanalSerie(registros, metaAtiva.diaResetSemana) : calcularMediaMovelSerie(registros);
  const mediaHoje = serieMedia.length ? serieMedia[serieMedia.length - 1].peso : null;
  if (mediaHoje == null || metaHoje === 0) return null;

  const desvioPct = ((mediaHoje - metaHoje) / metaHoje) * 100;
  if (Math.abs(desvioPct) <= Math.abs(metaAtiva.percentualMax)) return null;
  return { desvioPct, direcao: desvioPct > 0 ? "acima" : "abaixo" };
}

/** Taxa de variação (kg/semana) das últimas 2 semanas: compara a média dos últimos 7 dias com a
 * média dos 7 dias anteriores (mesma janela de 7 dias de getPesoMedioAtual, só que em dois
 * blocos) — mais estável que comparar dois pontos isolados, sem introduzir um tipo de
 * suavização novo no projeto (segue o mesmo padrão de média móvel simples já usado aqui).
 * Exige pelo menos 3 pesagens em cada janela — com poucos pontos o resultado é ruído, não
 * tendência real; nesse caso retorna null (quem chama trata como "sem dado suficiente"). */
export async function getTaxaVariacaoSemanal(): Promise<number | null> {
  const registros = await getPesosDoPeriodo("1900-01-01", hojeISO());
  if (!registros.length) return null;
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data));
  const dataMaisRecente = ordenados[ordenados.length - 1].data;
  const d = parseISODate(dataMaisRecente);
  const fimRecente = dataMaisRecente;
  const inicioRecente = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
  const fimAnterior = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
  const inicioAnterior = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 13));

  const janelaRecente = ordenados.filter((p) => p.data >= inicioRecente && p.data <= fimRecente);
  const janelaAnterior = ordenados.filter((p) => p.data >= inicioAnterior && p.data <= fimAnterior);
  if (janelaRecente.length < 3 || janelaAnterior.length < 3) return null;

  const mediaRecente = janelaRecente.reduce((acc, p) => acc + p.peso, 0) / janelaRecente.length;
  const mediaAnterior = janelaAnterior.reduce((acc, p) => acc + p.peso, 0) / janelaAnterior.length;
  return mediaRecente - mediaAnterior;
}

