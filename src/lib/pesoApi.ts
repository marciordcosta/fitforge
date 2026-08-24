import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

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
