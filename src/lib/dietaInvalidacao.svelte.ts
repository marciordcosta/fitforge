/**
 * Sinal simples pra invalidar dados de dieta já carregados numa aba diferente — as 5 abas
 * principais (App.svelte) ficam sempre montadas e só buscam seus dados uma vez, no boot; trocar
 * de aba depois disso não refaz o fetch. Isso significa que uma mudança feita numa aba (ex:
 * ajustar as calorias da semana pelo fluxo "Não vai treinar hoje?", iniciado no Home/Treino) não
 * chegava sozinha no Diário já aberto na aba Dieta. Quem muda algo que afeta a dieta chama
 * marcarDietaDesatualizada(); quem exibe dados de dieta observa `dietaInvalidacao.versao` num
 * $effect e recarrega quando ela mudar.
 */
let versao = $state(0);

export function marcarDietaDesatualizada(): void {
  versao++;
}

export const dietaInvalidacao = {
  get versao(): number {
    return versao;
  },
};
