import { useEffect, useState, type FormEvent } from "react";
import { CalendarRange } from "lucide-react";
import {
  PRESETS,
  dataParaInput,
  descreverPeriodo,
  periodoDoPreset,
  periodoPersonalizado,
  type Periodo,
  type PresetPeriodo,
} from "../periodo";

interface FiltroPeriodoProps {
  periodo: Periodo;
  onAlterar: (periodo: Periodo) => void;
}

export function FiltroPeriodo({ periodo, onAlterar }: FiltroPeriodoProps) {
  const [personalizadoAberto, setPersonalizadoAberto] = useState(periodo.preset === "personalizado");
  const [de, setDe] = useState(dataParaInput(periodo.inicio));
  const [ate, setAte] = useState(dataParaInput(new Date(periodo.fim.getTime() - 86_400_000)));
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (periodo.preset === "personalizado") setPersonalizadoAberto(true);
  }, [periodo.preset]);

  function selecionar(preset: PresetPeriodo) {
    setErro(null);
    if (preset === "personalizado") {
      setPersonalizadoAberto(true);
      return;
    }
    setPersonalizadoAberto(false);
    onAlterar(periodoDoPreset(preset));
  }

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const resultado = periodoPersonalizado(de, ate);
    if (typeof resultado === "string") {
      setErro(resultado);
      return;
    }
    setErro(null);
    onAlterar(resultado);
  }

  const selecionado = personalizadoAberto ? "personalizado" : periodo.preset;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1 rounded-lg border border-border bg-panel p-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selecionar(p.id)}
              aria-pressed={selecionado === p.id}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selecionado === p.id
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <CalendarRange size={14} aria-hidden="true" />
          {descreverPeriodo(periodo)}
        </p>
      </div>

      {personalizadoAberto && (
        <form onSubmit={aplicar} className="flex flex-wrap items-end gap-3" noValidate>
          <label className="flex flex-col gap-1 text-xs text-text-secondary" htmlFor="periodo-de">
            De
            <input
              id="periodo-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm text-text-primary [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary" htmlFor="periodo-ate">
            Até
            <input
              id="periodo-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm text-text-primary [color-scheme:dark]"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Aplicar
          </button>
          {erro && (
            <p role="alert" className="w-full text-xs text-danger">
              {erro}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
