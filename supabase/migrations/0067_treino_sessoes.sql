create table treino_sessoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  treino_id uuid references treinos(id) on delete cascade,
  data date not null,
  duracao_seg integer not null check (duracao_seg >= 0),
  created_at timestamptz not null default now()
);

create index treino_sessoes_user_treino_data_idx on treino_sessoes (user_id, treino_id, data);

alter table treino_sessoes enable row level security;

create policy "treino_sessoes_owner" on treino_sessoes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
