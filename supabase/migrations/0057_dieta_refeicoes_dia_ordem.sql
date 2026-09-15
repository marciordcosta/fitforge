alter table dieta_refeicoes_dia add column ordem integer;

-- Backfill: ordem inicial pela ordem de criação de cada dia (aproxima o que já era mostrado,
-- já que antes a posição vinha do catálogo pra quem batia o nome, e de created_at pras avulsas).
with numeradas as (
  select id, row_number() over (partition by data order by created_at) - 1 as rn
  from dieta_refeicoes_dia
)
update dieta_refeicoes_dia d set ordem = n.rn
from numeradas n
where n.id = d.id;

alter table dieta_refeicoes_dia alter column ordem set not null;
alter table dieta_refeicoes_dia alter column ordem set default 0;

notify pgrst, 'reload schema';
