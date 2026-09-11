alter table dieta_receitas add column oculta boolean not null default false;

notify pgrst, 'reload schema';
