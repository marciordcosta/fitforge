-- Agrupamento Muscular: catálogo próprio (nome + user_id), usado pra
-- classificar músculos subdivididos (ex: "Ombro Anterior", "Ombro Lateral"
-- e "Ombro Posterior" pertencem ao agrupamento "Ombro"). Substitui o campo
-- livre musculos.grupo_exibicao (texto solto, sujeito a erro de digitação)
-- por uma referência a um cadastro único e reutilizável.

create table agrupamentos_musculares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nome text not null,
  ordem int not null default 0,
  unique (user_id, nome)
);

alter table agrupamentos_musculares enable row level security;

create policy "agrupamentos_musculares_owner" on agrupamentos_musculares for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table musculos add column agrupamento_id uuid references agrupamentos_musculares(id) on delete set null;

-- Migra qualquer valor já digitado em grupo_exibicao pra um agrupamento de verdade,
-- antes de remover a coluna de texto livre.
insert into agrupamentos_musculares (user_id, nome, ordem)
select distinct user_id, grupo_exibicao, 0
from musculos
where grupo_exibicao is not null and trim(grupo_exibicao) <> ''
on conflict (user_id, nome) do nothing;

update musculos m
set agrupamento_id = a.id
from agrupamentos_musculares a
where a.user_id = m.user_id and a.nome = m.grupo_exibicao;

alter table musculos drop column grupo_exibicao;

notify pgrst, 'reload schema';
