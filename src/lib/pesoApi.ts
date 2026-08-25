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

/** Meta única por usuário. Para "percentual", o sinal indica a direção: positivo = ganho, negativo = perda — sempre semanal. */
export interface PesoMeta {
  tipo: "percentual" | "manutencao";
  percentual: number | null;
  pesoManutencao: number | null;
}

export async function getMeta(): Promise<PesoMeta | null> {
  const { data, error } = await supabase
    .from("peso_metas")
    .select("tipo, percentual, peso_manutencao")
    .eq("user_id", uid())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { tipo: data.tipo, percentual: data.percentual, pesoManutencao: data.peso_manutencao };
}

export async function salvarMetaPercentual(percentual: number): Promise<void> {
  const { error } = await supabase.from("peso_metas").upsert({
    user_id: uid(),
    tipo: "percentual",
    percentual,
    peso_manutencao: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function salvarMetaManutencao(peso: number): Promise<void> {
  const { error } = await supabase.from("peso_metas").upsert({
    user_id: uid(),
    tipo: "manutencao",
    percentual: null,
    peso_manutencao: peso,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function excluirMeta(): Promise<void> {
  const { error } = await supabase.from("peso_metas").delete().eq("user_id", uid());
  if (error) throw error;
}

export interface ProgressoMetaPeso {
  pesoAtual: number;
  pesoAlvo: number;
  /** Alvo menos o peso atual — quanto falta pra bater a meta: positivo = falta ganhar, negativo = falta perder (peso já está acima do alvo). */
  faltamG: number;
}

/**
 * Peso atual (média móvel dos últimos 7 dias, no registro mais recente) contra o alvo da meta ativa.
 * Pra meta percentual, o alvo é projetado a partir da média móvel do primeiro peso registrado nos
 * últimos 7 dias corridos — mesma janela "1 semana" que é o filtro padrão do gráfico de Peso — pra
 * bater com os mesmos valores mostrados lá. Retorna null se não há meta ativa, nenhum peso registrado
 * ainda, ou (só pra meta percentual) nenhum peso registrado na última semana.
 */
export async function getProgressoMetaHoje(): Promise<ProgressoMetaPeso | null> {
  const meta = await getMeta();
  if (!meta) return null;

  const registros = await getPesosDoPeriodo("1900-01-01", hojeISO());
  if (!registros.length) return null;
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data));

  function mediaMovelEm(data: string): number {
    const d = parseISODate(data);
    const limite = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
    const janela = ordenados.filter((p) => p.data >= limite && p.data <= data);
    return janela.reduce((acc, p) => acc + p.peso, 0) / janela.length;
  }

  const dataMaisRecente = ordenados[ordenados.length - 1].data;
  const pesoAtual = mediaMovelEm(dataMaisRecente);

  let pesoAlvo: number;
  if (meta.tipo === "manutencao") {
    if (meta.pesoManutencao == null) return null;
    pesoAlvo = meta.pesoManutencao;
  } else {
    if (meta.percentual == null) return null;
    const hoje = parseISODate(hojeISO());
    const inicioSemana = toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 7));
    const registrosNaSemana = ordenados.filter((p) => p.data >= inicioSemana);
    if (!registrosNaSemana.length) return null;
    const dataInicial = registrosNaSemana[0].data;
    const pesoInicial = mediaMovelEm(dataInicial);
    const diasDecorridos = Math.round(
      (parseISODate(dataMaisRecente).getTime() - parseISODate(dataInicial).getTime()) / 86400000,
    );
    pesoAlvo = pesoInicial * Math.pow(1 + meta.percentual / 100, diasDecorridos / 7);
  }

  return { pesoAtual, pesoAlvo, faltamG: Math.round((pesoAlvo - pesoAtual) * 1000) };
}
