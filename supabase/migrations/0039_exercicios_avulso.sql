-- Exercicio "avulso": criado direto na sessao de treino ao vivo pra um exercicio que nao existe
-- no catalogo reutilizavel (ex: aparelho de outra academia, variacao pontual). Fica com uma linha
-- normal em exercicios (o historico/registros depende dessa FK), so nao aparece na lista/picker
-- de exercicios -- listExercicios() passa a filtrar avulso = false.
alter table exercicios add column avulso boolean not null default false;

notify pgrst, 'reload schema';
