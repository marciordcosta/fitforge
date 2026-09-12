create table treino_marcadores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  exercicio_id uuid not null references exercicios(id) on delete cascade,
  data date not null,
  observacao text not null,
  created_at timestamptz not null default now(),
  unique (user_id, exercicio_id, data)
);

create index treino_marcadores_exercicio_idx on treino_marcadores (exercicio_id, data);

alter table treino_marcadores enable row level security;

create policy "treino_marcadores_owner" on treino_marcadores for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
