-- "Valores das refeições (home) correspondem a" deixa de ser um binário (meta da refeição/meta
-- diária) e vira um formato completo de exibição — reaproveita a mesma coluna
-- (refeicoes_valores_base), só troca os valores aceitos e o default.

alter table dieta_perfil drop constraint if exists dieta_perfil_refeicoes_valores_base_check;

update dieta_perfil set refeicoes_valores_base = 'restante_acima';

alter table dieta_perfil alter column refeicoes_valores_base set default 'restante_acima';

alter table dieta_perfil
  add constraint dieta_perfil_refeicoes_valores_base_check
    check (refeicoes_valores_base in ('percentual_refeicao', 'percentual_diario', 'restante_acima', 'meta_refeicao'));

notify pgrst, 'reload schema';
