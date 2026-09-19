import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Loader2, Printer, RefreshCw } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { regenerarCodigoEquipamento } from "../equipamentosService";
import { urlQrEquipamento } from "../tipos";

interface QrCodeEquipamentoProps {
  equipamentoId: string;
  codigo: string;
  nome: string;
  cliente: string;
  podeRegenerar: boolean;
  onRegenerado: () => void;
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * QR gerado localmente (sem serviço externo). O conteúdo é só a URL interna com o
 * código aleatório: abre o equipamento apenas para usuários logados da empresa.
 */
export function QrCodeEquipamento({ equipamentoId, codigo, nome, cliente, podeRegenerar, onRegenerado }: QrCodeEquipamentoProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [svg, setSvg] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const url = urlQrEquipamento(codigo);

  useEffect(() => {
    let cancelado = false;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0D0D0D", light: "#FFFFFF" } })
      .then((s) => !cancelado && setSvg(s))
      .catch(() => !cancelado && setSvg(null));
    return () => {
      cancelado = true;
    };
  }, [url]);

  async function baixarPng() {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: "M" });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qr-${nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "equipamento"}.png`;
      link.click();
    } catch {
      notificarErro("Não foi possível gerar a imagem do QR Code.");
    }
  }

  function imprimirEtiqueta() {
    if (!svg) return;
    const janela = window.open("", "_blank", "width=420,height=520");
    if (!janela) {
      notificarErro("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta</title>
      <style>
        body{font-family:Inter,system-ui,sans-serif;margin:0;display:flex;justify-content:center;padding:16px}
        .etiqueta{width:60mm;border:1px dashed #999;padding:4mm;text-align:center}
        .etiqueta svg{width:48mm;height:48mm}
        .nome{font-size:11pt;font-weight:600;margin-top:2mm}
        .cliente{font-size:9pt;color:#444}
        .codigo{font-size:7pt;color:#666;margin-top:1mm;word-break:break-all}
        @media print{.etiqueta{border:none}}
      </style></head><body>
      <div class="etiqueta">${svg}
        <div class="nome">${escaparHtml(nome)}</div>
        <div class="cliente">${escaparHtml(cliente)}</div>
        <div class="codigo">${escaparHtml(codigo)}</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    janela.document.close();
  }

  async function regenerar() {
    setRegenerando(true);
    try {
      await regenerarCodigoEquipamento(equipamentoId);
      notificarSucesso("Novo QR Code gerado. Substitua a etiqueta antiga.");
      setConfirmar(false);
      onRegenerado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível gerar um novo código.");
      setConfirmar(false);
    } finally {
      setRegenerando(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-display text-sm font-semibold text-text-primary">QR Code</h2>
      <p className="mt-0.5 text-xs text-text-muted">Cole a etiqueta no equipamento para identificá-lo pelo celular.</p>

      <div className="mt-4 flex justify-center">
        {svg ? (
          <div
            className="h-44 w-44 overflow-hidden rounded-lg bg-white p-2"
            role="img"
            aria-label={`QR Code do equipamento ${nome}`}
            // SVG gerado localmente pela biblioteca a partir da URL interna
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-white/5">
            <Loader2 size={18} className="animate-spin text-text-muted" aria-hidden="true" />
          </div>
        )}
      </div>
      <p className="mt-2 break-all text-center font-mono text-[11px] text-text-muted" title="Código do equipamento">
        {codigo}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={imprimirEtiqueta}
          disabled={!svg}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
        >
          <Printer size={14} aria-hidden="true" /> Imprimir etiqueta
        </button>
        <button
          onClick={baixarPng}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          <Download size={14} aria-hidden="true" /> Baixar PNG
        </button>
      </div>
      {podeRegenerar && (
        <button
          onClick={() => setConfirmar(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-muted hover:bg-white/5 hover:text-text-primary"
        >
          <RefreshCw size={14} aria-hidden="true" /> Gerar novo código
        </button>
      )}

      <ConfirmDialog
        aberto={confirmar}
        tom="perigo"
        titulo="Gerar novo QR Code?"
        descricao="O código atual deixará de funcionar imediatamente. Use esta opção se a etiqueta foi perdida ou copiada indevidamente, e imprima uma nova."
        textoConfirmar="Gerar novo código"
        processando={regenerando}
        onConfirmar={regenerar}
        onCancelar={() => setConfirmar(false)}
      />
    </section>
  );
}
