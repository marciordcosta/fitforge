-- 0014_dieta_refeicoes_modelo_e_scanner.sql
-- Catalogo reutilizavel de nomes de refeicao (Gerenciar Refeicoes), substituindo a lista fixa de sugestoes.
-- Tambem adiciona o codigo de barras no alimento, usado pelo scanner (Open Food Facts) pra evitar duplicar o mesmo produto.

create table dieta_refeicoes_modelo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  created_at timestamptz not null default now()
);

alter table dieta_refeicoes_modelo enable row level security;

create policy "dieta_refeicoes_modelo_owner" on dieta_refeicoes_modelo for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table alimentos add column codigo_barras text;

-- Migra os usuarios existentes com as 4 sugestoes que ja existiam fixas no app, pra nao regredir a lista.
insert into dieta_refeicoes_modelo (user_id, nome)
select u.id, v.nome
from auth.users u
cross join (values ('Café da Manhã'), ('Almoço'), ('Jantar'), ('Lanche')) as v(nome);

notify pgrst, 'reload schema';
