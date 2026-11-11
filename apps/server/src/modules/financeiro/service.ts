import { and, asc, desc, eq, gte, inArray, lte, max, ne, sql, type SQL } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  ROTULO_TIPO_COBRANCA,
  vencimentoAnuidade,
  type Cobranca,
  type FinanceiroSocio,
  type PreviaAnuidadeSocio,
  type FormaPagamento,
  type Perfil,
  type RecebimentoDetalhe,
  type RecebimentoResumo,
  type ResumoFinanceiro,
  type TipoCobranca,
  type ValorTabela,
} from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { cobrancas, pagamentos, recebimentos, sepulturas, socios, sucessoes, tabelaValores, usuarios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, ErroApp, naoEncontrado, proibido, requisicaoInvalida } from '../../shared/erros.js';
import { agoraIso, hojeLocal } from '../../shared/tempo.js';
import { aplicarEfeitosVenda, desfazerEfeitosVenda, liberarReserva, type EfeitosVenda } from '../sepulturas/service.js';
import { concluirSucessaoPelaTaxa, desfazerSucessao, type EfeitosSucessao } from '../sepultamentos/service.js';
import { obterLinhaSocio } from '../socios/service.js';

/** Conexão ou transação — as funções abaixo funcionam com as duas. */
type Tx = Pick<DB, 'select' | 'insert' | 'update' | 'delete'>;

const anoDe = (dataIso: string) => Number(dataIso.slice(0, 4));

// ---------------- Tabela de valores ----------------

export function valorVigente(db: Tx, tipo: TipoCobranca, ano: number): number | null {
  const v = db
    .select({ valor: tabelaValores.valorCentavos })
    .from(tabelaValores)
    .where(and(eq(tabelaValores.tipo, tipo), eq(tabelaValores.ano, ano)))
    .get();
  return v?.valor ?? null;
}

function exigirValor(db: Tx, tipo: TipoCobranca, ano: number): number {
  const v = valorVigente(db, tipo, ano);
  if (v === null) {
    throw new ErroApp(
      400,
      `Não há valor cadastrado para "${ROTULO_TIPO_COBRANCA[tipo]}" em ${ano}. Cadastre em Administração → Valores e reajustes.`,
      'valor_nao_cadastrado',
    );
  }
  return v;
}

export function listarValores(db: DB): ValorTabela[] {
  return db
    .select({
      tipo: tabelaValores.tipo,
      ano: tabelaValores.ano,
      valor_centavos: tabelaValores.valorCentavos,
      definido_em: tabelaValores.definidoEm,
      definido_por: usuarios.nome,
    })
    .from(tabelaValores)
    .leftJoin(usuarios, eq(usuarios.id, tabelaValores.definidoPor))
    .orderBy(asc(tabelaValores.tipo), desc(tabelaValores.ano))
    .all();
}

/** Cadastra ou altera o valor de um tipo num ano. Cobranças já geradas não mudam. */
export function definirValor(db: DB, d: { tipo: TipoCobranca; ano: number; valor_centavos: number }, usuarioId: number) {
  db.transaction((tx) => {
    const anterior = valorVigente(tx, d.tipo, d.ano);
    tx.insert(tabelaValores)
      .values({ tipo: d.tipo, ano: d.ano, valorCentavos: d.valor_centavos, definidoPor: usuarioId })
      .onConflictDoUpdate({
        target: [tabelaValores.tipo, tabelaValores.ano],
        set: { valorCentavos: d.valor_centavos, definidoPor: usuarioId, definidoEm: agoraIso() },
      })
      .run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: anterior === null ? 'definir_valor' : 'reajustar_valor',
      entidade: 'valor',
      detalhes: { tipo: d.tipo, ano: d.ano, de: anterior, para: d.valor_centavos },
    });
  });
}

// ---------------- Cobranças ----------------

type LinhaCobranca = typeof cobrancas.$inferSelect;

/** Código da sepultura (para descrever "Compra de sepultura S-0012"). */
function codigoSepultura(db: Tx, id: number | null): string | null {
  if (!id) return null;
  return db.select({ codigo: sepulturas.codigo }).from(sepulturas).where(eq(sepulturas.id, id)).get()?.codigo ?? null;
}

export function descricaoCobranca(c: Pick<LinhaCobranca, 'tipo' | 'ano'> & { sepulturaId?: number | null }, db?: Tx): string {
  if (c.tipo === 'anuidade') return `Anuidade ${c.ano}`;
  const codigo = c.tipo === 'compra_sepultura' && db ? codigoSepultura(db, c.sepulturaId ?? null) : null;
  return codigo ? `${ROTULO_TIPO_COBRANCA[c.tipo]} ${codigo}` : ROTULO_TIPO_COBRANCA[c.tipo];
}

