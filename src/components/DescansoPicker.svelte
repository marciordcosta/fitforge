<script lang="ts">
  import { OPCOES_DESCANSO, formatMinSeg } from "../lib/tempo";
  import WheelPicker from "./WheelPicker.svelte";

  let {
    nomeExercicio,
    valorAtual,
    onSelecionar,
    onFechar,
  }: {
    nomeExercicio: string;
    valorAtual: number | null;
    onSelecionar: (segundos: number | null) => void;
    onFechar: () => void;
  } = $props();

  const opcoes = [
    { valor: null, label: "Desativado" },
    ...OPCOES_DESCANSO.map((seg) => ({ valor: seg, label: formatMinSeg(seg) })),
  ];
</script>

<WheelPicker
  titulo="Tempo de Descanso"
  subtitulo={`Tempo de Descanso - ${nomeExercicio}`}
  {opcoes}
  {valorAtual}
  onSelecionar={(v) => onSelecionar(v)}
  {onFechar}
/>
