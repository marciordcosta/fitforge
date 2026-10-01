-- Quantos dias de carência (Parametrização > Calorias) depois de mudar a meta de calorias antes
-- do chip de aderência à dieta (Dentro do plano/Ajustar calorias) parar de mostrar "Calibrando…"
-- e voltar a dar veredito — era fixo em 14, agora configurável por usuário.

alter table dieta_perfil add column janela_calibracao_dias int not null default 14;

notify pgrst, 'reload schema';
