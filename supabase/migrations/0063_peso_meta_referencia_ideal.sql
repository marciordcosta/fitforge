alter table peso_metas add column if not exists referencia_ideal text default 'minimo';
alter table peso_metas_historico add column if not exists referencia_ideal text default 'minimo';
update peso_metas set referencia_ideal = 'minimo' where referencia_ideal is null;
update peso_metas_historico set referencia_ideal = 'minimo' where referencia_ideal is null;
