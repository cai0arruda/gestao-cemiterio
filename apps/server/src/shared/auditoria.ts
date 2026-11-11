import type { DB } from '../db/index.js';
import { auditoria } from '../db/schema.js';

export function registrarAuditoria(
  db: Pick<DB, 'insert'>,
  dados: {
    usuarioId: number | null;
    acao: string;
    entidade: string;
    entidadeId?: number | null;
    detalhes?: unknown;
  },
) {
  db.insert(auditoria)
    .values({
      usuarioId: dados.usuarioId,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId ?? null,
      detalhes: dados.detalhes === undefined ? null : JSON.stringify(dados.detalhes),
    })
    .run();
}
