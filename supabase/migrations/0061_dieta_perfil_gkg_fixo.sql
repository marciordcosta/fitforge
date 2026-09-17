-- Por padrão, editar a meta em Gerenciar > Calorias trava as GRAMAS (nunca mudam sozinhas até a
-- próxima edição) — só a proporção g/kg exibida acompanha o peso atual, como sinal de quando vale
-- reajustar manualmente. Esses dois campos permitem inverter isso por macro (proteína e gordura,
-- carboidrato nunca tem essa opção — ele é sempre a "válvula de ajuste" pra fechar a meta de
-- calorias): quando marcado, a proporção g/kg fica fixa e as gramas acompanham o peso sozinhas,
-- com o carboidrato se ajustando pra manter as calorias totais sempre iguais (nunca mudam
-- automaticamente).

alter table dieta_perfil
  add column if not exists proteina_gkg_fixo boolean not null default false,
  add column if not exists gordura_gkg_fixo boolean not null default false;

notify pgrst, 'reload schema';
