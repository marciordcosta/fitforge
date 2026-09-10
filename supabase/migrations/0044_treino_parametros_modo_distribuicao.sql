-- Card "Modo de Distribuicao" em Parametrizacao: transforma em configuravel um bocado de regra
-- que ate aqui era fixa no codigo (quais colunas aparecem, qual campo classifica a cor das
-- celulas de dia/rotina x coluna Total, o que os graficos usam como tamanho de fatia, e se os
-- aneis de grupo muscular da tela de Rotinas mostram todas as rotinas da semana ou so a proxima).
alter table treino_parametros add column mostrar_series_totais boolean not null default true;
alter table treino_parametros add column mostrar_series_ponderadas boolean not null default true;
alter table treino_parametros add column mostrar_series_acumuladas boolean not null default true;

-- Classificacao/cor das celulas de dia e rotina na grade semanal: total (bruto) por padrao,
-- igual o comportamento fixo anterior.
alter table treino_parametros add column usar_total_na_grade boolean not null default true;
-- Classificacao/cor e soma da coluna Total da grade semanal: ponderado por padrao, igual o
-- comportamento fixo anterior.
alter table treino_parametros add column usar_ponderado_no_total boolean not null default true;

-- Qual campo os graficos (aneis) usam como tamanho de fatia: 'destacada' reproduz o
-- comportamento fixo anterior (segue a coluna Total/Pond./Acum. selecionada na grade).
alter table treino_parametros add column grafico_campo text not null default 'destacada'
  check (grafico_campo in ('total', 'ponderado', 'destacada'));

-- Aneis de grupo muscular na tela de Rotinas: 'todos' reproduz o comportamento fixo anterior
-- (top 6 musculos por volume planejado somando todas as rotinas da semana).
alter table treino_parametros add column home_modo_grupos text not null default 'todos'
  check (home_modo_grupos in ('todos', 'proximo'));

notify pgrst, 'reload schema';