function inserirAnuidade(tx: Tx, socioId: number, ano: number, valorCentavos: number, usuarioId: number | null) {
  return tx
    .insert(cobrancas)
    .values({ socioId, tipo: 'anuidade', ano, valorCentavos, vencimento: vencimentoAnuidade(ano), criadoPor: usuarioId })
    .returning()
    .get();
}

function anuidadeDoAno(tx: Tx, socioId: number, ano: number) {
  return tx
    .select()
    .from(cobrancas)
    .where(
      and(eq(cobrancas.socioId, socioId), eq(cobrancas.tipo, 'anuidade'), eq(cobrancas.ano, ano), ne(cobrancas.situacao, 'cancelada')),
    )
    .get();
}

export function previaGeracaoAnuidades(db: DB, ano: number) {
  const ativos = db.select({ id: socios.id }).from(socios).where(eq(socios.situacao, 'ativo')).all();
  const jaTem = new Set(
    db
      .select({ socioId: cobrancas.socioId })
      .from(cobrancas)
      .where(and(eq(cobrancas.tipo, 'anuidade'), eq(cobrancas.ano, ano), ne(cobrancas.situacao, 'cancelada')))
      .all()
      .map((c) => c.socioId),
  );
  return {
    ano,
    vencimento: vencimentoAnuidade(ano),
    valor_centavos: valorVigente(db, 'anuidade', ano),
    socios_ativos: ativos.length,
    ja_geradas: ativos.filter((s) => jaTem.has(s.id)).length,
    a_gerar: ativos.filter((s) => !jaTem.has(s.id)).length,
  };
}

/** Cria a anuidade do ano para todos os sócios ativos que ainda não a têm. */
export function gerarAnuidades(db: DB, ano: number, usuarioId: number) {
  return db.transaction((tx) => {
    const valor = exigirValor(tx, 'anuidade', ano);
    const ativos = tx.select({ id: socios.id }).from(socios).where(eq(socios.situacao, 'ativo')).all();
    let criadas = 0;
    for (const s of ativos) {
      if (!anuidadeDoAno(tx, s.id, ano)) {
        inserirAnuidade(tx, s.id, ano, valor, usuarioId);
        criadas++;
      }
    }
    registrarAuditoria(tx, { usuarioId, acao: 'gerar_anuidades', entidade: 'sistema', detalhes: { ano, valor, criadas } });
    return { ano, criadas, valor_centavos: valor };
  });
}

// ---------------- Anuidades avulsas de um sócio ----------------

/**
 * Valor para gerar a anuidade de um ano: o da tabela; se o ano ainda não tem valor
 * (ex.: sócio adiantando o ano que vem), usa o valor mais recente cadastrado.
 */
function valorParaAno(db: Tx, ano: number): { valor: number; origem: 'tabela' | 'ultimo_valor' } | null {
  const doAno = valorVigente(db, 'anuidade', ano);
  if (doAno !== null) return { valor: doAno, origem: 'tabela' };
  const ultimo = db
    .select({ valor: tabelaValores.valorCentavos })
    .from(tabelaValores)
    .where(eq(tabelaValores.tipo, 'anuidade'))
    .orderBy(desc(tabelaValores.ano))
    .get();
  return ultimo ? { valor: ultimo.valor, origem: 'ultimo_valor' } : null;
}

export function previaAnuidadesSocio(db: DB, socioId: number, de: number, ate: number): PreviaAnuidadeSocio[] {
  obterLinhaSocio(db, socioId);
  const lista: PreviaAnuidadeSocio[] = [];
  for (let ano = de; ano <= ate; ano++) {
    const existente = anuidadeDoAno(db, socioId, ano);
    const v = existente ? null : valorParaAno(db, ano);
    lista.push({
      ano,
      vencimento: vencimentoAnuidade(ano),
      existente: existente ? (existente.situacao as 'aberta' | 'paga') : null,
      valor_centavos: existente ? existente.valorCentavos : (v?.valor ?? null),
      origem: existente ? null : (v?.origem ?? null),
    });
  }
  return lista;
}

