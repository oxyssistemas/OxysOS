import { useEffect, useRef, useState } from "react";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import { gerarUrlsFotos } from "../lib/storage";
import type { OSFoto, TipoFotoOS } from "../types";

interface FotosGaleriaProps {
  fotos: OSFoto[];
  permiteAdicionar?: boolean;
  onAdicionar?: (arquivo: File, tipo: TipoFotoOS, observacao: string) => Promise<void>;
}

function GrupoFotos({ titulo, fotos, urls }: { titulo: string; fotos: OSFoto[]; urls: Map<string, string> }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-text-muted">
        {titulo} ({fotos.length})
      </p>
      {fotos.length === 0 ? (
        <p className="text-xs text-text-muted">Nenhuma foto ainda.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((foto) => {
            const url = urls.get(foto.caminho);
            if (!url) {
              return (
                <div
                  key={foto.id}
                  className="flex aspect-square items-center justify-center rounded-lg border border-border bg-black/20 text-text-muted"
                  title="Foto indisponível"
                >
                  <ImageOff size={16} aria-label="Foto indisponível" />
                </div>
              );
            }
            return (
              <a
                key={foto.id}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg border border-border bg-black/20"
                title={foto.observacao ?? undefined}
              >
                <img src={url} alt={foto.observacao ?? `Foto ${titulo.toLowerCase()}`} className="h-full w-full object-cover" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FotosGaleria({ fotos, permiteAdicionar, onAdicionar }: FotosGaleriaProps) {
  const fotosAntes = fotos.filter((f) => f.tipo === "antes");
  const fotosDepois = fotos.filter((f) => f.tipo === "depois");

  const inputRef = useRef<HTMLInputElement>(null);
  const [tipoParaAdicionar, setTipoParaAdicionar] = useState<TipoFotoOS>("depois");
  const [enviando, setEnviando] = useState(false);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  const chaveCaminhos = fotos.map((f) => f.caminho).join("|");
  useEffect(() => {
    let cancelado = false;
    gerarUrlsFotos(fotos.map((f) => f.caminho)).then((mapa) => {
      if (!cancelado) setUrls(mapa);
    });
    return () => {
      cancelado = true;
    };
    // recalcula só quando o conjunto de caminhos muda
  }, [chaveCaminhos]);

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !onAdicionar) return;
    setEnviando(true);
    try {
      await onAdicionar(arquivo, tipoParaAdicionar, "");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <GrupoFotos titulo="Antes" fotos={fotosAntes} urls={urls} />
        <GrupoFotos titulo="Depois" fotos={fotosDepois} urls={urls} />
      </div>

      {permiteAdicionar && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <select
            value={tipoParaAdicionar}
            onChange={(e) => setTipoParaAdicionar(e.target.value as TipoFotoOS)}
            className="rounded-lg border border-border bg-base px-2.5 py-2 text-xs text-text-primary"
          >
            <option value="depois">Foto de "depois"</option>
            <option value="antes">Foto de "antes"</option>
          </select>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-60"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            Adicionar foto
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleArquivoSelecionado}
          />
        </div>
      )}
    </div>
  );
}
