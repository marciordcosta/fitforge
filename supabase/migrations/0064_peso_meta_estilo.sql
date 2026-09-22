alter table peso_metas add column if not exists estilo_meta text default 'ritmo_semanal';
alter table peso_metas_historico add column if not exists estilo_meta text default 'ritmo_semanal';
update peso_metas set estilo_meta = 'ritmo_semanal' where estilo_meta is null;
update peso_metas_historico set estilo_meta = 'ritmo_semanal' where estilo_meta is null;
