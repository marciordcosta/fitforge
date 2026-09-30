-- Troca o reset automático do contador de "registros" (dias de treino feitos
-- desde a última edição da rotina, no rodapé do card) por um reset manual:
-- editar a rotina (exercícios/séries) não zera mais a contagem sozinho. O
-- usuário decide quando zerar, em Parametrização (uma rotina por vez ou
-- todas de uma vez) — ver zerarRegistrosRotina em treinoApi.ts.

drop trigger if exists trg_treino_exercicios_composicao on treino_exercicios;
drop trigger if exists trg_treino_exercicio_series_composicao on treino_exercicio_series;
drop function if exists treino_toca_composicao_atualizada_em();
drop function if exists treino_exercicio_series_toca_composicao_atualizada_em();

alter table treinos rename column composicao_atualizada_em to registros_zerados_em;

notify pgrst, 'reload schema';
