import { and, asc, desc, eq, gt, inArray, like, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  normalizarTexto,
  type DestinoExumacao,
  type Perfil,
  type Sepultado,
  type SocioDados,
  type Sucessao,
  type VerificacaoDireito,
} from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { cobrancas, sepulturas, sepultamentos, socios, sucessoes } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, ErroApp, naoEncontrado, proibido, requisicaoInvalida } from '../../shared/erros.js';
import { agoraIso, hojeLocal } from '../../shared/tempo.js';
import { criarCobrancaTaxa, resumoFinanceiro } from '../financeiro/service.js';
import { desfazerTrocaTitular, obterLinhaSepultura, ocupacaoAtual, recalcularSituacao, trocarTitular } from '../sepulturas/service.js';
import { criarSocio, obterLinhaSocio } from '../socios/service.js';

type Tx = Pick<DB, 'select' | 'insert' | 'update' | 'delete'>;

// ---------------- Consultas ----------------

const socioDireito = alias(socios, 'socio_direito');
const sepulturaDestino = alias(sepulturas, 'sepultura_destino');
const registroOrigem = alias(sepultamentos, 'registro_origem');
const sepulturaOrigem = alias(sepulturas, 'sepultura_origem');

export function listarSepultados(db: Tx, f: { sepulturaId?: number; busca?: string; limite?: number }): Sepultado[] {
  const cond: SQL[] = [];
  if (f.sepulturaId) cond.push(eq(sepultamentos.sepulturaId, f.sepulturaId));
  for (const t of normalizarTexto(f.busca ?? '').split(' ').filter(Boolean)) {
    cond.push(like(sepultamentos.nomeNormalizado, `%${t}%`));
  }
  return db
    .select({
      id: sepultamentos.id,
      sepultura_id: sepultamentos.sepulturaId,
      sepultura_codigo: sepulturas.codigo,
      nome_sepultado: sepultamentos.nomeSepultado,
      socio_id: sepultamentos.socioId,
      socio_direito_id: sepultamentos.socioDireitoId,
      socio_direito_nome: socioDireito.nomeCompleto,
      parentesco: sepultamentos.parentesco,
      data_nascimento: sepultamentos.dataNascimento,
      data_falecimento: sepultamentos.dataFalecimento,
      data_sepultamento: sepultamentos.dataSepultamento,
      certidao_obito: sepultamentos.certidaoObito,
      observacoes: sepultamentos.observacoes,
      historico: sepultamentos.historico,
      justificativa_excecao: sepultamentos.justificativaExcecao,
      exumado_em: sepultamentos.exumadoEm,
      exumacao_destino: sepultamentos.exumacaoDestino,
      exumacao_sepultura_destino_id: sepultamentos.exumacaoSepulturaDestinoId,
      exumacao_sepultura_destino_codigo: sepulturaDestino.codigo,
      exumacao_observacao: sepultamentos.exumacaoObservacao,
      transferido_de_codigo: sepulturaOrigem.codigo,
    })
    .from(sepultamentos)
    .innerJoin(sepulturas, eq(sepulturas.id, sepultamentos.sepulturaId))
    .leftJoin(socioDireito, eq(socioDireito.id, sepultamentos.socioDireitoId))
    .leftJoin(sepulturaDestino, eq(sepulturaDestino.id, sepultamentos.exumacaoSepulturaDestinoId))
    .leftJoin(registroOrigem, eq(registroOrigem.id, sepultamentos.transferidoDeId))
    .leftJoin(sepulturaOrigem, eq(sepulturaOrigem.id, registroOrigem.sepulturaId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(f.sepulturaId ? asc(sepultamentos.dataSepultamento) : desc(sepultamentos.dataSepultamento))
    .limit(f.limite ?? 500)
    .all();
}

// ---------------- Regras do direito de sepultamento ----------------

/**
 * O direito exige: sócio ativo, taxa paga (direito disponível), sepultura comprada e anuidades
 * vencidas quitadas. Se a sepultura for informada, confere também se é dele e se há espaço.
 */
export function verificarDireito(db: Tx, socioId: number, sepulturaId?: number): VerificacaoDireito {
  const s = obterLinhaSocio(db, socioId);
  const resumo = resumoFinanceiro(db, socioId);
  const minhas = db.select({ id: sepulturas.id }).from(sepulturas).where(eq(sepulturas.socioId, socioId)).all();
  const itens: VerificacaoDireito['itens'] = [
    {
      regra: 'Sócio ativo',
      ok: s.situacao === 'ativo',
      detalhe:
        s.situacao === 'pendente'
          ? 'Falta pagar a taxa de associação'
          : s.situacao === 'associacao_encerrada'
            ? 'Associação encerrada: precisa renovar'
            : s.situacao === 'falecido'
              ? 'Sócio falecido'
              : undefined,
    },
    {
      regra: 'Benefício da associação disponível',
      ok: s.direitoSepultamento === 'disponivel',
      detalhe: s.direitoSepultamento === 'utilizado' ? 'Já foi utilizado' : undefined,
    },
    { regra: 'Tem sepultura comprada', ok: minhas.length > 0 },
    {
      regra: 'Anuidades em dia',
      ok: resumo.em_dia,
      detalhe: resumo.em_dia ? undefined : `Pendente: ${resumo.anos_pendentes.join(', ') || 'cobranças vencidas'}`,
    },
  ];
  if (sepulturaId) {
    const sep = obterLinhaSepultura(db, sepulturaId);
    const ocupacao = ocupacaoAtual(db, sepulturaId);
    itens.push(
      { regra: `A sepultura ${sep.codigo} é deste sócio`, ok: sep.socioId === socioId },
      { regra: 'Há espaço na sepultura', ok: ocupacao < sep.capacidade, detalhe: `${ocupacao} de ${sep.capacidade}` },
    );
  }
  return { socio_id: s.id, socio_nome: s.nomeCompleto, pode: itens.every((i) => i.ok), itens };
}

// ---------------- Registro ----------------

interface EfeitosSepultamento {
  sepultura: { id: number; situacaoAntes: string };
  socio?: {
    id: number;
    antes: { situacao: string; direito: string; dataFalecimento: string | null };
    depois: { situacao: string; direito: string; dataFalecimento: string | null };
  };
  cobrancasCanceladas: number[];
}

export function registrarSepultamento(
  db: DB,
  d: {
    sepultura_id: number;
    socio_direito_id?: number | null;
    sepultado_e_socio: boolean;
    nome_sepultado: string;
    parentesco: string | null;
    data_nascimento: string | null;
    data_falecimento: string | null;
    data_sepultamento: string;
    certidao_obito: string | null;
    observacoes: string | null;
    historico: boolean;
    justificativa_excecao: string | null;
  },
  usuario: { id: number; perfil: Perfil },
) {
  const hoje = hojeLocal();
  if (d.data_sepultamento > hoje) throw requisicaoInvalida('A data do sepultamento não pode estar no futuro.');
  if (d.data_falecimento && d.data_falecimento > d.data_sepultamento) {
    throw requisicaoInvalida('A data de falecimento não pode ser depois do sepultamento.');
  }

  return db.transaction((tx) => {
    const sep = obterLinhaSepultura(tx, d.sepultura_id);
    const efeitos: EfeitosSepultamento = { sepultura: { id: sep.id, situacaoAntes: sep.situacao }, cobrancasCanceladas: [] };
    const socioDireitoId = d.socio_direito_id ?? null;

    if (!d.historico) {
      const v = verificarDireito(tx, socioDireitoId!, sep.id);
      if (!v.pode) {
        const falhas = v.itens.filter((i) => !i.ok).map((i) => (i.detalhe ? `${i.regra} (${i.detalhe})` : i.regra));
        if (!d.justificativa_excecao) {
          throw new ErroApp(409, `Não atende às regras: ${falhas.join('; ')}.`, 'regras_sepultamento');
        }
        if (usuario.perfil !== 'admin') throw proibido('Somente administradores podem registrar uma exceção às regras.');
      }

      const s = obterLinhaSocio(tx, socioDireitoId!);
      const antes = { situacao: s.situacao, direito: s.direitoSepultamento, dataFalecimento: s.dataFalecimento };
      let depois: typeof antes;
      let limite: string;
      let motivo: string;
      if (d.sepultado_e_socio) {
        // Caso A: o próprio sócio. Fica falecido e deixa de pagar.
        const falecimento = d.data_falecimento ?? d.data_sepultamento;
        depois = { situacao: 'falecido', direito: 'utilizado', dataFalecimento: falecimento };
        limite = falecimento;
        motivo = 'Falecimento do sócio';
      } else {
        // Caso B: familiar. O direito foi usado e a associação se encerra até renovar.
        depois = { situacao: 'associacao_encerrada', direito: 'utilizado', dataFalecimento: s.dataFalecimento };
        limite = d.data_sepultamento;
        motivo = 'Associação encerrada (benefício utilizado)';
      }
      tx.update(socios)
        .set({
          situacao: depois.situacao as typeof s.situacao,
          direitoSepultamento: 'utilizado',
          dataFalecimento: depois.dataFalecimento,
          atualizadoEm: agoraIso(),
        })
        .where(eq(socios.id, s.id))
        .run();
      efeitos.socio = { id: s.id, antes, depois };

      // Anuidades ainda não vencidas deixam de ser devidas.
      const futuras = tx
        .select({ id: cobrancas.id })
        .from(cobrancas)
        .where(and(eq(cobrancas.socioId, s.id), eq(cobrancas.tipo, 'anuidade'), eq(cobrancas.situacao, 'aberta'), gt(cobrancas.vencimento, limite)))
        .all()
        .map((c) => c.id);
      if (futuras.length) {
        tx.update(cobrancas)
          .set({ situacao: 'cancelada', motivoCancelamento: motivo, canceladoEm: agoraIso(), canceladoPor: usuario.id })
          .where(inArray(cobrancas.id, futuras))
          .run();
      }
      efeitos.cobrancasCanceladas = futuras;
    }

    tx.update(sepulturas).set({ situacao: 'ocupada', atualizadoEm: agoraIso() }).where(eq(sepulturas.id, sep.id)).run();
    const reg = tx
      .insert(sepultamentos)
      .values({
        sepulturaId: sep.id,
        nomeSepultado: d.nome_sepultado,
        nomeNormalizado: normalizarTexto(d.nome_sepultado),
        socioId: d.sepultado_e_socio ? socioDireitoId : null,
        socioDireitoId,
        parentesco: d.sepultado_e_socio ? null : d.parentesco,
        dataNascimento: d.data_nascimento,
        dataFalecimento: d.data_falecimento,
        dataSepultamento: d.data_sepultamento,
        certidaoObito: d.certidao_obito,
        observacoes: d.observacoes,
        historico: d.historico,
        justificativaExcecao: d.justificativa_excecao,
        efeitos: JSON.stringify(efeitos),
        registradoPor: usuario.id,
      })
      .returning()
      .get();

    const detalhes = {
      sepultado: d.nome_sepultado,
      sepultura: sep.codigo,
      historico: d.historico || undefined,
      excecao: d.justificativa_excecao ?? undefined,
    };
    registrarAuditoria(tx, { usuarioId: usuario.id, acao: 'registrar_sepultamento', entidade: 'sepultura', entidadeId: sep.id, detalhes });
    if (socioDireitoId) {
      registrarAuditoria(tx, { usuarioId: usuario.id, acao: 'registrar_sepultamento', entidade: 'socio', entidadeId: socioDireitoId, detalhes });
    }
    return { id: reg.id, sugerir_sucessao: d.sepultado_e_socio && !d.historico };
  });
}

/** Exclui um registro feito por engano e desfaz o que ele mudou no sócio, nas cobranças e na sepultura. */
export function excluirSepultamento(db: DB, id: number, motivo: string, usuarioId: number) {
  db.transaction((tx) => {
    const reg = tx.select().from(sepultamentos).where(eq(sepultamentos.id, id)).get();
    if (!reg) throw naoEncontrado('Sepultamento');
    if (reg.exumadoEm) throw conflito('Este registro tem exumação. Desfaça a exumação antes de excluir.');
    if (reg.transferidoDeId) {
      throw conflito('Estes restos vieram de outra sepultura. Para corrigir, desfaça a exumação na sepultura de origem.');
    }
    const ef = JSON.parse(reg.efeitos ?? '{}') as Partial<EfeitosSepultamento>;

    if (ef.socio) {
      const s = obterLinhaSocio(tx, ef.socio.id);
      const igual = s.situacao === ef.socio.depois.situacao && s.dataFalecimento === ef.socio.depois.dataFalecimento;
      if (!igual) {
        throw conflito('A situação do sócio mudou depois deste registro. Ajuste a situação manualmente antes de excluir.');
      }
      tx.update(socios)
        .set({
          situacao: ef.socio.antes.situacao as typeof s.situacao,
          direitoSepultamento: ef.socio.antes.direito as typeof s.direitoSepultamento,
          dataFalecimento: ef.socio.antes.dataFalecimento,
          atualizadoEm: agoraIso(),
        })
        .where(eq(socios.id, s.id))
        .run();
    }
    if (ef.cobrancasCanceladas?.length) {
      tx.update(cobrancas)
        .set({ situacao: 'aberta', motivoCancelamento: null, canceladoEm: null, canceladoPor: null })
        .where(and(inArray(cobrancas.id, ef.cobrancasCanceladas), eq(cobrancas.situacao, 'cancelada')))
        .run();
    }
    tx.delete(sepultamentos).where(eq(sepultamentos.id, id)).run();

    const sep = obterLinhaSepultura(tx, reg.sepulturaId);
    recalcularSituacao(tx, sep.id);
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'excluir_sepultamento',
      entidade: 'sepultura',
      entidadeId: sep.id,
      detalhes: { sepultado: reg.nomeSepultado, motivo },
    });
  });
}

