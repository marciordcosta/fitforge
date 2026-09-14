alter table treino_parametros add column ordenacao_home text not null default 'dia';

notify pgrst, 'reload schema';
