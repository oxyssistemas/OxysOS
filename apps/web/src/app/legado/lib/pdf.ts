import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OSItem } from "../types";
import type { OrdemComRelacoes } from "../data/ordensService";
import type { LojaInfo } from "../data/lojaService";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface DadosDocumento {
  loja: LojaInfo;
  os: OrdemComRelacoes;
  itens: OSItem[];
}

function cabecalho(doc: jsPDF, loja: LojaInfo, titulo: string) {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(loja.nome, 14, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const linhaLoja = [loja.cnpj, loja.telefone, [loja.cidade, loja.estado].filter(Boolean).join("/")]
    .filter(Boolean)
    .join("  ·  ");
  if (linhaLoja) doc.text(linhaLoja, 14, 24);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 36);
}

function construirDocumentoOS({ loja, os, itens }: DadosDocumento): jsPDF {
  const doc = new jsPDF();
  cabecalho(doc, loja, `Ordem de Serviço #${os.codigo_aparelho ?? "—"}`);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 46;
  const linha = (label: string, valor: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(valor || "—", 50, y);
    y += 6;
  };

  linha("Cliente", os.cliente?.nome ?? "—");
  linha("Telefone", os.cliente?.telefone ?? "—");
  linha("Objeto", os.objeto_atendimento ?? "—");
  linha("Status", os.status?.nome ?? "—");
  linha("Aberta em", formatarData(os.criado_em));
  linha("Criada por", os.criador?.nome ?? "—");
  linha("Responsável", os.responsavel?.nome ?? "Não definido");

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text("Descrição do problema/serviço:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const descricaoQuebrada = doc.splitTextToSize(os.descricao || "—", 180);
  doc.text(descricaoQuebrada, 14, y);
  y += descricaoQuebrada.length * 5 + 6;

  autoTable(doc, {
    startY: y,
    head: [["Item", "Tipo", "Qtd.", "Valor unit.", "Subtotal"]],
    body: itens.map((item) => [
      item.descricao,
      item.tipo === "peca" ? "Peça/Produto" : "Mão de obra",
      String(item.quantidade),
      formatarMoeda(item.valor_unitario),
      formatarMoeda(item.quantidade * item.valor_unitario),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [21, 101, 255] },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  doc.setFont("helvetica", "bold");
  doc.text(`Valor total: ${formatarMoeda(os.valor_total)}`, 14, finalY + 8);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Código do aparelho: #${os.codigo_aparelho ?? "—"}  ·  Documento gerado em ${formatarData(new Date().toISOString())}`,
    14,
    287,
  );

  return doc;
}

function construirDocumentoRecibo({ loja, os, itens }: DadosDocumento): jsPDF {
  const doc = new jsPDF();
  cabecalho(doc, loja, "Recibo de Serviço");

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 46;
  const linha = (label: string, valor: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(valor || "—", 50, y);
    y += 6;
  };

  linha("Cliente", os.cliente?.nome ?? "—");
  linha("Objeto", os.objeto_atendimento ?? "—");
  linha("Código do aparelho", `#${os.codigo_aparelho ?? "—"}`);
  linha("Concluído em", formatarData(os.atualizado_em));
  linha("Responsável", os.responsavel?.nome ?? "—");

  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Serviço/Peça", "Tipo", "Qtd.", "Valor unit.", "Subtotal"]],
    body: itens.map((item) => [
      item.descricao,
      item.tipo === "peca" ? "Peça/Produto" : "Mão de obra",
      String(item.quantidade),
      formatarMoeda(item.valor_unitario),
      formatarMoeda(item.quantidade * item.valor_unitario),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [21, 101, 255] },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Valor total pago: ${formatarMoeda(os.valor_total)}`, 14, finalY + 10);

  const assinaturaY = Math.min(finalY + 50, 260);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.line(14, assinaturaY, 90, assinaturaY);
  doc.text("Assinatura do cliente", 14, assinaturaY + 5);
  doc.line(120, assinaturaY, 196, assinaturaY);
  doc.text(loja.nome, 120, assinaturaY + 5);

  doc.setFontSize(8);
  doc.text(
    `Recibo gerado em ${formatarData(new Date().toISOString())}`,
    14,
    287,
  );

  return doc;
}

async function baixarOuCompartilhar(
  doc: jsPDF,
  nomeArquivo: string,
  tituloCompartilhar: string,
  textoCompartilhar: string,
  compartilhar: boolean,
): Promise<{ compartilhado: boolean }> {
  if (compartilhar) {
    const blob = doc.output("blob");
    const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
    const dadosParaCompartilhar = { files: [arquivo], title: tituloCompartilhar, text: textoCompartilhar };

    if (navigator.canShare && navigator.canShare(dadosParaCompartilhar)) {
      await navigator.share(dadosParaCompartilhar);
      return { compartilhado: true };
    }
  }

  doc.save(nomeArquivo);
  return { compartilhado: false };
}

export async function baixarOS(dados: DadosDocumento): Promise<void> {
  const doc = construirDocumentoOS(dados);
  doc.save(`OS-${dados.os.codigo_aparelho ?? dados.os.id.slice(0, 8)}.pdf`);
}

export async function compartilharOS(dados: DadosDocumento): Promise<{ compartilhado: boolean }> {
  const doc = construirDocumentoOS(dados);
  return baixarOuCompartilhar(
    doc,
    `OS-${dados.os.codigo_aparelho ?? dados.os.id.slice(0, 8)}.pdf`,
    `Ordem de Serviço #${dados.os.codigo_aparelho ?? ""}`,
    `Ordem de serviço de ${dados.os.cliente?.nome ?? "cliente"} — ${dados.loja.nome}`,
    true,
  );
}

export async function baixarRecibo(dados: DadosDocumento): Promise<void> {
  const doc = construirDocumentoRecibo(dados);
  doc.save(`Recibo-${dados.os.codigo_aparelho ?? dados.os.id.slice(0, 8)}.pdf`);
}

export async function compartilharRecibo(dados: DadosDocumento): Promise<{ compartilhado: boolean }> {
  const doc = construirDocumentoRecibo(dados);
  return baixarOuCompartilhar(
    doc,
    `Recibo-${dados.os.codigo_aparelho ?? dados.os.id.slice(0, 8)}.pdf`,
    `Recibo de Serviço #${dados.os.codigo_aparelho ?? ""}`,
    `Recibo de serviço de ${dados.os.cliente?.nome ?? "cliente"} — ${dados.loja.nome}`,
    true,
  );
}
