import { supabase } from "./supabase";
import { auth } from "./auth.svelte";

export const PESOS_CONTRIBUICAO_PRESET = [1, 0.75, 0.5, 0.25] as const;

export type Papel = "primario" | "secundario";
export type HistoricoFonte = "ultimo_exercicio" | "ultima_rotina";

export interface Musculo {
  id: string;
  nome: string;
  grupo_exibicao: string | null;
  ordem: number;
}

export interface PadraoMovimento {
  id: string;
  nome: string;
  cor_fundo: string | null;
  cor_fonte: string | null;
  ordem: number;
}

export interface ExercicioMusculo {
  musculo_id: string;
  papel: Papel;
  peso_contribuicao: number;
  musculo?: Musculo;
}

export interface Exercicio {
  id: string;
  padrao_id: string | null;
  nome: string;
  descanso_padrao_seg: number | null;
  ordem: number;
  padrao?: PadraoMovimento | null;
  musculos: ExercicioMusculo[];
}

export interface Treino {
  id: string;
  nome_treino: string;
  dia_semana: number | null;
  ordem: number;
}

/** 0=domingo..6=sábado, mesma convenção de Date.getDay(). */
export const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const DIAS_SEMANA_COMPLETO = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export interface SerieAlvo {
  id: string;
  serie: number;
  peso_alvo: number | null;
  rep_min: number | null;
  rep_max: number | null;
}

export interface TreinoExercicio {
  id: string;
  treino_id: string;
  exercicio_id: string;
  descanso_seg: number | null;
  observacao: string | null;
  ordem: number;
  exercicio?: Exercicio;
  series: SerieAlvo[];
}

export interface TreinoRegistro {
  id: string;
  treino_id: string;
  exercicio_id: string;
  data: string;
  serie: number;
  peso: number | null;
  repeticoes: number | null;
}