/** Gera as anuidades de um sócio para os anos escolhidos (para adiantar ou pagar vários de uma vez). */
export function gerarAnuidadesSocio(db: DB, socioId: number, de: number, ate: number, usuarioId: number) {
  return db.transaction((tx) => {
    const s = obterLinhaSocio(tx, socioId);
    if (s.situacao !== 'ativo') {
      throw requisicaoInvalida(
        s.situacao === 'pendente'
          ? 'O sócio precisa pagar a taxa de associação antes.'
          : 'Só é possível gerar anuidades para sócios ativos.',
      );
    }
    const criadas: number[] = [];
    const jaExistiam: number[] = [];
    for (let ano = de; ano <= ate; ano++) {
      if (anuidadeDoAno(tx, socioId, ano)) {
        jaExistiam.push(ano);
        continue;
      }
      const v = valorParaAno(tx, ano);
      if (!v) {
        throw new ErroApp(400, 'Não há valor de anuidade cadastrado. Cadastre em Administração → Valores e reajustes.', 'valor_nao_cadastrado');
      }
      inserirAnuidade(tx, socioId, ano, v.valor, usuarioId);
      criadas.push(ano);
    }
    if (criadas.length) {
      registrarAuditoria(tx, { usuarioId, acao: 'gerar_anuidades_socio', entidade: 'socio', entidadeId: socioId, detalhes: { anos: criadas } });
    }
    return { criadas, ja_existiam: jaExistiam };
  });
}

/** Gera a cobrança da taxa de associação (sócio novo ou renovação). */
export function criarCobrancaTaxa(tx: Tx, socioId: number, usuarioId: number): LinhaCobranca {
  const hoje = hojeLocal();
  const aberta = tx
    .select({ id: cobrancas.id })
    .from(cobrancas)
    .where(and(eq(cobrancas.socioId, socioId), eq(cobrancas.tipo, 'taxa_associacao'), eq(cobrancas.situacao, 'aberta')))
    .get();
  if (aberta) throw conflito('Já existe uma taxa de associação em aberto para este sócio.');
  const valor = exigirValor(tx, 'taxa_associacao', anoDe(hoje));
  const c = tx
    .insert(cobrancas)
    .values({ socioId, tipo: 'taxa_associacao', ano: anoDe(hoje), valorCentavos: valor, vencimento: hoje, criadoPor: usuarioId })
    .returning()
    .get();
  registrarAuditoria(tx, { usuarioId, acao: 'gerar_taxa_associacao', entidade: 'socio', entidadeId: socioId, detalhes: { cobranca: c.id, valor } });
  return c;
}

export function cobrarTaxaAssociacao(db: DB, socioId: number, usuarioId: number) {
  return db.transaction((tx) => {
    const s = obterLinhaSocio(tx, socioId);
    if (s.situacao === 'falecido') throw requisicaoInvalida('Sócio falecido não pode se associar.');
    if (s.situacao === 'ativo' && s.direitoSepultamento === 'disponivel') {
      throw requisicaoInvalida('Este sócio já está ativo e com os benefícios da associação garantidos.');
    }
    return paraCobranca(criarCobrancaTaxa(tx, socioId, usuarioId), null);
  });
}

export function cancelarCobranca(db: DB, id: number, motivo: string, usuarioId: number) {
  db.transaction((tx) => {
    const c = tx.select().from(cobrancas).where(eq(cobrancas.id, id)).get();
    if (!c) throw naoEncontrado('Cobrança');
    if (c.situacao !== 'aberta') throw requisicaoInvalida('Só é possível cancelar cobranças em aberto.');
    tx.update(cobrancas)
      .set({ situacao: 'cancelada', motivoCancelamento: motivo, canceladoEm: agoraIso(), canceladoPor: usuarioId })
      .where(eq(cobrancas.id, id))
      .run();
    // Venda cancelada: a sepultura volta a ficar disponível.
    if (c.tipo === 'compra_sepultura' && c.sepulturaId) liberarReserva(tx, c.sepulturaId);
    // Taxa cancelada: a sucessão que dependia dela também é cancelada.
    if (c.tipo === 'taxa_associacao') {
      tx.update(sucessoes)
        .set({ situacao: 'cancelada' })
        .where(and(eq(sucessoes.cobrancaTaxaId, id), eq(sucessoes.situacao, 'pendente')))
        .run();
    }
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'cancelar_cobranca',
      entidade: 'socio',
      entidadeId: c.socioId,
      detalhes: { cobranca: id, descricao: descricaoCobranca(c, tx), motivo },
    });
  });
}

/**
 * Exclui uma anuidade gerada por engano. Só se estiver em aberto e nunca tiver tido
 * pagamento (nem estornado) — senão o certo é "cancelar", que mantém o histórico.
 */
