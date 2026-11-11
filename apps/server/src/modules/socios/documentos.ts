import { eq, desc } from 'drizzle-orm';
import path from 'node:path';
import type { DocumentoSocio } from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { socioDocumentos } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { naoEncontrado } from '../../shared/erros.js';
import { apagarArquivos, pastaUploads, salvarImagem } from '../../shared/imagens.js';
import { obterLinhaSocio } from './service.js';


type LinhaDoc = typeof socioDocumentos.$inferSelect;

const paraDocumento = (d: LinhaDoc): DocumentoSocio => ({
  id: d.id,
  socio_id: d.socioId,
  tipo: d.tipo,
  legenda: d.legenda,
  criado_em: d.criadoEm,
});

export { apagarArquivos, pastaUploads };

export function listarDocumentos(db: DB, socioId: number): DocumentoSocio[] {
  return db
    .select()
    .from(socioDocumentos)
    .where(eq(socioDocumentos.socioId, socioId))
    .orderBy(desc(socioDocumentos.criadoEm))
    .all()
    .map(paraDocumento);
}

/** Grava a foto (ficha em papel etc.) do sócio. */
export async function salvarDocumento(
  db: DB,
  dataDir: string,
  socioId: number,
  arquivo: Buffer,
  meta: { tipo: 'ficha' | 'outro'; legenda: string | null },
  usuarioId: number,
): Promise<DocumentoSocio> {
  obterLinhaSocio(db, socioId);
  const salvo = await salvarImagem(dataDir, path.join('socios', String(socioId)), arquivo);
  const d = db
    .insert(socioDocumentos)
    .values({ socioId, tipo: meta.tipo, legenda: meta.legenda, arquivo: salvo.arquivo, miniatura: salvo.miniatura, criadoPor: usuarioId })
    .returning()
    .get();
  registrarAuditoria(db, { usuarioId, acao: 'anexar_documento', entidade: 'socio', entidadeId: socioId, detalhes: { documento: d.id, tipo: d.tipo } });
  return paraDocumento(d);
}

export function caminhoDocumento(db: DB, dataDir: string, id: number, miniatura: boolean): string {
  const d = db.select().from(socioDocumentos).where(eq(socioDocumentos.id, id)).get();
  if (!d) throw naoEncontrado('Documento');
  return path.join(pastaUploads(dataDir), miniatura ? d.miniatura : d.arquivo);
}

export async function excluirDocumento(db: DB, dataDir: string, id: number, usuarioId: number) {
  const d = db.select().from(socioDocumentos).where(eq(socioDocumentos.id, id)).get();
  if (!d) throw naoEncontrado('Documento');
  db.delete(socioDocumentos).where(eq(socioDocumentos.id, id)).run();
  registrarAuditoria(db, { usuarioId, acao: 'excluir_documento', entidade: 'socio', entidadeId: d.socioId, detalhes: { documento: id } });
  await apagarArquivos(dataDir, [d.arquivo, d.miniatura]);
}
