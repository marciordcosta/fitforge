-- Numeros da meta viram colunas diretas (nao mais somados de um prato) --
-- calorias continuam derivadas (4*prot + 9*gord + 4*carb), sem coluna propria,
-- igual ja funciona pra meta diaria (caloriasCalc).
alter table dieta_refeicoes_modelo
  add column if not exists meta_proteina_g numeric,
  add column if not exists meta_gordura_g numeric,
  add column if not exists meta_carboidrato_g numeric;

alter table dieta_refeicoes_modelo_meta_dia
  add column if not exists meta_proteina_g numeric,
  add column if not exists meta_gordura_g numeric,
  add column if not exists meta_carboidrato_g numeric,
  alter column meta_receita_id drop not null;

notify pgrst, 'reload schema';