export function excluirCobranca(db: DB, id: number, usuarioId: number) {
  db.transaction((tx) => {
    const c = tx.select().from(cobrancas).where(eq(cobrancas.id, id)).get();
    if (!c) throw naoEncontrado('Cobrança');
    if (c.tipo !== 'anuidade') throw requisicaoInvalida('Só anuidades podem ser excluídas. Para as demais cobranças, use "cancelar".');
    if (c.situacao !== 'aberta') throw requisicaoInvalida('Só é possível excluir anuidades em aberto.');
    if (tx.select({ id: pagamentos.id }).from(pagamentos).where(eq(pagamentos.cobrancaId, id)).get()) {
      throw conflito('Esta anuidade já teve pagamento registrado (depois estornado). Use "cancelar" para manter o histórico.');
    }
    tx.delete(cobrancas).where(eq(cobrancas.id, id)).run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'excluir_cobranca',
      entidade: 'socio',
      entidadeId: c.socioId,
      detalhes: { descricao: descricaoCobranca(c), valor: c.valorCentavos },
    });
  });
}

function paraCobranca(c: LinhaCobranca, recebimentoId: number | null, hoje = hojeLocal(), db?: Tx): Cobranca {
  return {
    id: c.id,
    socio_id: c.socioId,
    tipo: c.tipo,
    ano: c.ano,
    descricao: descricaoCobranca(c, db),
    valor_centavos: c.valorCentavos,
    vencimento: c.vencimento,
    situacao: c.situacao,
    vencida: c.situacao === 'aberta' && c.vencimento < hoje,
    motivo_cancelamento: c.motivoCancelamento,
    recebimento_id: recebimentoId,
  };
}

// ---------------- Situação financeira ----------------

export function resumoFinanceiro(db: Tx, socioId: number, hoje = hojeLocal()): ResumoFinanceiro {
  const lista = db.select().from(cobrancas).where(and(eq(cobrancas.socioId, socioId), ne(cobrancas.situacao, 'cancelada'))).all();
  const vencidas = lista.filter((c) => c.situacao === 'aberta' && c.vencimento < hoje);
  const anuidades = lista.filter((c) => c.tipo === 'anuidade');
  const primeiraAberta = Math.min(...anuidades.filter((c) => c.situacao === 'aberta').map((c) => c.ano));
  const pagasAntes = anuidades.filter((c) => c.situacao === 'paga' && c.ano < primeiraAberta).map((c) => c.ano);
  return {
    em_dia: vencidas.length === 0,
    anos_pendentes: vencidas.filter((c) => c.tipo === 'anuidade').map((c) => c.ano).sort((a, b) => a - b),
    total_vencido_centavos: vencidas.reduce((t, c) => t + c.valorCentavos, 0),
    quitado_ate: pagasAntes.length ? Math.max(...pagasAntes) : null,
  };
}

export function financeiroDoSocio(db: DB, socioId: number): FinanceiroSocio {
  obterLinhaSocio(db, socioId);
  const hoje = hojeLocal();
  const pagosPor = new Map(
    db
      .select({ cobrancaId: pagamentos.cobrancaId, recebimentoId: pagamentos.recebimentoId })
      .from(pagamentos)
      .innerJoin(recebimentos, eq(recebimentos.id, pagamentos.recebimentoId))
      .innerJoin(cobrancas, eq(cobrancas.id, pagamentos.cobrancaId))
      .where(and(eq(cobrancas.socioId, socioId), sql`${recebimentos.estornadoEm} IS NULL`))
      .all()
      .map((p) => [p.cobrancaId, p.recebimentoId]),
  );
  const lista = db
    .select()
    .from(cobrancas)
    .where(eq(cobrancas.socioId, socioId))
    .orderBy(asc(sql`CASE ${cobrancas.situacao} WHEN 'aberta' THEN 0 WHEN 'paga' THEN 1 ELSE 2 END`), desc(cobrancas.ano), desc(cobrancas.id))
    .all();
  return {
    resumo: resumoFinanceiro(db, socioId, hoje),
    cobrancas: lista.map((c) => paraCobranca(c, pagosPor.get(c.id) ?? null, hoje, db)),
    recebimentos: listarRecebimentos(db, { socioId }),
  };
}

// ---------------- Recebimentos (pagamentos + recibo) ----------------

interface EfeitosTaxa {
  socioAntes: { situacao: string; direito: string; dataAssociacao: string | null };
  socioDepois: { situacao: string; direito: string; dataAssociacao: string | null };
  anuidadeGeradaId: number | null;
}

/** O que um pagamento mudou fora da própria cobrança (para o estorno desfazer). */
interface EfeitosPagamento {
  taxa?: EfeitosTaxa;
  venda?: EfeitosVenda;
  sucessao?: EfeitosSucessao;
}

function proximoNumeroRecibo(tx: Tx, ano: number) {
  const r = tx
    .select({ max: max(recebimentos.sequenciaRecibo) })
    .from(recebimentos)
    .where(eq(recebimentos.anoRecibo, ano))
    .get();
  const sequencia = (r?.max ?? 0) + 1;
  return { ano, sequencia, numero: `${ano}/${String(sequencia).padStart(6, '0')}` };
}

