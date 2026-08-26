-- 0018_dieta_calorias_dia_macros.sql
-- Cada dia com calorias travadas manualmente passa a guardar também sua
-- composição de macros (proteina/gordura/carboidrato), não só o total.

alter table dieta_calorias_dia
  add column if not exists proteina_g numeric,
  add column if not exists gordura_g numeric,
  add column if not exists carboidrato_g numeric;

notify pgrst, 'reload schema';
