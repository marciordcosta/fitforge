create extension if not exists unaccent;

alter table alimentos add column if not exists nome_normalizado text;

create or replace function alimentos_normalizar_nome() returns trigger as $$
begin
  new.nome_normalizado := lower(unaccent(new.nome));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_alimentos_normalizar_nome on alimentos;
create trigger trg_alimentos_normalizar_nome
  before insert or update of nome on alimentos
  for each row execute function alimentos_normalizar_nome();

update alimentos set nome_normalizado = lower(unaccent(nome));

notify pgrst, 'reload schema';