// ---------------- Sucessão ----------------

function paraSucessao(db: Tx, ids: number[]): Sucessao[] {
  if (!ids.length) return [];
  const origem = alias(socios, 'origem');
  const destino = alias(socios, 'destino');
  return db
    .select({
      id: sucessoes.id,
      socio_origem_id: sucessoes.socioOrigemId,
      socio_origem_nome: origem.nomeCompleto,
      socio_destino_id: sucessoes.socioDestinoId,
      socio_destino_nome: destino.nomeCompleto,
      situacao: sucessoes.situacao,
      criado_em: sucessoes.criadoEm,
    })
    .from(sucessoes)
    .innerJoin(origem, eq(origem.id, sucessoes.socioOrigemId))
    .innerJoin(destino, eq(destino.id, sucessoes.socioDestinoId))
    .where(inArray(sucessoes.id, ids))
    .orderBy(desc(sucessoes.id))
    .all();
}

export function sucessoesDoSocio(db: Tx, socioId: number): Sucessao[] {
  const ids = db
    .select({ id: sucessoes.id })
    .from(sucessoes)
    .where(sql`${sucessoes.socioOrigemId} = ${socioId} OR ${sucessoes.socioDestinoId} = ${socioId}`)
    .all()
    .map((x) => x.id);
  return paraSucessao(db, ids);
}

