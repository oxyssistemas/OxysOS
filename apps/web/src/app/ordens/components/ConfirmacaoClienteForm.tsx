import { useState, type FormEvent } from "react";
import { Loader2, PenLine } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { AssinaturaTouch } from "@/components/AssinaturaTouch";
import { registrarAssinaturaOs } from "../execucaoService";
import type { DadosConfirmacaoCliente } from "../tiposExecucao";

interface ConfirmacaoClienteFormProps {
  osId: string;
  agendamentoId?: string | null;
  /** já existe assinatura válida: a nova vai substituí-la */
  substitui: boolean;
  /** campos maiores para uso com o dedo (portal do técnico) */
  campo?: boolean;
  onSalvo: () => void;
  onCancelar?: () => void;
}

/**
 * Confirmação do cliente (§38): quem acompanhou, documento opcional,
 * observações e a assinatura na tela (§37).
 */
export function ConfirmacaoClienteForm({ osId, agendamentoId, substitui, campo, onSalvo, onCancelar }: ConfirmacaoClienteFormProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [dados, setDados] = useState<DadosConfirmacaoCliente>({ nome: "", documento: "", observacao: "" });
  const [imagem, setImagem] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof DadosConfirmacaoCliente | "imagem", string>>>({});
  const [salvando, setSalvando] = useState(false);

  const input = campo
    ? "min-h-[48px] w-full rounded-lg border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted"
    : "w-full rounded-lg border bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novos: typeof erros = {};
    const nome = dados.nome.trim();
    if (nome.length < 2) novos.nome = "Informe o nome de quem acompanhou.";
    else if (nome.length > 120) novos.nome = "Use até 120 caracteres.";
    const documento = dados.documento.trim();
    if (documento && (documento.length < 3 || documento.length > 30)) novos.documento = "Use de 3 a 30 caracteres.";
    if (dados.observacao.trim().length > 500) novos.observacao = "Use até 500 caracteres.";
    if (!imagem) novos.imagem = "Peça para o cliente assinar no quadro.";
    setErros(novos);
    if (Object.keys(novos).length > 0 || !imagem) return;

    setSalvando(true);
    try {
      await registrarAssinaturaOs({ osId, dados, imagem, agendamentoId });
      notificarSucesso(substitui ? "Nova assinatura registrada. A anterior ficou no histórico." : "Assinatura registrada.");
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível registrar a assinatura.");
    } finally {
      setSalvando(false);
    }
  }

  const borda = (chave: keyof typeof erros) => (erros[chave] ? "border-danger" : "border-border");

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Nome de quem acompanhou</span>
        <input
          value={dados.nome}
          maxLength={120}
          autoComplete="name"
          placeholder="Nome completo"
          onChange={(e) => setDados({ ...dados, nome: e.target.value })}
          aria-invalid={!!erros.nome}
          className={`${input} ${borda("nome")}`}
        />
        {erros.nome && <span className="text-xs text-danger">{erros.nome}</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Documento (opcional)</span>
        <input
          value={dados.documento}
          maxLength={30}
          placeholder="CPF, RG ou matrícula"
          onChange={(e) => setDados({ ...dados, documento: e.target.value })}
          aria-invalid={!!erros.documento}
          className={`${input} ${borda("documento")}`}
        />
        {erros.documento && <span className="text-xs text-danger">{erros.documento}</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Observações (opcional)</span>
        <textarea
          value={dados.observacao}
          maxLength={500}
          rows={2}
          placeholder="Ressalvas do cliente, se houver"
          onChange={(e) => setDados({ ...dados, observacao: e.target.value })}
          aria-invalid={!!erros.observacao}
          className={`${input} ${borda("observacao")} py-2`}
        />
        {erros.observacao && <span className="text-xs text-danger">{erros.observacao}</span>}
      </label>

      <div className="flex flex-col gap-1.5">
        <AssinaturaTouch onChange={setImagem} altura={campo ? 220 : 180} desabilitado={salvando} rotulo="Assinatura do cliente" />
        {erros.imagem && <span className="text-xs text-danger">{erros.imagem}</span>}
      </div>

      {substitui && (
        <p className="text-xs text-amber-300">Já existe uma assinatura nesta OS. A nova substitui a atual, que fica no histórico.</p>
      )}

      <div className="flex gap-2">
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={salvando}
            className={`flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-white/5 ${campo ? "min-h-[48px]" : "py-2.5"}`}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={salvando}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60 ${
            campo ? "min-h-[52px]" : "py-2.5"
          }`}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <PenLine size={16} aria-hidden="true" />}
          Confirmar assinatura
        </button>
      </div>
      <p className="text-[11px] text-text-muted">
        Data e hora vêm do servidor. A imagem é guardada com uma impressão digital (SHA-256) para mostrar que não foi trocada.
      </p>
    </form>
  );
}
