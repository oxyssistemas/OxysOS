import { useEffect, useState, type ReactNode } from "react";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useCompany } from "../../context/CompanyContext";
import { SeletorLocalAtendimento } from "../../legado/components/LocalAtendimento";
import { listarEquipamentosDoCliente } from "../ordensService";
import type { ApoioOrdem } from "../useApoioOrdem";
import type { DadosOrdemForm, ModoPrazo, OpcaoEquipamento } from "../tipos";

export type ErrosOrdem = Partial<Record<keyof DadosOrdemForm, string>>;

interface CamposOrdemProps {
  idPrefixo: string;
  dados: DadosOrdemForm;
  onAlterar: (parcial: Partial<DadosOrdemForm>) => void;
  erros: ErrosOrdem;
  clienteId: string | null;
  apoio: ApoioOrdem;
  modosPrazo: ModoPrazo[];
  /** preenche o endereço principal do cliente ao escolher "externo" (só na criação) */
  sugerirEndereco?: boolean;
  /** ids que devem continuar visíveis mesmo inativos (edição) */
  atuais?: { tipo?: string | null; prioridade?: string | null };
  disabled?: boolean;
}

export function validarOrdem(dados: DadosOrdemForm): ErrosOrdem {
  const erros: ErrosOrdem = {};
  if (!dados.titulo.trim()) erros.titulo = "Informe um título curto para a OS.";
  else if (dados.titulo.trim().length > 120) erros.titulo = "Use até 120 caracteres.";
  if (!dados.descricao.trim()) erros.descricao = "Descreva o problema ou o serviço solicitado.";
  else if (dados.descricao.trim().length > 5000) erros.descricao = "Use até 5.000 caracteres.";
  if (dados.objeto_atendimento.trim().length > 200) erros.objeto_atendimento = "Use até 200 caracteres.";
  if (dados.observacoes_internas.trim().length > 5000) erros.observacoes_internas = "Use até 5.000 caracteres.";
  if (!dados.prioridade_id) erros.prioridade_id = "Selecione a prioridade.";
  if (dados.hora_agendada && !dados.data_agendada) erros.data_agendada = "Informe a data do agendamento.";
  if (dados.modo_prazo === "horas") {
    const horas = Number(dados.sla_horas);
    if (!Number.isInteger(horas) || horas < 1 || horas > 8760) erros.sla_horas = "Informe de 1 a 8.760 horas.";
  }
  if (dados.modo_prazo === "data" && (!dados.prazo_data || Number.isNaN(new Date(dados.prazo_data).getTime()))) {
    erros.prazo_data = "Informe a data limite.";
  }
  return erros;
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function CamposOrdem({
  idPrefixo,
  dados,
  onAlterar,
  erros,
  clienteId,
  apoio,
  modosPrazo,
  sugerirEndereco,
  atuais,
  disabled,
}: CamposOrdemProps) {
  const { hasFeature, can } = useCompany();
  const verEquipamentos = hasFeature("assets") && can("assets.view");
  const [equipamentos, setEquipamentos] = useState<OpcaoEquipamento[] | null>(null);

  useEffect(() => {
    if (!verEquipamentos || !clienteId) {
      setEquipamentos(null);
      return;
    }
    let cancelado = false;
    setEquipamentos(null);
    listarEquipamentosDoCliente(clienteId)
      .then((lista) => !cancelado && setEquipamentos(lista))
      .catch(() => !cancelado && setEquipamentos([]));
    return () => {
      cancelado = true;
    };
  }, [clienteId, verEquipamentos]);

  const prioridades = apoio.prioridades.filter((p) => p.ativo || p.id === atuais?.prioridade);
  const tipos = apoio.tipos.filter((t) => t.ativo || t.id === atuais?.tipo);
  const prioridadeEscolhida = apoio.prioridades.find((p) => p.id === dados.prioridade_id);

  const rotulosPrazo: Record<ModoPrazo, string> = {
    prioridade: prioridadeEscolhida?.sla_horas
      ? `SLA da prioridade (${prioridadeEscolhida.sla_horas} h)`
      : "Sem prazo (a prioridade não define SLA)",
    horas: "Horas a partir da abertura",
    data: "Data limite",
    sem: "Sem prazo",
  };

  return (
    <div className="flex flex-col gap-7">
      <Secao titulo="Descrição">
        <Field
          id={`${idPrefixo}_titulo`}
          label="Título"
          placeholder="Ex.: Instalação de 8 câmeras na portaria"
          maxLength={120}
          value={dados.titulo}
          onChange={(e) => onAlterar({ titulo: e.target.value })}
          erro={erros.titulo}
          disabled={disabled}
        />
        <TextareaField
          id={`${idPrefixo}_descricao`}
          label="Descrição do problema ou serviço"
          rows={4}
          maxLength={5000}
          value={dados.descricao}
          onChange={(e) => onAlterar({ descricao: e.target.value })}
          erro={erros.descricao}
          disabled={disabled}
        />
      </Secao>

      <Secao titulo="Atendimento">
        <SeletorLocalAtendimento
          idPrefixo={idPrefixo}
          local={dados.local_atendimento}
          enderecoId={dados.cliente_endereco_id}
          clienteId={clienteId}
          sugerirPrincipal={sugerirEndereco}
          disabled={disabled}
          onAlterar={(local, enderecoId) => onAlterar({ local_atendimento: local, cliente_endereco_id: enderecoId })}
        />
        {verEquipamentos && (
          <SelectField
            id={`${idPrefixo}_equipamento`}
            label="Equipamento (opcional)"
            value={dados.equipamento_id}
            onChange={(e) => onAlterar({ equipamento_id: e.target.value })}
            disabled={disabled || !clienteId || equipamentos === null}
          >
            <option value="">
              {!clienteId
                ? "Selecione o cliente primeiro"
                : equipamentos === null
                  ? "Carregando equipamentos…"
                  : equipamentos.length === 0
                    ? "Cliente sem equipamentos cadastrados"
                    : "Nenhum equipamento específico"}
            </option>
            {(equipamentos ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {e.detalhe ? ` — ${e.detalhe}` : ""}
              </option>
            ))}
          </SelectField>
        )}
        <Field
          id={`${idPrefixo}_objeto`}
          label="Objeto do atendimento (opcional)"
          placeholder="Ex.: iPhone 13, portão da garagem"
          maxLength={200}
          value={dados.objeto_atendimento}
          onChange={(e) => onAlterar({ objeto_atendimento: e.target.value })}
          erro={erros.objeto_atendimento}
          disabled={disabled}
        />
      </Secao>

      <Secao titulo="Classificação">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id={`${idPrefixo}_tipo`}
            label="Tipo de serviço"
            value={dados.tipo_servico_id}
            disabled={disabled}
            onChange={(e) => {
              const tipo = apoio.tipos.find((t) => t.id === e.target.value);
              const parcial: Partial<DadosOrdemForm> = { tipo_servico_id: e.target.value };
              // sugere o local do tipo (ex.: instalação → no cliente); o usuário pode trocar
              if (tipo?.local_atendimento_padrao && tipo.local_atendimento_padrao !== dados.local_atendimento) {
                parcial.local_atendimento = tipo.local_atendimento_padrao;
                parcial.cliente_endereco_id = "";
              }
              onAlterar(parcial);
            }}
          >
            <option value="">{tipos.length === 0 ? "Nenhum tipo cadastrado" : "Não informado"}</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
                {t.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={`${idPrefixo}_prioridade`}
            label="Prioridade"
            value={dados.prioridade_id}
            onChange={(e) => onAlterar({ prioridade_id: e.target.value })}
            erro={erros.prioridade_id}
            disabled={disabled}
          >
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.sla_horas ? ` · SLA ${p.sla_horas} h` : ""}
                {p.ativo ? "" : " (inativa)"}
              </option>
            ))}
          </SelectField>
        </div>
      </Secao>

      <Secao titulo="Agendamento e prazo">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id={`${idPrefixo}_data`}
            label="Data agendada (opcional)"
            type="date"
            value={dados.data_agendada}
            onChange={(e) => onAlterar({ data_agendada: e.target.value, ...(e.target.value ? {} : { hora_agendada: "" }) })}
            erro={erros.data_agendada}
            disabled={disabled}
          />
          <Field
            id={`${idPrefixo}_hora`}
            label="Horário (opcional)"
            type="time"
            value={dados.hora_agendada}
            onChange={(e) => onAlterar({ hora_agendada: e.target.value })}
            disabled={disabled || !dados.data_agendada}
          />
        </div>

        <fieldset disabled={disabled}>
          <legend className="mb-2 text-sm font-medium text-text-secondary">Prazo de atendimento (SLA)</legend>
          <div role="radiogroup" className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {modosPrazo.map((modo) => (
              <label
                key={modo}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  dados.modo_prazo === modo ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefixo}_modo_prazo`}
                  checked={dados.modo_prazo === modo}
                  onChange={() => onAlterar({ modo_prazo: modo })}
                  className="accent-accent"
                />
                {rotulosPrazo[modo]}
              </label>
            ))}
          </div>
          {dados.modo_prazo === "horas" && (
            <div className="mt-3 max-w-xs">
              <Field
                id={`${idPrefixo}_sla`}
                label="Horas para atender"
                type="number"
                min={1}
                max={8760}
                step={1}
                inputMode="numeric"
                value={dados.sla_horas}
                onChange={(e) => onAlterar({ sla_horas: e.target.value })}
                erro={erros.sla_horas}
              />
            </div>
          )}
          {dados.modo_prazo === "data" && (
            <div className="mt-3 max-w-xs">
              <Field
                id={`${idPrefixo}_prazo`}
                label="Data e hora limite"
                type="datetime-local"
                value={dados.prazo_data}
                onChange={(e) => onAlterar({ prazo_data: e.target.value })}
                erro={erros.prazo_data}
              />
            </div>
          )}
        </fieldset>
      </Secao>

      <Secao titulo="Uso interno">
        <TextareaField
          id={`${idPrefixo}_obs_internas`}
          label="Observações internas (visíveis só para a equipe)"
          rows={3}
          maxLength={5000}
          value={dados.observacoes_internas}
          onChange={(e) => onAlterar({ observacoes_internas: e.target.value })}
          erro={erros.observacoes_internas}
          disabled={disabled}
        />
      </Secao>
    </div>
  );
}
