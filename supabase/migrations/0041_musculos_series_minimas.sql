-- Override por musculo do minimo de series semanais (Manutencao) usado na classificacao de
-- volume (Parametrizacao > Classificacao de Volume Semanal) -- null = usa o minimo global.
-- Primeiro passo de landmarks por musculo (o teto/Foco continua global por enquanto, ver
-- discussao em treinoApi.ts/classificarVolumeSemanal).
alter table musculos add column series_minimas int;

notify pgrst, 'reload schema';
