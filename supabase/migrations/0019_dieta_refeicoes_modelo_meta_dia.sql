-- 0019_dieta_refeicoes_modelo_meta_dia.sql
-- Em modo Ondulatoria, cada refeicao do catalogo pode ter um prato de meta
-- diferente por dia da semana, em vez de sempre usar o mesmo
-- meta_receita_id global (dieta_refeicoes_modelo). Ausencia de linha aqui =
-- usa o meta_receita_id global da refeicao como padrao pra aquele dia.

create table if not exists dieta_refeicoes_modelo_meta_dia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  modelo_id uuid not null references dieta_refeicoes_modelo(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  meta_receita_id uuid not null references dieta_receitas(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, modelo_id, dia_semana)
);

alter table dieta_refeicoes_modelo_meta_dia enable row level security;

drop policy if exists "dieta_refeicoes_modelo_meta_dia_owner" on dieta_refeicoes_modelo_meta_dia;
create policy "dieta_refeicoes_modelo_meta_dia_owner" on dieta_refeicoes_modelo_meta_dia for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
