import type { FastifyInstance } from 'fastify';
import { CHAVES_CONFIG, CONFIG_PADRAO, configSchema, type Configuracoes } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import type { DB } from '../../db/index.js';
import { configuracoes } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';

export function lerConfiguracoes(db: DB): Configuracoes {
  const salvas = Object.fromEntries(db.select().from(configuracoes).all().map((c) => [c.chave, c.valor]));
  return Object.fromEntries(CHAVES_CONFIG.map((k) => [k, salvas[k] ?? CONFIG_PADRAO[k]])) as Configuracoes;
}

export async function rotasConfiguracoes(app: FastifyInstance, { db, config }: AppContext) {
  app.get('/api/configuracoes', { preHandler: exigirLogin }, async () => ({
    configuracoes: lerConfiguracoes(db),
    public_url: config.publicUrl,
  }));

  app.put('/api/configuracoes', { preHandler: exigirAdmin }, async (req) => {
    const novas = validar(configSchema, req.body);
    const antes = lerConfiguracoes(db);
    db.transaction((tx) => {
      for (const k of CHAVES_CONFIG) {
        tx.insert(configuracoes)
          .values({ chave: k, valor: novas[k] })
          .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: novas[k] } })
          .run();
      }
      const alteradas = CHAVES_CONFIG.filter((k) => antes[k] !== novas[k]);
      if (alteradas.length) {
        registrarAuditoria(tx, {
          usuarioId: usuarioDe(req).id,
          acao: 'alterar_configuracoes',
          entidade: 'sistema',
          detalhes: Object.fromEntries(alteradas.map((k) => [k, { de: antes[k], para: novas[k] }])),
        });
      }
    });
    return { configuracoes: lerConfiguracoes(db), public_url: config.publicUrl };
  });
}
