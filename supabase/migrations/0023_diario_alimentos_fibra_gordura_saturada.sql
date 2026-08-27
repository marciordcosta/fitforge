-- 0023_diario_alimentos_fibra_gordura_saturada.sql
-- Cada item lançado no diário passa a guardar também fibra e gordura saturada (o alimento já
-- tinha esses dados, só não eram copiados pro item lançado) — dá pra somar o consumo real do dia.

alter table diario_alimentos
  add column if not exists fibra_g numeric,
  add column if not exists gordura_saturada_g numeric;

notify pgrst, 'reload schema';
