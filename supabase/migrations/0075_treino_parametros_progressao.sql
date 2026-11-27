-- Preferencias da progressao que estavam so no aparelho (localStorage) passam a morar no banco.
-- Colunas anulaveis de proposito: NULL = ainda nao gravado no banco; nesse caso o app sobe uma vez
-- o valor que o aparelho ja tinha (nada se perde) e depois o banco passa a valer em todos os aparelhos.
alter table treino_parametros add column if not exists pausa_reiniciar_semanas integer check (pausa_reiniciar_semanas >= 0);
alter table treino_parametros add column if not exists janela_progressao_semanas integer check (janela_progressao_semanas >= 0);
alter table treino_parametros add column if not exists fadiga_ativa boolean;

notify pgrst, 'reload schema';
