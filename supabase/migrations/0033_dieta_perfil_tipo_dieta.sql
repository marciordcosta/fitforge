-- Classificação da dieta (Cutting/Manutenção/Bulking) — campo novo na
-- aba Calorias da tela de Parâmetros. Guardado junto do resto do
-- perfil de metas (dieta_perfil), com default 'manutencao' pra não
-- quebrar quem já tem uma linha salva.

alter table dieta_perfil
  add column if not exists tipo_dieta text not null default 'manutencao'
    check (tipo_dieta in ('cutting', 'manutencao', 'bulking'));

notify pgrst, 'reload schema';
