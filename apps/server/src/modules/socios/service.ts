import { and, asc, eq, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  CAMPOS_ESSENCIAIS,
  normalizarTexto,
  somenteDigitos,
  type PossivelDuplicado,
  type Socio,
  type SocioDados,
  type SocioResumo,
} from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { cobrancas, recebimentos, sepulturas, sepulturaTitulares, sepultamentos, socioDocumentos, socios, sucessoes } from '../../db/schema.js';
import { criarCobrancaTaxa } from '../financeiro/service.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, naoEncontrado } from '../../shared/erros.js';
import { agoraIso } from '../../shared/tempo.js';
import { similaridade, tokensNome } from '../../shared/texto.js';

type LinhaSocio = typeof socios.$inferSelect;

export function paraSocio(s: LinhaSocio): Socio {
  return {
    id: s.id,
    matricula: s.matricula,
    nome_completo: s.nomeCompleto,
    cpf: s.cpf,
    data_nascimento: s.dataNascimento,
    telefone: s.telefone,
    telefone2: s.telefone2,
    email: s.email,
    cep: s.cep,
    logradouro: s.logradouro,
    numero: s.numero,
    complemento: s.complemento,
    bairro: s.bairro,
    cidade: s.cidade,
    uf: s.uf as Socio['uf'],
    situacao: s.situacao,
    direito_sepultamento: s.direitoSepultamento,
    data_associacao: s.dataAssociacao,
    data_falecimento: s.dataFalecimento,
    observacoes: s.observacoes,
    criado_em: s.criadoEm,
    atualizado_em: s.atualizadoEm,
  };
}

function paraColunas(d: SocioDados) {
  return {
    nomeCompleto: d.nome_completo,
    nomeNormalizado: normalizarTexto(d.nome_completo),
    cpf: d.cpf,
    dataNascimento: d.data_nascimento,
    telefone: d.telefone,
    telefone2: d.telefone2,
    email: d.email,
    cep: d.cep,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.cidade,
    uf: d.uf,
    dataAssociacao: d.data_associacao,
    observacoes: d.observacoes,
  };
}

const mapaEssenciais = {
  data_nascimento: socios.dataNascimento,
  telefone: socios.telefone,
  logradouro: socios.logradouro,
  cidade: socios.cidade,
} as const;

export function listarSocios(db: DB, busca?: string): SocioResumo[] {
  const condicoes: SQL[] = [];
  const termo = busca?.trim() ?? '';
  if (termo) {
    const digitos = somenteDigitos(termo);
    const porNome = tokensNome(termo).map((t) => like(socios.nomeNormalizado, `%${t}%`));
    const alternativas: (SQL | undefined)[] = [porNome.length ? and(...porNome) : undefined, eq(socios.matricula, termo)];
    if (digitos.length >= 3) {
      alternativas.push(like(socios.cpf, `%${digitos}%`), like(socios.matricula, `%${digitos}%`));
    }
    condicoes.push(or(...alternativas)!);
  }

  const incompleto = sql<number>`(${sql.join(
    CAMPOS_ESSENCIAIS.map((c) => sql`${mapaEssenciais[c]} IS NULL`),
    sql` OR `,
  )})`;

  return db
    .select({
      id: socios.id,
      matricula: socios.matricula,
      nome_completo: socios.nomeCompleto,
      cpf: socios.cpf,
      data_nascimento: socios.dataNascimento,
      telefone: socios.telefone,
      cidade: socios.cidade,
      situacao: socios.situacao,
      incompleto,
      // Nomes qualificados à mão: dentro da subconsulta o Drizzle não prefixa a tabela,
      // e "id" seria interpretado como a coluna da tabela interna.
      qtd_documentos: sql<number>`(SELECT count(*) FROM socio_documentos d WHERE d.socio_id = socios.id)`,
      pendencias: sql<number>`(SELECT count(*) FROM cobrancas c WHERE c.socio_id = socios.id AND c.situacao = 'aberta' AND c.vencimento < date('now', 'localtime'))`,
    })
    .from(socios)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(asc(socios.nomeNormalizado))
    .limit(1000)
    .all()
    .map((s) => ({ ...s, incompleto: Boolean(s.incompleto) }));
}

export function obterLinhaSocio(db: Pick<DB, 'select'>, id: number): LinhaSocio {
  const s = db.select().from(socios).where(eq(socios.id, id)).get();
  if (!s) throw naoEncontrado('Sócio');
  return s;
}

export const obterSocio = (db: DB, id: number) => paraSocio(obterLinhaSocio(db, id));

