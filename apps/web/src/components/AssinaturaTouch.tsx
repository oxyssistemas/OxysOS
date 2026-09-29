import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

interface Ponto {
  x: number;
  y: number;
}

interface AssinaturaTouchProps {
  /** recebe o PNG (data URL) recortado na tinta, ou null quando o quadro está vazio */
  onChange: (png: string | null) => void;
  altura?: number;
  desabilitado?: boolean;
  rotulo?: string;
}

/** menos tinta que isso é um toque sem querer, não uma assinatura */
const TRACO_MINIMO_PX = 40;
/** largura máxima da imagem guardada (o suficiente para o relatório impresso) */
const LARGURA_MAXIMA = 900;
const MARGEM = 12;

/**
 * Quadro de assinatura por toque (§37). Funciona com dedo, caneta e mouse
 * pelos Pointer Events; o fundo é branco como papel, para a assinatura
 * aparecer igual na tela escura, no relatório e na impressão.
 */
export function AssinaturaTouch({ onChange, altura = 200, desabilitado, rotulo = "Assine no quadro" }: AssinaturaTouchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracos = useRef<Ponto[][]>([]);
  const desenhando = useRef(false);
  const comprimento = useRef(0);
  const [vazia, setVazia] = useState(true);

  const contexto = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);

  /** prepara o canvas na densidade do aparelho (linha nítida em tela retina) */
  const preparar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contexto();
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    // redesenha o que já existia (ex.: girou o celular)
    for (const traco of tracos.current) {
      ctx.beginPath();
      traco.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (traco.length === 1) ctx.lineTo(traco[0].x + 0.1, traco[0].y + 0.1);
      ctx.stroke();
    }
  }, [altura, contexto]);

  useEffect(() => {
    preparar();
    const aoRedimensionar = () => preparar();
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [preparar]);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>): Ponto {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** recorta a tinta com margem e reduz a largura para guardar pouco */
  function exportar(): string | null {
    const canvas = canvasRef.current;
    const pontos = tracos.current.flat();
    if (!canvas || pontos.length === 0) return null;
    const minX = Math.max(0, Math.min(...pontos.map((p) => p.x)) - MARGEM);
    const minY = Math.max(0, Math.min(...pontos.map((p) => p.y)) - MARGEM);
    const maxX = Math.min(canvas.clientWidth, Math.max(...pontos.map((p) => p.x)) + MARGEM);
    const maxY = Math.min(altura, Math.max(...pontos.map((p) => p.y)) + MARGEM);
    const dpr = canvas.width / canvas.clientWidth;
    const largura = (maxX - minX) * dpr;
    const alturaRecorte = (maxY - minY) * dpr;
    const escala = Math.min(1, LARGURA_MAXIMA / largura);
    const saida = document.createElement("canvas");
    saida.width = Math.max(1, Math.round(largura * escala));
    saida.height = Math.max(1, Math.round(alturaRecorte * escala));
    const ctx = saida.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, saida.width, saida.height);
    ctx.drawImage(canvas, minX * dpr, minY * dpr, largura, alturaRecorte, 0, 0, saida.width, saida.height);
    return saida.toDataURL("image/png");
  }

  function aoPressionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (desabilitado) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const p = ponto(e);
    tracos.current.push([p]);
    const ctx = contexto();
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.1, p.y + 0.1);
      ctx.stroke();
    }
  }

  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const traco = tracos.current[tracos.current.length - 1];
    const anterior = traco[traco.length - 1];
    const p = ponto(e);
    comprimento.current += Math.hypot(p.x - anterior.x, p.y - anterior.y);
    traco.push(p);
    const ctx = contexto();
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(anterior.x, anterior.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  function aoSoltar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const temAssinatura = comprimento.current >= TRACO_MINIMO_PX;
    setVazia(!temAssinatura);
    onChange(temAssinatura ? exportar() : null);
  }

  function limpar() {
    tracos.current = [];
    comprimento.current = 0;
    setVazia(true);
    preparar();
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{rotulo}</span>
        <button
          type="button"
          onClick={limpar}
          disabled={desabilitado || vazia}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-40"
        >
          <Eraser size={13} aria-hidden="true" /> Limpar
        </button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={vazia ? "Quadro de assinatura vazio" : "Assinatura desenhada"}
          style={{ height: altura, touchAction: "none" }}
          className={`block w-full ${desabilitado ? "cursor-not-allowed opacity-60" : "cursor-crosshair"}`}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onPointerLeave={aoSoltar}
        />
        {vazia && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">
            Assine com o dedo ou a caneta
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-slate-300" aria-hidden="true" />
      </div>
    </div>
  );
}
