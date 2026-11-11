import { and, asc, desc, eq, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import path from 'node:path';
import {
  normalizarTexto,
  type FotoSepultura,
  type SepulturaDetalhe,
  type SepulturaResumo,
  type SituacaoSepultura,
  type TipoSepultura,
} from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import {
  cobrancas,
  sepulturaFotos,
  sepulturas,
  sepulturaTitulares,
  sepultamentos,
  setores,
  socios,
} from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, naoEncontrado, requisicaoInvalida } from '../../shared/erros.js';
import { pastaUploads, salvarImagem } from '../../shared/imagens.js';
import { agoraIso, hojeLocal } from '../../shared/tempo.js';
import { obterLinhaSocio } from '../socios/service.js';
import { listarSepultados } from '../sepultamentos/service.js';

type Tx = Pick<DB, 'select' | 'insert' | 'update' | 'delete'>;
type LinhaSepultura = typeof sepulturas.$inferSelect;

// ---------------- Consultas ----------------

const colunasResumo = {
  id: sepulturas.id,
  codigo: sepulturas.codigo,
  setor_nome: setores.nome,
  tipo: sepulturas.tipo,
  capacidade: sepulturas.capacidade,
  situacao: sepulturas.situacao,
  referencia: sepulturas.referencia,
  socio_id: sepulturas.socioId,
  socio_nome: socios.nomeCompleto,
  socio_matricula: socios.matricula,
  // Nomes qualificados à mão (ver comentário em socios/service.ts).
  // Exumados não ocupam mais o lugar.
  ocupacao: sql<number>`(SELECT count(*) FROM sepultamentos x WHERE x.sepultura_id = sepulturas.id AND x.exumado_em IS NULL)`,
  qtd_fotos: sql<number>`(SELECT count(*) FROM sepultura_fotos f WHERE f.sepultura_id = sepulturas.id)`,
  tem_localizacao: sql<number>`(${sepulturas.latitude} IS NOT NULL)`,
};

