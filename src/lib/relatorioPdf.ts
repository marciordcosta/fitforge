import type { jsPDF } from "jspdf";
import { NOME_CLASSE, NOME_PROGRESSAO, type ModeloRelatorio } from "./relatorioTreino";
import { parseISODate } from "./dates";

/** Desenha o relatório de decisão do Treino em PDF (A4 retrato). jsPDF/autotable entram por import
 * dinâmico: só baixam quando o usuário pede o relatório. Fonte padrão (Helvetica) cobre os acentos;
 * por isso nada de setas/símbolos especiais nos textos. */

const COR = {
  texto: [30, 34, 42] as [number, number, number],
  suave: [110, 117, 128] as [number, number, number],
  verde: [22, 163, 74] as [number, number, number],
  vermelho: [220, 38, 38] as [number, number, number],
  azul: [37, 99, 235] as [number, number, number],
  ambar: [217, 119, 6] as [number, number, number],
  cinza: [156, 163, 175] as [number, number, number],
  linha: [226, 229, 234] as [number, number, number],
  cabecalho: [31, 41, 55] as [number, number, number],
  zebra: [247, 248, 250] as [number, number, number],
};

const M = 12; // margem (mm)

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNum(v: number | null, casas = 1, sufixo = ""): string {
  if (v == null) return "-";
  return `${v.toFixed(casas).replace(".", ",")}${sufixo}`;
}

