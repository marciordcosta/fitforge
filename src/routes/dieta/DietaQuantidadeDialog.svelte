<script lang="ts">
  import { untrack } from "svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";

  let {
    titulo,
    quantidadeInicial,
    porcaoPadraoUnidade,
    onSalvar,
    onFechar,
  }: {
    titulo: string;
    quantidadeInicial: number;
    porcaoPadraoUnidade: string;
    onSalvar: (quantidade: number) => void;
    onFechar: () => void;
  } = $props();

  const rotuloUnidade = untrack(() => (porcaoPadraoUnidade === "unidade" ? "un" : porcaoPadraoUnidade));
  const ehPeso = untrack(() => porcaoPadraoUnidade !== "unidade");
  const valorBruto = untrack(() => Math.max(1, Math.round(quantidadeInicial)));

  /** 1 a 5 de 1 em 1, depois de 5 em 5 até 500 (limite da porção em g/ml na refeição). */
  function gerarValoresPeso(): number[] {
    const valores = [1, 2, 3, 4, 5];
    for (let v = 10; v <= 500; v += 5) valores.push(v);
    if (valorBruto > 500) {
      const alvo = Math.ceil(valorBruto / 5) * 5;
      for (let v = 505; v <= alvo; v += 5) valores.push(v);
    }
    return valores;
  }

  function gerarValoresUnidade(): number[] {
    const max = Math.max(100, valorBruto);
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  function maisProximo(valor: number, valores: number[]): number {
    return valores.reduce((melhor, atual) => (Math.abs(atual - valor) < Math.abs(melhor - valor) ? atual : melhor), valores[0]);
  }

  const valoresBase = ehPeso ? gerarValoresPeso() : gerarValoresUnidade();
  const valorInicial = maisProximo(valorBruto, valoresBase);

  const opcoes = valoresBase.map((v) => ({ valor: v, label: `${v} ${rotuloUnidade}` }));
</script>

<WheelPicker
  {titulo}
  subtitulo={`Quantidade em ${rotuloUnidade}`}
  {opcoes}
  valorAtual={valorInicial}
  onSelecionar={(v) => onSalvar(v)}
  {onFechar}
/>
