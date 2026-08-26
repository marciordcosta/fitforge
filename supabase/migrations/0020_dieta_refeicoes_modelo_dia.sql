-- 0020_dieta_refeicoes_modelo_dia.sql
-- Em modo Ondulatoria, cada dia da semana pode ter sua propria lista de
-- refeicoes (quais aparecem e em que ordem), independente dos outros
-- dias. Ausencia de QUALQUER linha pra um dia = esse dia ainda usa o
-- catalogo global inteiro, na ordem global (comportamento de hoje,
-- default ate o dia ser customizado pela primeira vez).

create table if not exists dieta_refeicoes_modelo_dia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  modelo_id uuid not null references dieta_refeicoes_modelo(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  ordem int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, modelo_id, dia_semana)
);

alter table dieta_refeicoes_modelo_dia enable row level security;

drop policy if exists "dieta_refeicoes_modelo_dia_owner" on dieta_refeicoes_modelo_dia;
create policy "dieta_refeicoes_modelo_dia_owner" on dieta_refeicoes_modelo_dia for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
