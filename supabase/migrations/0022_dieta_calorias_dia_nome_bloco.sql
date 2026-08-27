-- 0022_dieta_calorias_dia_nome_bloco.sql
-- Cada dia travado manualmente na Ondulatória passa a poder pertencer a um
-- "bloco" nomeado (ex: "Treino A") — vários dias com o mesmo nome formam um
-- único bloco editável junto no modal de Calorias.

alter table dieta_calorias_dia
  add column if not exists nome_bloco text;

notify pgrst, 'reload schema';