/** Código curto para o QR do recibo (sem letras que se confundem: 0/O, 1/I/L). */
function codigoVerificacao() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

/** Ao pagar a taxa: sócio fica ativo, recupera o direito e recebe a anuidade do ano. */
function aplicarEfeitosTaxa(tx: Tx, socioId: number, dataPagamento: string, usuarioId: number, avisos: string[]): EfeitosTaxa {
  const s = obterLinhaSocio(tx, socioId);
  const antes = { situacao: s.situacao, direito: s.direitoSepultamento, dataAssociacao: s.dataAssociacao };
  const depois = { situacao: 'ativo', direito: 'disponivel', dataAssociacao: dataPagamento };
  tx.update(socios)
    .set({ situacao: 'ativo', direitoSepultamento: 'disponivel', dataAssociacao: dataPagamento, atualizadoEm: agoraIso() })
    .where(eq(socios.id, socioId))
    .run();

  let anuidadeGeradaId: number | null = null;
  const ano = anoDe(dataPagamento);
  if (!anuidadeDoAno(tx, socioId, ano)) {
    const valor = valorVigente(tx, 'anuidade', ano);
    if (valor === null) {
      avisos.push(`A anuidade de ${ano} não foi gerada porque não há valor cadastrado para ${ano}.`);
    } else {
      anuidadeGeradaId = inserirAnuidade(tx, socioId, ano, valor, usuarioId).id;
    }
  }
  return { socioAntes: antes, socioDepois: depois, anuidadeGeradaId };
}

export function registrarRecebimento(
  db: DB,
  d: {
    socio_id: number;
    itens: { cobranca_id: number; desconto_centavos: number }[];
    forma: FormaPagamento;
    data_pagamento: string | null;
    observacao: string | null;
  },
  usuario: { id: number; perfil: Perfil },
): RecebimentoDetalhe {
  const hoje = hojeLocal();
  const dataPagamento = d.data_pagamento ?? hoje;
  if (dataPagamento > hoje) throw requisicaoInvalida('A data do pagamento não pode estar no futuro.');
  if (d.itens.some((i) => i.desconto_centavos > 0) && usuario.perfil !== 'admin') {
    throw proibido('Somente administradores podem dar desconto.');
  }
  const ids = d.itens.map((i) => i.cobranca_id);
  if (new Set(ids).size !== ids.length) throw requisicaoInvalida('Cobrança repetida no pagamento.');

  const avisos: string[] = [];
  const id = db.transaction((tx) => {
    obterLinhaSocio(tx, d.socio_id);
    const lista = tx.select().from(cobrancas).where(inArray(cobrancas.id, ids)).all();
    if (lista.length !== ids.length) throw naoEncontrado('Cobrança');
    const porId = new Map(lista.map((c) => [c.id, c]));
    for (const item of d.itens) {
      const c = porId.get(item.cobranca_id)!;
      if (c.socioId !== d.socio_id) throw requisicaoInvalida('A cobrança não pertence a este sócio.');
      if (c.situacao !== 'aberta') throw conflito(`${descricaoCobranca(c, tx)} já está ${c.situacao}.`, 'cobranca_nao_aberta');
      if (item.desconto_centavos > c.valorCentavos) throw requisicaoInvalida('O desconto não pode ser maior que o valor.');
    }

    const total = d.itens.reduce((t, i) => t + porId.get(i.cobranca_id)!.valorCentavos - i.desconto_centavos, 0);
    const recibo = proximoNumeroRecibo(tx, anoDe(hoje));
    const r = tx
      .insert(recebimentos)
      .values({
        socioId: d.socio_id,
        anoRecibo: recibo.ano,
        sequenciaRecibo: recibo.sequencia,
        numeroRecibo: recibo.numero,
        codigoVerificacao: codigoVerificacao(),
        dataPagamento,
        forma: d.forma,
        totalCentavos: total,
        observacao: d.observacao,
        registradoPor: usuario.id,
      })
      .returning()
      .get();

    // Taxa primeiro: se ela gerar a anuidade do ano, a anuidade fica em aberto para o próximo pagamento.
    const ordenados = [...d.itens].sort((a, b) => Number(porId.get(b.cobranca_id)!.tipo === 'taxa_associacao') - Number(porId.get(a.cobranca_id)!.tipo === 'taxa_associacao'));
    for (const item of ordenados) {
      const c = porId.get(item.cobranca_id)!;
      const efeitos: EfeitosPagamento = {};
      if (c.tipo === 'taxa_associacao') {
        efeitos.taxa = aplicarEfeitosTaxa(tx, d.socio_id, dataPagamento, usuario.id, avisos);
        // Familiar assumindo as sepulturas de um sócio falecido.
        const suc = concluirSucessaoPelaTaxa(tx, c.id, dataPagamento);
        if (suc) {
          efeitos.sucessao = suc;
          avisos.push(`${suc.transferencias.length} sepultura(s) transferida(s) para este sócio (sucessão).`);
        }
      }
      if (c.tipo === 'compra_sepultura') efeitos.venda = aplicarEfeitosVenda(tx, c, dataPagamento) ?? undefined;
      tx.insert(pagamentos)
        .values({
          recebimentoId: r.id,
          cobrancaId: c.id,
          valorCentavos: c.valorCentavos,
          descontoCentavos: item.desconto_centavos,
          pagoCentavos: c.valorCentavos - item.desconto_centavos,
          efeitos: Object.keys(efeitos).length ? JSON.stringify(efeitos) : null,
        })
        .run();
      tx.update(cobrancas).set({ situacao: 'paga' }).where(eq(cobrancas.id, c.id)).run();
    }

    registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: 'registrar_pagamento',
      entidade: 'socio',
      entidadeId: d.socio_id,
      detalhes: {
        recibo: recibo.numero,
        total,
        forma: d.forma,
        itens: d.itens.map((i) => ({ cobranca: descricaoCobranca(porId.get(i.cobranca_id)!, tx), desconto: i.desconto_centavos || undefined })),
      },
    });
    return r.id;
  });
  return { ...obterRecebimento(db, id), avisos };
}

