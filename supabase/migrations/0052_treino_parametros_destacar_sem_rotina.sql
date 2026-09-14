alter table treino_parametros add column destacar_exercicios_sem_rotina boolean not null default false;

notify pgrst, 'reload schema';