/** Próxima matrícula numérica (maior número existente + 1), com 4 dígitos. */
export function proximaMatricula(db: Pick<DB, 'select'>): string {
  const r = db
    .select({ max: sql<number | null>`max(CAST(${socios.matricula} AS INTEGER))` })
    .from(socios)
    .where(sql`${socios.matricula} GLOB '[0-9]*' AND ${socios.matricula} NOT GLOB '*[^0-9]*'`)
    .get();
  return String((r?.max ?? 0) + 1).padStart(4, '0');
}

function garantirUnicos(db: Pick<DB, 'select'>, dados: { matricula?: string | null; cpf: string | null }, ignorarId?: number) {
  const outro = (cond: SQL) =>
    db
      .select({ id: socios.id, nome: socios.nomeCompleto })
      .from(socios)
      .where(ignorarId ? and(cond, ne(socios.id, ignorarId)) : cond)
      .get();
  if (dados.matricula) {
    const s = outro(eq(socios.matricula, dados.matricula));
    if (s) throw conflito(`A matrícula ${dados.matricula} já pertence a ${s.nome}.`, 'matricula_duplicada');
  }
  if (dados.cpf) {
    const s = outro(eq(socios.cpf, dados.cpf));
    if (s) throw conflito(`Este CPF já está cadastrado para ${s.nome}.`, 'cpf_duplicado');
  }
}

export function criarSocio(db: DB, dados: SocioDados, usuarioId: number): Socio {
  return db.transaction((tx) => {
    const matricula = dados.matricula ?? proximaMatricula(tx);
    garantirUnicos(tx, { matricula, cpf: dados.cpf });
    const socioNovo = Boolean(dados.cobrar_taxa_associacao);
    const s = tx
      .insert(socios)
      .values({
        ...paraColunas(dados),
        matricula,
        tokenPublico: randomBytes(18).toString('base64url'),
        // Sócio novo só fica ativo quando pagar a taxa de associação.
        situacao: socioNovo ? 'pendente' : 'ativo',
      })
      .returning()
      .get();
    registrarAuditoria(tx, { usuarioId, acao: 'criar', entidade: 'socio', entidadeId: s.id, detalhes: { matricula, nome: s.nomeCompleto } });
    if (socioNovo) criarCobrancaTaxa(tx, s.id, usuarioId);
    return paraSocio(s);
  });
}

export function atualizarSocio(db: DB, id: number, dados: SocioDados, usuarioId: number): Socio {
  return db.transaction((tx) => {
    const antes = paraSocio(obterLinhaSocio(tx, id));
    const matricula = dados.matricula ?? antes.matricula;
    garantirUnicos(tx, { matricula, cpf: dados.cpf }, id);
    const s = tx
      .update(socios)
      .set({ ...paraColunas(dados), matricula, atualizadoEm: agoraIso() })
      .where(eq(socios.id, id))
      .returning()
      .get();
    const depois = paraSocio(s);
    const alterados: Record<string, { de: unknown; para: unknown }> = {};
    for (const chave of Object.keys(dados) as (keyof SocioDados)[]) {
      if (chave === 'cobrar_taxa_associacao') continue;
      const k = chave as keyof Socio;
      if (antes[k] !== depois[k]) alterados[chave] = { de: antes[k], para: depois[k] };
    }
    if (Object.keys(alterados).length) {
      registrarAuditoria(tx, { usuarioId, acao: 'atualizar', entidade: 'socio', entidadeId: id, detalhes: alterados });
    }
    return depois;
  });
}

export function ajustarSituacao(
  db: DB,
  id: number,
  ajuste: { situacao: Socio['situacao']; direito_sepultamento: Socio['direito_sepultamento']; data_falecimento: string | null; justificativa: string },
  usuarioId: number,
): Socio {
  return db.transaction((tx) => {
    const antes = obterLinhaSocio(tx, id);
    const s = tx
      .update(socios)
      .set({
        situacao: ajuste.situacao,
        direitoSepultamento: ajuste.direito_sepultamento,
        dataFalecimento: ajuste.situacao === 'falecido' ? ajuste.data_falecimento : null,
        atualizadoEm: agoraIso(),
      })
      .where(eq(socios.id, id))
      .returning()
      .get();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'ajuste_manual_situacao',
      entidade: 'socio',
      entidadeId: id,
      detalhes: {
        de: { situacao: antes.situacao, direito: antes.direitoSepultamento, falecimento: antes.dataFalecimento },
        para: { situacao: s.situacao, direito: s.direitoSepultamento, falecimento: s.dataFalecimento },
        justificativa: ajuste.justificativa,
      },
    });
    return paraSocio(s);
  });
}

