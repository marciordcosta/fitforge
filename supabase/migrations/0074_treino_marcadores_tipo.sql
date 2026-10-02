alter table treino_marcadores
  add column tipo text not null default 'apenas_marcar'
    check (tipo in ('desconsiderar', 'reiniciar', 'apenas_marcar'));

notify pgrst, 'reload schema';
