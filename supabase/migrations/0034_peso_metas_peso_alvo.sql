-- peso_manutencao vira peso_alvo: o campo passa a guardar o peso
-- buscado tanto pra meta de manutenção quanto pra meta percentual
-- (cutting/bulking), que ganha um alvo final além do ritmo semanal.

alter table peso_metas rename column peso_manutencao to peso_alvo;

notify pgrst, 'reload schema';
