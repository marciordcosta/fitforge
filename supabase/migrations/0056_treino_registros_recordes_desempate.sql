-- Corrige dados já gravados pela migration 0054 (rodada antes desse ajuste): em caso de duas
-- séries idênticas batendo o mesmo recorde no mesmo dia, as duas ficavam marcadas com troféu.
-- Agora só a primeira (menor número de série) conta como recorde de verdade — a segunda apenas
-- igualou, não superou a anterior. Mesma lógica de 0054, com desempate por row_number().
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
    (dp.volume_dia > coalesce(dp.volume_prev, 0) and sc.volume = dp.volume_dia) as bate_volume,
    row_number() over (partition by sc.exercicio_id, sc.data, (sc.rm = dp.rm_dia) order by sc.serie) as rn_1rm,
    row_number() over (partition by sc.exercicio_id, sc.data, (sc.volume = dp.volume_dia) order by sc.serie) as rn_volume
  from sets_calc sc
  join dia_prev dp using (exercicio_id, data)
)
update treino_registros tr set
  recorde_1rm = coalesce((select bate_1rm and rn_1rm = 1 from alvo where alvo.id = tr.id), false),
  recorde_volume = coalesce((select bate_volume and rn_volume = 1 from alvo where alvo.id = tr.id), false);

notify pgrst, 'reload schema';
