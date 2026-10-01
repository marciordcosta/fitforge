-- Preferência de exibição dos cards de refeição na home do Diário: "barras" (padrão, de sempre)
-- ou "resumo" (troca as barras por uma linha com os nomes dos alimentos lançados).

alter table dieta_perfil add column refeicoes_exibicao text not null default 'barras';

notify pgrst, 'reload schema';
