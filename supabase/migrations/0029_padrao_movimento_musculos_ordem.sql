-- Guarda a ordem em que cada músculo foi cadastrado no Padrão de
-- Movimento — sem isso, a leitura não tinha ordem garantida (o banco
-- podia devolver em qualquer sequência).

alter table padrao_movimento_musculos
  add column ordem int not null default 0;

notify pgrst, 'reload schema';
