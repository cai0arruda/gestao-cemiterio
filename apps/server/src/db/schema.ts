import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const agora = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  login: text('login').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  perfil: text('perfil', { enum: ['admin', 'atendente'] }).notNull(),
  ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
  tentativasFalhas: integer('tentativas_falhas').notNull().default(0),
  bloqueadoAte: text('bloqueado_ate'),
  criadoEm: text('criado_em').notNull().default(agora),
});

export const sessoes = sqliteTable(
  'sessoes',
  {
    /** sha256 do token do cookie — o token em si nunca é gravado. */
    id: text('id').primaryKey(),
    usuarioId: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    criadoEm: text('criado_em').notNull().default(agora),
    ultimoAcesso: text('ultimo_acesso').notNull(),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId)],
);

export const socios = sqliteTable(
  'socios',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matricula: text('matricula').notNull().unique(),
    nomeCompleto: text('nome_completo').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    cpf: text('cpf').unique(),
    dataNascimento: text('data_nascimento'),
    telefone: text('telefone'),
    telefone2: text('telefone2'),
    email: text('email'),
    cep: text('cep'),
    logradouro: text('logradouro'),
    numero: text('numero'),
    complemento: text('complemento'),
    bairro: text('bairro'),
    cidade: text('cidade'),
    uf: text('uf'),
    situacao: text('situacao', { enum: ['pendente', 'ativo', 'associacao_encerrada', 'falecido'] })
      .notNull()
      .default('ativo'),
    direitoSepultamento: text('direito_sepultamento', { enum: ['disponivel', 'utilizado'] })
      .notNull()
      .default('disponivel'),
    dataAssociacao: text('data_associacao'),
    dataFalecimento: text('data_falecimento'),
    /** Código aleatório usado no QR code do portal público (Fase 3). */
    tokenPublico: text('token_publico').notNull().unique(),
    observacoes: text('observacoes'),
    criadoEm: text('criado_em').notNull().default(agora),
    atualizadoEm: text('atualizado_em').notNull().default(agora),
  },
  (t) => [index('socios_nome_idx').on(t.nomeNormalizado)],
);

export const socioDocumentos = sqliteTable(
  'socio_documentos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => socios.id, { onDelete: 'cascade' }),
    /** 'ficha' = foto da ficha em papel; 'outro' = qualquer outro documento. */
    tipo: text('tipo', { enum: ['ficha', 'outro'] }).notNull().default('ficha'),
    arquivo: text('arquivo').notNull(),
    miniatura: text('miniatura').notNull(),
    legenda: text('legenda'),
    criadoPor: integer('criado_por').references(() => usuarios.id),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [index('socio_documentos_socio_idx').on(t.socioId)],
);

export const auditoria = sqliteTable(
  'auditoria',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    acao: text('acao').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: integer('entidade_id'),
    detalhes: text('detalhes'),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [index('auditoria_entidade_idx').on(t.entidade, t.entidadeId)],
);

export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor').notNull(),
});

// ---------------- Financeiro (Fase 2) ----------------

const TIPOS = ['anuidade', 'taxa_associacao', 'compra_sepultura'] as const;