/** Lança anuidades antigas já pagas (digitação das fichas em papel). Não gera recibo. */
export function lancarAnuidadesAntigas(
  db: DB,
  socioId: number,
  d: { ano_inicial: number; ano_final: number; valor_centavos: number; data_pagamento: string | null; observacao: string | null },
  usuarioId: number,
) {
  const hoje = hojeLocal();
  if (d.data_pagamento && d.data_pagamento > hoje) throw requisicaoInvalida('A data do pagamento não pode estar no futuro.');
  if (d.ano_final > anoDe(hoje)) throw requisicaoInvalida('Só é possível lançar anuidades até o ano atual.');

  return db.transaction((tx) => {
    obterLinhaSocio(tx, socioId);
    const lancados: number[] = [];
    const jaPagos: number[] = [];
    const itens: { c: LinhaCobranca }[] = [];
    for (let ano = d.ano_inicial; ano <= d.ano_final; ano++) {
      const existente = anuidadeDoAno(tx, socioId, ano);
      if (existente?.situacao === 'paga') {
        jaPagos.push(ano);
        continue;
      }
      itens.push({ c: existente ?? inserirAnuidade(tx, socioId, ano, d.valor_centavos, usuarioId) });
      lancados.push(ano);
    }
    if (itens.length === 0) return { lancados, ja_pagos: jaPagos };

    const r = tx
      .insert(recebimentos)
      .values({
        socioId,
        dataPagamento: d.data_pagamento ?? vencimentoAnuidade(d.ano_final),
        forma: 'outro',
        totalCentavos: itens.reduce((t, { c }) => t + c.valorCentavos, 0),
        observacao: d.observacao ?? 'Lançamento de anuidades antigas (ficha em papel)',
        historico: true,
        registradoPor: usuarioId,
      })
      .returning()
      .get();
    for (const { c } of itens) {
      tx.insert(pagamentos)
        .values({ recebimentoId: r.id, cobrancaId: c.id, valorCentavos: c.valorCentavos, pagoCentavos: c.valorCentavos })
        .run();
      tx.update(cobrancas).set({ situacao: 'paga' }).where(eq(cobrancas.id, c.id)).run();
    }
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'lancar_anuidades_antigas',
      entidade: 'socio',
      entidadeId: socioId,
      detalhes: { anos: lancados, ja_pagos: jaPagos, valor_por_ano: d.valor_centavos },
    });
    return { lancados, ja_pagos: jaPagos };
  });
}

