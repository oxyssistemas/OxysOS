import { cepValido, cnpjValido, cpfValido, isValidEmail, isValidPhone, ESTADOS_BR } from "@oxys/shared/masks";
import type { DadosClienteForm, DadosEnderecoForm } from "./tipos";

export type ErrosForm = Record<string, string>;

export function validarCliente(dados: DadosClienteForm): ErrosForm {
  const erros: ErrosForm = {};

  if (dados.tipo_pessoa === "pf") {
    if (!dados.nome.trim()) erros.nome = "Informe o nome do cliente.";
    else if (dados.nome.trim().length > 200) erros.nome = "Use no máximo 200 caracteres.";
    if (dados.documento.trim() && !cpfValido(dados.documento)) erros.documento = "CPF inválido.";
  } else {
    if (!dados.razao_social.trim()) erros.razao_social = "Informe a razão social.";
    else if (dados.razao_social.trim().length > 200) erros.razao_social = "Use no máximo 200 caracteres.";
    if (dados.nome_fantasia.trim().length > 200) erros.nome_fantasia = "Use no máximo 200 caracteres.";
    if (dados.documento.trim() && !cnpjValido(dados.documento)) erros.documento = "CNPJ inválido.";
  }

  if (dados.email.trim() && !isValidEmail(dados.email)) erros.email = "E-mail inválido.";
  if (dados.telefone.trim() && !isValidPhone(dados.telefone)) erros.telefone = "Informe DDD + número (10 ou 11 dígitos).";
  if (dados.whatsapp.trim() && !isValidPhone(dados.whatsapp)) erros.whatsapp = "Informe DDD + número (10 ou 11 dígitos).";
  if (dados.observacoes.length > 5000) erros.observacoes = "Use no máximo 5.000 caracteres.";
  if (dados.tags.length > 20) erros.tags = "Use no máximo 20 tags.";

  return erros;
}

export function enderecoPreenchido(dados: DadosEnderecoForm): boolean {
  return [dados.cep, dados.logradouro, dados.numero, dados.complemento, dados.bairro, dados.cidade, dados.estado].some(
    (v) => v.trim() !== "",
  );
}

/** prefixo permite reaproveitar no formulário do cliente (campos "end_*") */
export function validarEndereco(dados: DadosEnderecoForm, prefixo = ""): ErrosForm {
  const erros: ErrosForm = {};
  if (!dados.rotulo.trim()) erros[`${prefixo}rotulo`] = "Informe um nome para o endereço.";
  if (dados.cep.trim() && !cepValido(dados.cep)) erros[`${prefixo}cep`] = "CEP deve ter 8 dígitos.";
  if (!dados.logradouro.trim()) erros[`${prefixo}logradouro`] = "Informe o logradouro.";
  if (!dados.cidade.trim()) erros[`${prefixo}cidade`] = "Informe a cidade.";
  if (!ESTADOS_BR.includes(dados.estado)) erros[`${prefixo}estado`] = "Selecione a UF.";
  return erros;
}
