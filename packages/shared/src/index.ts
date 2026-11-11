import { z } from 'zod';

// ---------- Utilitários de texto ----------

/** Remove acentos, espaços duplicados e coloca em minúsculas — usado para busca e duplicados. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) && digito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

// ---------- Constantes de domínio ----------

export const PERFIS = ['admin', 'atendente'] as const;
export type Perfil = (typeof PERFIS)[number];

export const SITUACOES_SOCIO = ['pendente', 'ativo', 'associacao_encerrada', 'falecido'] as const;
export type SituacaoSocio = (typeof SITUACOES_SOCIO)[number];
export const ROTULO_SITUACAO_SOCIO: Record<SituacaoSocio, string> = {
  pendente: 'Aguardando taxa de associação',
  ativo: 'Ativo',
  associacao_encerrada: 'Associação encerrada',
  falecido: 'Falecido',
};

export const DIREITOS_SEPULTAMENTO = ['disponivel', 'utilizado'] as const;
export type DireitoSepultamento = (typeof DIREITOS_SEPULTAMENTO)[number];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

// ---------- Schemas ----------

/** Campo de texto opcional: string vazia vira null. */
const opcional = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v ?? null),
    z.string().trim().max(max).nullable(),
  );

const dataIsoOpcional = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')
    .nullable(),
);

export const socioInputSchema = z.object({
  matricula: opcional(20),
  nome_completo: z.string().trim().min(3, 'Informe o nome completo').max(150),
  cpf: z.preprocess(
    (v) => (typeof v === 'string' ? (somenteDigitos(v) === '' ? null : somenteDigitos(v)) : v ?? null),
    z.string().refine(cpfValido, 'CPF inválido').nullable(),
  ),
  data_nascimento: dataIsoOpcional,
  telefone: opcional(20),
  telefone2: opcional(20),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v ?? null),
    z.email('E-mail inválido').nullable(),
  ),
  cep: z.preprocess(
    (v) => (typeof v === 'string' ? (somenteDigitos(v) === '' ? null : somenteDigitos(v)) : v ?? null),
    z.string().length(8, 'CEP deve ter 8 dígitos').nullable(),
  ),
  logradouro: opcional(150),
  numero: opcional(20),
  complemento: opcional(80),
  bairro: opcional(80),
  cidade: opcional(80),
  uf: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.enum(UFS).nullable()),
  data_associacao: dataIsoOpcional,
  observacoes: opcional(2000),
  /** Só na criação: sócio novo começa "pendente" e já recebe a cobrança da taxa de associação. */
  cobrar_taxa_associacao: z.boolean().optional(),
});
export type SocioInput = z.input<typeof socioInputSchema>;
export type SocioDados = z.output<typeof socioInputSchema>;

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe o usuário').max(50),
  senha: z.string().min(1, 'Informe a senha').max(200),
});

export const senhaSchema = z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(200);

export const usuarioCriarSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(100),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Use de 3 a 50 caracteres: letras, números, ponto, hífen ou _'),
  senha: senhaSchema,
  perfil: z.enum(PERFIS),
});

export const usuarioAtualizarSchema = z.object({
  nome: z.string().trim().min(2).max(100).optional(),
  perfil: z.enum(PERFIS).optional(),
  ativo: z.boolean().optional(),
  nova_senha: senhaSchema.optional(),
});

export const trocarSenhaSchema = z.object({
  senha_atual: z.string().min(1),
  nova_senha: senhaSchema,
});

// ---------- Tipos retornados pela API ----------

export interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  ativo: boolean;
}

