import type { EventoAgenda } from "../tipos";
import { EventoAgendaCard } from "./EventoAgendaCard";

interface Responsavel {
  id: string;
  nome: string | null;
  cor?: string;
}

interface ListaPorResponsavelProps {
  /** técnicos ou equipes ativos da empresa */
  responsaveis: Responsavel[];
  eventos: EventoAgenda[];
  /** de qual campo do evento sai o responsável */
  campo: "tecnico" | "equipe";
  rotuloVazio: string;
  aoAbrir?: (evento: EventoAgenda) => void;
}

const ROTULO_SEM: Record<"tecnico" | "equipe", string> = {
  tecnico: "Sem técnico",
  equipe: "Sem equipe",
};

/** Visões "Técnicos" e "Equipes": o dia escolhido, um bloco por responsável. */
export function ListaPorResponsavel({ responsaveis, eventos, campo, rotuloVazio, aoAbrir }: ListaPorResponsavelProps) {
  const semResponsavel = eventos.filter((e) => !e[campo]);
  const blocos = responsaveis.map((r) => ({
    responsavel: r,
    eventos: eventos
      .filter((e) => e[campo]?.id === r.id)
      .sort((a, b) => a.inicio_em.localeCompare(b.inicio_em)),
  }));

  if (responsaveis.length === 0 && semResponsavel.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel px-4 py-12 text-center">
        <p className="text-sm text-text-secondary">{rotuloVazio}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {blocos.map(({ responsavel, eventos: doResponsavel }) => (
        <section key={responsavel.id} className="rounded-xl border border-border bg-panel p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {responsavel.cor && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: responsavel.cor }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{responsavel.nome ?? "Sem nome"}</span>
            <span className="ml-auto shrink-0 text-xs text-text-muted">{doResponsavel.length}</span>
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {doResponsavel.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                Sem atendimentos no dia
              </p>
            ) : (
              doResponsavel.map((evento) => (
                <div key={evento.id} className="min-h-[68px]">
                  <EventoAgendaCard evento={evento} aoAbrir={aoAbrir} />
                </div>
              ))
            )}
          </div>
        </section>
      ))}

      {semResponsavel.length > 0 && (
        <section className="rounded-xl border border-dashed border-border bg-panel p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {ROTULO_SEM[campo]}
            <span className="ml-auto text-xs text-text-muted">{semResponsavel.length}</span>
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {semResponsavel
              .sort((a, b) => a.inicio_em.localeCompare(b.inicio_em))
              .map((evento) => (
                <div key={evento.id} className="min-h-[68px]">
                  <EventoAgendaCard evento={evento} aoAbrir={aoAbrir} />
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
