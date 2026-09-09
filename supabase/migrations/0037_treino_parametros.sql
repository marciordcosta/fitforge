-- treino_parametros: configurações do usuário pra classificação de
-- volume semanal (Manutenção/Foco) e modo de cálculo de fadiga por
-- posição (Fases fixas vs Gradual contínuo) — usado em
-- DistribuicaoMusculos.svelte. Uma linha por usuário; ausência de
-- linha = usa os padrões (mesmo comportamento de hoje).

create table treino_parametros (
  user_id uuid primary key references auth.users(id),
  series_manutencao_min int not null default 4,
  series_manutencao_max int not null default 6,
  series_foco_min int not null default 12,
  fadiga_modo text not null default 'fases', -- 'fases' | 'gradual'
  fadiga_gradual_c numeric not null default 0.12,
  fadiga_gradual_d numeric not null default 0.025,
  updated_at timestamptz not null default now()
);

alter table treino_parametros enable row level security;

create policy "treino_parametros_owner" on treino_parametros for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
