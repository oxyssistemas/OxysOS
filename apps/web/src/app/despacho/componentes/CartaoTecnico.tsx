import { Link } from "react-router-dom";
import { horario } from "../../agenda/tipos";
import {
  CLASSE_SITUACAO,
  ROTULO_SITUACAO,
  cargaHumana,
  type TecnicoDespacho,
} from "../tipos";

interface CartaoTecnicoProps {
  tecnico: TecnicoDespacho;
  /** recebe a OS arrastada até este técnico */
  aoSoltarOs?: (tecnicoId: string, osId: string) => void;
  /** há uma OS sendo arrastada agora */
  recebendo: boolean;
}

export function CartaoTecnico({ tecnico, aoSoltarOs, recebendo }: CartaoTecnicoProps) {
  return (
    <section
      onDragOver={aoSoltarOs ? (e) => e.preventDefault() : undefined}
      onDrop={
        aoSoltarOs
          ? (e) => {
              e.preventDefault();
              const osId = e.dataTransfer.getData("text/plain");
              if (osId) aoSoltarOs(tecnico.id, osId);
            }
          : undefined
      }
      className={`rounded-xl border bg-panel p-3 transition-colors ${
        recebendo && aoSoltarOs ? "border-dashed border-accent" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{tecnico.nome ?? "Sem nome"}</p>
          <p className="text-[11px] text-text-muted">
            {tecnico.atendimentos_dia} no dia · {cargaHumana(tecnico.minutos_dia)}
            <br />
            {tecnico.os_abertas} OS em aberto
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${CLASSE_SITUACAO[tecnico.situacao]}`}
        >
          {ROTULO_SITUACAO[tecnico.situacao]}
        </span>
      </div>

      {tecnico.especialidades.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tecnico.especialidades.map((e) => (
            <span key={e} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-text-secondary">
              {e}
            </span>
          ))}
        </div>
      )}

      <ul className="mt-2.5 flex flex-col gap-1">
        {tecnico.agenda.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-text-muted">
            {aoSoltarOs ? "Solte uma OS aqui para agendar" : "Sem atendimentos no dia"}
          </li>
        ) : (
          tecnico.agenda.map((a) => (
            <li key={a.id}>
              <Link
                to={`/app/service-orders/${a.os_id}`}
                style={{ borderLeftColor: a.prioridade_cor }}
                className="flex items-center gap-2 overflow-hidden rounded border-l-[3px] bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
              >
                <span className="shrink-0 tabular-nums text-text-muted">
                  {horario(a.inicio_em)}–{horario(a.fim_em)}
                </span>
                <span className="truncate text-text-secondary">{a.titulo}</span>
              </Link>
            </li>
          ))
        )}
      </ul>

      {!tecnico.tem_login && (
        <p className="mt-2 text-[11px] text-text-muted">Sem login: não acompanha o atendimento pelo portal do técnico.</p>
      )}
    </section>
  );
}
