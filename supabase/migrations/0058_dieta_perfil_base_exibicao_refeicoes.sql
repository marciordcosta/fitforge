-- Parametrização: a que a barra e o valor mostrados nos cards de refeição (home e detalhe da
-- refeição) correspondem — a meta DAQUELA refeição (como sempre foi) ou a meta DIÁRIA inteira.
-- Duas colunas independentes porque o usuário pode querer, por ex., a barra ainda por refeição
-- mas o texto embaixo já contra a meta do dia. Default 'refeicao' preserva o comportamento atual.

alter table dieta_perfil
  add column if not exists refeicoes_barra_base text not null default 'refeicao'
    check (refeicoes_barra_base in ('refeicao', 'diaria')),
  add column if not exists refeicoes_valores_base text not null default 'refeicao'
    check (refeicoes_valores_base in ('refeicao', 'diaria'));

notify pgrst, 'reload schema';