export interface Socio extends SocioDados {
  id: number;
  matricula: string;
  situacao: SituacaoSocio;
  direito_sepultamento: DireitoSepultamento;
  data_falecimento: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface SocioResumo {
  id: number;
  /** Quantidade de cobranças vencidas em aberto. */
  pendencias: number;
  matricula: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  cidade: string | null;
  situacao: SituacaoSocio;
  incompleto: boolean;
  qtd_documentos: number;
}

export interface PossivelDuplicado {
  id: number;
  matricula: string;
  nome_completo: string;
  data_nascimento: string | null;
  motivo: string;
}

export interface DocumentoSocio {
  id: number;
  socio_id: number;
  tipo: string;
  legenda: string | null;
  criado_em: string;
}

export interface BackupInfo {
  arquivo: string;
  tamanho_bytes: number;
  criado_em: string;
  automatico: boolean;
}

export interface RegistroAuditoria {
  id: number;
  usuario_nome: string | null;
  acao: string;
  entidade: string;
  entidade_id: number | null;
  detalhes: string | null;
  criado_em: string;
}

/** Campos que o cadastro exige; quando faltam, o sócio aparece como "incompleto". */
export const CAMPOS_ESSENCIAIS = ['data_nascimento', 'telefone', 'logradouro', 'cidade'] as const;

/** Ajuste manual de situação (somente admin) — usado, por exemplo, ao digitar fichas antigas. */
export const socioSituacaoSchema = z
  .object({
    situacao: z.enum(SITUACOES_SOCIO),
    direito_sepultamento: z.enum(DIREITOS_SEPULTAMENTO),
    data_falecimento: dataIsoOpcional,
    justificativa: z.string().trim().min(5, 'Explique o motivo do ajuste').max(500),
  })
  .refine((d) => d.situacao !== 'falecido' || d.data_falecimento, {
    message: 'Informe a data de falecimento',
    path: ['data_falecimento'],
  });

// ---------- Financeiro (Fase 2) ----------

export const TIPOS_COBRANCA = ['anuidade', 'taxa_associacao', 'compra_sepultura'] as const;
export type TipoCobranca = (typeof TIPOS_COBRANCA)[number];
export const ROTULO_TIPO_COBRANCA: Record<TipoCobranca, string> = {
  anuidade: 'Anuidade',
  taxa_associacao: 'Taxa de associação',
  compra_sepultura: 'Compra de sepultura',
};

export const SITUACOES_COBRANCA = ['aberta', 'paga', 'cancelada'] as const;
export type SituacaoCobranca = (typeof SITUACOES_COBRANCA)[number];

export const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'transferencia', 'outro'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];
export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  transferencia: 'Transferência',
  outro: 'Outro',
};

/** Dia e mês do vencimento da anuidade: Dia de Finados. */
export const VENCIMENTO_ANUIDADE = { mes: 11, dia: 2 } as const;
export const vencimentoAnuidade = (ano: number) =>
  `${ano}-${String(VENCIMENTO_ANUIDADE.mes).padStart(2, '0')}-${String(VENCIMENTO_ANUIDADE.dia).padStart(2, '0')}`;

const ano = z.coerce.number().int().min(1950).max(2200);
const centavos = z.coerce.number().int().min(0).max(100_000_000);

export const valorSchema = z.object({
  tipo: z.enum(TIPOS_COBRANCA),
  ano,
  valor_centavos: centavos.refine((v) => v > 0, 'Informe um valor maior que zero'),
});

export const gerarAnuidadesSchema = z.object({ ano });

export const cancelarSchema = z.object({ motivo: z.string().trim().min(5, 'Explique o motivo').max(500) });

export const recebimentoSchema = z.object({
  socio_id: z.number().int().positive(),
  itens: z
    .array(z.object({ cobranca_id: z.number().int().positive(), desconto_centavos: centavos.default(0) }))
    .min(1, 'Selecione pelo menos uma cobrança'),
  forma: z.enum(FORMAS_PAGAMENTO),
  data_pagamento: dataIsoOpcional,
  observacao: opcional(300),
});
export type RecebimentoInput = z.input<typeof recebimentoSchema>;

