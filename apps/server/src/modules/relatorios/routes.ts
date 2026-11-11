import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import { hojeLocal } from '../../shared/tempo.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirLogin, usuarioDe } from '../auth/guard.js';
import { listarSepultados } from '../sepultamentos/service.js';
import { aniversariantes, arrecadacao, caixaDoDia, listarDevedores, registrarAviso, visaoGeral } from './service.js';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

export async function rotasRelatorios(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  app.get('/api/relatorios/visao-geral', async () => visaoGeral(db));

  app.get('/api/relatorios/devedores', async (req) => {
    const { modo } = validar(z.object({ modo: z.enum(['vencidas', 'a_vencer']).default('vencidas') }), req.query);
    return { devedores: listarDevedores(db, modo, config.publicUrl) };
  });

  app.post('/api/socios/:id/avisos', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const d = validar(
      z.object({ tipo: z.enum(['cobranca', 'lembrete']), canal: z.enum(['whatsapp', 'telefone', 'outro']).default('whatsapp') }),
      req.body,
    );
    registrarAviso(db, id, d.tipo, d.canal, usuarioDe(req).id);
    return reply.code(201).send({ ok: true });
  });

  app.get('/api/relatorios/arrecadacao', async (req) => {
    const f = validar(z.object({ de: data, ate: data }), req.query);
    return arrecadacao(db, f.de, f.ate);
  });

  app.get('/api/relatorios/caixa', async (req) => {
    const f = validar(z.object({ data: data.optional() }), req.query);
    return caixaDoDia(db, f.data ?? hojeLocal());
  });

  app.get('/api/relatorios/aniversariantes', async (req) => {
    const { mes } = validar(z.object({ mes: z.coerce.number().int().min(1).max(12) }), req.query);
    return { aniversariantes: aniversariantes(db, mes) };
  });

  app.get('/api/relatorios/sepultamentos', async (req) => {
    const f = validar(z.object({ de: data, ate: data }), req.query);
    const lista = listarSepultados(db, { limite: 5000 }).filter((s) => s.data_sepultamento >= f.de && s.data_sepultamento <= f.ate);
    return { sepultamentos: lista };
  });
}
