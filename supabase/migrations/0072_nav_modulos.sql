-- nav_modulos: ordem/visibilidade das abas Peso, Dieta, Treino e Fotos na barra inferior
-- (Início > Cards da Início > Módulos). Mesmo padrão de home_cards: cada linha é um módulo
-- visível, na posição `ordem`; ausência de linha = módulo escondido. "Início" nunca entra
-- aqui -- fica sempre fixa como primeira aba.

create table nav_modulos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  modulo text not null,
  ordem int not null default 0,
  unique (user_id, modulo)
);

alter table nav_modulos enable row level security;

create policy "nav_modulos_owner" on nav_modulos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