interface Transferencia {
  sepulturaId: number;
  antes: { socioId: number | null; situacao: 'disponivel' | 'reservada' | 'vendida' | 'ocupada'; dataAquisicao: string | null };
  troca: { fechadoId: number | null; novoId: number | null };
}

function transferirTodas(tx: Tx, origemId: number, destinoId: number, data: string): Transferencia[] {
  const lista = tx.select().from(sepulturas).where(eq(sepulturas.socioId, origemId)).all();
  return lista.map((s) => ({
    sepulturaId: s.id,
    antes: { socioId: s.socioId, situacao: s.situacao, dataAquisicao: s.dataAquisicao },
    troca: trocarTitular(tx, s.id, destinoId, 'sucessao', data),
  }));
}

/**
 * Familiar assume as sepulturas do sócio falecido. Se ele já é sócio ativo, a transferência é imediata;
 * senão, gera a taxa de associação e a transferência acontece quando ela for paga.
 */
export function iniciarSucessao(
  db: DB,
  origemId: number,
  d: { socio_destino_id?: number | null; novo_socio?: Omit<SocioDados, 'cobrar_taxa_associacao'> | null },
  usuarioId: number,
) {
  return db.transaction((tx) => {
    const origem = obterLinhaSocio(tx, origemId);
    if (origem.situacao !== 'falecido') throw requisicaoInvalida('A sucessão é feita a partir de um sócio falecido.');
    if (!tx.select({ id: sepulturas.id }).from(sepulturas).where(eq(sepulturas.socioId, origemId)).get()) {
      throw requisicaoInvalida('Este sócio não tem sepulturas para transferir.');
    }
    if (tx.select({ id: sucessoes.id }).from(sucessoes).where(and(eq(sucessoes.socioOrigemId, origemId), eq(sucessoes.situacao, 'pendente'))).get()) {
      throw conflito('Já existe uma sucessão em andamento para este sócio.');
    }

    let destinoId: number;
    if (d.socio_destino_id) {
      destinoId = d.socio_destino_id;
      if (destinoId === origemId) throw requisicaoInvalida('Escolha outra pessoa.');
      if (obterLinhaSocio(tx, destinoId).situacao === 'falecido') throw requisicaoInvalida('O familiar não pode ser um sócio falecido.');
    } else if (d.novo_socio) {
      // Novo sócio entra "pendente" com a taxa de associação já gerada.
      // A transação do Drizzle aceita transações aninhadas (savepoint), como criarSocio usa.
      destinoId = criarSocio(tx as unknown as DB, { ...d.novo_socio, cobrar_taxa_associacao: true }, usuarioId).id;
    } else {
      throw requisicaoInvalida('Informe o familiar que vai assumir.');
    }

    const destino = obterLinhaSocio(tx, destinoId);
    const hoje = hojeLocal();
    if (destino.situacao === 'ativo' && destino.direitoSepultamento === 'disponivel') {
      const transferidas = transferirTodas(tx, origemId, destinoId, hoje);
      const suc = tx
        .insert(sucessoes)
        .values({ socioOrigemId: origemId, socioDestinoId: destinoId, situacao: 'concluida', concluidaEm: agoraIso(), criadoPor: usuarioId })
        .returning()
        .get();
      registrarAuditoria(tx, {
        usuarioId,
        acao: 'sucessao_concluida',
        entidade: 'socio',
        entidadeId: origemId,
        detalhes: { para: destino.nomeCompleto, sepulturas: transferidas.length },
      });
      return { sucessao_id: suc.id, concluida: true, socio_destino_id: destinoId };
    }

    const taxaAberta = tx
      .select()
      .from(cobrancas)
      .where(and(eq(cobrancas.socioId, destinoId), eq(cobrancas.tipo, 'taxa_associacao'), eq(cobrancas.situacao, 'aberta')))
      .get();
    const taxa = taxaAberta ?? criarCobrancaTaxa(tx, destinoId, usuarioId);
    const suc = tx
      .insert(sucessoes)
      .values({ socioOrigemId: origemId, socioDestinoId: destinoId, cobrancaTaxaId: taxa.id, criadoPor: usuarioId })
      .returning()
      .get();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'sucessao_iniciada',
      entidade: 'socio',
      entidadeId: origemId,
      detalhes: { para: destino.nomeCompleto, cobranca_taxa: taxa.id },
    });
    return { sucessao_id: suc.id, concluida: false, socio_destino_id: destinoId };
  });
}

