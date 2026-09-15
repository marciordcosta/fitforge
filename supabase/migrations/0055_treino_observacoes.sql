create table treino_observacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  exercicio_id uuid not null references exercicios(id) on delete cascade,
  data date not null,
  observacao text not null,
  created_at timestamptz not null default now(),
  unique (user_id, exercicio_id, data)
);

create index treino_observacoes_exercicio_idx on treino_observacoes (exercicio_id, data);

alter table treino_observacoes enable row level security;

create policy "treino_observacoes_owner" on treino_observacoes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Backfill best-effort: a observação deixa de ser por slot de rotina (treino_exercicios) e
-- passa a ser por exercício — pega uma observação existente por exercício (se o mesmo
-- exercício tinha notas diferentes em rotinas diferentes, fica só uma) como a versão vigente
-- de hoje em diante; o histórico anterior a hoje não tinha observação registrada mesmo.
insert into treino_observacoes (user_id, exercicio_id, data, observacao)
select distinct on (te.user_id, te.exercicio_id) te.user_id, te.exercicio_id, current_date, te.observacao
from treino_exercicios te
where te.observacao is not null and trim(te.observacao) <> ''
order by te.user_id, te.exercicio_id, te.id;

alter table treino_exercicios drop column observacao;

notify pgrst, 'reload schema';
