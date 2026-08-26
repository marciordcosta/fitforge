-- 0017_dieta_refeicoes_modelo_meta.sql
-- Vincula cada refeicao do catalogo (Gerenciar > Refeicoes) a um "prato" (dieta_receitas)
-- que serve como meta de macros/calorias daquela refeicao.

alter table dieta_refeicoes_modelo
  add column if not exists meta_receita_id uuid references dieta_receitas(id) on delete set null;

notify pgrst, 'reload schema';