export interface EfeitosSucessao {
  sucessaoId: number;
  transferencias: Transferencia[];
}

/** Chamado quando a taxa de associação é paga: conclui a sucessão ligada a ela, se houver. */
export function concluirSucessaoPelaTaxa(tx: Tx, cobrancaId: number, data: string): EfeitosSucessao | null {
  const suc = tx
    .select()
    .from(sucessoes)
    .where(and(eq(sucessoes.cobrancaTaxaId, cobrancaId), eq(sucessoes.situacao, 'pendente')))
    .get();
  if (!suc) return null;
  const transferencias = transferirTodas(tx, suc.socioOrigemId, suc.socioDestinoId, data);
  tx.update(sucessoes).set({ situacao: 'concluida', concluidaEm: agoraIso() }).where(eq(sucessoes.id, suc.id)).run();
  return { sucessaoId: suc.id, transferencias };
}

export function desfazerSucessao(tx: Tx, ef: EfeitosSucessao) {
  for (const t of [...ef.transferencias].reverse()) desfazerTrocaTitular(tx, t.sepulturaId, t.troca, t.antes);
  tx.update(sucessoes).set({ situacao: 'pendente', concluidaEm: null }).where(eq(sucessoes.id, ef.sucessaoId)).run();
}

export function cancelarSucessao(db: DB, id: number, usuarioId: number) {
  db.transaction((tx) => {
    const suc = tx.select().from(sucessoes).where(eq(sucessoes.id, id)).get();
    if (!suc) throw naoEncontrado('Sucessão');
    if (suc.situacao !== 'pendente') throw requisicaoInvalida('Só é possível cancelar sucessões pendentes.');
    tx.update(sucessoes).set({ situacao: 'cancelada' }).where(eq(sucessoes.id, id)).run();
    registrarAuditoria(tx, { usuarioId, acao: 'sucessao_cancelada', entidade: 'socio', entidadeId: suc.socioOrigemId, detalhes: { sucessao: id } });
  });
}

