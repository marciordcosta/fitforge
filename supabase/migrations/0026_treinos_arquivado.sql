-- Permite "arquivar" uma rotina (tirar da lista principal) sem apagar
-- nada — diferente de excluir, que agora é bloqueado enquanto a rotina
-- tiver histórico de treinos registrados (migração 0025).

alter table treinos
  add column arquivado boolean not null default false;

notify pgrst, 'reload schema';