export function listarSepulturas(
  db: Tx,
  f: { busca?: string; situacao?: SituacaoSepultura; socioId?: number } = {},
): SepulturaResumo[] {
  const cond: SQL[] = [];
  if (f.situacao) cond.push(eq(sepulturas.situacao, f.situacao));
  if (f.socioId) cond.push(eq(sepulturas.socioId, f.socioId));
  const termo = f.busca?.trim();
  if (termo) {
    const n = normalizarTexto(termo);
    cond.push(
      or(
        like(sepulturas.codigo, `%${termo.toUpperCase()}%`),
        like(sql`lower(${sepulturas.referencia})`, `%${termo.toLowerCase()}%`),
        like(socios.nomeNormalizado, `%${n}%`),
        like(sql`lower(${setores.nome})`, `%${termo.toLowerCase()}%`),
        sql`EXISTS (SELECT 1 FROM sepultamentos x WHERE x.sepultura_id = sepulturas.id AND x.nome_normalizado LIKE ${`%${n}%`})`,
      )!,
    );
  }
  return db
    .select(colunasResumo)
    .from(sepulturas)
    .leftJoin(socios, eq(socios.id, sepulturas.socioId))
    .leftJoin(setores, eq(setores.id, sepulturas.setorId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(asc(sepulturas.codigo))
    .limit(2000)
    .all()
    .map((s) => ({ ...s, tem_localizacao: Boolean(s.tem_localizacao) }));
}

export function obterLinhaSepultura(db: Pick<DB, 'select'>, id: number): LinhaSepultura {
  const s = db.select().from(sepulturas).where(eq(sepulturas.id, id)).get();
  if (!s) throw naoEncontrado('Sepultura');
  return s;
}

export function obterSepultura(db: DB, id: number): SepulturaDetalhe {
  const s = obterLinhaSepultura(db, id);
  const resumo = listarSepulturas(db).find((x) => x.id === id)!;
  const titulares = db
    .select({
      socio_id: sepulturaTitulares.socioId,
      socio_nome: socios.nomeCompleto,
      inicio: sepulturaTitulares.inicio,
      fim: sepulturaTitulares.fim,
      motivo: sepulturaTitulares.motivo,
      observacao: sepulturaTitulares.observacao,
    })
    .from(sepulturaTitulares)
    .innerJoin(socios, eq(socios.id, sepulturaTitulares.socioId))
    .where(eq(sepulturaTitulares.sepulturaId, id))
    .orderBy(desc(sepulturaTitulares.inicio), desc(sepulturaTitulares.id))
    .all();
  const venda = db
    .select({ cobranca_id: cobrancas.id, socio_id: cobrancas.socioId, socio_nome: socios.nomeCompleto, valor_centavos: cobrancas.valorCentavos })
    .from(cobrancas)
    .innerJoin(socios, eq(socios.id, cobrancas.socioId))
    .where(and(eq(cobrancas.sepulturaId, id), eq(cobrancas.tipo, 'compra_sepultura'), eq(cobrancas.situacao, 'aberta')))
    .get();
  return {
    ...resumo,
    data_aquisicao: s.dataAquisicao,
    observacoes: s.observacoes,
    latitude: s.latitude,
    longitude: s.longitude,
    sepultados: listarSepultados(db, { sepulturaId: id }),
    titulares,
    reserva: venda ?? null,
  };
}

/** Quantas pessoas estão na sepultura agora (sem contar as exumadas). */
export function ocupacaoAtual(db: Pick<DB, 'select'>, sepulturaId: number): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(sepultamentos)
    .where(and(eq(sepultamentos.sepulturaId, sepulturaId), isNull(sepultamentos.exumadoEm)))
    .get()!.n;
}

/** Recalcula a situação da sepultura depois de sepultamento, exumação ou exclusão de registro. */
export function recalcularSituacao(tx: Tx, sepulturaId: number) {
  const s = obterLinhaSepultura(tx, sepulturaId);
  let situacao: SituacaoSepultura;
  if (ocupacaoAtual(tx, sepulturaId) > 0) situacao = 'ocupada';
  else if (s.socioId) situacao = 'vendida';
  else {
    const venda = tx
      .select({ id: cobrancas.id })
      .from(cobrancas)
      .where(and(eq(cobrancas.sepulturaId, sepulturaId), eq(cobrancas.tipo, 'compra_sepultura'), eq(cobrancas.situacao, 'aberta')))
      .get();
    situacao = venda ? 'reservada' : 'disponivel';
  }
  if (situacao !== s.situacao) {
    tx.update(sepulturas).set({ situacao, atualizadoEm: agoraIso() }).where(eq(sepulturas.id, sepulturaId)).run();
  }
}

export function proximoCodigo(db: Pick<DB, 'select'>): string {
  const r = db
    .select({ max: sql<number | null>`max(CAST(substr(${sepulturas.codigo}, 3) AS INTEGER))` })
    .from(sepulturas)
    .where(sql`${sepulturas.codigo} GLOB 'S-[0-9]*'`)
    .get();
  return `S-${String((r?.max ?? 0) + 1).padStart(4, '0')}`;
}

// ---------------- Cadastro ----------------

interface DadosSepultura {
  codigo: string | null;
  tipo: TipoSepultura;
  capacidade: number;
  referencia: string | null;
  observacoes: string | null;
}

function garantirCodigoUnico(db: Pick<DB, 'select'>, codigo: string, ignorarId?: number) {
  const outro = db.select({ id: sepulturas.id }).from(sepulturas).where(eq(sepulturas.codigo, codigo)).get();
  if (outro && outro.id !== ignorarId) throw conflito(`Já existe a sepultura ${codigo}.`, 'codigo_duplicado');
}

/** Registra um novo titular no histórico (fechando o anterior) e atualiza a sepultura. */
export function trocarTitular(
  tx: Tx,
  sepulturaId: number,
  socioId: number | null,
  motivo: 'cadastro' | 'compra' | 'sucessao' | 'transferencia',
  data: string,
  observacao: string | null = null,
): { fechadoId: number | null; novoId: number | null } {
  const atual = tx
    .select()
    .from(sepulturaTitulares)
    .where(and(eq(sepulturaTitulares.sepulturaId, sepulturaId), isNull(sepulturaTitulares.fim)))
    .get();
  if (atual) tx.update(sepulturaTitulares).set({ fim: data }).where(eq(sepulturaTitulares.id, atual.id)).run();
  const novo = socioId
    ? tx.insert(sepulturaTitulares).values({ sepulturaId, socioId, inicio: data, motivo, observacao }).returning().get()
    : null;
  const s = obterLinhaSepultura(tx, sepulturaId);
  const ocupada = ocupacaoAtual(tx, sepulturaId) > 0;
  const situacao: SituacaoSepultura = ocupada ? 'ocupada' : socioId ? 'vendida' : 'disponivel';
  tx.update(sepulturas)
    .set({
      socioId,
      situacao,
      dataAquisicao: socioId ? (motivo === 'compra' || motivo === 'cadastro' ? data : s.dataAquisicao) : null,
      atualizadoEm: agoraIso(),
    })
    .where(eq(sepulturas.id, sepulturaId))
    .run();
  return { fechadoId: atual?.id ?? null, novoId: novo?.id ?? null };
}

/** Desfaz uma troca de titular (usado em estornos). */
export function desfazerTrocaTitular(
  tx: Tx,
  sepulturaId: number,
  troca: { fechadoId: number | null; novoId: number | null },
  antes: { socioId: number | null; situacao: SituacaoSepultura; dataAquisicao: string | null },
) {
  if (troca.novoId) tx.delete(sepulturaTitulares).where(eq(sepulturaTitulares.id, troca.novoId)).run();
  if (troca.fechadoId) tx.update(sepulturaTitulares).set({ fim: null }).where(eq(sepulturaTitulares.id, troca.fechadoId)).run();
  tx.update(sepulturas)
    .set({ socioId: antes.socioId, situacao: antes.situacao, dataAquisicao: antes.dataAquisicao, atualizadoEm: agoraIso() })
    .where(eq(sepulturas.id, sepulturaId))
    .run();
}

export function criarSepultura(
  db: DB,
  d: DadosSepultura & { socio_id?: number | null; data_aquisicao: string | null },
  usuarioId: number,
): SepulturaDetalhe {
  const id = db.transaction((tx) => {
    const codigo = (d.codigo ?? proximoCodigo(tx)).toUpperCase();
    garantirCodigoUnico(tx, codigo);
    if (d.socio_id) {
      const socio = obterLinhaSocio(tx, d.socio_id);
      if (socio.situacao === 'falecido') throw requisicaoInvalida('O titular não pode ser um sócio falecido.');
    }
    const s = tx
      .insert(sepulturas)
      .values({ codigo, tipo: d.tipo, capacidade: d.capacidade, referencia: d.referencia, observacoes: d.observacoes })
      .returning()
      .get();
    // Sepultura que já era de alguém antes do sistema: registra o titular sem cobrança.
    if (d.socio_id) trocarTitular(tx, s.id, d.socio_id, 'cadastro', d.data_aquisicao ?? hojeLocal());
    registrarAuditoria(tx, { usuarioId, acao: 'criar', entidade: 'sepultura', entidadeId: s.id, detalhes: { codigo, titular: d.socio_id ?? null } });
    return s.id;
  });
  return obterSepultura(db, id);
}

export function atualizarSepultura(db: DB, id: number, d: DadosSepultura, usuarioId: number): SepulturaDetalhe {
  db.transaction((tx) => {
    const antes = obterLinhaSepultura(tx, id);
    const codigo = (d.codigo ?? antes.codigo).toUpperCase();
    garantirCodigoUnico(tx, codigo, id);
    const ocupacao = ocupacaoAtual(tx, id);
    if (d.capacidade < ocupacao) throw requisicaoInvalida(`A sepultura já tem ${ocupacao} sepultado(s).`);
    tx.update(sepulturas)
      .set({ codigo, tipo: d.tipo, capacidade: d.capacidade, referencia: d.referencia, observacoes: d.observacoes, atualizadoEm: agoraIso() })
      .where(eq(sepulturas.id, id))
      .run();
    registrarAuditoria(tx, { usuarioId, acao: 'atualizar', entidade: 'sepultura', entidadeId: id, detalhes: { ...d, codigo } });
  });
  return obterSepultura(db, id);
}

/** Exclui sepultura cadastrada por engano. Devolve os arquivos de foto para apagar. */
export function excluirSepultura(db: DB, id: number, usuarioId: number): string[] {
  return db.transaction((tx) => {
    const s = obterLinhaSepultura(tx, id);
    if (tx.select({ id: sepultamentos.id }).from(sepultamentos).where(eq(sepultamentos.sepulturaId, id)).get()) {
      throw conflito('Esta sepultura tem sepultamentos registrados e não pode ser excluída.');
    }
    if (tx.select({ id: cobrancas.id }).from(cobrancas).where(and(eq(cobrancas.sepulturaId, id), sql`${cobrancas.situacao} <> 'cancelada'`)).get()) {
      throw conflito('Esta sepultura tem cobrança de venda. Cancele ou estorne antes de excluir.');
    }
    const fotos = tx.select().from(sepulturaFotos).where(eq(sepulturaFotos.sepulturaId, id)).all();
    tx.delete(sepulturaTitulares).where(eq(sepulturaTitulares.sepulturaId, id)).run();
    tx.delete(sepulturas).where(eq(sepulturas.id, id)).run();
    registrarAuditoria(tx, { usuarioId, acao: 'excluir', entidade: 'sepultura', entidadeId: id, detalhes: { codigo: s.codigo } });
    return fotos.flatMap((f) => [f.arquivo, f.miniatura]);
  });
}

// ---------------- Venda e titularidade ----------------

/** Inicia a venda: gera a cobrança de compra e reserva a sepultura até o pagamento. */
export function iniciarVenda(db: DB, sepulturaId: number, socioId: number, valorCentavos: number, usuarioId: number) {
  db.transaction((tx) => {
    const s = obterLinhaSepultura(tx, sepulturaId);
    if (s.situacao !== 'disponivel') throw conflito(`A sepultura ${s.codigo} não está disponível.`);
    const socio = obterLinhaSocio(tx, socioId);
    if (socio.situacao === 'falecido') throw requisicaoInvalida('Não é possível vender para um sócio falecido.');
    const hoje = hojeLocal();
    const c = tx
      .insert(cobrancas)
      .values({
        socioId,
        tipo: 'compra_sepultura',
        ano: Number(hoje.slice(0, 4)),
        valorCentavos,
        vencimento: hoje,
        sepulturaId,
        criadoPor: usuarioId,
      })
      .returning()
      .get();
    tx.update(sepulturas).set({ situacao: 'reservada', atualizadoEm: agoraIso() }).where(eq(sepulturas.id, sepulturaId)).run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'iniciar_venda',
      entidade: 'sepultura',
      entidadeId: sepulturaId,
      detalhes: { codigo: s.codigo, socio: socio.nomeCompleto, valor: valorCentavos, cobranca: c.id },
    });
  });
}

