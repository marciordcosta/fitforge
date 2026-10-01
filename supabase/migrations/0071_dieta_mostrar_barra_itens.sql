-- Preferências (Parametrização > Exibição das Refeições) da barrinha de progresso embaixo de cada
-- alimento, na lista de itens de uma refeição: "Mostrar barra nos alimentos" (liga/desliga) e,
-- quando ligada, "Visualizar como" Calorias (cor única, de sempre) ou Macros (preenchimento
-- dividido em 3 cores, proporcional às calorias de carb/gordura/proteína daquele item).

alter table dieta_perfil add column mostrar_barra_itens boolean not null default true;
alter table dieta_perfil add column cor_barra_itens text not null default 'calorias';

notify pgrst, 'reload schema';
