-- Cortes do modo de fadiga "Fases" (A/B/C por posicao na sessao) -- corte em % da sessao
-- (nao numero absoluto de series). Isto nao modela fadiga fisica real (varia dia a dia, nao
-- da pra medir de forma confiavel) -- e uma heuristica 80/20 de priorizacao: os primeiros
-- X% da sessao sao o "bloco" de maior retorno, e exercicios foco devem cair ali, seja o
-- treino curto ou longo.
alter table treino_parametros add column fadiga_fases_corte_a int not null default 20;
alter table treino_parametros add column fadiga_fases_corte_b int not null default 50;

notify pgrst, 'reload schema';
