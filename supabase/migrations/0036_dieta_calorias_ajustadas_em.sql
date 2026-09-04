-- calorias_ajustadas_em: data do último ajuste real na meta calórica
-- (dieta_perfil.meta_calorias) — usada pra dar ~14 dias de "carência"
-- antes de calcular o status de aderência à dieta, já que a média de
-- peso demora a refletir um ajuste recém-feito. NULL = nunca rastreado
-- (usuário já usava o app antes dessa coluna existir, ou nunca mexeu
-- nas calorias) — tratado como "sem carência", pra não travar quem já
-- está estável há meses.

alter table dieta_perfil add column calorias_ajustadas_em timestamptz;

notify pgrst, 'reload schema';