/** Desfaz um recebimento: cobranças voltam a ficar em aberto e o efeito da taxa é revertido. */
export function estornarRecebimento(db: DB, id: number, motivo: string, usuarioId: number) {
  db.transaction((tx) => {
    const r = tx.select().from(recebimentos).where(eq(recebimentos.id, id)).get();
    if (!r) throw naoEncontrado('Recebimento');
    if (r.estornadoEm) throw conflito('Este pagamento já foi estornado.');
    const itens = tx.select().from(pagamentos).where(eq(pagamentos.recebimentoId, id)).all();

    for (const p of itens) {
      tx.update(cobrancas).set({ situacao: 'aberta' }).where(eq(cobrancas.id, p.cobrancaId)).run();
      if (!p.efeitos) continue;
      const todos = JSON.parse(p.efeitos) as EfeitosPagamento & Partial<EfeitosTaxa>;
      if (todos.sucessao) desfazerSucessao(tx, todos.sucessao);
      if (todos.venda) desfazerEfeitosVenda(tx, todos.venda);
      // Compatível com o formato antigo (Fase 2), em que o JSON era só o efeito da taxa.
      const ef = todos.taxa ?? (todos.socioAntes ? (todos as EfeitosTaxa) : null);
      if (!ef) continue;
      if (ef.anuidadeGeradaId) {
        const gerada = tx.select().from(cobrancas).where(eq(cobrancas.id, ef.anuidadeGeradaId)).get();
        if (gerada?.situacao === 'aberta') {
          tx.update(cobrancas)
            .set({ situacao: 'cancelada', motivoCancelamento: 'Estorno da taxa de associação', canceladoEm: agoraIso(), canceladoPor: usuarioId })
            .where(eq(cobrancas.id, gerada.id))
            .run();
        }
      }
      // Só desfaz no sócio se ninguém mexeu na situação depois do pagamento.
      const s = obterLinhaSocio(tx, r.socioId);
      if (
        s.situacao === ef.socioDepois.situacao &&
        s.direitoSepultamento === ef.socioDepois.direito &&
        s.dataAssociacao === ef.socioDepois.dataAssociacao
      ) {
        tx.update(socios)
          .set({
            situacao: ef.socioAntes.situacao as typeof s.situacao,
            direitoSepultamento: ef.socioAntes.direito as typeof s.direitoSepultamento,
            dataAssociacao: ef.socioAntes.dataAssociacao,
            atualizadoEm: agoraIso(),
          })
          .where(eq(socios.id, r.socioId))
          .run();
      }
    }
    tx.update(recebimentos)
      .set({ estornadoEm: agoraIso(), estornadoPor: usuarioId, motivoEstorno: motivo })
      .where(eq(recebimentos.id, id))
      .run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'estornar_pagamento',
      entidade: 'socio',
      entidadeId: r.socioId,
      detalhes: { recibo: r.numeroRecibo, total: r.totalCentavos, motivo },
    });
  });
}

export function registrarImpressao(db: DB, id: number, usuarioId: number): number {
  return db.transaction((tx) => {
    const r = tx.select().from(recebimentos).where(eq(recebimentos.id, id)).get();
    if (!r) throw naoEncontrado('Recebimento');
    if (!r.numeroRecibo) throw requisicaoInvalida('Lançamentos antigos não têm recibo.');
    if (r.estornadoEm) throw requisicaoInvalida('Este pagamento foi estornado; o recibo não pode ser impresso.');
    const via = r.viasImpressas + 1;
    tx.update(recebimentos).set({ viasImpressas: via }).where(eq(recebimentos.id, id)).run();
    if (via > 1) {
      registrarAuditoria(tx, { usuarioId, acao: 'reimprimir_recibo', entidade: 'socio', entidadeId: r.socioId, detalhes: { recibo: r.numeroRecibo, via } });
    }
    return via;
  });
}

// ---------------- Consultas ----------------

function itensDosRecebimentos(db: Tx, ids: number[]) {
  if (ids.length === 0) return new Map<number, { cobranca: LinhaCobranca; pagamento: typeof pagamentos.$inferSelect }[]>();
  const linhas = db
    .select({ pagamento: pagamentos, cobranca: cobrancas })
    .from(pagamentos)
    .innerJoin(cobrancas, eq(cobrancas.id, pagamentos.cobrancaId))
    .where(inArray(pagamentos.recebimentoId, ids))
    .orderBy(asc(cobrancas.tipo), asc(cobrancas.ano))
    .all();
  const mapa = new Map<number, typeof linhas>();
  for (const l of linhas) {
    const lista = mapa.get(l.pagamento.recebimentoId) ?? [];
    lista.push(l);
    mapa.set(l.pagamento.recebimentoId, lista);
  }
  return mapa;
}

/** "Anuidades 2024, 2025 · Taxa de associação" */
function descricaoItens(itens: { cobranca: LinhaCobranca }[], db?: Tx): string {
  const anos = itens.filter((i) => i.cobranca.tipo === 'anuidade').map((i) => i.cobranca.ano);
  const partes: string[] = [];
  if (anos.length) partes.push(`${anos.length > 1 ? 'Anuidades' : 'Anuidade'} ${anos.join(', ')}`);
  for (const i of itens) if (i.cobranca.tipo !== 'anuidade') partes.push(descricaoCobranca(i.cobranca, db));
  return partes.join(' · ');
}

