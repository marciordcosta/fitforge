alter table peso_metas add column percentual_min numeric;
alter table peso_metas add column percentual_max numeric;
update peso_metas set percentual_min = percentual, percentual_max = percentual where tipo = 'percentual';

alter table peso_metas_historico add column percentual_min numeric;
alter table peso_metas_historico add column percentual_max numeric;
update peso_metas_historico set percentual_min = percentual, percentual_max = percentual where tipo = 'percentual';
