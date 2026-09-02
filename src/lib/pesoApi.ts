import { supabase } from "./supabase";
import { auth } from "./auth.svelte";
import { toISODate, parseISODate, hojeISO } from "./dates";

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
  const { data, error } = await supabase
    .from("pesos")
    .select("data, peso")
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .order("data", { ascending: true });
  if (error) throw error;
  return data ?? [];
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

/** Uma foto de acompanhamento por dia (a mais recente registrada, se houver mais de uma). */
export async function getFotoDoDia(data: string): Promise<FotoRegistro | null> {
  const { data: linhas, error } = await supabase
    .from("fotos")
    .select("id, url")
    .eq("user_id", uid())
    .eq("data_foto", data)
    .order("ordem", { ascending: true })
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

export async function salvarFotoDoDia(
  data: string,
  arquivo: File,
  fotoAnterior: FotoRegistro | null,
): Promise<FotoRegistro> {
  const userId = uid();
  const extensao = arquivo.name.split(".").pop() || "jpg";
  const path = `${userId}/${data}/${Date.now()}.${extensao}`;

  const { error: uploadError } = await supabase.storage.from("fotos").upload(path, arquivo);
  if (uploadError) throw uploadError;

  if (fotoAnterior) {
    await excluirFotoDoDia(fotoAnterior);
  }

  const { data: linha, error } = await supabase
    .from("fotos")
    .insert({ user_id: userId, data_foto: data, url: path, ordem: 0 })
    .select("id, url")
    .single();
  if (error) throw error;
  return { id: linha.id, path: linha.url };
}

export async function excluirFotoDoDia(foto: FotoRegistro): Promise<void> {
  await supabase.storage.from("fotos").remove([foto.path]);
  const { error } = await supabase.from("fotos").delete().eq("id", foto.id);
  if (error) throw error;
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

/** Meta única por usuário. Para "percentual", o sinal indica a direção: positivo = ganho,
 * negativo = perda — sempre semanal (cutting = negativo, bulking = positivo, derivado do Tipo de
 * Dieta em Dieta > Parâmetros, não escolhido aqui). `pesoAlvo` é o peso buscado — pro tipo
 * manutenção é o próprio peso de manutenção; pro tipo percentual é o alvo final da perda/ganho,
 * usado pra projetar quantos dias faltam (ver getDiasParaObjetivo). */
export interface PesoMeta {
  tipo: "percentual" | "manutencao";
  percentual: number | null;
  pesoAlvo: number | null;
}

export async function getMeta(): Promise<PesoMeta | null> {
  const { data, error } = await supabase
    .from("peso_metas")
    .select("tipo, percentual, peso_alvo")
    .eq("user_id", uid())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { tipo: data.tipo, percentual: data.percentual, pesoAlvo: data.peso_alvo };
}

export async function salvarMeta(tipo: "percentual" | "manutencao", percentual: number | null, pesoAlvo: number | null): Promise<void> {
  const { error } = await supabase.from("peso_metas").upsert({
    user_id: uid(),
    tipo,
    percentual: tipo === "percentual" ? percentual : null,
    peso_alvo: pesoAlvo,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function excluirMeta(): Promise<void> {
  const { error } = await supabase.from("peso_metas").delete().eq("user_id", uid());
  if (error) throw error;
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
  if (meta.percentual == null || meta.percentual === 0) return null;

  const mediaAtual = await getPesoMedioAtual();
  if (mediaAtual == null) return null;

  const EPSILON_KG = 0.05;
  if (Math.abs(meta.pesoAlvo - mediaAtual) <= EPSILON_KG) return 0;

  const razao = meta.pesoAlvo / mediaAtual;
  const base = 1 + meta.percentual / 100;
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

