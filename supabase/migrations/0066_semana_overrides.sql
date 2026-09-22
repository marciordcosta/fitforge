create table treino_semana_override (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  semana_inicio date not null,
  dia_semana integer not null check (dia_semana between 0 and 6),
  treino_id uuid not null references treinos(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index treino_semana_override_user_semana_idx on treino_semana_override (user_id, semana_inicio);

alter table treino_semana_override enable row level security;

create policy "treino_semana_override_owner" on treino_semana_override for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table dieta_semana_override (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  semana_inicio date not null,
  dia_semana integer not null check (dia_semana between 0 and 6),
  calorias numeric not null,
  gordura_g numeric not null,
  created_at timestamptz not null default now()
);

create index dieta_semana_override_user_semana_idx on dieta_semana_override (user_id, semana_inicio);

alter table dieta_semana_override enable row level security;

create policy "dieta_semana_override_owner" on dieta_semana_override for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