export const lancamentoHistoricoSchema = z
  .object({
    ano_inicial: ano,
    ano_final: ano,
    valor_centavos: centavos,
    data_pagamento: dataIsoOpcional,
    observacao: opcional(300),
  })
  .refine((d) => d.ano_final >= d.ano_inicial, { message: 'O ano final deve ser maior ou igual ao inicial', path: ['ano_final'] })
  .refine((d) => d.ano_final - d.ano_inicial < 60, { message: 'Intervalo grande demais', path: ['ano_final'] });

export const CHAVES_CONFIG = [
  'cemiterio_nome',
  'cemiterio_cnpj',
  'cemiterio_endereco',
  'cemiterio_telefone',
  'recibo_mensagem',
  'recibo_largura_mm',
  'recibo_impressao_automatica',
  'mensagem_cobranca',
  'mensagem_lembrete',
] as const;
export type ChaveConfig = (typeof CHAVES_CONFIG)[number];
export type Configuracoes = Record<ChaveConfig, string>;
export const CONFIG_PADRAO: Configuracoes = {
  cemiterio_nome: 'Cemitério Campo Vicente',
  cemiterio_cnpj: '',
  cemiterio_endereco: '',
  cemiterio_telefone: '',
  recibo_mensagem: 'Obrigado!',
  recibo_largura_mm: '80',
  recibo_impressao_automatica: 'true',
  mensagem_cobranca:
    'Olá, {nome}! Aqui é do {cemiterio}. Consta em aberto a anuidade de {anos}, no total de {valor}. ' +
    'Você pode acertar na secretaria. Sua situação: {link}',
  mensagem_lembrete:
    'Olá, {nome}! Aqui é do {cemiterio}. Lembrando que a anuidade de {anos} ({valor}) vence no Dia de Finados, {vencimento}. ' +
    'Sua situação: {link}',
};
export const configSchema = z.object({
  cemiterio_nome: z.string().trim().min(2).max(80),
  cemiterio_cnpj: z.string().trim().max(20),
  cemiterio_endereco: z.string().trim().max(150),
  cemiterio_telefone: z.string().trim().max(40),
  recibo_mensagem: z.string().trim().max(200),
  recibo_largura_mm: z.enum(['58', '80']),
  recibo_impressao_automatica: z.enum(['true', 'false']),
  mensagem_cobranca: z.string().trim().max(600),
  mensagem_lembrete: z.string().trim().max(600),
});

/** Preenche {nome}, {anos}, {valor}, {link}, {cemiterio}, {vencimento} na mensagem. */
export function montarMensagem(modelo: string, dados: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (todo, chave: string) => dados[chave] ?? todo);
}

/** Link do WhatsApp com a mensagem pronta (o atendente só confere e envia). */
export function linkWhatsapp(telefone: string | null | undefined, mensagem: string): string | null {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const numero = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export interface ValorTabela {
  tipo: TipoCobranca;
  ano: number;
  valor_centavos: number;
  definido_em: string;
  definido_por: string | null;
}

export interface Cobranca {
  id: number;
  socio_id: number;
  tipo: TipoCobranca;
  ano: number | null;
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  situacao: SituacaoCobranca;
  vencida: boolean;
  motivo_cancelamento: string | null;
  recebimento_id: number | null;
}

export interface ResumoFinanceiro {
  em_dia: boolean;
  anos_pendentes: number[];
  total_vencido_centavos: number;
  /** Último ano de anuidade quitado sem pendências anteriores. */
  quitado_ate: number | null;
}

export interface RecebimentoResumo {
  id: number;
  numero: string | null;
  socio_id: number;
  socio_nome: string;
  socio_matricula: string;
  data_pagamento: string;
  forma: FormaPagamento;
  total_centavos: number;
  descricao: string;
  historico: boolean;
  estornado: boolean;
  registrado_por: string | null;
  registrado_em: string;
}

export interface ItemRecebimento {
  cobranca_id: number;
  descricao: string;
  valor_centavos: number;
  desconto_centavos: number;
  pago_centavos: number;
}

export interface RecebimentoDetalhe extends RecebimentoResumo {
  itens: ItemRecebimento[];
  observacao: string | null;
  codigo_verificacao: string | null;
  vias_impressas: number;
  estornado_em: string | null;
  motivo_estorno: string | null;
  socio_token_publico: string;
  resumo_atual: ResumoFinanceiro;
  avisos?: string[];
}

export interface FinanceiroSocio {
  resumo: ResumoFinanceiro;
  cobrancas: Cobranca[];
  recebimentos: RecebimentoResumo[];
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- Portal do sócio (Fase 3) ----------

/** "Maria Aparecida da Silva" -> "MARIA S." (o portal é público: nada de nome completo). */
export function nomeAbreviado(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()));
  if (partes.length === 0) return '';
  const primeiro = partes[0]!.toUpperCase();
  return partes.length > 1 ? `${primeiro} ${partes.at(-1)![0]!.toUpperCase()}.` : primeiro;
}