/** Exclui o sócio e devolve os arquivos que precisam ser apagados do disco. */
export function excluirSocio(db: DB, id: number, usuarioId: number): string[] {
  return db.transaction((tx) => {
    const s = obterLinhaSocio(tx, id);
    if (tx.select({ id: recebimentos.id }).from(recebimentos).where(eq(recebimentos.socioId, id)).get()) {
      throw conflito('Este sócio tem pagamentos registrados e não pode ser excluído.', 'tem_pagamentos');
    }
    if (tx.select({ id: sepulturas.id }).from(sepulturas).where(eq(sepulturas.socioId, id)).get()) {
      throw conflito('Este sócio é titular de sepultura. Transfira a sepultura antes de excluir.', 'tem_sepultura');
    }
    if (
      tx
        .select({ id: sepultamentos.id })
        .from(sepultamentos)
        .where(sql`${sepultamentos.socioId} = ${id} OR ${sepultamentos.socioDireitoId} = ${id}`)
        .get()
    ) {
      throw conflito('Este sócio aparece em registros de sepultamento e não pode ser excluído.', 'tem_sepultamento');
    }
    const temHistorico =
      tx.select({ id: sepulturaTitulares.id }).from(sepulturaTitulares).where(eq(sepulturaTitulares.socioId, id)).get() ||
      tx
        .select({ id: sucessoes.id })
        .from(sucessoes)
        .where(sql`${sucessoes.socioOrigemId} = ${id} OR ${sucessoes.socioDestinoId} = ${id}`)
        .get();
    if (temHistorico) {
      throw conflito('Este sócio aparece no histórico de titulares de sepulturas e não pode ser excluído.', 'tem_historico');
    }
    const docs = tx.select().from(socioDocumentos).where(eq(socioDocumentos.socioId, id)).all();
    tx.delete(cobrancas).where(eq(cobrancas.socioId, id)).run();
    tx.delete(socios).where(eq(socios.id, id)).run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'excluir',
      entidade: 'socio',
      entidadeId: id,
      detalhes: { matricula: s.matricula, nome: s.nomeCompleto, cpf: s.cpf, documentos: docs.length },
    });
    return docs.flatMap((d) => [d.arquivo, d.miniatura]);
  });
}

/** Procura cadastros que parecem ser a mesma pessoa. */
export function buscarDuplicados(
  db: DB,
  alvo: { nome_completo: string; data_nascimento?: string | null; cpf?: string | null; ignorarId?: number },
): PossivelDuplicado[] {
  // Compara sem os conectivos ("da", "de", "dos"...), que muitas vezes faltam nas fichas.
  const tokAlvo = tokensNome(alvo.nome_completo);
  const nomeAlvo = tokAlvo.join(' ');
  if (tokAlvo.length === 0) return [];
  const cpfAlvo = alvo.cpf ? somenteDigitos(alvo.cpf) : null;
  const primeiro = tokAlvo[0]!;
  const ultimo = tokAlvo.at(-1)!;

  const candidatos = db
    .select({
      id: socios.id,
      matricula: socios.matricula,
      nome_completo: socios.nomeCompleto,
      data_nascimento: socios.dataNascimento,
      cpf: socios.cpf,
    })
    .from(socios)
    .where(alvo.ignorarId ? ne(socios.id, alvo.ignorarId) : undefined)
    .all();

  const resultado: PossivelDuplicado[] = [];
  for (const c of candidatos) {
    const tok = tokensNome(c.nome_completo);
    const mesmaData = !!alvo.data_nascimento && alvo.data_nascimento === c.data_nascimento;
    const nomeCand = tok.join(' ');
    const sim = similaridade(nomeAlvo, nomeCand);
    const extremosIguais = tok[0] === primeiro && tok.at(-1) === ultimo;

    let motivo: string | null = null;
    if (cpfAlvo && c.cpf === cpfAlvo) motivo = 'Mesmo CPF';
    else if (nomeCand === nomeAlvo) motivo = mesmaData ? 'Mesmo nome e mesma data de nascimento' : 'Mesmo nome';
    else if (mesmaData && (extremosIguais || sim >= 0.75)) motivo = 'Nome parecido e mesma data de nascimento';
    else if (sim >= 0.9) motivo = 'Nome muito parecido';

    if (motivo) {
      resultado.push({
        id: c.id,
        matricula: c.matricula,
        nome_completo: c.nome_completo,
        data_nascimento: c.data_nascimento,
        motivo,
      });
    }
  }
  return resultado.slice(0, 10);
}
