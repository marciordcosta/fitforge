-- Nome da refeição vira independente por grupo de dias (Ondulatória) — renomear "Lanche" só no
-- grupo Lower1, por exemplo, sem afetar Upper1 nem o nome global do catálogo. Nulo = continua
-- usando o nome global do modelo (dieta_refeicoes_modelo.nome), igual já funciona pra meta_receita_id
-- e as metas numéricas por dia.

alter table dieta_refeicoes_modelo_meta_dia
  add column if not exists nome text;

notify pgrst, 'reload schema';
