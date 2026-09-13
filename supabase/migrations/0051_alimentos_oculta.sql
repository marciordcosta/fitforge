alter table alimentos add column oculta boolean not null default false;

notify pgrst, 'reload schema';
