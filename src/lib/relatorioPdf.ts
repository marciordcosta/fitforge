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
  if (c === "excessivo") return COR.azul;
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
  const doc = new JsPDF({ unit: "mm", format: "a4" }) as DocComTabela;
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
      rotulo: "Calorias (média/dia)",
      valor: modelo.calorias?.mediaKcal != null ? `${Math.round(modelo.calorias.mediaKcal).toLocaleString("pt-BR")} kcal` : "-",
      detalhe: modelo.calorias
        ? `${modelo.calorias.metaMediaKcal != null ? `meta ${Math.round(modelo.calorias.metaMediaKcal).toLocaleString("pt-BR")} | ` : ""}${modelo.calorias.diasRegistrados}/${modelo.calorias.diasPeriodo} dias`
        : "sem dados da dieta",
    },
  ];
  const wCaixa = (util - 3 * 3) / 4;
  caixas.forEach((c, i) => {
    const x = M + i * (wCaixa + 3);
    doc.setDrawColor(...COR.linha);
    doc.setFillColor(...COR.zebra);
    doc.roundedRect(x, y, wCaixa, 17, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COR.suave);
    doc.text(c.rotulo, x + 2.5, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COR.texto);
    doc.text(c.valor, x + 2.5, y + 10.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    doc.text(c.detalhe, x + 2.5, y + 14.5);
  });
  y += 22;

  // ---------------- curva de peso x meta ----------------
  titulo("Peso no período contra a meta");
  const altGraf = 42;
  desenharGraficoPeso(doc, modelo, M, y, util, altGraf);
  y += altGraf + 4;

  // ---------------- decisões ----------------
  titulo("Decisões sugeridas");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COR.texto);
  if (!modelo.decisoes.length) {
    doc.text("Nenhum ajuste urgente: os músculos com leitura estão mantendo ou progredindo.", M, y + 3);
    y += 7;
  } else {
    for (const d of modelo.decisoes) {
      const linhas = doc.splitTextToSize(`-  ${d}`, util) as string[];
      garantir(linhas.length * 4.5 + 1);
      doc.text(linhas, M, y + 3);
      y += linhas.length * 4.5 + 1;
    }
    y += 2;
  }

  // ---------------- tabela por músculo ----------------
  titulo("Por músculo: volume, progressão e ação");
  tabela({
    head: [["Músculo", "Séries/sem.", "Planej.", "Faixa", "Freq./sem.", "Progressão", "Var. %", "Fim treino", "Ação sugerida"]],
    body: modelo.musculos.map((l) => [
      l.nome,
      fmtNum(l.mediaSemanal),
      fmtNum(l.planejado),
      NOME_CLASSE[l.classe],
      fmtNum(l.frequenciaSemanal),
      l.progressao ? NOME_PROGRESSAO[l.progressao] : "-",
      fmtSinal(l.variacaoPct, 1, "%"),
      l.fimDoTreinoPct != null ? `${l.fimDoTreinoPct}%` : "-",
      l.acao,
    ]),
    columnStyles: {
      0: { cellWidth: 26, fontStyle: "bold" },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 13 },
      3: { cellWidth: 19 },
      4: { halign: "right", cellWidth: 17 },
      5: { cellWidth: 19 },
      6: { halign: "right", cellWidth: 13 },
      7: { halign: "right", cellWidth: 14 },
    },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const l = modelo.musculos[d.row.index];
      if (d.column.index === 3) {
        d.cell.styles.textColor = corClasse(l.classe);
        d.cell.styles.fontStyle = "bold";
      }
      if (d.column.index === 5 || d.column.index === 6) {
        d.cell.styles.textColor = corProgressao(l.progressao);
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COR.suave);
  const nota = doc.splitTextToSize(
    "Séries/sem: média ponderada das semanas com treino. Progressão: reta do 1RM semanal dos exercícios do músculo, ponderados pelo trabalho no músculo (limite de 2%; com menos de 4 semanas fica Em análise). Fim treino: % do volume planejado que cai no último bloco da rotina, onde a fadiga desconta mais.",
    util,
  ) as string[];
  garantir(nota.length * 3.2);
  doc.text(nota, M, y);
  y += nota.length * 3.2 + 4;

  // ---------------- volume semana a semana ----------------
  titulo("Volume semana a semana (séries ponderadas)");
  tabela({
    head: [["Músculo", ...modelo.semanas.map((s) => s.rotulo), "Média", "Planej."]],
    body: modelo.musculos.map((l) => [l.nome, ...l.porSemana.map((v) => fmtNum(v)), fmtNum(l.mediaSemanal), fmtNum(l.planejado)]),
    columnStyles: { 0: { cellWidth: 28, fontStyle: "bold" } },
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
  doc.text("Cores: verde = 90% ou mais do planejado; amarelo = 60% a 90%; vermelho = abaixo de 60%.", M, y);
  y += 6;

  // ---------------- exercícios ----------------
  titulo("Por exercício (1RM estimado no período)");
  tabela({
    head: [["Músculo principal", "Exercício", "Sessões", "1RM início", "1RM fim", "Var. %", "Status", "Última"]],
    body: modelo.exercicios.map((x) => [
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
      const x = modelo.exercicios[d.row.index];
      if (d.column.index === 5 || d.column.index === 6) {
        d.cell.styles.textColor = corProgressao(x.status);
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---------------- alertas ----------------
  titulo("Alertas");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COR.texto);
  if (!modelo.alertas.length) {
    doc.text("Nenhum alerta no período.", M, y + 3);
    y += 7;
  } else {
    for (const a of modelo.alertas) {
      const linhas = doc.splitTextToSize(`-  ${a}`, util) as string[];
      garantir(linhas.length * 4 + 1);
      doc.text(linhas, M, y + 3);
      y += linhas.length * 4 + 1;
    }
    y += 3;
  }

  // ---------------- equilíbrio entre grupos ----------------
  if (modelo.grupos.length) {
    titulo("Equilíbrio entre grupos musculares");
    tabela({
      head: [["Grupo", "Séries/sem", "% do total", "Planejado"]],
      body: modelo.grupos.map((g) => [g.nome, fmtNum(g.mediaSemanal), `${g.pctTotal}%`, fmtNum(g.planejado)]),
      columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    });
  }

  // ---------------- marcadores ----------------
  if (modelo.marcadores.length) {
    titulo("Marcadores e observações do período");
    tabela({
      head: [["Data", "Exercício", "Tipo", "Observação"]],
      body: modelo.marcadores.map((m) => [fmtData(m.data), m.exercicio, m.tipo, m.observacao]),
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 50 }, 2: { cellWidth: 24 } },
    });
  }

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

/** Entrega o PDF no aparelho: compartilhar (Android: abre o menu, dá pra salvar/enviar), senão baixar
 * pelo navegador, senão abrir numa aba. WebView sem suporte a download cai no próximo passo. */
export async function entregarPdf(blob: Blob, nome: string): Promise<"compartilhado" | "baixado" | "aberto"> {
  const arquivo = new File([blob], nome, { type: "application/pdf" });
  try {
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: nome });
      return "compartilhado";
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "compartilhado";
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "baixado";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
