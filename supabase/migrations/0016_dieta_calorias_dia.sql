-- 0016_dieta_calorias_dia.sql
-- Distribuicao semanal de calorias: modo Fixa/Ondulatoria e ajuste manual por dia da semana.

alter table dieta_perfil
  add column if not exists modo_calorias text not null default 'fixa'
    check (modo_calorias in ('fixa', 'ondulatoria'));

create table if not exists dieta_calorias_dia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  dia_semana int not null check (dia_semana between 0 and 6),
  calorias numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, dia_semana)
);

alter table dieta_calorias_dia enable row level security;

drop policy if exists "dieta_calorias_dia_owner" on dieta_calorias_dia;
create policy "dieta_calorias_dia_owner" on dieta_calorias_dia for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
