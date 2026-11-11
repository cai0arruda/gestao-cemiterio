import type { Socio, SocioInput } from '@cemiterio/shared';
import { cepBr, cpfBr, dataBr, dataIso, telefoneBr } from './formatar';

/** Valores do formulário: datas em DD/MM/AAAA e campos com máscara. */
export interface ValoresSocio {
  matricula: string;
  nome_completo: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  telefone2: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  data_associacao: string;
  observacoes: string;
}

export const valoresVazios = (padrao: Partial<ValoresSocio> = {}): ValoresSocio => ({
  matricula: '',
  nome_completo: '',
  cpf: '',
  data_nascimento: '',
  telefone: '',
  telefone2: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  data_associacao: '',
  observacoes: '',
  ...padrao,
});

export function socioParaValores(s: Socio): ValoresSocio {
  return {
    matricula: s.matricula,
    nome_completo: s.nome_completo,
    cpf: cpfBr(s.cpf),
    data_nascimento: dataBr(s.data_nascimento),
    telefone: telefoneBr(s.telefone),
    telefone2: telefoneBr(s.telefone2),
    email: s.email ?? '',
    cep: cepBr(s.cep),
    logradouro: s.logradouro ?? '',
    numero: s.numero ?? '',
    complemento: s.complemento ?? '',
    bairro: s.bairro ?? '',
    cidade: s.cidade ?? '',
    uf: s.uf ?? '',
    data_associacao: dataBr(s.data_associacao),
    observacoes: s.observacoes ?? '',
  };
}

const soDigitos = (v: string) => v.replace(/\D/g, '');

export function valoresParaInput(v: ValoresSocio): SocioInput {
  return {
    ...v,
    nome_completo: v.nome_completo.trim().replace(/\s+/g, ' '),
    telefone: soDigitos(v.telefone),
    telefone2: soDigitos(v.telefone2),
    data_nascimento: v.data_nascimento ? (dataIso(v.data_nascimento) ?? 'invalida') : '',
    data_associacao: v.data_associacao ? (dataIso(v.data_associacao) ?? 'invalida') : '',
  } as SocioInput;
}

export function validarDataBr(v: string, futuro = false): string | null {
  if (!v) return null;
  const iso = dataIso(v);
  if (!iso) return 'Data inválida (use DD/MM/AAAA)';
  if (!futuro && iso > new Date().toISOString().slice(0, 10)) return 'A data não pode estar no futuro';
  if (iso < '1890-01-01') return 'Data inválida';
  return null;
}
