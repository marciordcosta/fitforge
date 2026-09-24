alter table dieta_perfil
  add column if not exists acumular_calorias boolean not null default false,
  add column if not exists dia_reset_saldo_calorico integer;

create table dieta_saldo_refeicao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data date not null,
  refeicao_nome text not null,
  delta_carboidrato_g numeric not null,
  created_at timestamptz not null default now()
);

create unique index dieta_saldo_refeicao_user_data_refeicao_idx
  on dieta_saldo_refeicao (user_id, data, refeicao_nome);

alter table dieta_saldo_refeicao enable row level security;

create policy "dieta_saldo_refeicao_owner" on dieta_saldo_refeicao for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Correção manual (Editar/Excluir no card de saldo acumulado): guarda o saldo final JÁ CORRIGIDO
-- do dia anterior ao dia editado — os dias seguintes voltam a acumular normalmente a partir desse
-- valor, ignorando o que teria sido derivado antes dele.
create table dieta_saldo_ajuste (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data date not null,
  saldo_final_kcal numeric not null,
  created_at timestamptz not null default now()
);

create unique index dieta_saldo_ajuste_user_data_idx on dieta_saldo_ajuste (user_id, data);

alter table dieta_saldo_ajuste enable row level security;

create policy "dieta_saldo_ajuste_owner" on dieta_saldo_ajuste for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
