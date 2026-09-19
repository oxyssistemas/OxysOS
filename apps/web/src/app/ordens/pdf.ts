import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LojaInfo } from "../legado/data/lojaService";
import { formatarEnderecoOS } from "../legado/components/LocalAtendimento";
import { ROTULO_TIPO_ITEM, formatarAgendamento, formatarDataHora, formatarMoeda, type ItemOrdem, type OrdemDetalhe } from "./tipos";

interface DadosDocumento {
  loja: LojaInfo;
  ordem: OrdemDetalhe;
  itens: ItemOrdem[];
}

type Linha = (rotulo: string, valor: string | null | undefined) => void;

function iniciar(loja: LojaInfo, titulo: string): { doc: jsPDF; linha: Linha; cursor: () => number; avancar: (n: number) => void } {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(loja.nome, 14, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const linhaLoja = [loja.cnpj, loja.telefone, [loja.cidade, loja.estado].filter(Boolean).join("/")].filter(Boolean).join("  ·  ");
  if (linhaLoja) doc.text(linhaLoja, 14, 24);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 36);

  doc.setFontSize(10);
  let y = 46;
  const linha: Linha = (rotulo, valor) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${rotulo}:`, 14, y);
    doc.setFont("helvetica", "normal");
    const quebrado = doc.splitTextToSize(valor || "—", 140);
    doc.text(quebrado, 52, y);
    y += Math.max(quebrado.length, 1) * 5 + 1;
  };
  return { doc, linha, cursor: () => y, avancar: (n) => (y += n) };
}

function bloco(doc: jsPDF, y: number, titulo: string, texto: string): number {
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, y);
  doc.setFont("helvetica", "normal");
  const quebrado = doc.splitTextToSize(texto, 182);
  doc.text(quebrado, 14, y + 6);
  return y + 6 + quebrado.length * 5 + 4;
}

function tabelaItens(doc: jsPDF, y: number, itens: ItemOrdem[], ordem: OrdemDetalhe): void {
  autoTable(doc, {
    startY: y,
    head: [["Item", "Tipo", "Qtd.", "Valor unit.", "Subtotal"]],
    body: itens.map((item) => [
      item.descricao,
      ROTULO_TIPO_ITEM[item.tipo],
      item.quantidade.toLocaleString("pt-BR"),
      formatarMoeda(item.valor_unitario),
      formatarMoeda(item.subtotal),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [21, 101, 255] },
    margin: { left: 14, right: 14 },
  });
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${formatarMoeda(ordem.subtotal_itens)}`, 196, finalY + 8, { align: "right" });
  doc.text(`Desconto: ${formatarMoeda(ordem.desconto)}`, 196, finalY + 14, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatarMoeda(ordem.valor_total)}`, 196, finalY + 21, { align: "right" });
}

function construirOS({ loja, ordem, itens }: DadosDocumento): jsPDF {
  const { doc, linha, cursor } = iniciar(loja, `Ordem de Serviço ${ordem.numero}`);
  if (ordem.titulo) linha("Título", ordem.titulo);
  linha("Cliente", ordem.cliente.nome);
  if (ordem.cliente.telefone) linha("Telefone", ordem.cliente.telefone);
  linha("Atendimento", ordem.local_atendimento === "externo" ? "Externo (no cliente)" : "Na loja");
  if (ordem.endereco) linha("Endereço", `${ordem.endereco.rotulo} · ${formatarEnderecoOS(ordem.endereco)}`);
  if (ordem.equipamento) linha("Equipamento", [ordem.equipamento.nome, ordem.equipamento.numero_serie && `S/N ${ordem.equipamento.numero_serie}`].filter(Boolean).join(" · "));
  if (ordem.objeto_atendimento) linha("Objeto", ordem.objeto_atendimento);
  linha("Tipo de serviço", ordem.tipo_servico?.nome);
  linha("Prioridade", ordem.prioridade?.nome);
  linha("Status", ordem.status.nome);
  linha("Técnico", ordem.tecnico?.nome ?? "Não definido");
  linha("Aberta em", formatarDataHora(ordem.criado_em));
  const agendamento = formatarAgendamento(ordem.data_agendada, ordem.hora_agendada);
  if (agendamento) linha("Agendada para", agendamento);
  if (ordem.prazo_em) linha("Prazo", formatarDataHora(ordem.prazo_em));

  let y = cursor() + 3;
  y = bloco(doc, y, "Descrição do problema/serviço", ordem.descricao);
  if (ordem.servico_executado) y = bloco(doc, y, "Serviço executado", ordem.servico_executado);
  tabelaItens(doc, y, itens, ordem);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${ordem.numero}  ·  Documento gerado em ${formatarDataHora(new Date().toISOString())}`, 14, 287);
  return doc;
}

function construirRecibo({ loja, ordem, itens }: DadosDocumento): jsPDF {
  const { doc, linha, cursor } = iniciar(loja, `Recibo de Serviço · ${ordem.numero}`);
  linha("Cliente", ordem.cliente.nome);
  if (ordem.titulo) linha("Serviço", ordem.titulo);
  if (ordem.equipamento) linha("Equipamento", ordem.equipamento.nome);
  if (ordem.objeto_atendimento) linha("Objeto", ordem.objeto_atendimento);
  linha("Concluído em", ordem.concluido_em ? formatarDataHora(ordem.concluido_em) : null);
  linha("Técnico", ordem.tecnico?.nome);

  tabelaItens(doc, cursor() + 4, itens, ordem);
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor() + 30;

  const assinaturaY = Math.min(finalY + 55, 265);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.line(14, assinaturaY, 90, assinaturaY);
  doc.text("Assinatura do cliente", 14, assinaturaY + 5);
  doc.line(120, assinaturaY, 196, assinaturaY);
  doc.text(loja.nome, 120, assinaturaY + 5);

  doc.setFontSize(8);
  doc.text(`Recibo gerado em ${formatarDataHora(new Date().toISOString())}`, 14, 287);
  return doc;
}

async function entregar(doc: jsPDF, nomeArquivo: string, titulo: string, compartilhar: boolean): Promise<{ compartilhado: boolean }> {
  if (compartilhar) {
    const arquivo = new File([doc.output("blob")], nomeArquivo, { type: "application/pdf" });
    const dados = { files: [arquivo], title: titulo };
    if (navigator.canShare && navigator.canShare(dados)) {
      await navigator.share(dados);
      return { compartilhado: true };
    }
  }
  doc.save(nomeArquivo);
  return { compartilhado: false };
}

export function documentoOS(dados: DadosDocumento, compartilhar: boolean) {
  return entregar(construirOS(dados), `${dados.ordem.numero}.pdf`, `Ordem de Serviço ${dados.ordem.numero}`, compartilhar);
}

export function reciboOS(dados: DadosDocumento, compartilhar: boolean) {
  return entregar(construirRecibo(dados), `Recibo-${dados.ordem.numero}.pdf`, `Recibo ${dados.ordem.numero}`, compartilhar);
}
