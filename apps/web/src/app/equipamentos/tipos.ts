export type StatusEquipamento = "operacional" | "em_manutencao" | "fora_de_operacao";

export const ROTULO_STATUS_EQUIPAMENTO: Record<StatusEquipamento, string> = {
  operacional: "Em operação",
  em_manutencao: "Em manutenção",
  fora_de_operacao: "Fora de operação",
};

export type FiltroArquivoEquipamento = "ativos" | "arquivados" | "todos";
export type FiltroGarantia = "" | "vigente" | "vencendo" | "vencida" | "sem";

export interface FiltrosEquipamentos {
  busca: string;
  arquivo: FiltroArquivoEquipamento;
  status: StatusEquipamento | "";
  categoria: string;
  cliente: string;
  garantia: FiltroGarantia;
  pagina: number;
}

export interface EquipamentoListagem {
  id: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  status: StatusEquipamento;
  /** AAAA-MM-DD */
  garantia_ate: string | null;
  data_instalacao: string | null;
  localizacao: string | null;
  arquivado_em: string | null;
  versao: number;
  cliente: { id: string; nome: string; arquivado: boolean };
  categoria: { id: string; nome: string; ativo: boolean } | null;
  endereco: { id: string; rotulo: string; cidade: string; estado: string } | null;
  total_os: number;
}

export interface Equipamento {
  id: string;
  cliente_id: string;
  cliente_endereco_id: string | null;
  categoria_id: string | null;
  nome: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  data_instalacao: string | null;
  garantia_ate: string | null;
  localizacao: string | null;
  observacoes: string | null;
  status: StatusEquipamento;
  codigo_publico: string;
  criado_em: string;
  arquivado_em: string | null;
  versao: number;
  cliente: { id: string; nome: string; arquivado_em: string | null } | null;
  categoria: { id: string; nome: string; ativo: boolean } | null;
  endereco: {
    id: string;
    rotulo: string;
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string;
    estado: string;
  } | null;
}

export interface DadosEquipamentoForm {
  cliente: { id: string; nome: string } | null;
  cliente_endereco_id: string;
  categoria_id: string;
  nome: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  data_instalacao: string;
  garantia_ate: string;
  localizacao: string;
  observacoes: string;
  status: StatusEquipamento;
}

export function equipamentoFormVazio(cliente: { id: string; nome: string } | null = null): DadosEquipamentoForm {
  return {
    cliente,
    cliente_endereco_id: "",
    categoria_id: "",
    nome: "",
    marca: "",
    modelo: "",
    numero_serie: "",
    data_instalacao: "",
    garantia_ate: "",
    localizacao: "",
    observacoes: "",
    status: "operacional",
  };
}

// ---------------------------------------------------------------------------
// Garantia (datas AAAA-MM-DD, comparadas no dia local)
// ---------------------------------------------------------------------------

export type SituacaoGarantia = "sem" | "vigente" | "vencendo" | "vencida";

export function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarDataCurta(iso: string | null): string {
  return iso ? dataLocal(iso).toLocaleDateString("pt-BR") : "";
}

export function situacaoGarantia(garantiaAte: string | null, hoje = new Date()): { situacao: SituacaoGarantia; dias: number } {
  if (!garantiaAte) return { situacao: "sem", dias: 0 };
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((dataLocal(garantiaAte).getTime() - inicioHoje.getTime()) / 86_400_000);
  if (dias < 0) return { situacao: "vencida", dias };
  if (dias <= 30) return { situacao: "vencendo", dias };
  return { situacao: "vigente", dias };
}

export function urlQrEquipamento(codigo: string): string {
  return `${window.location.origin}/app/assets/qr/${encodeURIComponent(codigo)}`;
}
