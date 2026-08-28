-- fitforge — schema consolidado (Fase 0)
-- Rodar uma única vez no SQL Editor do Supabase, em um projeto novo.
-- Convenção: toda tabela tem RLS habilitada, id uuid default gen_random_uuid(),
-- e policy "owner-only" (user_id = auth.uid()), direta ou via join/subquery
-- quando a tabela-filha não tem user_id próprio.

-- ============================================================
-- TREINO
-- ============================================================

create table musculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  grupo_exibicao text,
  ordem int not null default 0,
  unique (user_id, nome)
);

create table padroes_movimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  cor_fundo text,
  cor_fonte text,
  ordem int not null default 0
);

create table exercicios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  padrao_id uuid references padroes_movimento(id) on delete set null,
  nome text not null,
  descanso_padrao_seg int,
  ordem int not null default 0
);

create table exercicio_musculos (
  id uuid primary key default gen_random_uuid(),
  exercicio_id uuid not null references exercicios(id) on delete cascade,
  musculo_id uuid not null references musculos(id) on delete cascade,
  papel text not null check (papel in ('primario', 'secundario')),
  peso_contribuicao numeric not null check (peso_contribuicao > 0 and peso_contribuicao <= 1),
  unique (exercicio_id, musculo_id)
);

-- Catálogo de músculos associados a cada padrão de movimento (cadastrado à
-- parte, na tela "Movimentos"), usado para filtrar as opções de músculo ao
-- criar/editar um exercício vinculado a esse padrão.
create table padrao_movimento_musculos (
  id uuid primary key default gen_random_uuid(),
  padrao_id uuid not null references padroes_movimento(id) on delete cascade,
  musculo_id uuid not null references musculos(id) on delete cascade,
  unique (padrao_id, musculo_id)
);

create table treinos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome_treino text not null,
  -- Dia da semana sugerido (0=domingo..6=sábado, mesma convenção do
  -- Date.getDay()), opcional. Usado só pra ordenar a lista por proximidade;
  -- rotinas sem dia mantêm a ordenação manual.
  dia_semana int check (dia_semana is null or (dia_semana >= 0 and dia_semana <= 6)),
  ordem int not null default 0
);

create table treino_exercicios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  treino_id uuid not null references treinos(id) on delete cascade,
  exercicio_id uuid not null references exercicios(id) on delete restrict,
  descanso_seg int,
  observacao text,
  ordem int not null default 0
);

-- Cada linha é uma série planejada individual (peso-alvo + faixa de reps
-- própria), em vez de uma contagem única para o exercício inteiro — permite
-- que cada série tenha seu próprio alvo (ex: aquecimento leve, depois séries
-- de trabalho mais pesadas).
create table treino_exercicio_series (
  id uuid primary key default gen_random_uuid(),
  treino_exercicio_id uuid not null references treino_exercicios(id) on delete cascade,
  serie int not null,
  peso_alvo numeric,
  rep_min int,
  rep_max int,
  unique (treino_exercicio_id, serie)
);

create table treino_registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  -- nullable + set null (não cascade/restrict): o histórico pertence ao
  -- exercício, não à rotina — apagar a rotina desvincula (treino_id vira
  -- null, aparece como "Treino Avulso") em vez de bloquear ou apagar.
  treino_id uuid references treinos(id) on delete set null,
  exercicio_id uuid not null references exercicios(id) on delete restrict,
  data date not null,
  serie int not null,
  peso numeric,
  repeticoes int,
  created_at timestamptz not null default now(),
  unique (user_id, treino_id, exercicio_id, data, serie)
);

create index treino_registros_user_data_idx on treino_registros (user_id, data);
create index treino_registros_exercicio_idx on treino_registros (exercicio_id);

-- Volume por músculo: séries × peso de contribuição, na granularidade mais
-- fina (por treino/bloco no caso planejado, por dia no caso realizado).
-- Arredondamento deve acontecer só uma vez, no SUM() final feito pelo app
-- ao agregar por dia/semana — nunca por exercício antes de somar (era o
-- bug do app anterior).

create view v_musculo_volume_planejado as
select
  t.user_id,
  te.treino_id,
  em.musculo_id,
  sum(qtd.n_series * em.peso_contribuicao) as series_equivalentes
from treino_exercicios te
join exercicio_musculos em on em.exercicio_id = te.exercicio_id
join treinos t on t.id = te.treino_id
join (
  select treino_exercicio_id, count(*) as n_series
  from treino_exercicio_series
  group by treino_exercicio_id
) qtd on qtd.treino_exercicio_id = te.id
group by t.user_id, te.treino_id, em.musculo_id;

create view v_musculo_volume_realizado as
select
  tr.user_id,
  tr.data,
  em.musculo_id,
  sum(em.peso_contribuicao) as series_equivalentes
from treino_registros tr
join exercicio_musculos em on em.exercicio_id = tr.exercicio_id
group by tr.user_id, tr.data, em.musculo_id;

alter table musculos enable row level security;
alter table padroes_movimento enable row level security;
alter table exercicios enable row level security;
alter table exercicio_musculos enable row level security;
alter table padrao_movimento_musculos enable row level security;
alter table treinos enable row level security;
alter table treino_exercicios enable row level security;
alter table treino_exercicio_series enable row level security;
alter table treino_registros enable row level security;

create policy "musculos_owner" on musculos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "padroes_movimento_owner" on padroes_movimento for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "exercicios_owner" on exercicios for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "exercicio_musculos_owner" on exercicio_musculos for all
  using (exercicio_id in (select id from exercicios where user_id = auth.uid()))
  with check (exercicio_id in (select id from exercicios where user_id = auth.uid()));

