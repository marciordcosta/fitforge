-- Guarda a ordem em que cada exercício foi feito dentro do dia/sessão.
-- Antes só existia "serie" (ordem dentro do próprio exercício); sem
-- isso, reconstruir o histórico dependia da ordem arbitrária que o
-- banco devolvia, que podia sair fora de ordem (ex: parecendo
-- alfabética).

alter table treino_registros
  add column ordem int not null default 0;

notify pgrst, 'reload schema';
