import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Plus, RefreshCw, Trash2, UserPlus, ImagePlus, X } from "lucide-react";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import { listarClientes, criarCliente } from "../data/clientesService";
import { listarStatusOS, listarResponsaveis } from "../data/apoioService";
import { criarOrdemServico } from "../data/osService";
import { isValidEmail, isValidPhone, maskPhone } from "@oxys/shared/masks";
import { gerarCodigoAparelho } from "../lib/storage";
import type { Cliente, ItemOSFormulario, StatusOS, UsuarioResponsavel } from "../types";

function novoIdLocal() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function novoItemVazio(): ItemOSFormulario {
  return { id: novoIdLocal(), tipo: "peca", descricao: "", quantidade: 1, valor_unitario: 0 };
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface FotoSelecionada {
  id: string;
  arquivo: File;
  preview: string;
}

export function NovaOsPage() {
  const { lojaId, usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();
  const [searchParams] = useSearchParams();
  const clientePreSelecionado = searchParams.get("cliente");

  const [carregandoApoio, setCarregandoApoio] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [statusDisponiveis, setStatusDisponiveis] = useState<StatusOS[]>([]);
  const [responsaveis, setResponsaveis] = useState<UsuarioResponsavel[]>([]);

  const [clienteId, setClienteId] = useState("");
  const [mostrarNovoCliente, setMostrarNovoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: "", telefone: "", email: "" });

  const [codigoAparelho, setCodigoAparelho] = useState(() => gerarCodigoAparelho());
  const [objetoAtendimento, setObjetoAtendimento] = useState("");
  const [descricao, setDescricao] = useState("");
  const [itens, setItens] = useState<ItemOSFormulario[]>([novoItemVazio()]);
  const [desconto, setDesconto] = useState(0);
  const [statusId, setStatusId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);

  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    async function carregar() {
      if (!lojaId) return;
      setCarregandoApoio(true);
      try {
        const [dadosClientes, dadosStatus, dadosResponsaveis] = await Promise.all([
          listarClientes(lojaId),
          listarStatusOS(lojaId),
          listarResponsaveis(lojaId),
        ]);
        setClientes(dadosClientes);
        if (clientePreSelecionado && dadosClientes.some((c) => c.id === clientePreSelecionado)) {
          setClienteId(clientePreSelecionado);
        }
        setStatusDisponiveis(dadosStatus);
        setResponsaveis(dadosResponsaveis);

        const statusAberto = dadosStatus.find((s) => s.categoria === "aberto");
        setStatusId(statusAberto?.id ?? dadosStatus[0]?.id ?? "");
      } catch (err) {
        notificarErro(err instanceof Error ? err.message : "Erro ao carregar dados da loja.");
      } finally {
        setCarregandoApoio(false);
      }
    }
    carregar();
  }, [lojaId]);

  const subtotal = useMemo(
    () => itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0),
    [itens],
  );
  const valorTotal = Math.max(subtotal - desconto, 0);

  function atualizarItem(id: string, campo: keyof ItemOSFormulario, valor: string | number) {
    setItens((atual) =>
      atual.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)),
    );
  }

  function removerItem(id: string) {
    setItens((atual) => (atual.length > 1 ? atual.filter((item) => item.id !== id) : atual));
  }

  function adicionarFotos(arquivos: FileList | null) {
    if (!arquivos) return;
    const novasFotos = Array.from(arquivos).map((arquivo) => ({
      id: novoIdLocal(),
      arquivo,
      preview: URL.createObjectURL(arquivo),
    }));
    setFotos((atual) => [...atual, ...novasFotos]);
  }

  function removerFoto(id: string) {
    setFotos((atual) => {
      const alvo = atual.find((f) => f.id === id);
      if (alvo) URL.revokeObjectURL(alvo.preview);
      return atual.filter((f) => f.id !== id);
    });
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {};

    if (!mostrarNovoCliente && !clienteId) novosErros.cliente = "Selecione um cliente.";
    if (mostrarNovoCliente) {
      if (!novoCliente.nome.trim()) novosErros.novo_cliente_nome = "Informe o nome do cliente.";
      if (novoCliente.email && !isValidEmail(novoCliente.email)) {
        novosErros.novo_cliente_email = "E-mail inválido.";
      }
      if (novoCliente.telefone && !isValidPhone(novoCliente.telefone)) {
        novosErros.novo_cliente_telefone = "Telefone incompleto.";
      }
    }
    if (!descricao.trim()) novosErros.descricao = "Descreva o problema ou serviço solicitado.";
    if (!statusId) novosErros.status = "Selecione um status.";

    const itensInvalidos = itens.some((item) => !item.descricao.trim() || item.valor_unitario < 0);
    if (itens.length === 0 || itensInvalidos) {
      novosErros.itens = "Preencha a descrição de todos os itens (ou remova os vazios).";
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando || !lojaId || !usuarioId) return;
    if (!validar()) return;

    setEnviando(true);
    try {
      let idClienteFinal = clienteId;

      if (mostrarNovoCliente) {
        const clienteCriado = await criarCliente({
          loja_id: lojaId,
          nome: novoCliente.nome,
          telefone: novoCliente.telefone,
          email: novoCliente.email,
        });
        idClienteFinal = clienteCriado.id;
      }

      await criarOrdemServico({
        loja_id: lojaId,
        usuario_id: usuarioId,
        cliente_id: idClienteFinal,
        status_id: statusId,
        responsavel_id: responsavelId || null,
        codigo_aparelho: codigoAparelho,
        objeto_atendimento: objetoAtendimento,
        descricao,
        desconto,
        itens,
        fotos: fotos.map((f) => f.arquivo),
      });

      notificarSucesso(`OS aberta com sucesso. Código do aparelho: ${codigoAparelho}`);

      // reset do formulário
      setClienteId("");
      setMostrarNovoCliente(false);
      setNovoCliente({ nome: "", telefone: "", email: "" });
      setCodigoAparelho(gerarCodigoAparelho());
      setObjetoAtendimento("");
      setDescricao("");
      setItens([novoItemVazio()]);
      setDesconto(0);
      fotos.forEach((f) => URL.revokeObjectURL(f.preview));
      setFotos([]);
      setErros({});

      if (mostrarNovoCliente) {
        const atualizados = await listarClientes(lojaId);
        setClientes(atualizados);
      }
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível abrir a OS.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregandoApoio) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Abrir OS</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Preencha os dados abaixo para registrar uma nova ordem de serviço.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 rounded-xl border border-border bg-panel p-6">
        {/* Código do aparelho */}
        <section className="flex items-center justify-between rounded-lg bg-accent-muted px-4 py-3">
          <div>
            <p className="text-xs font-medium text-text-secondary">Código do aparelho</p>
            <p className="font-display text-lg font-semibold tracking-wide text-accent">
              #{codigoAparelho}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCodigoAparelho(gerarCodigoAparelho())}
            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
          >
            <RefreshCw size={13} />
            Gerar novo
          </button>
        </section>

        {/* Cliente */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Cliente</p>
            <button
              type="button"
              onClick={() => setMostrarNovoCliente((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <UserPlus size={14} />
              {mostrarNovoCliente ? "Selecionar cliente existente" : "Cadastrar novo cliente"}
            </button>
          </div>

          {!mostrarNovoCliente ? (
            <SelectField
              id="cliente_id"
              label="Selecione o cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              erro={erros.cliente}
            >
              <option value="">
                {clientes.length === 0 ? "Nenhum cliente cadastrado ainda" : "Selecione..."}
              </option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nome}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  id="novo_cliente_nome"
                  label="Nome do cliente"
                  value={novoCliente.nome}
                  onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                  erro={erros.novo_cliente_nome}
                />
              </div>
              <Field
                id="novo_cliente_telefone"
                label="Telefone (opcional)"
                value={novoCliente.telefone}
                onChange={(e) =>
                  setNovoCliente({ ...novoCliente, telefone: maskPhone(e.target.value) })
                }
                placeholder="(00) 00000-0000"
                erro={erros.novo_cliente_telefone}
              />
              <Field
                id="novo_cliente_email"
                label="E-mail (opcional)"
                type="email"
                value={novoCliente.email}
                onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })}
                erro={erros.novo_cliente_email}
              />
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* Atendimento */}
        <section className="flex flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Atendimento</p>
          <Field
            id="objeto_atendimento"
            label="Objeto do atendimento (opcional)"
            placeholder="Ex.: Placa do veículo, modelo do aparelho, etc."
            value={objetoAtendimento}
            onChange={(e) => setObjetoAtendimento(e.target.value)}
          />
          <TextareaField
            id="descricao"
            label="Descrição do problema ou serviço solicitado"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            erro={erros.descricao}
          />
        </section>

        <div className="border-t border-border" />

        {/* Itens */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Peças, produtos e mão de obra
            </p>
            <button
              type="button"
              onClick={() => setItens((atual) => [...atual, novoItemVazio()])}
              className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <Plus size={14} />
              Adicionar item
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {itens.map((item, indice) => (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[110px_1fr_80px_120px_32px] sm:items-end"
              >
                <SelectField
                  id={`item_tipo_${item.id}`}
                  label={indice === 0 ? "Tipo" : ""}
                  value={item.tipo}
                  onChange={(e) => atualizarItem(item.id, "tipo", e.target.value)}
                >
                  <option value="peca">Peça/Produto</option>
                  <option value="servico">Mão de obra</option>
                </SelectField>
                <Field
                  id={`item_descricao_${item.id}`}
                  label={indice === 0 ? "Descrição" : ""}
                  value={item.descricao}
                  onChange={(e) => atualizarItem(item.id, "descricao", e.target.value)}
                />
                <Field
                  id={`item_qtd_${item.id}`}
                  label={indice === 0 ? "Qtd." : ""}
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.quantidade}
                  onChange={(e) => atualizarItem(item.id, "quantidade", Number(e.target.value))}
                />
                <Field
                  id={`item_valor_${item.id}`}
                  label={indice === 0 ? "Valor unit." : ""}
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.valor_unitario}
                  onChange={(e) => atualizarItem(item.id, "valor_unitario", Number(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => removerItem(item.id)}
                  disabled={itens.length === 1}
                  aria-label="Remover item"
                  className="flex h-[42px] items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          {erros.itens && <p className="text-xs text-danger">{erros.itens}</p>}
        </section>

        <div className="border-t border-border" />

        {/* Fotos do estado atual */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Fotos do aparelho (antes)
            </p>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover">
              <ImagePlus size={14} />
              Adicionar fotos
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => adicionarFotos(e.target.files)}
              />
            </label>
          </div>
          {fotos.length === 0 ? (
            <p className="text-xs text-text-muted">
              Nenhuma foto adicionada ainda (opcional, mas recomendado para o relatório).
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((foto) => (
                <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                  <img src={foto.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removerFoto(foto.id)}
                    aria-label="Remover foto"
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* Status e responsável */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="status_id"
            label="Status"
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            erro={erros.status}
          >
            {statusDisponiveis.map((status) => (
              <option key={status.id} value={status.id}>
                {status.nome}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="responsavel_id"
            label="Responsável (opcional)"
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
          >
            <option value="">Sem responsável definido</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </SelectField>
        </section>

        <div className="border-t border-border" />

        {/* Totais */}
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="desconto"
              label="Desconto (opcional)"
              type="number"
              min={0}
              step="0.01"
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value))}
            />
            <div className="flex flex-col justify-end gap-1.5 rounded-lg bg-accent-muted px-3.5 py-2.5">
              <p className="text-xs font-medium text-text-secondary">Valor total</p>
              <p className="font-display text-lg font-semibold text-accent">
                {formatarMoeda(valorTotal)}
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-end border-t border-border pt-5">
          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            Abrir ordem de serviço
          </button>
        </div>
      </div>
    </div>
  );
}
