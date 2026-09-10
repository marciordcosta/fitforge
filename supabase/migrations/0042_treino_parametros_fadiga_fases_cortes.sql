-- Cortes do modo de fadiga "Fases" (A/B/C por posicao) passam a ser em numero ABSOLUTO de
-- series, nao mais percentual do total da sessao -- um treino curto e um longo tratavam a
-- mesma posicao absoluta como "fadiga" em momentos bem diferentes, o que nao bate com como
-- fadiga real se acumula (por volume feito, nao pela fracao do que foi planejado no dia).
alter table treino_parametros add column fadiga_fases_corte_a int not null default 6;
alter table treino_parametros add column fadiga_fases_corte_b int not null default 15;

notify pgrst, 'reload schema';