// ---------------- Exumação ----------------

/**
 * Registra a exumação: o registro do sepultamento continua (histórico), mas a pessoa
 * deixa de ocupar o lugar. Se os restos foram para outra sepultura do cemitério
 * (ex.: ossuário), cria lá um registro ligado a este.
 */
export function exumar(
  db: DB,
  id: number,
  d: { data_exumacao: string; destino: DestinoExumacao; sepultura_destino_id?: number | null; observacao: string | null },
  usuarioId: number,
) {
  return db.transaction((tx) => {
    const reg = tx.select().from(sepultamentos).where(eq(sepultamentos.id, id)).get();
    if (!reg) throw naoEncontrado('Sepultamento');
    if (reg.exumadoEm) throw conflito('Esta exumação já foi registrada.');
    if (d.data_exumacao > hojeLocal()) throw requisicaoInvalida('A data da exumação não pode estar no futuro.');
    if (d.data_exumacao < reg.dataSepultamento) throw requisicaoInvalida('A exumação não pode ser antes do sepultamento.');
    const origem = obterLinhaSepultura(tx, reg.sepulturaId);

    let destinoId: number | null = null;
    if (d.destino === 'outra_sepultura') {
      destinoId = d.sepultura_destino_id!;
      if (destinoId === origem.id) throw requisicaoInvalida('Escolha uma sepultura diferente da atual.');
      const destino = obterLinhaSepultura(tx, destinoId);
      if (ocupacaoAtual(tx, destinoId) >= destino.capacidade) {
        throw conflito(`A sepultura ${destino.codigo} está cheia (${destino.capacidade} lugar(es)). Aumente a capacidade dela, se for o caso.`);
      }
      tx.insert(sepultamentos)
        .values({
          sepulturaId: destinoId,
          nomeSepultado: reg.nomeSepultado,
          nomeNormalizado: reg.nomeNormalizado,
          socioId: reg.socioId,
          socioDireitoId: reg.socioDireitoId,
          parentesco: reg.parentesco,
          dataNascimento: reg.dataNascimento,
          dataFalecimento: reg.dataFalecimento,
          dataSepultamento: d.data_exumacao,
          certidaoObito: reg.certidaoObito,
          observacoes: `Restos transferidos da sepultura ${origem.codigo}`,
          // Não é um uso novo do benefício: não confere regras nem muda o sócio.
          historico: true,
          transferidoDeId: reg.id,
          registradoPor: usuarioId,
        })
        .run();
      tx.update(sepulturas).set({ situacao: 'ocupada', atualizadoEm: agoraIso() }).where(eq(sepulturas.id, destinoId)).run();
    }

    tx.update(sepultamentos)
      .set({
        exumadoEm: d.data_exumacao,
        exumacaoDestino: d.destino,
        exumacaoSepulturaDestinoId: destinoId,
        exumacaoObservacao: d.observacao,
        exumacaoRegistradaPor: usuarioId,
      })
      .where(eq(sepultamentos.id, id))
      .run();
    recalcularSituacao(tx, origem.id);

    const detalhes = { sepultado: reg.nomeSepultado, sepultura: origem.codigo, data: d.data_exumacao, destino: d.destino };
    registrarAuditoria(tx, { usuarioId, acao: 'registrar_exumacao', entidade: 'sepultura', entidadeId: origem.id, detalhes });
    if (destinoId) {
      registrarAuditoria(tx, { usuarioId, acao: 'receber_restos', entidade: 'sepultura', entidadeId: destinoId, detalhes });
    }
  });
}

