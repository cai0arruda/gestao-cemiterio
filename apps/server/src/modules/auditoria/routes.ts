import type { FastifyInstance } from 'fastify';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import { auditoria, usuarios } from '../../db/schema.js';
import { validar } from '../../shared/validacao.js';
import { exigirAdmin } from '../auth/guard.js';

export async function rotasAuditoria(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', exigirAdmin);

  app.get('/api/auditoria', async (req) => {
    const f = validar(
      z.object({
        entidade: z.string().max(30).optional(),
        entidade_id: z.coerce.number().int().positive().optional(),
        limite: z.coerce.number().int().min(1).max(1000).default(300),
      }),
      req.query,
    );
    const cond: SQL[] = [];
    if (f.entidade) cond.push(eq(auditoria.entidade, f.entidade));
    if (f.entidade_id) cond.push(eq(auditoria.entidadeId, f.entidade_id));
    const registros = db
      .select({
        id: auditoria.id,
        usuario_nome: usuarios.nome,
        acao: auditoria.acao,
        entidade: auditoria.entidade,
        entidade_id: auditoria.entidadeId,
        detalhes: auditoria.detalhes,
        criado_em: auditoria.criadoEm,
      })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(cond.length ? and(...cond) : undefined)
      .orderBy(desc(auditoria.id))
      .limit(f.limite)
      .all();
    return { registros };
  });
}
