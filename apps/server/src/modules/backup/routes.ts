import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { naoEncontrado } from '../../shared/erros.js';
import { validar } from '../../shared/validacao.js';
import { exigirAdmin, usuarioDe } from '../auth/guard.js';
import { caminhoBackup, criarBackup, listarBackups, rotacionarBackups } from './service.js';

export async function rotasBackup(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', exigirAdmin);

  app.get('/api/backups', async () => ({ backups: await listarBackups(config), pasta: 'data/backups' }));

  app.post('/api/backups', async (req, reply) => {
    const backup = await criarBackup(db, config, false);
    await rotacionarBackups(config);
    registrarAuditoria(db, { usuarioId: usuarioDe(req).id, acao: 'backup_manual', entidade: 'sistema', detalhes: { arquivo: backup.arquivo } });
    return reply.code(201).send({ backup });
  });

  app.get('/api/backups/:arquivo', async (req, reply) => {
    const { arquivo } = validar(z.object({ arquivo: z.string() }), req.params);
    const caminho = caminhoBackup(config, arquivo);
    if (!caminho) throw naoEncontrado('Backup');
    registrarAuditoria(db, { usuarioId: usuarioDe(req).id, acao: 'baixar_backup', entidade: 'sistema', detalhes: { arquivo } });
    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="${arquivo}"`)
      .send(createReadStream(caminho));
  });
}
