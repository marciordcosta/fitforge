alter table treino_registros
  add column recorde_1rm boolean not null default false,
  add column recorde_volume boolean not null default false;

-- Backfill: por exercício, cada DIA cujo máximo (1RM estimado / volume de uma série)
-- supera o máximo de TODOS os dias anteriores marca a(s) série(s) daquele dia que
-- atingiram esse máximo. Empate exato no mesmo dia marca mais de uma série — raro e
-- inofensivo (as duas bateram o recorde igualmente naquele dia).
with sets_calc as (
  select id, exercicio_id, data, serie,
    (peso * (1 + repeticoes::numeric / 30)) as rm,
    (peso * repeticoes) as volume
  from treino_registros
  where peso is not null and repeticoes is not null
),
dia_max as (
  select exercicio_id, data, max(rm) as rm_dia, max(volume) as volume_dia
  from sets_calc
  group by exercicio_id, data
),
dia_prev as (
  select exercicio_id, data, rm_dia, volume_dia,
    max(rm_dia) over (partition by exercicio_id order by data rows between unbounded preceding and 1 preceding) as rm_prev,
    max(volume_dia) over (partition by exercicio_id order by data rows between unbounded preceding and 1 preceding) as volume_prev
  from dia_max
),
alvo as (
  select
    sc.id,
    (dp.rm_dia > coalesce(dp.rm_prev, 0) and sc.rm = dp.rm_dia) as bate_1rm,
    (dp.volume_dia > coalesce(dp.volume_prev, 0) and sc.volume = dp.volume_dia) as bate_volume
  from sets_calc sc
  join dia_prev dp using (exercicio_id, data)
)
update treino_registros tr set
  recorde_1rm = coalesce((select bate_1rm from alvo where alvo.id = tr.id), false),
  recorde_volume = coalesce((select bate_volume from alvo where alvo.id = tr.id), false);

notify pgrst, 'reload schema';