export function listarRecebimentos(
  db: DB,
  f: { socioId?: number; de?: string; ate?: string; limite?: number; registradoNoDia?: string },
): RecebimentoResumo[] {
  const cond: SQL[] = [];
  // Dia em que foi registrado no balcão (fuso do computador) — usado no fechamento de caixa.
  if (f.registradoNoDia) cond.push(sql`date(${recebimentos.registradoEm}, 'localtime') = ${f.registradoNoDia}`);
  if (f.socioId) cond.push(eq(recebimentos.socioId, f.socioId));
  if (f.de) cond.push(gte(recebimentos.dataPagamento, f.de));
  if (f.ate) cond.push(lte(recebimentos.dataPagamento, f.ate));
  const linhas = db
    .select({ r: recebimentos, socioNome: socios.nomeCompleto, socioMatricula: socios.matricula, usuarioNome: usuarios.nome })
    .from(recebimentos)
    .innerJoin(socios, eq(socios.id, recebimentos.socioId))
    .leftJoin(usuarios, eq(usuarios.id, recebimentos.registradoPor))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(recebimentos.dataPagamento), desc(recebimentos.id))
    .limit(f.limite ?? 500)
    .all();
  const itens = itensDosRecebimentos(db, linhas.map((l) => l.r.id));
  return linhas.map(({ r, socioNome, socioMatricula, usuarioNome }) => ({
    id: r.id,
    numero: r.numeroRecibo,
    socio_id: r.socioId,
    socio_nome: socioNome,
    socio_matricula: socioMatricula,
    data_pagamento: r.dataPagamento,
    forma: r.forma,
    total_centavos: r.totalCentavos,
    descricao: descricaoItens(itens.get(r.id) ?? [], db),
    historico: r.historico,
    estornado: r.estornadoEm !== null,
    registrado_por: usuarioNome,
    registrado_em: r.registradoEm,
  }));
}

export function obterRecebimento(db: DB, id: number): RecebimentoDetalhe {
  const linha = db
    .select({ r: recebimentos, socio: socios, usuarioNome: usuarios.nome })
    .from(recebimentos)
    .innerJoin(socios, eq(socios.id, recebimentos.socioId))
    .leftJoin(usuarios, eq(usuarios.id, recebimentos.registradoPor))
    .where(eq(recebimentos.id, id))
    .get();
  if (!linha) throw naoEncontrado('Recebimento');
  const { r, socio, usuarioNome } = linha;
  const itens = itensDosRecebimentos(db, [id]).get(id) ?? [];
  return {
    id: r.id,
    numero: r.numeroRecibo,
    socio_id: r.socioId,
    socio_nome: socio.nomeCompleto,
    socio_matricula: socio.matricula,
    socio_token_publico: socio.tokenPublico,
    data_pagamento: r.dataPagamento,
    forma: r.forma,
    total_centavos: r.totalCentavos,
    descricao: descricaoItens(itens, db),
    historico: r.historico,
    estornado: r.estornadoEm !== null,
    estornado_em: r.estornadoEm,
    motivo_estorno: r.motivoEstorno,
    registrado_por: usuarioNome,
    registrado_em: r.registradoEm,
    observacao: r.observacao,
    codigo_verificacao: r.codigoVerificacao,
    vias_impressas: r.viasImpressas,
    itens: itens.map(({ cobranca, pagamento }) => ({
      cobranca_id: cobranca.id,
      descricao: descricaoCobranca(cobranca, db),
      valor_centavos: pagamento.valorCentavos,
      desconto_centavos: pagamento.descontoCentavos,
      pago_centavos: pagamento.pagoCentavos,
    })),
    resumo_atual: resumoFinanceiro(db, r.socioId),
  };
}

/** Totais por ano de anuidade (para a tela Financeiro). */
export function resumoAnuidadesPorAno(db: DB) {
  return db
    .select({
      ano: cobrancas.ano,
      total: sql<number>`count(*)`,
      pagas: sql<number>`sum(CASE WHEN ${cobrancas.situacao} = 'paga' THEN 1 ELSE 0 END)`,
      abertas: sql<number>`sum(CASE WHEN ${cobrancas.situacao} = 'aberta' THEN 1 ELSE 0 END)`,
      valor_aberto_centavos: sql<number>`sum(CASE WHEN ${cobrancas.situacao} = 'aberta' THEN ${cobrancas.valorCentavos} ELSE 0 END)`,
    })
    .from(cobrancas)
    .where(and(eq(cobrancas.tipo, 'anuidade'), ne(cobrancas.situacao, 'cancelada')))
    .groupBy(cobrancas.ano)
    .orderBy(desc(cobrancas.ano))
    .limit(15)
    .all();
}
