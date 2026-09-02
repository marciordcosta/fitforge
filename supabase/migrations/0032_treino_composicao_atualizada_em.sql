-- Marca quando a composição de cada rotina (exercícios/séries) foi editada
-- pela última vez — usado pelo card de rotina pra contar só os "registros"
-- (dias de treino distintos) feitos DEPOIS da última edição, e zerar esse
-- contador sempre que a rotina é alterada. Atualizado via trigger (não pelo
-- app) pra cobrir qualquer caminho de edição — editor completo (delete+
-- insert), ajuste rápido de série, trocar/mover exercício, reordenar etc. —
-- sem precisar lembrar de tocar essa coluna em cada função nova.

alter table treinos add column composicao_atualizada_em timestamptz not null default now();

create or replace function treino_toca_composicao_atualizada_em() returns trigger as $$
begin
  update treinos set composicao_atualizada_em = now() where id = coalesce(new.treino_id, old.treino_id);
  return null;
end;
$$ language plpgsql;

create trigger trg_treino_exercicios_composicao
after insert or update or delete on treino_exercicios
for each row execute function treino_toca_composicao_atualizada_em();

create or replace function treino_exercicio_series_toca_composicao_atualizada_em() returns trigger as $$
declare
  tid uuid;
begin
  select treino_id into tid from treino_exercicios where id = coalesce(new.treino_exercicio_id, old.treino_exercicio_id);
  if tid is not null then
    update treinos set composicao_atualizada_em = now() where id = tid;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger trg_treino_exercicio_series_composicao
after insert or update or delete on treino_exercicio_series
for each row execute function treino_exercicio_series_toca_composicao_atualizada_em();

notify pgrst, 'reload schema';
