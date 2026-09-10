-- 0042 tratou os cortes de fadiga por posicao como numero ABSOLUTO de series (default 6/15).
-- Modelo errado: a ideia nao e medir fadiga fisica real (isso varia dia a dia, impossivel de
-- medir de forma confiavel) e sim uma heuristica 80/20 de priorizacao -- os primeiros X% da
-- sessao sao o "bloco" de maior retorno, entao a unidade certa e % da sessao, nao posicao
-- absoluta. Corrige o default e os valores ja gravados (linha unica de configuracao) para
-- percentual (20/50), equivalente ao 20/30/50 antigo.
alter table treino_parametros alter column fadiga_fases_corte_a set default 20;
alter table treino_parametros alter column fadiga_fases_corte_b set default 50;

update treino_parametros set fadiga_fases_corte_a = 20, fadiga_fases_corte_b = 50
where fadiga_fases_corte_a = 6 and fadiga_fases_corte_b = 15;

notify pgrst, 'reload schema';
