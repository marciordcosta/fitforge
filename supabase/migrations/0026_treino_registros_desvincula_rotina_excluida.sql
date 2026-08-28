-- O histórico (treino_registros) pertence ao exercício realizado, não à
-- rotina que o originou — a rotina é só um agrupamento/template de
-- exercícios de um dia. Excluir a rotina não pode mais bloquear nem
-- apagar o histórico (substitui o "on delete restrict" da migração
-- 0025): os registros ficam soltos (treino_id nulo) e continuam
-- aparecendo no histórico como "Treino Avulso".

alter table treino_registros
  drop constraint treino_registros_treino_id_fkey;

alter table treino_registros
  alter column treino_id drop not null;

alter table treino_registros
  add constraint treino_registros_treino_id_fkey
    foreign key (treino_id) references treinos(id) on delete set null;

notify pgrst, 'reload schema';
