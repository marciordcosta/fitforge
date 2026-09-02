-- home_cards: quais cards de resumo o usuário escolheu ter na Início
-- e em que ordem — cada linha é um card ativo; ausência de linha pra
-- um tipo = card removido. tipo é validado em código (homeApi.ts),
-- não via check constraint, pra não precisar de migração toda vez
-- que um card novo for adicionado no catálogo.

create table home_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tipo text not null,
  ordem int not null default 0,
  unique (user_id, tipo)
);

alter table home_cards enable row level security;

create policy "home_cards_owner" on home_cards for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
