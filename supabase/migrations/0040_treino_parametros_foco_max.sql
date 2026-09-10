-- Foco ganha um maximo (antes so tinha minimo, faixa aberta pra cima). O intervalo entre o
-- maximo da manutencao e o minimo do foco vira "moderado" automaticamente (sem coluna propria,
-- calculado em runtime) — ver classificarVolumeSemanal em treinoApi.ts.
alter table treino_parametros add column series_foco_max int not null default 20;

notify pgrst, 'reload schema';
