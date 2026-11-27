-- Janela de series semanais por musculo: minimo (series_minimas, ja existia) e maximo (novo).
-- Abaixo do minimo = insuficiente, dentro = manutencao, acima do maximo = foco. Nao existe mais janela
-- geral em Parametrizacao: cada musculo tem a sua (vazio usa 6 a 14 no app).
alter table musculos add column if not exists series_maximas int check (series_maximas >= 0);

-- Mantem o comportamento de hoje: quem ainda nao tinha janela propria herda os valores gerais de
-- Parametrizacao (minimo da Manutencao e maximo do Foco), que eram o limite do verde.
update musculos m
set series_minimas = coalesce(m.series_minimas, p.series_manutencao_min),
    series_maximas = coalesce(m.series_maximas, p.series_foco_max)
from treino_parametros p
where p.user_id = m.user_id;

notify pgrst, 'reload schema';