export interface EfeitosVenda {
  sepulturaId: number;
  antes: { socioId: number | null; situacao: SituacaoSepultura; dataAquisicao: string | null };
  troca: { fechadoId: number | null; novoId: number | null };
}

/** Pagamento da compra: o sócio vira titular. */
export function aplicarEfeitosVenda(tx: Tx, c: typeof cobrancas.$inferSelect, dataPagamento: string): EfeitosVenda | null {
  if (!c.sepulturaId) return null;
  const s = obterLinhaSepultura(tx, c.sepulturaId);
  const antes = { socioId: s.socioId, situacao: s.situacao, dataAquisicao: s.dataAquisicao };
  const troca = trocarTitular(tx, s.id, c.socioId, 'compra', dataPagamento);
  return { sepulturaId: s.id, antes, troca };
}

export function desfazerEfeitosVenda(tx: Tx, ef: EfeitosVenda) {
  // "antes" é o estado no momento do pagamento (normalmente "reservada"): a cobrança volta a ficar em aberto.
  desfazerTrocaTitular(tx, ef.sepulturaId, ef.troca, ef.antes);
}

/** Cobrança de compra cancelada: a sepultura volta a ficar disponível. */
export function liberarReserva(tx: Tx, sepulturaId: number) {
  const s = obterLinhaSepultura(tx, sepulturaId);
  if (s.situacao === 'reservada') {
    tx.update(sepulturas).set({ situacao: 'disponivel', atualizadoEm: agoraIso() }).where(eq(sepulturas.id, sepulturaId)).run();
  }
}

