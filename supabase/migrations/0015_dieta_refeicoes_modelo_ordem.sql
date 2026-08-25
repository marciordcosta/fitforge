-- 0015_dieta_refeicoes_modelo_ordem.sql
-- Ordem manual (drag-and-drop) das refeicoes cadastradas em "Gerenciar Refeicoes".

alter table dieta_refeicoes_modelo add column if not exists ordem int not null default 0;

update dieta_refeicoes_modelo m
set ordem = sub.rn
from (
  select id, row_number() over (partition by user_id order by created_at) as rn
  from dieta_refeicoes_modelo
) sub
where m.id = sub.id;

notify pgrst, 'reload schema';