/** Valor de cada tipo de cobrança por ano (reajustes feitos pelo painel). */
export const tabelaValores = sqliteTable(
  'tabela_valores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tipo: text('tipo', { enum: TIPOS }).notNull(),
    ano: integer('ano').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    definidoEm: text('definido_em').notNull().default(agora),
    definidoPor: integer('definido_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('tabela_valores_tipo_ano_uq').on(t.tipo, t.ano)],
);

/** O que o sócio deve (ou devia): anuidades, taxa de associação, compra de sepultura. */
export const cobrancas = sqliteTable(
  'cobrancas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => socios.id, { onDelete: 'restrict' }),
    tipo: text('tipo', { enum: TIPOS }).notNull(),
    /** Ano de referência (anuidade) ou ano em que foi gerada. */
    ano: integer('ano').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    vencimento: text('vencimento').notNull(),
    situacao: text('situacao', { enum: ['aberta', 'paga', 'cancelada'] }).notNull().default('aberta'),
    motivoCancelamento: text('motivo_cancelamento'),
    canceladoEm: text('cancelado_em'),
    canceladoPor: integer('cancelado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    /** Reservado para a Fase 4 (compra de sepultura). */
    sepulturaId: integer('sepultura_id'),
    criadoPor: integer('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [
    index('cobrancas_socio_idx').on(t.socioId, t.situacao),
    // Uma anuidade por sócio por ano (canceladas não contam, para permitir gerar de novo).
    uniqueIndex('cobrancas_anuidade_uq').on(t.socioId, t.ano).where(sql`tipo = 'anuidade' AND situacao <> 'cancelada'`),
  ],
);

/**
 * Um recebimento = um atendimento no balcão (pode quitar várias cobranças) = um recibo.
 * Lançamentos de anuidades antigas (fichas em papel) ficam com historico = true e sem número de recibo.
 */
export const recebimentos = sqliteTable(
  'recebimentos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => socios.id, { onDelete: 'restrict' }),
    anoRecibo: integer('ano_recibo'),
    sequenciaRecibo: integer('sequencia_recibo'),
    numeroRecibo: text('numero_recibo').unique(),
    codigoVerificacao: text('codigo_verificacao').unique(),
    dataPagamento: text('data_pagamento').notNull(),
    forma: text('forma', {
      enum: ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'transferencia', 'outro'],
    }).notNull(),
    totalCentavos: integer('total_centavos').notNull(),
    observacao: text('observacao'),
    historico: integer('historico', { mode: 'boolean' }).notNull().default(false),
    viasImpressas: integer('vias_impressas').notNull().default(0),
    registradoPor: integer('registrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    registradoEm: text('registrado_em').notNull().default(agora),
    estornadoEm: text('estornado_em'),
    estornadoPor: integer('estornado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    motivoEstorno: text('motivo_estorno'),
  },
  (t) => [
    index('recebimentos_socio_idx').on(t.socioId),
    index('recebimentos_data_idx').on(t.dataPagamento),
    uniqueIndex('recebimentos_recibo_uq').on(t.anoRecibo, t.sequenciaRecibo),
  ],
);

/** Cada cobrança quitada dentro de um recebimento. */
export const pagamentos = sqliteTable(
  'pagamentos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recebimentoId: integer('recebimento_id')
      .notNull()
      .references(() => recebimentos.id, { onDelete: 'restrict' }),
    cobrancaId: integer('cobranca_id')
      .notNull()
      .references(() => cobrancas.id, { onDelete: 'restrict' }),
    valorCentavos: integer('valor_centavos').notNull(),
    descontoCentavos: integer('desconto_centavos').notNull().default(0),
    pagoCentavos: integer('pago_centavos').notNull(),
    /** O que o pagamento mudou no sócio (para desfazer num estorno). JSON. */
    efeitos: text('efeitos'),
  },
  (t) => [index('pagamentos_recebimento_idx').on(t.recebimentoId), index('pagamentos_cobranca_idx').on(t.cobrancaId)],
);

// ---------------- Sepulturas e sepultamentos (Fase 4) ----------------

export const sepulturas = sqliteTable(
  'sepulturas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Gerado pelo sistema: S-0001, S-0002... (o cemitério não tem numeração própria). */
    codigo: text('codigo').notNull().unique(),
    socioId: integer('socio_id').references(() => socios.id, { onDelete: 'restrict' }),
    tipo: text('tipo', { enum: ['tumulo', 'ossuario', 'gaveta', 'outro'] }).notNull().default('tumulo'),
    capacidade: integer('capacidade').notNull().default(1),
    situacao: text('situacao', { enum: ['disponivel', 'reservada', 'vendida', 'ocupada'] }).notNull().default('disponivel'),
    referencia: text('referencia'),
    dataAquisicao: text('data_aquisicao'),
    /** Posição no mapa (Fase 5). */
    latitude: real('latitude'),
    longitude: real('longitude'),
    /** Calculado pela posição do pin dentro dos setores desenhados. */
    setorId: integer('setor_id'),
    observacoes: text('observacoes'),
    criadoEm: text('criado_em').notNull().default(agora),
    atualizadoEm: text('atualizado_em').notNull().default(agora),
  },
  (t) => [index('sepulturas_socio_idx').on(t.socioId)],
);

