<script lang="ts">
  import { untrack } from "svelte";
  import WheelPicker from "../../components/WheelPicker.svelte";

  let {
    quantidadeInicial,
    porcaoPadraoUnidade,
    onSalvar,
    onFechar,
  }: {
    quantidadeInicial: number;
    porcaoPadraoUnidade: string;
    onSalvar: (quantidade: number) => void;
    onFechar: () => void;
  } = $props();

  const rotuloUnidade = untrack(() => (porcaoPadraoUnidade === "unidade" ? "un" : porcaoPadraoUnidade));
  const maxPadrao = untrack(() => (porcaoPadraoUnidade === "unidade" ? 100 : 1000));
  const valorInicial = untrack(() => Math.max(1, Math.round(quantidadeInicial)));
  const maxFinal = Math.max(maxPadrao, valorInicial);

  const opcoes = Array.from({ length: maxFinal }, (_, i) => i + 1).map((v) => ({
    valor: v,
    label: `${v} ${rotuloUnidade}`,
  }));
</script>

<WheelPicker
  titulo="Quanto?"
  subtitulo={`Quantidade em ${rotuloUnidade}`}
  {opcoes}
  valorAtual={valorInicial}
  onSelecionar={(v) => onSalvar(v)}
  {onFechar}
/>
