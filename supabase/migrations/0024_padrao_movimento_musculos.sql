-- Catálogo de músculos associados a cada padrão de movimento, usado para
-- filtrar as opções de músculo ao cadastrar um exercício vinculado a um
-- padrão (evita digitar/duplicar nomes de músculo por exercício).

create table padrao_movimento_musculos (
  id uuid primary key default gen_random_uuid(),
  padrao_id uuid not null references padroes_movimento(id) on delete cascade,
  musculo_id uuid not null references musculos(id) on delete cascade,
  unique (padrao_id, musculo_id)
);

alter table padrao_movimento_musculos enable row level security;

create policy "padrao_movimento_musculos_owner" on padrao_movimento_musculos for all
  using (padrao_id in (select id from padroes_movimento where user_id = auth.uid()))
  with check (padrao_id in (select id from padroes_movimento where user_id = auth.uid()));

notify pgrst, 'reload schema';