export const sepulturaFotos = sqliteTable(
  'sepultura_fotos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sepulturaId: integer('sepultura_id')
      .notNull()
      .references(() => sepulturas.id, { onDelete: 'cascade' }),
    arquivo: text('arquivo').notNull(),
    miniatura: text('miniatura').notNull(),
    legenda: text('legenda'),
    criadoPor: integer('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [index('sepultura_fotos_sepultura_idx').on(t.sepulturaId)],
);

/** Histórico de quem foi titular de cada sepultura. fim = null -> titular atual. */
export const sepulturaTitulares = sqliteTable(
  'sepultura_titulares',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sepulturaId: integer('sepultura_id')
      .notNull()
      .references(() => sepulturas.id, { onDelete: 'cascade' }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => socios.id, { onDelete: 'restrict' }),
    inicio: text('inicio').notNull(),
    fim: text('fim'),
    motivo: text('motivo', { enum: ['cadastro', 'compra', 'sucessao', 'transferencia'] }).notNull(),
    observacao: text('observacao'),
  },
  (t) => [index('sepultura_titulares_sepultura_idx').on(t.sepulturaId)],
);

export const sepultamentos = sqliteTable(
  'sepultamentos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sepulturaId: integer('sepultura_id')
      .notNull()
      .references(() => sepulturas.id, { onDelete: 'restrict' }),
    nomeSepultado: text('nome_sepultado').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    /** Preenchido quando o sepultado é o próprio sócio. */
    socioId: integer('socio_id').references(() => socios.id, { onDelete: 'restrict' }),
    /** Sócio cujo direito de sepultamento foi usado (nulo em lançamentos antigos). */
    socioDireitoId: integer('socio_direito_id').references(() => socios.id, { onDelete: 'restrict' }),
    parentesco: text('parentesco'),
    dataNascimento: text('data_nascimento'),
    dataFalecimento: text('data_falecimento'),
    dataSepultamento: text('data_sepultamento').notNull(),
    certidaoObito: text('certidao_obito'),
    observacoes: text('observacoes'),
    /** Lançamento de sepultamento antigo (digitação): não aplica regras nem efeitos. */
    historico: integer('historico', { mode: 'boolean' }).notNull().default(false),
    justificativaExcecao: text('justificativa_excecao'),
    /** O que o registro mudou (para desfazer se for excluído por erro). JSON. */
    efeitos: text('efeitos'),
    /** Exumação: o registro continua, mas a pessoa deixa de ocupar o lugar. */
    exumadoEm: text('exumado_em'),
    exumacaoDestino: text('exumacao_destino', { enum: ['mesma_sepultura', 'outra_sepultura', 'familia', 'cremacao', 'outro'] }),
    exumacaoSepulturaDestinoId: integer('exumacao_sepultura_destino_id'),
    exumacaoObservacao: text('exumacao_observacao'),
    exumacaoRegistradaPor: integer('exumacao_registrada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    /** Quando os restos vieram de outra sepultura (exumação com transferência): o registro de origem. */
    transferidoDeId: integer('transferido_de_id'),
    registradoPor: integer('registrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [index('sepultamentos_sepultura_idx').on(t.sepulturaId), index('sepultamentos_nome_idx').on(t.nomeNormalizado)],
);

/** Familiar que assume as sepulturas de um sócio falecido (concluída quando paga a taxa). */
export const sucessoes = sqliteTable('sucessoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  socioOrigemId: integer('socio_origem_id')
    .notNull()
    .references(() => socios.id, { onDelete: 'restrict' }),
  socioDestinoId: integer('socio_destino_id')
    .notNull()
    .references(() => socios.id, { onDelete: 'restrict' }),
  cobrancaTaxaId: integer('cobranca_taxa_id').references(() => cobrancas.id, { onDelete: 'set null' }),
  situacao: text('situacao', { enum: ['pendente', 'concluida', 'cancelada'] }).notNull().default('pendente'),
  criadoPor: integer('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  criadoEm: text('criado_em').notNull().default(agora),
  concluidaEm: text('concluida_em'),
});

// ---------------- Mapa (Fase 5) ----------------

/** Região do cemitério desenhada no mapa. polígono = JSON com os anéis em [longitude, latitude]. */
export const setores = sqliteTable('setores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull().unique(),
  cor: text('cor').notNull(),
  poligono: text('poligono').notNull(),
  criadoEm: text('criado_em').notNull().default(agora),
});

// ---------------- Relatórios (Fase 6) ----------------

/** Registro de cada aviso de cobrança/lembrete enviado (para não mandar duas vezes na campanha). */
export const avisosCobranca = sqliteTable(
  'avisos_cobranca',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => socios.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: ['cobranca', 'lembrete'] }).notNull(),
    canal: text('canal', { enum: ['whatsapp', 'telefone', 'outro'] }).notNull().default('whatsapp'),
    usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: text('criado_em').notNull().default(agora),
  },
  (t) => [index('avisos_socio_idx').on(t.socioId)],
);
