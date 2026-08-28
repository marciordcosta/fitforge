-- treino_registros.treino_id estava com "on delete cascade": apagar uma
-- rotina apagava silenciosamente todo o histórico de séries registradas
-- nela, sem aviso. Troca para "on delete restrict", igual já era feito
-- para exercicio_id — passa a bloquear a exclusão da rotina enquanto
-- houver histórico, em vez de apagar tudo junto.

alter table treino_registros
  drop constraint treino_registros_treino_id_fkey;

alter table treino_registros
  add constraint treino_registros_treino_id_fkey
    foreign key (treino_id) references treinos(id) on delete restrict;

notify pgrst, 'reload schema';