export type SituacaoReciboPublico = 'valido' | 'estornado' | 'nao_encontrado';

/** Tudo o que a página pública mostra. Sem CPF, endereço, telefone ou data de nascimento. */
export interface PortalSocio {
  cemiterio: { nome: string; telefone: string };
  socio: {
    nome: string;
    matricula: string;
    situacao: SituacaoSocio;
    direito_sepultamento: DireitoSepultamento;
  };
  financeiro: {
    em_dia: boolean;
    anos_pendentes: number[];
    quitado_ate: number | null;
    proximo_vencimento: string | null;
    ultimas_anuidades: { ano: number; pago_em: string }[];
  };
  sepulturas: { codigo: string; referencia: string | null; setor: string | null; latitude: number | null; longitude: number | null }[];
  recibo?: {
    situacao: SituacaoReciboPublico;
    numero?: string;
    data_pagamento?: string;
    total_centavos?: number;
    descricao?: string;
  };
  consultado_em: string;
}

export interface LinkPortal {
  url: string;
}

// ---------- Sepulturas e sepultamentos (Fase 4) ----------

export const TIPOS_SEPULTURA = ['tumulo', 'ossuario', 'gaveta', 'outro'] as const;
export type TipoSepultura = (typeof TIPOS_SEPULTURA)[number];
export const ROTULO_TIPO_SEPULTURA: Record<TipoSepultura, string> = {
  tumulo: 'Túmulo',
  ossuario: 'Ossuário',
  gaveta: 'Gaveta',
  outro: 'Outro',
};

export const SITUACOES_SEPULTURA = ['disponivel', 'reservada', 'vendida', 'ocupada'] as const;
export type SituacaoSepultura = (typeof SITUACOES_SEPULTURA)[number];
export const ROTULO_SITUACAO_SEPULTURA: Record<SituacaoSepultura, string> = {
  disponivel: 'Disponível',
  reservada: 'Reservada (aguardando pagamento)',
  vendida: 'Vendida',
  ocupada: 'Ocupada',
};

export const sepulturaInputSchema = z.object({
  codigo: opcional(20),
  tipo: z.enum(TIPOS_SEPULTURA),
  capacidade: z.coerce.number().int().min(1).max(50),
  referencia: opcional(200),
  observacoes: opcional(2000),
});

/** Na criação: dá para já informar o titular (sepulturas vendidas antes do sistema). */
export const sepulturaCriarSchema = sepulturaInputSchema.extend({
  socio_id: z.number().int().positive().nullish(),
  data_aquisicao: dataIsoOpcional,
});

export const vendaSepulturaSchema = z.object({
  socio_id: z.number().int().positive(),
  valor_centavos: z.coerce.number().int().min(1, 'Informe o valor').max(100_000_000),
});

export const transferenciaSchema = z.object({
  socio_id: z.number().int().positive().nullable(),
  motivo: z.string().trim().min(5, 'Explique o motivo').max(500),
});