function fmtSinal(v: number | null, casas = 1, sufixo = ""): string {
  if (v == null) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(casas).replace(".", ",")}${sufixo}`;
}

function corClasse(c: string): [number, number, number] {
  if (c === "insuficiente") return COR.vermelho;
  if (c === "foco") return COR.azul;
  if (c === "manutencao") return COR.suave;
  if (c === "moderado") return COR.ambar;
  return COR.verde;
}

function corProgressao(s: string | null): [number, number, number] {
  if (s === "subindo") return COR.verde;
  if (s === "caindo") return COR.vermelho;
  if (s === "estavel") return COR.suave;
  return COR.cinza;
}

type DocComTabela = jsPDF & { lastAutoTable?: { finalY: number } };

export async function gerarRelatorioPdf(modelo: ModeloRelatorio): Promise<Blob> {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" }) as DocComTabela;
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const util = largura - 2 * M;
  let y = M;

  const garantir = (preciso: number) => {
    if (y + preciso > altura - M - 6) {
      doc.addPage();
      y = M;
    }
  };

  const titulo = (txt: string) => {
    garantir(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COR.texto);
    doc.text(txt, M, y + 4);
    doc.setDrawColor(...COR.linha);
    doc.line(M, y + 6, M + util, y + 6);
    y += 9;
  };

  const tabela = (opts: Parameters<typeof autoTable>[1]) => {
    autoTable(doc, {
      margin: { left: M, right: M },
      styles: { fontSize: 7.5, cellPadding: 1.4, textColor: COR.texto, lineColor: COR.linha, lineWidth: 0.1 },
      headStyles: { fillColor: COR.cabecalho, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: COR.zebra },
      ...opts,
      startY: y,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 5;
  };

  // ---------------- cabeçalho ----------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COR.texto);
  doc.text("Relatório de decisão do treino", M, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COR.suave);
  doc.text(`Período: ${fmtData(modelo.inicio)} a ${fmtData(modelo.fim)}  |  ${modelo.semanas.length} semanas  |  gerado em ${fmtData(modelo.geradoEm)}`, M, y + 11);
  y += 16;

  // caixas de resumo
  const caixas: { rotulo: string; valor: string; detalhe: string }[] = [
    {
      rotulo: "Sessões",
      valor: `${modelo.sessoes.realizadas}/${modelo.sessoes.planejadas}`,
      detalhe: modelo.sessoes.planejadas ? `${Math.round((modelo.sessoes.realizadas / modelo.sessoes.planejadas) * 100)}% do planejado` : "realizadas",
    },
    {
      rotulo: "Peso (média móvel)",
      valor: `${fmtNum(modelo.peso.inicio)} a ${fmtNum(modelo.peso.fim)} kg`,
      detalhe: modelo.peso.variacaoKg != null ? `${fmtSinal(modelo.peso.variacaoKg, 1)} kg no período` : "sem dados",
    },
    {
      rotulo: "Ritmo do peso",
      valor: modelo.peso.kgPorSemana != null ? `${fmtSinal(modelo.peso.kgPorSemana, 2)} kg/sem` : "-",
      detalhe: modelo.peso.metaFim != null ? `meta no fim: ${fmtNum(modelo.peso.metaFim)} kg` : "sem meta no período",
    },
    {
      rotulo: "Calorias planejadas (média/dia)",
      valor: modelo.calorias?.metaMediaKcal != null ? `${Math.round(modelo.calorias.metaMediaKcal).toLocaleString("pt-BR")} kcal` : "-",
      detalhe: modelo.calorias ? `meta da dieta no período (${modelo.calorias.diasPeriodo} dias)` : "sem dados da dieta",
    },
  ];
  // ---------------- cards à esquerda (empilhados) e gráfico de peso x meta à direita ----------------
  const wCaixa = 56;
  const hCaixa = 15;
  const gapCaixa = 2.5;
  const xGraf = M + wCaixa + 6;
  const wGraf = util - wCaixa - 6;
  const alturaBloco = caixas.length * hCaixa + (caixas.length - 1) * gapCaixa;
  garantir(alturaBloco + 12);
  // título do gráfico (os cards começam na altura do gráfico)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR.texto);
  doc.text("Peso no período contra a meta", xGraf, y + 4);
  doc.setDrawColor(...COR.linha);
  doc.line(xGraf, y + 6, xGraf + wGraf, y + 6);
  const yTopo = y + 9;
  caixas.forEach((c, i) => {
    const yCaixa = yTopo + i * (hCaixa + gapCaixa);
    doc.setDrawColor(...COR.linha);
    doc.setFillColor(...COR.zebra);
    doc.roundedRect(M, yCaixa, wCaixa, hCaixa, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    doc.text(c.rotulo, M + 2.5, yCaixa + 4.3, { maxWidth: wCaixa - 4 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...COR.texto);
    doc.text(c.valor, M + 2.5, yCaixa + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...COR.suave);
    doc.text(c.detalhe, M + 2.5, yCaixa + 12.6, { maxWidth: wCaixa - 4 });
  });
  desenharGraficoPeso(doc, modelo, xGraf, yTopo, wGraf, alturaBloco);
  y = yTopo + alturaBloco + 5;

  // ---------------- TABELA PRINCIPAL: tudo que decide, por músculo ----------------
  titulo("Consolidado por músculo (realizado no período)");
  // Músculos que aparecem na tabela de 1RM (Por exercício): ganham um asterisco pequeno ao lado do nome.
  const musculosNa1rm = new Set(modelo.exercicios.filter((x) => x.sessoes >= 4).map((x) => x.musculo));
  tabela({
    styles: { fontSize: 6.8, cellPadding: 1, textColor: COR.texto, lineColor: COR.linha, lineWidth: 0.1 },
    headStyles: { fillColor: COR.cabecalho, textColor: 255, fontStyle: "bold", fontSize: 6.8 },
    head: [["Músculo", "Séries/sem.", "Faixa", "Progressão", "Ação sugerida"]],
    body: modelo.musculos.map((l) => [
      l.nome,
      fmtNum(l.mediaSemanal),
      NOME_CLASSE[l.classe],
      l.progressao ? `${NOME_PROGRESSAO[l.progressao]}${l.variacaoPct != null ? ` ${fmtSinal(l.variacaoPct, 1, "%")}` : ""}` : "-",
      l.acao,
    ]),
    columnStyles: {
      0: { cellWidth: 34, fontStyle: "bold" },
      1: { halign: "right", cellWidth: 20 },
      2: { cellWidth: 24 },
      3: { cellWidth: 34 },
    },
    didDrawCell: (d) => {
      if (d.section !== "body" || d.column.index !== 0) return;
      const l = modelo.musculos[d.row.index];
      if (!l || !musculosNa1rm.has(l.nome)) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      const larguraNome = doc.getTextWidth(l.nome);
      doc.setFontSize(5.5);
      doc.setTextColor(...COR.suave);
      doc.text("*", d.cell.x + d.cell.padding("left") + larguraNome + 0.4, d.cell.y + d.cell.padding("top") + 1.7);
    },
    didParseCell: (d) => {
      if (d.section === "head") return;
      const l = modelo.musculos[d.row.index];
      const col = d.column.index;
      if (col === 2) {
        d.cell.styles.textColor = corClasse(l.classe);
        d.cell.styles.fontStyle = "bold";
      }
      if (col === 3) {
        d.cell.styles.textColor = corProgressao(l.progressao);
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---------------- volume semana a semana ----------------
  titulo("Volume semana a semana (séries ponderadas)");
  tabela({
    head: [["Músculo", ...modelo.semanas.map((s) => s.rotulo), "Média"]],
    body: modelo.musculos.map((l) => [l.nome, ...l.porSemana.map((v) => fmtNum(v)), fmtNum(l.mediaSemanal)]),
    // Compacta (fonte e margem menores): divide a primeira folha com o Consolidado.
    styles: { fontSize: modelo.semanas.length > 10 ? 6 : 6.5, cellPadding: 0.7, textColor: COR.texto, lineColor: COR.linha, lineWidth: 0.1 },
    headStyles: { fillColor: COR.cabecalho, textColor: 255, fontStyle: "bold" as const, fontSize: modelo.semanas.length > 10 ? 6 : 6.5 },
    columnStyles: { 0: { cellWidth: 26, fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      if (d.column.index >= 1 && d.column.index <= modelo.semanas.length) {
        const l = modelo.musculos[d.row.index];
        const v = l.porSemana[d.column.index - 1];
        d.cell.styles.halign = "right";
        if (l.planejado > 0) {
          const r = v / l.planejado;
          d.cell.styles.fillColor = r >= 0.9 ? [220, 245, 227] : r >= 0.6 ? [254, 243, 199] : [254, 226, 226];
        }
      } else if (d.column.index > modelo.semanas.length) {
        d.cell.styles.halign = "right";
      }
    },
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COR.suave);
  garantir(5);
  doc.text("Cores: verde = 90% ou mais do plano atual do músculo; amarelo = 60% a 90%; vermelho = abaixo de 60%.", M, y);
  y += 6;

  // ---------------- rotinas atuais (o plano de hoje), pelos músculos que cada uma trabalha ----------------
  if (modelo.rotinas.length) {
    doc.addPage();
    y = M;
    titulo("Rotinas atuais (músculos trabalhados)");
    const comAcum = modelo.rotinas.some((r) => r.musculos.some((m) => m.acum != null));
    const nCols = comAcum ? 5 : 4;
    const corpo: NonNullable<Parameters<typeof autoTable>[1]["body"]> = [];
    for (const r of modelo.rotinas) {
      corpo.push([
        {
          content: `${r.nome}${r.dia ? ` (${r.dia})` : ""}  -  ${r.numExercicios} exercícios, ${r.totalSeries} séries`,
          colSpan: nCols,
          styles: { fontStyle: "bold", fillColor: [229, 231, 235], textColor: COR.texto },
        },
      ]);
      // Exercícios do dia em sequência, no espaço ao lado das colunas: uma célula que ocupa todas as linhas
      // de músculos da rotina ("1º Flexora (3), 2º Agachamento (3)").
      const sequencia = r.exercicios.map((x, k) => `${k + 1}º ${x.nome} (${x.series})`).join(", ");
      r.musculos.forEach((m, k) => {
        const linha: (string | { content: string; rowSpan: number; styles: object })[] = [m.nome, fmtNum(m.total, m.total % 1 ? 1 : 0), fmtNum(m.pond)];
        if (comAcum) linha.push(m.acum != null ? fmtNum(m.acum) : "-");
        if (k === 0) {
          linha.push({ content: sequencia || "-", rowSpan: r.musculos.length, styles: { valign: "top", textColor: COR.texto, fillColor: [255, 255, 255] } });
        }
        corpo.push(linha);
      });
    }
    tabela({
      head: [comAcum ? ["Músculo", "Total", "Pond.", "Acum.", "Exercícios do dia (em sequência)"] : ["Músculo", "Total", "Pond.", "Exercícios do dia (em sequência)"]],
      body: corpo,
      columnStyles: {
        0: { cellWidth: 34 },
        1: { halign: "right", cellWidth: 14 },
        2: { halign: "right", cellWidth: 14 },
        ...(comAcum ? { 3: { halign: "right", cellWidth: 14 } } : {}),
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    const notaRot = doc.splitTextToSize(
      "Séries planejadas por semana nesta rotina, como no card da rotina no app: Total conta 1 série para cada músculo que o exercício trabalha; Pond. pondera pelo peso de contribuição do exercício no músculo; Acum. desconta a posição da série na rotina (só aparece com a fadiga por posição ligada). Ao lado, os exercícios do dia na ordem do treino, com o número de séries entre parênteses.",
      util,
    ) as string[];
    garantir(notaRot.length * 3.2);
    doc.text(notaRot, M, y);
    y += notaRot.length * 3.2 + 4;
  }

  // ---- Distribuição Semanal: a grade de dias (seg a dom) com as séries ponderadas planejadas ----
  if (modelo.grade.linhas.length) {
    doc.addPage();
    y = M;
    titulo("Distribuição semanal planejada (séries totais por dia, total ponderado)");
    const dias = modelo.grade.dias;
    tabela({
      head: [
        ["Músculo", ...dias.map((d) => d.rotulo), "Total", "Observação"],
        ["", ...dias.map((d) => d.rotina ?? "descanso"), "", ""],
      ],
      body: modelo.grade.linhas.map((l) => [l.nome, ...l.porDia.map((v) => (v > 0 ? fmtNum(v) : "-")), fmtNum(l.total), l.observacao || "-"]),
      columnStyles: {
        0: { cellWidth: 26, fontStyle: "bold" },
        ...Object.fromEntries(dias.map((_, i) => [i + 1, { cellWidth: 12.5 }])),
        [dias.length + 1]: { cellWidth: 13 },
      },
      didParseCell: (d) => {
        const col = d.column.index;
        if (d.section === "head") {
          if (d.row.index === 1) {
            d.cell.styles.fillColor = [51, 65, 85];
            d.cell.styles.fontStyle = "normal";
            d.cell.styles.fontSize = 5.8;
          }
          if (col >= 1 && col <= dias.length + 1) d.cell.styles.halign = "center";
          return;
        }
        if (col >= 1 && col <= dias.length + 1) d.cell.styles.halign = "center";
        const l = modelo.grade.linhas[d.row.index];
        if (col === dias.length + 1) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = corClasse(l.classe);
        }
        if (col >= 1 && col <= dias.length) {
          const aviso = l.avisosDia[col - 1];
          if (aviso === "max") {
            d.cell.styles.textColor = COR.vermelho;
            d.cell.styles.fontStyle = "bold";
          } else if (aviso === "atencao") {
            d.cell.styles.textColor = COR.ambar;
            d.cell.styles.fontStyle = "bold";
          }
        }
        if (col === dias.length + 2) {
          d.cell.styles.fontSize = 6.5;
          d.cell.styles.textColor = l.avisosDia.includes("max") ? COR.vermelho : COR.suave;
        }
      },
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    const notaGrade = doc.splitTextToSize(
      "Cada dia mostra as séries TOTAIS planejadas (1 por série, para cada músculo que o exercício trabalha). O Total é a soma da semana PONDERADA pelo peso de contribuição de cada exercício (a mesma leitura do Realizado), por isso não é a soma dos dias. A linha de baixo do cabeçalho mostra a rotina do dia. O Total segue a cor da faixa do músculo (vermelho abaixo, cinza em manutenção, amarelo em moderado, verde em prioridade, azul em foco). Dias em vermelho passam de 10 séries (fracionar); em âmbar ficam de 8 a 10 (perto do limite) ou abaixo do mínimo do músculo (o menor entre 5 e a metade do máximo semanal dele), este só quando outro dia do mesmo músculo passa de 8 e dá pra redistribuir.",
      util,
    ) as string[];
    garantir(notaGrade.length * 3.2);
    doc.text(notaGrade, M, y);
    y += notaGrade.length * 3.2 + 4;
  }

  // ---------------- plano atual x executado ----------------
  if (modelo.ajustesPlano.length) {
    // Começa numa folha separada (é a parte de decisão do plano, fora das tabelas de apoio).
    doc.addPage();
    y = M;
    titulo("Plano atual contra o executado (onde divergem)");
    tabela({
      head: [["Músculo", "Exec.", "Plano", "Dif.", "Faixa (exec. > plano)", "Progressão", "Leitura"]],
      body: modelo.ajustesPlano.map((a) => [
        a.nome,
        fmtNum(a.executado),
        fmtNum(a.plano),
        fmtSinal(a.diferenca),
        `${NOME_CLASSE[a.classeExecutado]} > ${NOME_CLASSE[a.classePlano]}`,
        a.progressao ? NOME_PROGRESSAO[a.progressao] : "-",
        a.leitura,
      ]),
      columnStyles: {
        0: { cellWidth: 26, fontStyle: "bold" },
        1: { halign: "right", cellWidth: 11 },
        2: { halign: "right", cellWidth: 11 },
        3: { halign: "right", cellWidth: 11 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
      },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const a = modelo.ajustesPlano[d.row.index];
        if (d.column.index === 3) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = a.diferenca > 0 ? COR.azul : COR.ambar;
        }
        if (d.column.index === 5) {
          d.cell.styles.textColor = corProgressao(a.progressao);
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    const notaAj = doc.splitTextToSize(
      "Séries ponderadas por semana: Exec. é a média do período (a mesma da tabela Consolidado) e Plano é o que as rotinas atuais somam. Dif. positiva = plano acima do executado (aumento recente da rotina ou séries que não foram feitas); negativa = plano abaixo. Só entram músculos com diferença de 1 série ou mais.",
      util,
    ) as string[];
    garantir(notaAj.length * 3.2);
    doc.text(notaAj, M, y);
    y += notaAj.length * 3.2 + 4;
  }

  // ---------------- exercícios ----------------
  const exerciciosComLeitura = modelo.exercicios.filter((x) => x.sessoes >= 4);
  if (!modelo.ajustesPlano.length) {
    doc.addPage();
    y = M;
  }
  titulo("Por exercício (1RM estimado no período, 4 sessões ou mais)");
  tabela({
    head: [["Músculo principal", "Exercício", "Sessões", "1RM início", "1RM fim", "Var. %", "Status", "Última"]],
    body: exerciciosComLeitura.map((x) => [
      x.musculo,
      x.nome,
      String(x.sessoes),
      fmtNum(x.rmInicio),
      fmtNum(x.rmFim),
      fmtSinal(x.variacaoPct, 1, "%"),
      x.status ? NOME_PROGRESSAO[x.status] : "-",
      x.ultima ? fmtData(x.ultima) : "-",
    ]),
    columnStyles: {
      0: { cellWidth: 28 },
      2: { halign: "right", cellWidth: 14 },
      3: { halign: "right", cellWidth: 17 },
      4: { halign: "right", cellWidth: 16 },
      5: { halign: "right", cellWidth: 14 },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 },
    },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const x = exerciciosComLeitura[d.row.index];
      if (d.column.index === 5 || d.column.index === 6) {
        d.cell.styles.textColor = corProgressao(x.status);
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COR.suave);
  const notaEx = doc.splitTextToSize(
    "* Músculo da tabela Consolidado que tem exercício listado aqui. 1RM início e fim: primeira e última sessão válida do período, depois do último reinício marcado ou pausa (sessões marcadas como desconsiderar ficam de fora). Var. % e Status vêm da reta de tendência dessas mesmas sessões, não só do início e do fim; sem sessões válidas suficientes ficam em branco ou Em análise.",
    util,
  ) as string[];
  garantir(notaEx.length * 3.2);
  doc.text(notaEx, M, y);
  y += notaEx.length * 3.2 + 4;

  // ---------------- limites ----------------
  garantir(16);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...COR.suave);
  const limites = doc.splitTextToSize(
    "Limites da análise: o app não registra esforço percebido (RIR/RPE) nem sono. Um exercício estagnado pode refletir intensidade baixa e não excesso ou falta de volume. A tendência usa o 1RM estimado (fórmula de Epley) e é um norte, não um diagnóstico.",
    util,
  ) as string[];
  doc.text(limites, M, y);

  // rodapé com paginação
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.cinza);
    doc.text(`FitForge - relatório de treino ${fmtData(modelo.inicio)} a ${fmtData(modelo.fim)}`, M, altura - 6);
    doc.text(`${p}/${total}`, largura - M, altura - 6, { align: "right" });
  }

  return doc.output("blob");
}

/** Curva de peso (pontos + média móvel) contra a linha da meta, desenhada direto no PDF. */
function desenharGraficoPeso(doc: jsPDF, m: ModeloRelatorio, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(...COR.linha);
  doc.roundedRect(x, y, w, h, 2, 2, "S");
  const pontos = m.peso.pontos;
  const mm = m.peso.mediaMovel;
  const meta = m.peso.meta;
  if (!pontos.length && !mm.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COR.suave);
    doc.text("Sem registros de peso no período.", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  const todos = [...pontos.map((p) => p.peso), ...mm.map((p) => p.peso), ...meta.map((p) => p.valor)];
  let min = Math.min(...todos);
  let max = Math.max(...todos);
  const folga = Math.max((max - min) * 0.1, 0.3);
  min -= folga;
  max += folga;
  const px = x + 12;
  const pw = w - 16;
  const py = y + 4;
  const ph = h - 12;
  const t0 = parseISODate(m.inicio).getTime();
  const t1 = Math.max(parseISODate(m.fim).getTime(), t0 + 86_400_000);
  const X = (d: string) => px + ((parseISODate(d).getTime() - t0) / (t1 - t0)) * pw;
  const Y = (v: number) => py + ph - ((v - min) / (max - min)) * ph;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COR.suave);
  doc.setDrawColor(...COR.linha);
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    doc.line(px, Y(v), px + pw, Y(v));
    doc.text(v.toFixed(1).replace(".", ","), px - 1.5, Y(v) + 1, { align: "right" });
  }
  doc.text(fmtData(m.inicio).slice(0, 5), px, y + h - 2);
  doc.text(fmtData(m.fim).slice(0, 5), px + pw, y + h - 2, { align: "right" });

  // meta (tracejada vermelha)
  if (meta.length >= 2) {
    doc.setDrawColor(...COR.vermelho);
    doc.setLineWidth(0.45);
    doc.setLineDashPattern([1.6, 1.2], 0);
    for (let i = 1; i < meta.length; i++) doc.line(X(meta[i - 1].data), Y(meta[i - 1].valor), X(meta[i].data), Y(meta[i].valor));
    doc.setLineDashPattern([], 0);
  }
  // pesos diários (pontos cinza)
  doc.setFillColor(...COR.cinza);
  for (const p of pontos) doc.circle(X(p.data), Y(p.peso), 0.5, "F");
  // média móvel (linha azul)
  doc.setDrawColor(...COR.azul);
  doc.setLineWidth(0.6);
  for (let i = 1; i < mm.length; i++) doc.line(X(mm[i - 1].data), Y(mm[i - 1].peso), X(mm[i].data), Y(mm[i].peso));
  doc.setLineWidth(0.2);

  // legenda
  const ly = y + h - 2;
  const lx = x + w / 2 - 25;
  doc.setFontSize(6.5);
  doc.setTextColor(...COR.suave);
  doc.setFillColor(...COR.cinza);
  doc.circle(lx, ly - 0.8, 0.6, "F");
  doc.text("Peso do dia", lx + 2, ly);
  doc.setDrawColor(...COR.azul);
  doc.setLineWidth(0.6);
  doc.line(lx + 17, ly - 0.8, lx + 22, ly - 0.8);
  doc.text("Média móvel", lx + 23, ly);
  doc.setDrawColor(...COR.vermelho);
  doc.setLineWidth(0.45);
  doc.setLineDashPattern([1.2, 0.9], 0);
  doc.line(lx + 42, ly - 0.8, lx + 47, ly - 0.8);
  doc.setLineDashPattern([], 0);
  doc.text("Meta", lx + 48, ly);
  doc.setLineWidth(0.2);
}