/** Transferência manual de titularidade (administrador). */
export function transferirSepultura(db: DB, sepulturaId: number, socioId: number | null, motivo: string, usuarioId: number) {
  db.transaction((tx) => {
    const s = obterLinhaSepultura(tx, sepulturaId);
    if (s.situacao === 'reservada') throw conflito('Há uma venda em andamento. Cancele a cobrança de compra antes.');
    if (s.socioId === socioId) throw requisicaoInvalida('Esse já é o titular atual.');
    let nome: string | null = null;
    if (socioId) {
      const novo = obterLinhaSocio(tx, socioId);
      if (novo.situacao === 'falecido') throw requisicaoInvalida('O novo titular não pode ser um sócio falecido.');
      nome = novo.nomeCompleto;
    }
    trocarTitular(tx, sepulturaId, socioId, 'transferencia', hojeLocal(), motivo);
    registrarAuditoria(tx, {
      usuarioId,
      acao: 'transferir_titularidade',
      entidade: 'sepultura',
      entidadeId: sepulturaId,
      detalhes: { codigo: s.codigo, de: s.socioId, para: socioId, para_nome: nome, motivo },
    });
  });
}

// ---------------- Fotos ----------------

export function listarFotos(db: DB, sepulturaId: number): FotoSepultura[] {
  return db
    .select({ id: sepulturaFotos.id, legenda: sepulturaFotos.legenda, criado_em: sepulturaFotos.criadoEm })
    .from(sepulturaFotos)
    .where(eq(sepulturaFotos.sepulturaId, sepulturaId))
    .orderBy(desc(sepulturaFotos.criadoEm))
    .all();
}