create policy "padrao_movimento_musculos_owner" on padrao_movimento_musculos for all
  using (padrao_id in (select id from padroes_movimento where user_id = auth.uid()))
  with check (padrao_id in (select id from padroes_movimento where user_id = auth.uid()));

create policy "treinos_owner" on treinos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "treino_exercicios_owner" on treino_exercicios for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "treino_exercicio_series_owner" on treino_exercicio_series for all
  using (treino_exercicio_id in (select id from treino_exercicios where user_id = auth.uid()))
  with check (treino_exercicio_id in (select id from treino_exercicios where user_id = auth.uid()));

create policy "treino_registros_owner" on treino_registros for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on v_musculo_volume_planejado to authenticated;
grant select on v_musculo_volume_realizado to authenticated;

-- ============================================================
-- PESO CORPORAL
-- ============================================================

create table pesos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data date not null,
  peso numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, data)
);

create table peso_metas (
  user_id uuid primary key references auth.users(id),
  tipo text not null check (tipo in ('percentual', 'manutencao')),
  percentual numeric,
  peso_manutencao numeric,
  updated_at timestamptz not null default now()
);

alter table pesos enable row level security;
alter table peso_metas enable row level security;

create policy "pesos_owner" on pesos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "peso_metas_owner" on peso_metas for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- FOTOS
-- ============================================================

create table fotos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data_foto date not null,
  url text not null,
  ordem int not null default 0
);

create index fotos_user_data_idx on fotos (user_id, data_foto);

alter table fotos enable row level security;

create policy "fotos_owner" on fotos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bucket de Storage para as fotos, escopado por usuário via convenção de
-- path "{user_id}/{data_foto}/{filename}".
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy "fotos_storage_owner_select" on storage.objects for select
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos_storage_owner_insert" on storage.objects for insert
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos_storage_owner_update" on storage.objects for update
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos_storage_owner_delete" on storage.objects for delete
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- DIETA — metas e planos de refeição
-- ============================================================

create table dieta_perfil (
  user_id uuid primary key references auth.users(id),
  peso_atual numeric not null default 76,
  meta_calorias numeric not null default 2000,
  proteina_g_kg numeric not null default 2.17,
  gordura_g_kg numeric not null default 0.66,
  carboidrato_g_kg numeric not null default 2.93,
  gorduras_saturadas_g numeric default 16,
  fibras_g numeric default 28,
  agua_l numeric default 3.8,
  updated_at timestamptz not null default now()
);

create table dieta_planos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  titulo text not null,
  descricao text,
  calorias numeric not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table dieta_refeicoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references dieta_planos(id) on delete cascade,
  nome text not null,
  proteina numeric not null default 0,
  gordura numeric not null default 0,
  carboidrato numeric not null default 0,
  calorias numeric not null default 0,
  ordem int not null default 0
);

alter table dieta_perfil enable row level security;
alter table dieta_planos enable row level security;
alter table dieta_refeicoes enable row level security;

create policy "dieta_perfil_owner" on dieta_perfil for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "dieta_planos_owner" on dieta_planos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "dieta_refeicoes_owner" on dieta_refeicoes for all
  using (plano_id in (select id from dieta_planos where user_id = auth.uid()))
  with check (plano_id in (select id from dieta_planos where user_id = auth.uid()));

-- ============================================================
-- DIETA — base de alimentos e diário
-- ============================================================

create table alimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  marca text,
  porcao_padrao_qtd numeric not null default 100,
  porcao_padrao_unidade text not null default 'g' check (porcao_padrao_unidade in ('g', 'ml', 'unidade')),
  calorias_por_porcao numeric not null default 0,
  proteina_g numeric not null default 0,
  gordura_g numeric not null default 0,
  carboidrato_g numeric not null default 0,
  fibra_g numeric,
  sodio_mg numeric,
  codigo_barras text unique,
  fonte text not null default 'manual' check (fonte in ('manual', 'openfoodfacts')),
  created_at timestamptz not null default now()
);

create table diario_alimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  alimento_id uuid not null references alimentos(id) on delete restrict,
  data date not null,
  refeicao text not null check (refeicao in ('cafe_da_manha', 'almoco', 'jantar', 'lanche')),
  quantidade numeric not null default 1,
  unidade text not null,
  -- valores congelados no momento do registro (mesmo padrão de dieta_refeicoes):
  -- editar um alimento depois não reescreve o histórico já logado.
  calorias numeric not null,
  proteina_g numeric not null,
  gordura_g numeric not null,
  carboidrato_g numeric not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index diario_alimentos_user_data_idx on diario_alimentos (user_id, data);

alter table alimentos enable row level security;
alter table diario_alimentos enable row level security;

create policy "alimentos_owner" on alimentos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "diario_alimentos_owner" on diario_alimentos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- CONFIGURAÇÕES DO USUÁRIO
-- ============================================================

-- Preferências de UI que não pertencem a um domínio específico.
-- historico_fonte controla a coluna "Anterior" na tela de log de treino:
-- 'ultimo_exercicio' = última vez que esse exercício foi feito (em qualquer
-- rotina); 'ultima_rotina' = último registro desse exercício especificamente
-- dentro da rotina atual.
create table usuario_config (
  user_id uuid primary key references auth.users(id),
  historico_fonte text not null default 'ultimo_exercicio'
    check (historico_fonte in ('ultimo_exercicio', 'ultima_rotina')),
  updated_at timestamptz not null default now()
);

alter table usuario_config enable row level security;

create policy "usuario_config_owner" on usuario_config for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