function uid(): string {
  const id = auth.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

// ---------------- Músculos ----------------

export async function listMusculos(): Promise<Musculo[]> {
  const { data, error } = await supabase
    .from("musculos")
    .select("id, nome, grupo_exibicao, ordem")
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function findOrCreateMusculo(nome: string): Promise<Musculo> {
  const nomeTrim = nome.trim();
  const { data: existente } = await supabase
    .from("musculos")
    .select("id, nome, grupo_exibicao, ordem")
    .eq("user_id", uid())
    .ilike("nome", nomeTrim)
    .maybeSingle();
  if (existente) return existente;

  const { data, error } = await supabase
    .from("musculos")
    .insert({ user_id: uid(), nome: nomeTrim, ordem: 0 })
    .select("id, nome, grupo_exibicao, ordem")
    .single();
  if (error) throw error;
  return data;
}

export async function getMusculo(id: string): Promise<Musculo | null> {
  const { data, error } = await supabase
    .from("musculos")
    .select("id, nome, grupo_exibicao, ordem")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMusculo(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("musculos").update({ nome: nome.trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteMusculo(id: string): Promise<void> {
  const { error } = await supabase.from("musculos").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Padrões de movimento ----------------

export async function listPadroesMovimento(): Promise<PadraoMovimento[]> {
  const { data, error } = await supabase
    .from("padroes_movimento")
    .select("id, nome, cor_fundo, cor_fonte, ordem")
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function findOrCreatePadraoMovimento(nome: string): Promise<PadraoMovimento> {
  const nomeTrim = nome.trim();
  const { data: existente } = await supabase
    .from("padroes_movimento")
    .select("id, nome, cor_fundo, cor_fonte, ordem")
    .eq("user_id", uid())
    .ilike("nome", nomeTrim)
    .maybeSingle();
  if (existente) return existente;

  const { data, error } = await supabase
    .from("padroes_movimento")
    .insert({ user_id: uid(), nome: nomeTrim, ordem: 0 })
    .select("id, nome, cor_fundo, cor_fonte, ordem")
    .single();
  if (error) throw error;
  return data;
}

export interface PadraoMovimentoComMusculos extends PadraoMovimento {
  musculos: Musculo[];
}

const PADRAO_COM_MUSCULOS_SELECT =
  "id, nome, cor_fundo, cor_fonte, ordem, musculos:padrao_movimento_musculos(musculo:musculos(id, nome, grupo_exibicao, ordem))";

interface PadraoRow {
  id: string;
  nome: string;
  cor_fundo: string | null;
  cor_fonte: string | null;
  ordem: number;
  musculos: { musculo: Musculo | null }[];
}

function mapPadraoComMusculos(row: PadraoRow): PadraoMovimentoComMusculos {
  return {
    id: row.id,
    nome: row.nome,
    cor_fundo: row.cor_fundo,
    cor_fonte: row.cor_fonte,
    ordem: row.ordem,
    musculos: row.musculos.map((m) => m.musculo).filter((m): m is Musculo => m != null),
  };
}

export async function listPadroesMovimentoComMusculos(): Promise<PadraoMovimentoComMusculos[]> {
  const { data, error } = await supabase
    .from("padroes_movimento")
    .select(PADRAO_COM_MUSCULOS_SELECT)
    .order("nome", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as PadraoRow[]).map(mapPadraoComMusculos);
}

export async function getPadraoMovimentoComMusculos(id: string): Promise<PadraoMovimentoComMusculos | null> {
  const { data, error } = await supabase
    .from("padroes_movimento")
    .select(PADRAO_COM_MUSCULOS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPadraoComMusculos(data as unknown as PadraoRow) : null;
}

export async function listMusculosDoPadrao(padraoId: string): Promise<Musculo[]> {
  const { data, error } = await supabase
    .from("padrao_movimento_musculos")
    .select("musculo:musculos(id, nome, grupo_exibicao, ordem)")
    .eq("padrao_id", padraoId);
  if (error) throw error;
  return ((data ?? []) as unknown as { musculo: Musculo | null }[])
    .map((r) => r.musculo)
    .filter((m): m is Musculo => m != null);
}

async function salvarMusculosPadrao(padraoId: string, musculoIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from("padrao_movimento_musculos")
    .delete()
    .eq("padrao_id", padraoId);
  if (delError) throw delError;

  if (!musculoIds.length) return;
  const { error: insError } = await supabase
    .from("padrao_movimento_musculos")
    .insert(musculoIds.map((musculo_id) => ({ padrao_id: padraoId, musculo_id })));
  if (insError) throw insError;
}

/** Cria (ou reaproveita, por nome) o padrão de movimento e sincroniza os músculos associados a ele. */
export async function createPadraoMovimentoComMusculos(nome: string, musculoNomes: string[]): Promise<string> {
  const padrao = await findOrCreatePadraoMovimento(nome);
  const nomesPreenchidos = musculoNomes.filter((n) => n.trim());
  const musculosResolvidos = await Promise.all(nomesPreenchidos.map((n) => findOrCreateMusculo(n)));
  await salvarMusculosPadrao(padrao.id, musculosResolvidos.map((m) => m.id));
  return padrao.id;
}

export async function updatePadraoMovimentoComMusculos(
  id: string,
  nome: string,
  musculoNomes: string[],
): Promise<void> {
  const { error } = await supabase.from("padroes_movimento").update({ nome: nome.trim() }).eq("id", id);
  if (error) throw error;
  const nomesPreenchidos = musculoNomes.filter((n) => n.trim());
  const musculosResolvidos = await Promise.all(nomesPreenchidos.map((n) => findOrCreateMusculo(n)));
  await salvarMusculosPadrao(id, musculosResolvidos.map((m) => m.id));
}

export async function deletePadraoMovimento(id: string): Promise<void> {
  const { error } = await supabase.from("padroes_movimento").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Exercícios ----------------

const EXERCICIO_SELECT =
  "id, padrao_id, nome, descanso_padrao_seg, ordem, padrao:padroes_movimento(id, nome, cor_fundo, cor_fonte, ordem), musculos:exercicio_musculos(musculo_id, papel, peso_contribuicao, musculo:musculos(id, nome, grupo_exibicao, ordem))";

export async function listExercicios(): Promise<Exercicio[]> {
  const { data, error } = await supabase
    .from("exercicios")
    .select(EXERCICIO_SELECT)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Exercicio[];
}

export async function getExercicio(id: string): Promise<Exercicio | null> {
  const { data, error } = await supabase
    .from("exercicios")
    .select(EXERCICIO_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Exercicio | null;
}

export interface SalvarExercicioInput {
  nome: string;
  padrao_id: string | null;
  musculos: { musculo_id: string; papel: Papel; peso_contribuicao: number }[];
}

export async function createExercicio(input: SalvarExercicioInput): Promise<string> {
  const { data, error } = await supabase
    .from("exercicios")
    .insert({ user_id: uid(), nome: input.nome, padrao_id: input.padrao_id, ordem: 0 })
    .select("id")
    .single();
  if (error) throw error;
  await salvarMusculosExercicio(data.id, input.musculos);
  return data.id;
}

export async function updateExercicio(id: string, input: SalvarExercicioInput): Promise<void> {
  const { error } = await supabase
    .from("exercicios")
    .update({ nome: input.nome, padrao_id: input.padrao_id })
    .eq("id", id);
  if (error) throw error;
  await salvarMusculosExercicio(id, input.musculos);
}

async function salvarMusculosExercicio(
  exercicioId: string,
  musculos: { musculo_id: string; papel: Papel; peso_contribuicao: number }[],
): Promise<void> {
  const { error: delError } = await supabase
    .from("exercicio_musculos")
    .delete()
    .eq("exercicio_id", exercicioId);
  if (delError) throw delError;

  if (!musculos.length) return;
  const { error: insError } = await supabase.from("exercicio_musculos").insert(
    musculos.map((m) => ({
      exercicio_id: exercicioId,
      musculo_id: m.musculo_id,
      papel: m.papel,
      peso_contribuicao: m.peso_contribuicao,
    })),
  );
  if (insError) throw insError;
}

export async function deleteExercicio(id: string): Promise<void> {
  const { error } = await supabase.from("exercicios").delete().eq("id", id);
  if (error) throw error;
}

export interface LinhaMusculoInput {
  nome: string;
  peso: number;
}

/** Resolve os nomes digitados em músculos (criando se necessário) e marca o de maior peso como primário. */
export async function construirMusculosInput(
  linhas: LinhaMusculoInput[],
): Promise<{ musculo_id: string; papel: Papel; peso_contribuicao: number }[]> {
  const preenchidos = linhas.filter((l) => l.nome.trim());
  if (!preenchidos.length) return [];

  const maiorPeso = Math.max(...preenchidos.map((l) => l.peso));
  let jaMarcouPrimario = false;
  const musculosInput: { musculo_id: string; papel: Papel; peso_contribuicao: number }[] = [];

  for (const l of preenchidos) {
    const m = await findOrCreateMusculo(l.nome);
    const ehPrimario = !jaMarcouPrimario && l.peso === maiorPeso;
    if (ehPrimario) jaMarcouPrimario = true;
    musculosInput.push({ musculo_id: m.id, papel: ehPrimario ? "primario" : "secundario", peso_contribuicao: l.peso });
  }
  return musculosInput;
}

export interface HistoricoPonto {
  data: string;
  maiorPeso: number;
  melhor1rm: number;
  melhorVolumeSerie: { peso: number; reps: number; volume: number };
  /** Volume total do dia: soma de peso × repetições de todas as séries do exercício. */
  volumeTotal: number;
}

export function calcular1RM(peso: number, reps: number): number {
  return peso * (1 + reps / 30);
}

export async function getHistoricoExercicio(exercicioId: string): Promise<HistoricoPonto[]> {
  const { data, error } = await supabase
    .from("treino_registros")
    .select("data, peso, repeticoes")
    .eq("exercicio_id", exercicioId)
    .not("peso", "is", null)
    .order("data", { ascending: true });
  if (error) throw error;

  const porData = new Map<string, { peso: number; repeticoes: number }[]>();
  for (const r of data ?? []) {
    if (r.peso == null) continue;
    const lista = porData.get(r.data) ?? [];
    lista.push({ peso: Number(r.peso), repeticoes: Number(r.repeticoes ?? 0) });
    porData.set(r.data, lista);
  }

  return Array.from(porData.entries()).map(([data, sets]) => {
    const maiorPeso = Math.max(...sets.map((s) => s.peso));
    let melhor1rm = 0;
    let melhorVolumeSerie = { peso: 0, reps: 0, volume: 0 };
    let volumeTotal = 0;
    for (const s of sets) {
      const rm = calcular1RM(s.peso, s.repeticoes);
      if (rm > melhor1rm) melhor1rm = rm;
      const vol = s.peso * s.repeticoes;
      if (vol > melhorVolumeSerie.volume) melhorVolumeSerie = { peso: s.peso, reps: s.repeticoes, volume: vol };
      volumeTotal += vol;
    }
    return { data, maiorPeso, melhor1rm, melhorVolumeSerie, volumeTotal };
  });
}

export interface SessaoHistorico {
  treinoId: string;
  treinoNome: string;
  data: string;
  criadoEm: string;
  sets: { serie: number; peso: number | null; repeticoes: number | null }[];
}

/** Histórico detalhado do exercício, agrupado por sessão (rotina + data), mais recente primeiro. */
export async function getHistoricoDetalhadoExercicio(exercicioId: string): Promise<SessaoHistorico[]> {
  const { data, error } = await supabase
    .from("treino_registros")
    .select("data, serie, peso, repeticoes, created_at, treino_id, treinos(nome_treino)")
    .eq("exercicio_id", exercicioId)
    .order("data", { ascending: false })
    .order("serie", { ascending: true });
  if (error) throw error;

  const grupos = new Map<string, SessaoHistorico>();
  for (const r of data ?? []) {
    const chave = `${r.treino_id}-${r.data}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        treinoId: r.treino_id,
        treinoNome: (r.treinos as unknown as { nome_treino: string } | null)?.nome_treino ?? "",
        data: r.data,
        criadoEm: r.created_at,
        sets: [],
      };
      grupos.set(chave, grupo);
    }
    grupo.sets.push({ serie: r.serie, peso: r.peso, repeticoes: r.repeticoes });
  }
  return Array.from(grupos.values());
}

export interface RecordesExercicio {
  maiorPeso: number;
  melhor1rm: number;
  melhorVolumeSerie: number;
}

/** Recordes pessoais do exercício até agora (antes da sessão atual), usados para detectar novas marcas ao logar. */
export async function getRecordesExercicio(exercicioId: string): Promise<RecordesExercicio> {
  const historico = await getHistoricoExercicio(exercicioId);
  if (!historico.length) return { maiorPeso: 0, melhor1rm: 0, melhorVolumeSerie: 0 };
  return {
    maiorPeso: Math.max(...historico.map((h) => h.maiorPeso)),
    melhor1rm: Math.max(...historico.map((h) => h.melhor1rm)),
    melhorVolumeSerie: Math.max(...historico.map((h) => h.melhorVolumeSerie.volume)),
  };
}

// ---------------- Rotinas (treinos) ----------------

const TREINO_EXERCICIO_SELECT =
  "id, treino_id, exercicio_id, descanso_seg, observacao, ordem, exercicio:exercicios(id, padrao_id, nome, descanso_padrao_seg, ordem, padrao:padroes_movimento(id, nome, cor_fundo, cor_fonte, ordem), musculos:exercicio_musculos(musculo_id, papel, peso_contribuicao)), series:treino_exercicio_series(id, serie, peso_alvo, rep_min, rep_max)";

export interface TreinoComExercicios extends Treino {
  exercicios: TreinoExercicio[];
}

function ordenarExercicios(treino: TreinoComExercicios): void {
  treino.exercicios.sort((a, b) => a.ordem - b.ordem);
  for (const ex of treino.exercicios) {
    ex.series.sort((a, b) => a.serie - b.serie);
  }
}

export async function listTreinos(): Promise<TreinoComExercicios[]> {
  const { data, error } = await supabase
    .from("treinos")
    .select(`id, nome_treino, dia_semana, ordem, exercicios:treino_exercicios(${TREINO_EXERCICIO_SELECT})`)
    .order("ordem", { ascending: true });
  if (error) throw error;
  const treinos = (data ?? []) as unknown as TreinoComExercicios[];
  treinos.forEach(ordenarExercicios);
  return treinos;
}

export async function getTreino(id: string): Promise<TreinoComExercicios | null> {
  const { data, error } = await supabase
    .from("treinos")
    .select(`id, nome_treino, dia_semana, ordem, exercicios:treino_exercicios(${TREINO_EXERCICIO_SELECT})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const treino = data as unknown as TreinoComExercicios | null;
  if (treino) ordenarExercicios(treino);
  return treino;
}

export async function createTreino(nome: string, diaSemana: number | null = null): Promise<string> {
  const { count } = await supabase.from("treinos").select("id", { count: "exact", head: true });
  const { data, error } = await supabase
    .from("treinos")
    .insert({ user_id: uid(), nome_treino: nome, dia_semana: diaSemana, ordem: count ?? 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function renameTreino(id: string, nome: string, diaSemana: number | null): Promise<void> {
  const { error } = await supabase
    .from("treinos")
    .update({ nome_treino: nome, dia_semana: diaSemana })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTreino(id: string): Promise<void> {
  const { error } = await supabase.from("treinos").delete().eq("id", id);
  if (error) throw error;
}

/** Atualiza a ordem das rotinas na tela inicial, na sequência dos ids informados. */
export async function atualizarOrdemTreinos(idsOrdenados: string[]): Promise<void> {
  await Promise.all(
    idsOrdenados.map((id, ordem) => supabase.from("treinos").update({ ordem }).eq("id", id)),
  );
}

export async function duplicateTreino(id: string): Promise<string> {
  const original = await getTreino(id);
  if (!original) throw new Error("Rotina não encontrada.");
  const novoId = await createTreino(`${original.nome_treino} (cópia)`);
  if (original.exercicios.length) {
    await salvarExerciciosRotina(
      novoId,
      original.exercicios.map((e) => ({
        exercicio_id: e.exercicio_id,
        descanso_seg: e.descanso_seg,
        observacao: e.observacao,
        series: e.series.map((s) => ({
          serie: s.serie,
          peso_alvo: s.peso_alvo,
          rep_min: s.rep_min,
          rep_max: s.rep_max,
        })),
      })),
    );
  }
  return novoId;
}

export interface ItemSerieRotina {
  serie: number;
  peso_alvo: number | null;
  rep_min: number | null;
  rep_max: number | null;
}

export interface ItemRotina {
  exercicio_id: string;
  descanso_seg: number | null;
  observacao: string | null;
  series: ItemSerieRotina[];
}

/** Substitui a composição da rotina inteira (delete+insert), mesmo padrão usado no log de treino. */
export async function salvarExerciciosRotina(treinoId: string, itens: ItemRotina[]): Promise<void> {
  const { error: delError } = await supabase.from("treino_exercicios").delete().eq("treino_id", treinoId);
  if (delError) throw delError;
  if (!itens.length) return;

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const { data: te, error: insError } = await supabase
      .from("treino_exercicios")
      .insert({
        user_id: uid(),
        treino_id: treinoId,
        exercicio_id: item.exercicio_id,
        descanso_seg: item.descanso_seg,
        observacao: item.observacao,
        ordem: idx,
      })
      .select("id")
      .single();
    if (insError) throw insError;

    if (item.series.length) {
      const { error: seriesError } = await supabase.from("treino_exercicio_series").insert(
        item.series.map((s) => ({
          treino_exercicio_id: te.id,
          serie: s.serie,
          peso_alvo: s.peso_alvo,
          rep_min: s.rep_min,
          rep_max: s.rep_max,
        })),
      );
      if (seriesError) throw seriesError;
    }
  }
}

/** Atualiza só o descanso de um exercício dentro de uma rotina (editável direto na tela de log). */
export async function updateDescansoTreinoExercicio(
  treinoExercicioId: string,
  descansoSeg: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("treino_exercicios")
    .update({ descanso_seg: descansoSeg })
    .eq("id", treinoExercicioId);
  if (error) throw error;
}

export async function updateObservacaoTreinoExercicio(treinoExercicioId: string, observacao: string | null): Promise<void> {
  const { error } = await supabase
    .from("treino_exercicios")
    .update({ observacao })
    .eq("id", treinoExercicioId);
  if (error) throw error;
}

// ---------------- Log de treino (registros) ----------------

export interface SetRegistro {
  serie: number;
  peso: number | null;
  repeticoes: number | null;
}

export async function getRegistrosDoDia(treinoId: string, data: string): Promise<TreinoRegistro[]> {
  const { data: rows, error } = await supabase
    .from("treino_registros")
    .select("id, treino_id, exercicio_id, data, serie, peso, repeticoes")
    .eq("treino_id", treinoId)
    .eq("data", data);
  if (error) throw error;
  return rows ?? [];
}

/** Salva todos os registros de uma sessão (substitui o que existir para essa data+rotina). */
export async function salvarRegistrosDoDia(
  treinoId: string,
  data: string,
  porExercicio: Map<string, SetRegistro[]>,
): Promise<void> {
  const { error: delError } = await supabase
    .from("treino_registros")
    .delete()
    .eq("treino_id", treinoId)
    .eq("data", data);
  if (delError) throw delError;

  const linhas: Record<string, unknown>[] = [];
  for (const [exercicioId, sets] of porExercicio.entries()) {
    for (const s of sets) {
      if (s.peso == null && s.repeticoes == null) continue;
      linhas.push({
        user_id: uid(),
        treino_id: treinoId,
        exercicio_id: exercicioId,
        data,
        serie: s.serie,
        peso: s.peso,
        repeticoes: s.repeticoes,
      });
    }
  }
  if (!linhas.length) return;
  const { error: insError } = await supabase.from("treino_registros").insert(linhas);
  if (insError) throw insError;
}

export interface DiaComTreino {
  data: string;
  treinoId: string;
  treinoNome: string;
}

/** Dias do período que têm ao menos um registro, com a rotina feita naquele dia (uma por dia; se houver mais de uma, pega a primeira). */
export async function getDiasComTreino(dataInicio: string, dataFim: string): Promise<DiaComTreino[]> {
  const { data, error } = await supabase
    .from("treino_registros")
    .select("data, treino_id, treinos(nome_treino)")
    .gte("data", dataInicio)
    .lte("data", dataFim);
  if (error) throw error;

  const porDia = new Map<string, DiaComTreino>();
  for (const r of data ?? []) {
    if (porDia.has(r.data)) continue;
    porDia.set(r.data, {
      data: r.data,
      treinoId: r.treino_id,
      treinoNome: (r.treinos as unknown as { nome_treino: string } | null)?.nome_treino ?? "",
    });
  }
  return Array.from(porDia.values());
}

export interface ExercicioRegistroDia {
  exercicioId: string;
  exercicioNome: string;
  sets: SetRegistro[];
}

export interface HistoricoDia {
  treinoNome: string;
  exercicios: ExercicioRegistroDia[];
}

/** Registro completo de uma sessão específica (rotina + data), agrupado por exercício e com nomes já resolvidos. */
export async function getHistoricoDia(treinoId: string, data: string): Promise<HistoricoDia> {
  const [{ data: rows, error }, treino] = await Promise.all([
    supabase
      .from("treino_registros")
      .select("exercicio_id, serie, peso, repeticoes, exercicios(nome)")
      .eq("treino_id", treinoId)
      .eq("data", data)
      .order("serie", { ascending: true }),
    getTreino(treinoId),
  ]);
  if (error) throw error;

  const porExercicio = new Map<string, ExercicioRegistroDia>();
  for (const r of rows ?? []) {
    let grupo = porExercicio.get(r.exercicio_id);
    if (!grupo) {
      grupo = {
        exercicioId: r.exercicio_id,
        exercicioNome: (r.exercicios as unknown as { nome: string } | null)?.nome ?? "",
        sets: [],
      };
      porExercicio.set(r.exercicio_id, grupo);
    }
    grupo.sets.push({ serie: r.serie, peso: r.peso, repeticoes: r.repeticoes });
  }

  return {
    treinoNome: treino?.nome_treino ?? "",
    exercicios: Array.from(porExercicio.values()),
  };
}

/** Apaga todos os registros de uma sessão específica (rotina + data) — usado pra excluir um dia do histórico. */
export async function excluirRegistrosDoDia(treinoId: string, data: string): Promise<void> {
  const { error } = await supabase.from("treino_registros").delete().eq("treino_id", treinoId).eq("data", data);
  if (error) throw error;
}

/** Cria uma rotina nova a partir dos exercícios/séries de uma sessão do histórico (peso e reps feitos viram peso-alvo/faixa inicial, editável depois). */
export async function criarRotinaAPartirDeSessao(
  nome: string,
  exercicios: { exercicioId: string; sets: SetRegistro[] }[],
): Promise<string> {
  const treinoId = await createTreino(nome);
  const itens: ItemRotina[] = exercicios.map((ex) => ({
    exercicio_id: ex.exercicioId,
    descanso_seg: null,
    observacao: null,
    series: ex.sets
      .filter((s) => s.peso != null || s.repeticoes != null)
      .map((s) => ({ serie: s.serie, peso_alvo: s.peso, rep_min: s.repeticoes, rep_max: s.repeticoes })),
  }));
  await salvarExerciciosRotina(treinoId, itens);
  return treinoId;
}

/** Último registro de um exercício, filtrado por rotina se `treinoId` for informado. */
export async function getUltimoRegistro(
  exercicioId: string,
  treinoId?: string,
): Promise<SetRegistro[]> {
  let q = supabase
    .from("treino_registros")
    .select("data, serie, peso, repeticoes")
    .eq("exercicio_id", exercicioId)
    .order("data", { ascending: false })
    .limit(50);
  if (treinoId) q = q.eq("treino_id", treinoId);

  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return [];

  const ultimaData = data[0].data;
  return data
    .filter((r) => r.data === ultimaData)
    .map((r) => ({ serie: r.serie, peso: r.peso, repeticoes: r.repeticoes }))
    .sort((a, b) => a.serie - b.serie);
}

// ---------------- Configuração do usuário ----------------

export async function getHistoricoFonte(): Promise<HistoricoFonte> {
  const { data } = await supabase
    .from("usuario_config")
    .select("historico_fonte")
    .eq("user_id", uid())
    .maybeSingle();
  return (data?.historico_fonte as HistoricoFonte) ?? "ultimo_exercicio";
}

export async function setHistoricoFonte(fonte: HistoricoFonte): Promise<void> {
  const { error } = await supabase
    .from("usuario_config")
    .upsert({ user_id: uid(), historico_fonte: fonte, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------------- Distribuição muscular ----------------

export interface VolumeMusculo {
  musculo_id: string;
  series_equivalentes: number;
}

export async function getVolumePlanejado(treinoId: string): Promise<VolumeMusculo[]> {
  const { data, error } = await supabase
    .from("v_musculo_volume_planejado")
    .select("musculo_id, series_equivalentes")
    .eq("treino_id", treinoId);
  if (error) throw error;
  return data ?? [];
}

export async function getVolumeRealizadoBruto(
  dataInicio: string,
  dataFim: string,
): Promise<{ data: string; musculo_id: string; series_equivalentes: number }[]> {
  const { data, error } = await supabase
    .from("v_musculo_volume_realizado")
    .select("data, musculo_id, series_equivalentes")
    .gte("data", dataInicio)
    .lte("data", dataFim);
  if (error) throw error;
  return data ?? [];
}

/** Uma linha por série registrada (rotina + exercício) no período — base pra contar tanto o total por rotina quanto o detalhamento por músculo de cada rotina. */
export async function getRegistrosPorTreinoPeriodo(
  dataInicio: string,
  dataFim: string,
): Promise<{ treino_id: string; exercicio_id: string }[]> {
  const { data, error } = await supabase
    .from("treino_registros")
    .select("treino_id, exercicio_id")
    .gte("data", dataInicio)
    .lte("data", dataFim);
  if (error) throw error;
  return data ?? [];
}
