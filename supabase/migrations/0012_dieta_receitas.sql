-- 0012_dieta_receitas.sql
-- Tabelas de Receita (combo reutilizavel e buscavel de varios alimentos ja cadastrados).

create table dieta_receitas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  created_at timestamptz not null default now()
);

create table dieta_receita_itens (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references dieta_receitas(id) on delete cascade,
  alimento_id uuid not null references alimentos(id) on delete restrict,
  quantidade numeric not null,
  ordem int not null default 0
);

create index dieta_receita_itens_receita_idx on dieta_receita_itens (receita_id);

alter table dieta_receitas enable row level security;
alter table dieta_receita_itens enable row level security;

create policy "dieta_receitas_owner" on dieta_receitas for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "dieta_receita_itens_owner" on dieta_receita_itens for all
  using (receita_id in (select id from dieta_receitas where user_id = auth.uid()))
  with check (receita_id in (select id from dieta_receitas where user_id = auth.uid()));

notify pgrst, 'reload schema';
