-- 0021_dieta_parametros.sql
-- Parametros de dieta editaveis pelo usuario, sempre como min/max por kg
-- de peso. Ausencia de linha pra uma chave = usa o padrao embutido no
-- app (PARAMETROS_PADRAO). Pra parametros so-de-minimo (ex: calorias),
-- max_por_kg fica igual a min_por_kg (nao e exibido/editado na tela).

create table if not exists dieta_parametros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  chave text not null,
  min_por_kg numeric not null,
  max_por_kg numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, chave)
);

alter table dieta_parametros enable row level security;

drop policy if exists "dieta_parametros_owner" on dieta_parametros;
create policy "dieta_parametros_owner" on dieta_parametros for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
