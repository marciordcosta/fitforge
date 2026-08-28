-- Limpeza: a coluna "arquivado" foi criada numa versão anterior de uma
-- função (arquivar rotina) que acabou sendo revertida antes de ir pra
-- produção. Remove se existir — não afeta nada além dela mesma.

alter table treinos drop column if exists arquivado;

notify pgrst, 'reload schema';