export const sepultamentoSchema = z
  .object({
    sepultura_id: z.number().int().positive(),
    /** Sócio cujo direito está sendo usado. Obrigatório, exceto em lançamento antigo. */
    socio_direito_id: z.number().int().positive().nullish(),
    sepultado_e_socio: z.boolean().default(false),
    nome_sepultado: z.string().trim().min(3, 'Informe o nome de quem foi sepultado').max(150),
    parentesco: opcional(50),
    data_nascimento: dataIsoOpcional,
    data_falecimento: dataIsoOpcional,
    data_sepultamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    certidao_obito: opcional(60),
    observacoes: opcional(1000),
    historico: z.boolean().default(false),
    /** Só administrador: registra mesmo descumprindo as regras. */
    justificativa_excecao: opcional(500),
  })
  .refine((d) => d.historico || d.socio_direito_id, {
    message: 'Informe de qual sócio é o benefício utilizado',
    path: ['socio_direito_id'],
  });
export type SepultamentoInput = z.input<typeof sepultamentoSchema>;

export const sucessaoSchema = z.object({
  socio_destino_id: z.number().int().positive().nullish(),
  /** Se o familiar ainda não é sócio, os dados básicos para cadastrá-lo. */
  novo_socio: socioInputSchema.omit({ cobrar_taxa_associacao: true }).nullish(),
});

export interface SepulturaResumo {
  id: number;
  codigo: string;
  setor_nome: string | null;
  tipo: TipoSepultura;
  capacidade: number;
  situacao: SituacaoSepultura;
  referencia: string | null;
  socio_id: number | null;
  socio_nome: string | null;
  socio_matricula: string | null;
  ocupacao: number;
  qtd_fotos: number;
  tem_localizacao: boolean;
}

export interface Sepultado {
  id: number;
  sepultura_id: number;
  sepultura_codigo: string;
  nome_sepultado: string;
  socio_id: number | null;
  socio_direito_id: number | null;
  socio_direito_nome: string | null;
  parentesco: string | null;
  data_nascimento: string | null;
  data_falecimento: string | null;
  data_sepultamento: string;
  certidao_obito: string | null;
  observacoes: string | null;
  historico: boolean;
  justificativa_excecao: string | null;
  /** Data da exumação (null = ainda está na sepultura). */
  exumado_em: string | null;
  exumacao_destino: DestinoExumacao | null;
  exumacao_sepultura_destino_id: number | null;
  exumacao_sepultura_destino_codigo: string | null;
  exumacao_observacao: string | null;
  /** Restos trazidos de outra sepultura (exumação com transferência). */
  transferido_de_codigo: string | null;
}

export interface TitularHistorico {
  socio_id: number;
  socio_nome: string;
  inicio: string;
  fim: string | null;
  motivo: 'cadastro' | 'compra' | 'sucessao' | 'transferencia';
  observacao: string | null;
}

export interface SepulturaDetalhe extends SepulturaResumo {
  data_aquisicao: string | null;
  observacoes: string | null;
  latitude: number | null;
  longitude: number | null;
  sepultados: Sepultado[];
  titulares: TitularHistorico[];
  /** Venda em andamento (cobrança de compra ainda não paga). */
  reserva: { cobranca_id: number; socio_id: number; socio_nome: string; valor_centavos: number } | null;
}

export interface FotoSepultura {
  id: number;
  legenda: string | null;
  criado_em: string;
}

export interface VerificacaoDireito {
  socio_id: number;
  socio_nome: string;
  pode: boolean;
  itens: { regra: string; ok: boolean; detalhe?: string }[];
}

export interface Sucessao {
  id: number;
  socio_origem_id: number;
  socio_origem_nome: string;
  socio_destino_id: number;
  socio_destino_nome: string;
  situacao: 'pendente' | 'concluida' | 'cancelada';
  criado_em: string;
}

