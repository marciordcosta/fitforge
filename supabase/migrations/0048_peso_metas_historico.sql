create table peso_metas_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('percentual', 'manutencao')),
  percentual numeric,
  peso_alvo numeric,
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  unique (user_id, vigente_desde)
);

create index peso_metas_historico_user_data_idx on peso_metas_historico (user_id, vigente_desde);

alter table peso_metas_historico enable row level security;

create policy "peso_metas_historico_owner" on peso_metas_historico for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Semeia o histórico com a meta atual de cada usuário, valendo "desde sempre" — não há como saber
-- o que valia antes disso, então tratamos a meta atual como se sempre tivesse sido essa.
insert into peso_metas_historico (user_id, tipo, percentual, peso_alvo, vigente_desde)
select user_id, tipo, percentual, peso_alvo, '2000-01-01'::date from peso_metas
on conflict (user_id, vigente_desde) do nothing;

notify pgrst, 'reload schema';
