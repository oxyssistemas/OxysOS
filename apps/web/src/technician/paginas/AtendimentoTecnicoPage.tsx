import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  FileText,
  Stethoscope,
  AlertTriangle,
  ArrowLeft,
  Camera,
  ClipboardList,
  HardDrive,
  MapPin,
  Navigation,
  Package,
  PenLine,
  Phone,
  RefreshCw,
  Store,
  Timer,
  Users,
} from "lucide-react";
import { TelaCarregando } from "@/components/TelaCarregando";
import { maskPhone } from "@oxys/shared/masks";
import { obterAtendimento, obterAtendimentoAtual } from "../tecnicoService";
import { AcoesCampo } from "../componentes/AcoesCampo";
import {
  CLASSE_ESTADO_CAMPO,
  ROTULO_ESTADO_CAMPO,
  diaRelativo,
  horario,
  linkDaRota,
  type AtendimentoTecnico,
} from "../tipos";

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold text-text-primary">{titulo}</h2>
      <div className="mt-2 text-sm text-text-secondary">{children}</div>
    </section>
  );
}

interface AtendimentoTecnicoPageProps {
  /** sem id na rota: mostra o atendimento em foco (em andamento ou o próximo) */
  atual?: boolean;
}

export function AtendimentoTecnicoPage({ atual }: AtendimentoTecnicoPageProps) {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<AtendimentoTecnico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(atual || !id ? await obterAtendimentoAtual() : await obterAtendimento(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o atendimento.");
    } finally {
      setCarregando(false);
    }
  }, [id, atual]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando && !dados) return <TelaCarregando />;

  if (erro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-12 text-center">
        <AlertTriangle size={20} className="text-danger" aria-hidden="true" />
        <p className="text-sm text-text-primary">{erro}</p>
        <div className="flex gap-2">
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary">
            <RefreshCw size={13} aria-hidden="true" /> Tentar de novo
          </button>
          <Link to="/technician/agenda" className="rounded-lg border border-border px-3 py-2 text-xs text-text-secondary">
            Ver a agenda
          </Link>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-14 text-center">
        <ClipboardList size={20} className="text-text-muted" aria-hidden="true" />
        <p className="text-sm text-text-secondary">Nenhum atendimento em aberto agora.</p>
        <Link to="/technician/agenda" className="mt-1 text-sm font-medium text-accent">
          Abrir a agenda
        </Link>
      </div>
    );
  }

  const { agendamento, os, cliente, endereco, equipamento } = dados;
  const rota = linkDaRota(endereco);

  return (
    <div className="flex flex-col gap-4">
      {!atual && (
        <Link to="/technician/agenda" className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
          <ArrowLeft size={15} aria-hidden="true" /> Agenda
        </Link>
      )}

      <header style={{ borderLeftColor: os.prioridade.cor }} className="rounded-xl border border-border border-l-[4px] bg-panel p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold tabular-nums text-text-primary">
              {horario(agendamento.inicio_em)} – {horario(agendamento.fim_em)}
            </p>
            <p className="text-xs text-text-muted">
              {diaRelativo(agendamento.inicio_em)} · {os.numero ?? "sem número"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{ borderColor: `${os.prioridade.cor}55`, color: os.prioridade.cor }}
            >
              {os.prioridade.nome}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CLASSE_ESTADO_CAMPO[agendamento.estado_campo]}`}>
              {ROTULO_ESTADO_CAMPO[agendamento.estado_campo]}
            </span>
          </div>
        </div>
        <p className="mt-2 text-base font-medium text-text-primary">{os.titulo?.trim() || os.tipo_servico || cliente.nome}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: os.status.cor }} aria-hidden="true" />
            {os.status.nome}
          </span>
          {os.tipo_servico && <span>{os.tipo_servico}</span>}
          {agendamento.equipe && (
            <span className="inline-flex items-center gap-1">
              <Users size={11} style={{ color: agendamento.equipe.cor }} aria-hidden="true" />
              {agendamento.equipe.nome}
            </span>
          )}
        </p>
        {agendamento.observacao && (
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-text-secondary">{agendamento.observacao}</p>
        )}
      </header>

      <AcoesCampo
        agendamentoId={agendamento.id}
        estado={agendamento.estado_campo}
        apontamento={dados.apontamento_aberto}
        tempos={dados.tempos}
        aoMudar={carregar}
      />

      <Bloco titulo="Cliente">
        <p className="font-medium text-text-primary">{cliente.nome}</p>
        {cliente.telefone ? (
          <a
            href={`tel:${cliente.telefone}`}
            className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-text-primary"
          >
            <Phone size={15} aria-hidden="true" /> {maskPhone(cliente.telefone)}
          </a>
        ) : (
          <p className="text-xs text-text-muted">Sem telefone cadastrado.</p>
        )}
      </Bloco>

      <Bloco titulo="Onde">
        {os.local_atendimento === "loja" ? (
          <p className="flex items-center gap-1.5">
            <Store size={14} className="text-text-muted" aria-hidden="true" /> Atendimento na loja
          </p>
        ) : endereco ? (
          <>
            <p className="flex items-start gap-1.5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {endereco.resumo}
                {endereco.complemento && <span className="block text-xs text-text-muted">{endereco.complemento}</span>}
                {endereco.referencia && <span className="block text-xs text-text-muted">Ref.: {endereco.referencia}</span>}
                {endereco.cep && <span className="block text-xs text-text-muted">CEP {endereco.cep}</span>}
              </span>
            </p>
            {rota && (
              <a
                href={rota}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white"
              >
                <Navigation size={16} aria-hidden="true" /> Ver rota
              </a>
            )}
          </>
        ) : (
          <p className="text-xs text-text-muted">Endereço não informado na OS.</p>
        )}
      </Bloco>

      <Bloco titulo="O que foi relatado">
        <p className="whitespace-pre-wrap text-text-secondary">{os.problema}</p>
        {os.objeto && <p className="mt-2 text-xs text-text-muted">Objeto: {os.objeto}</p>}
      </Bloco>

      {equipamento && (
        <Bloco titulo="Equipamento">
          <p className="flex items-center gap-1.5 font-medium text-text-primary">
            <HardDrive size={14} className="text-text-muted" aria-hidden="true" /> {equipamento.nome}
          </p>
          <ul className="mt-1 text-xs text-text-muted">
            {(equipamento.marca || equipamento.modelo) && (
              <li>{[equipamento.marca, equipamento.modelo].filter(Boolean).join(" ")}</li>
            )}
            {equipamento.numero_serie && <li>Nº de série {equipamento.numero_serie}</li>}
            {equipamento.localizacao && <li>Local: {equipamento.localizacao}</li>}
            {equipamento.codigo && <li>Código {equipamento.codigo}</li>}
          </ul>
        </Bloco>
      )}

      <div className="flex flex-col gap-2">
        <Link
          to={`/technician/jobs/${agendamento.id}/checklist`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <ClipboardList size={15} aria-hidden="true" /> Checklist do atendimento
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/fotos`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <Camera size={15} aria-hidden="true" /> Fotos e evidências
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/diagnostico`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <Stethoscope size={15} aria-hidden="true" /> Diagnóstico e solução
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/materiais`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <Package size={15} aria-hidden="true" /> Materiais e serviços
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/assinatura`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <PenLine size={15} aria-hidden="true" /> Assinatura do cliente
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/relatorio`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <FileText size={15} aria-hidden="true" /> Relatório do atendimento
        </Link>
        <Link
          to={`/technician/jobs/${agendamento.id}/horas`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-panel text-sm font-medium text-text-secondary"
        >
          <Timer size={15} aria-hidden="true" /> Minhas horas neste atendimento
        </Link>
      </div>


    </div>
  );
}