/** Desfaz uma exumação registrada por engano (administrador). */
export function desfazerExumacao(db: DB, id: number, motivo: string, usuarioId: number) {
  db.transaction((tx) => {
    const reg = tx.select().from(sepultamentos).where(eq(sepultamentos.id, id)).get();
    if (!reg) throw naoEncontrado('Sepultamento');
    if (!reg.exumadoEm) throw requisicaoInvalida('Este sepultamento não tem exumação registrada.');
    const origem = obterLinhaSepultura(tx, reg.sepulturaId);
    if (ocupacaoAtual(tx, origem.id) >= origem.capacidade) {
      throw conflito(`A sepultura ${origem.codigo} já está com todos os lugares ocupados.`);
    }
    const copia = tx.select().from(sepultamentos).where(eq(sepultamentos.transferidoDeId, id)).get();
    if (copia) {
      if (copia.exumadoEm) throw conflito('Os restos já foram retirados também da sepultura de destino. Desfaça aquela exumação antes.');
      tx.delete(sepultamentos).where(eq(sepultamentos.id, copia.id)).run();
      recalcularSituacao(tx, copia.sepulturaId);
    }
    tx.update(sepultamentos)
      .set({ exumadoEm: null, exumacaoDestino: null, exumacaoSepulturaDestinoId: null, exumacaoObservacao: null, exumacaoRegistradaPor: null })
      .where(eq(sepultamentos.id, id))
      .run();
    recalcularSituacao(tx, origem.id);
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'desfazer_exumacao',
      entidade: 'sepultura',
      entidadeId: origem.id,
      detalhes: { sepultado: reg.nomeSepultado, motivo },
    });
  });
}