export async function salvarFoto(db: DB, dataDir: string, sepulturaId: number, arquivo: Buffer, legenda: string | null, usuarioId: number) {
  const s = obterLinhaSepultura(db, sepulturaId);
  const salvo = await salvarImagem(dataDir, path.join('sepulturas', String(sepulturaId)), arquivo);
  const f = db.insert(sepulturaFotos).values({ sepulturaId, legenda, ...salvo, criadoPor: usuarioId }).returning().get();
  registrarAuditoria(db, { usuarioId, acao: 'anexar_foto', entidade: 'sepultura', entidadeId: sepulturaId, detalhes: { codigo: s.codigo, foto: f.id } });
  return { id: f.id, legenda: f.legenda, criado_em: f.criadoEm };
}

export function caminhoFoto(db: DB, dataDir: string, id: number, miniatura: boolean) {
  const f = db.select().from(sepulturaFotos).where(eq(sepulturaFotos.id, id)).get();
  if (!f) throw naoEncontrado('Foto');
  return path.join(pastaUploads(dataDir), miniatura ? f.miniatura : f.arquivo);
}

export function excluirFoto(db: DB, id: number, usuarioId: number): string[] {
  const f = db.select().from(sepulturaFotos).where(eq(sepulturaFotos.id, id)).get();
  if (!f) throw naoEncontrado('Foto');
  db.delete(sepulturaFotos).where(eq(sepulturaFotos.id, id)).run();
  registrarAuditoria(db, { usuarioId, acao: 'excluir_foto', entidade: 'sepultura', entidadeId: f.sepulturaId, detalhes: { foto: id } });
  return [f.arquivo, f.miniatura];
}

