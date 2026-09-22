alter table peso_metas add column if not exists dia_reset_semana integer default 1;
alter table peso_metas_historico add column if not exists dia_reset_semana integer default 1;
alter table peso_metas add column if not exists modo_media text default 'diario';
alter table peso_metas_historico add column if not exists modo_media text default 'diario';