export interface SepulturasDoSocio {
  sepulturas: SepulturaResumo[];
  direito: VerificacaoDireito;
  sucessoes: Sucessao[];
}

// ---------- Mapa (Fase 5) ----------

/** Polígono em GeoJSON: lista de anéis, cada anel uma lista de [longitude, latitude]. */
export type AneisPoligono = [number, number][][];

/** Ponto dentro de polígono (ray casting). Considera buracos (anéis internos). */
export function pontoNoPoligono(lat: number, lng: number, aneis: AneisPoligono): boolean {
  const noAnel = (anel: [number, number][]) => {
    let dentro = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i]!;
      const [xj, yj] = anel[j]!;
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
  if (!aneis[0] || !noAnel(aneis[0])) return false;
  return !aneis.slice(1).some(noAnel);
}

const coordenada = (min: number, max: number) => z.number().min(min).max(max);

export const localizacaoSchema = z.object({
  latitude: coordenada(-90, 90).nullable(),
  longitude: coordenada(-180, 180).nullable(),
});

export const setorSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(60),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
  poligono: z
    .array(z.array(z.tuple([coordenada(-180, 180), coordenada(-90, 90)])).min(4, 'O setor precisa de pelo menos 3 pontos'))
    .min(1),
});

export const mapaPosicaoSchema = z.object({
  latitude: coordenada(-90, 90),
  longitude: coordenada(-180, 180),
  zoom: z.number().int().min(1).max(22),
});

/** Cantos da imagem aérea própria: [[sul, oeste], [norte, leste]]. */
export const imagemAereaSchema = z.object({
  limites: z.tuple([z.tuple([coordenada(-90, 90), coordenada(-180, 180)]), z.tuple([coordenada(-90, 90), coordenada(-180, 180)])]),
  opacidade: z.number().min(0.1).max(1),
});

export interface Setor {
  id: number;
  nome: string;
  cor: string;
  poligono: AneisPoligono;
  qtd_sepulturas: number;
}

export interface PinSepultura {
  id: number;
  codigo: string;
  latitude: number;
  longitude: number;
  situacao: SituacaoSepultura;
  tipo: TipoSepultura;
  referencia: string | null;
  socio_id: number | null;
  socio_nome: string | null;
  /** Titular com cobranças vencidas em aberto. */
  titular_pendente: boolean;
  ocupacao: number;
  capacidade: number;
  setor_nome: string | null;
  foto_id: number | null;
  sepultados: string[];
}

export interface ConfigMapa {
  posicao: { latitude: number; longitude: number; zoom: number } | null;
  imagem_aerea: {
    limites: [[number, number], [number, number]];
    opacidade: number;
    versao: string;
    /** Tamanho da foto em pixels, para manter a proporção no mapa. */
    largura: number;
    altura: number;
  } | null;
}

// ---------- Relatórios (Fase 6) ----------

export interface Devedor {
  socio_id: number;
  matricula: string;
  nome: string;
  telefone: string | null;
  telefone2: string | null;
  anos: number[];
  outras: string[];
  total_centavos: number;
  vencimento_mais_antigo: string;
  link_portal: string;
  ultimo_aviso: string | null;
}

export interface VisaoGeral {
  socios: Record<SituacaoSocio, number>;
  ativos_em_dia: number;
  ativos_pendentes: number;
  total_vencido_centavos: number;
  arrecadado_mes_centavos: number;
  arrecadado_ano_centavos: number;
  sepulturas: Record<SituacaoSepultura, number>;
  sepulturas_sem_mapa: number;
  sepultamentos_ano: number;
  cadastros_incompletos: number;
  anuidade_ano: { ano: number; geradas: number; pagas: number } | null;
}

export interface Arrecadacao {
  de: string;
  ate: string;
  total_centavos: number;
  descontos_centavos: number;
  qtd_recibos: number;
  por_forma: { forma: FormaPagamento; total_centavos: number; qtd: number }[];
  por_tipo: { tipo: TipoCobranca; total_centavos: number; qtd: number }[];
  por_mes: { mes: string; total_centavos: number }[];
}

