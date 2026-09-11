-- Unifica usar_total_na_grade + usar_ponderado_no_total (2 booleans independentes, combinacoes
-- confusas) num unico campo de 3 opcoes, no mesmo padrao ja usado por grafico_campo: 'total'
-- (sempre bruto), 'ponderado' (sempre ponderado) ou 'destacada' (segue a coluna Total/Pond./Acum.
-- que o usuario tocou por ultimo na grade) -- controla tanto as celulas de dia/rotina quanto a
-- coluna Total da grade semanal.
alter table treino_parametros add column campo_grade text not null default 'destacada'
  check (campo_grade in ('total', 'ponderado', 'destacada'));

alter table treino_parametros drop column usar_total_na_grade;
alter table treino_parametros drop column usar_ponderado_no_total;

notify pgrst, 'reload schema';
