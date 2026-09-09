-- meta_series vira numeric (aceita 0.5 em ponderado/acumulado, ex: 4.5, 7.5);
-- meta_tipo guarda em qual coluna a meta foi definida (Total/Pond./Acum.) —
-- sem isso não dá pra saber se "7.5" é ponderado ou uma leitura errada de bruto.
-- Metas existentes (todas de hoje, sempre bruto) viram 'total' pelo default,
-- mesmo comportamento de antes.

alter table treino_metas_musculo alter column meta_series type numeric using meta_series::numeric;
alter table treino_metas_musculo add column meta_tipo text not null default 'total';

notify pgrst, 'reload schema';
