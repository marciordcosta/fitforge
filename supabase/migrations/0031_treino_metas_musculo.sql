-- Meta manual de séries por músculo dentro de uma rotina específica, editável
-- direto na grade "Distribuição na Semana". É opcional (nem toda célula tem
-- uma) e puramente informativa: a tela de edição de rotina mostra o saldo
-- (feito/meta) conforme os exercícios são adicionados/ajustados, mas nada
-- aqui trava a gravação da rotina se o saldo ficar negativo.

create table treino_metas_musculo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  treino_id uuid not null references treinos(id) on delete cascade,
  musculo_id uuid not null references musculos(id) on delete cascade,
  meta_series int not null check (meta_series >= 0),
  unique (treino_id, musculo_id)
);

alter table treino_metas_musculo enable row level security;

create policy "treino_metas_musculo_owner" on treino_metas_musculo for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
