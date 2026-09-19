import { useEffect, useState } from "react";
import { MapPin, Store } from "lucide-react";
import { supabase } from "@oxys/shared/supabase";
import type { EnderecoOS, LocalAtendimento } from "../types";

export const ROTULO_LOCAL_ATENDIMENTO: Record<LocalAtendimento, string> = {
  loja: "Na loja",
  externo: "Externo",
};

export const DESCRICAO_LOCAL_ATENDIMENTO: Record<LocalAtendimento, string> = {
  loja: "O cliente traz o aparelho até a loja (ex.: reparo de celular).",
  externo: "O técnico vai até o cliente (ex.: instalação de câmeras).",
};

export function formatarEnderecoOS(e: EnderecoOS): string {
  return [
    [e.logradouro, e.numero || "s/n"].join(", "),
    e.complemento,
    e.bairro,
    `${e.cidade}/${e.estado}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Ícone + texto (nunca só cor). */
export function LocalAtendimentoBadge({ local }: { local: LocalAtendimento }) {
  const Icone = local === "externo" ? MapPin : Store;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
        local === "externo" ? "border-accent/30 bg-accent-muted text-accent" : "border-border text-text-secondary"
      }`}
    >
      <Icone size={12} aria-hidden="true" />
      {ROTULO_LOCAL_ATENDIMENTO[local]}
    </span>
  );
}

interface EnderecoOpcao extends EnderecoOS {
  id: string;
  rotulo: string;
  principal: boolean;
}

interface SeletorLocalAtendimentoProps {
  idPrefixo: string;
  local: LocalAtendimento;
  enderecoId: string;
  /** endereços são do cliente escolhido; null = cliente ainda não cadastrado/selecionado */
  clienteId: string | null;
  onAlterar: (local: LocalAtendimento, enderecoId: string) => void;
  disabled?: boolean;
  /** preenche o endereço principal automaticamente (só ao abrir uma OS nova) */
  sugerirPrincipal?: boolean;
}

export function SeletorLocalAtendimento({
  idPrefixo,
  local,
  enderecoId,
  clienteId,
  onAlterar,
  disabled,
  sugerirPrincipal,
}: SeletorLocalAtendimentoProps) {
  const [enderecos, setEnderecos] = useState<EnderecoOpcao[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (local !== "externo" || !clienteId) {
      setEnderecos([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    supabase
      .from("cliente_enderecos")
      .select("id, rotulo, logradouro, numero, complemento, bairro, cidade, estado, principal")
      .eq("cliente_id", clienteId)
      .order("principal", { ascending: false })
      .order("rotulo")
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.error("[os] endereços do cliente", error);
        const lista = (data ?? []) as EnderecoOpcao[];
        setEnderecos(lista);
        setCarregando(false);
        // sugere o endereço principal quando ainda não há escolha
        const principal = lista.find((e) => e.principal);
        if (sugerirPrincipal && !enderecoId && principal) onAlterar("externo", principal.id);
      });
    return () => {
      cancelado = true;
    };
    // recarrega só ao trocar de cliente ou de local
  }, [local, clienteId]);

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-medium text-text-secondary">Local do atendimento</legend>
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["loja", "externo"] as const).map((opcao) => {
            const Icone = opcao === "externo" ? MapPin : Store;
            const marcado = local === opcao;
            return (
              <button
                key={opcao}
                type="button"
                role="radio"
                aria-checked={marcado}
                id={`${idPrefixo}_local_${opcao}`}
                onClick={() => onAlterar(opcao, opcao === "externo" ? enderecoId : "")}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                  marcado ? "border-accent bg-accent-muted" : "border-border hover:bg-white/5"
                }`}
              >
                <Icone size={18} className={`mt-0.5 shrink-0 ${marcado ? "text-accent" : "text-text-muted"}`} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-text-primary">
                    {opcao === "loja" ? "Na loja (balcão)" : "Externo (no cliente)"}
                  </span>
                  <span className="block text-xs text-text-muted">{DESCRICAO_LOCAL_ATENDIMENTO[opcao]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {local === "externo" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefixo}_endereco`} className="text-sm font-medium text-text-secondary">
            Endereço do atendimento
          </label>
          <select
            id={`${idPrefixo}_endereco`}
            value={enderecoId}
            disabled={disabled || !clienteId || carregando}
            onChange={(e) => onAlterar("externo", e.target.value)}
            className="rounded-lg border border-border bg-base px-3.5 py-2.5 text-sm text-text-primary transition-colors focus:border-accent disabled:opacity-60"
          >
            <option value="">
              {!clienteId
                ? "Selecione um cliente cadastrado"
                : carregando
                  ? "Carregando endereços…"
                  : enderecos.length === 0
                    ? "Cliente sem endereços cadastrados"
                    : "Não informado"}
            </option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo} · {formatarEnderecoOS(e)}
              </option>
            ))}
          </select>
          {clienteId && !carregando && enderecos.length === 0 && (
            <p className="text-xs text-text-muted">Cadastre endereços na ficha do cliente para escolher aqui.</p>
          )}
        </div>
      )}
    </div>
  );
}