export interface Caixa {
  data: string;
  total_centavos: number;
  por_forma: { forma: FormaPagamento; total_centavos: number; qtd: number }[];
  por_usuario: { usuario: string; total_centavos: number; qtd: number }[];
  recebimentos: RecebimentoResumo[];
  estornados: RecebimentoResumo[];
}

export interface Aniversariante {
  socio_id: number;
  nome: string;
  matricula: string;
  data_nascimento: string;
  telefone: string | null;
  idade: number;
}

// ---------- Anuidades avulsas de um sócio (adiantamento / vários anos) ----------

export const anuidadesSocioSchema = z
  .object({
    ano_inicial: z.coerce.number().int().min(1950).max(2200),
    ano_final: z.coerce.number().int().min(1950).max(2200),
  })
  .refine((d) => d.ano_final >= d.ano_inicial, { message: 'O ano final deve ser maior ou igual ao inicial', path: ['ano_final'] })
  .refine((d) => d.ano_final - d.ano_inicial < 10, { message: 'No máximo 10 anos de uma vez', path: ['ano_final'] });

export interface PreviaAnuidadeSocio {
  ano: number;
  vencimento: string;
  /** Já existe cobrança para o ano (aberta ou paga): não será gerada de novo. */
  existente: 'aberta' | 'paga' | null;
  valor_centavos: number | null;
  /** 'tabela' = valor do ano; 'ultimo_valor' = ano ainda sem valor cadastrado, usa o mais recente. */
  origem: 'tabela' | 'ultimo_valor' | null;
}

/**
 * Cantos [[sul, oeste], [norte, leste]] para uma imagem com a proporção largura/altura (pixels),
 * a partir do canto sudoeste e da largura em metros. Considera que um grau de longitude
 * encolhe com a latitude.
 */
export function limitesProporcionais(
  sul: number,
  oeste: number,
  larguraMetros: number,
  proporcao: number,
): [[number, number], [number, number]] {
  const metrosPorGrauLat = 111_320;
  const latMedia = sul + larguraMetros / proporcao / metrosPorGrauLat / 2;
  const metrosPorGrauLng = metrosPorGrauLat * Math.cos((latMedia * Math.PI) / 180);
  const alturaMetros = larguraMetros / proporcao;
  return [
    [sul, oeste],
    [sul + alturaMetros / metrosPorGrauLat, oeste + larguraMetros / metrosPorGrauLng],
  ];
}

/** Largura em metros de uns limites (medida na latitude média). */
export function larguraEmMetros(limites: [[number, number], [number, number]]): number {
  const [[s, o], [n, l]] = limites;
  return (l - o) * 111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180);
}

// ---------- Exumação ----------

export const DESTINOS_EXUMACAO = ['mesma_sepultura', 'outra_sepultura', 'familia', 'cremacao', 'outro'] as const;
export type DestinoExumacao = (typeof DESTINOS_EXUMACAO)[number];
export const ROTULO_DESTINO_EXUMACAO: Record<DestinoExumacao, string> = {
  mesma_sepultura: 'Os restos ficam nesta mesma sepultura (ossada em caixinha ou enterrada no local)',
  outra_sepultura: 'Transferido para outra sepultura do cemitério (ex.: ossuário)',
  familia: 'Entregue à família / levado para outro cemitério',
  cremacao: 'Cremação',
  outro: 'Outro',
};

export const exumacaoSchema = z
  .object({
    data_exumacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    destino: z.enum(DESTINOS_EXUMACAO),
    sepultura_destino_id: z.number().int().positive().nullish(),
    observacao: opcional(500),
  })
  .refine((d) => d.destino !== 'outra_sepultura' || d.sepultura_destino_id, {
    message: 'Escolha a sepultura para onde os restos foram levados',
    path: ['sepultura_destino_id'],
  });
