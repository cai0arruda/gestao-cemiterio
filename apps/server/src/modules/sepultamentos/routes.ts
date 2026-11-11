import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cancelarSchema, exumacaoSchema, sepultamentoSchema, sucessaoSchema, type SepulturasDoSocio } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import { listarSepulturas } from '../sepulturas/service.js';
import { obterLinhaSocio } from '../socios/service.js';
import {
  cancelarSucessao,
  desfazerExumacao,
  exumar,
  excluirSepultamento,
  iniciarSucessao,
  listarSepultados,
  registrarSepultamento,
  sucessoesDoSocio,
  verificarDireito,
} from './service.js';

export async function rotasSepultamentos(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  // "Onde está sepultado fulano?"
  app.get('/api/sepultados', async (req) => {
    const { q } = validar(z.object({ q: z.string().max(100).optional() }), req.query);
    return { sepultados: listarSepultados(db, { busca: q, limite: 300 }) };
  });

  app.get('/api/socios/:id/direito', async (req) => {
    const { id } = validar(idParam, req.params);
    const { sepultura_id } = validar(z.object({ sepultura_id: z.coerce.number().int().positive().optional() }), req.query);
    return verificarDireito(db, id, sepultura_id);
  });

  app.get('/api/socios/:id/sepulturas', async (req): Promise<SepulturasDoSocio> => {
    const { id } = validar(idParam, req.params);
    obterLinhaSocio(db, id);
    return { sepulturas: listarSepulturas(db, { socioId: id }), direito: verificarDireito(db, id), sucessoes: sucessoesDoSocio(db, id) };
  });

  app.post('/api/sepultamentos', async (req, reply) => {
    const u = usuarioDe(req);
    const r = registrarSepultamento(db, validar(sepultamentoSchema, req.body), { id: u.id, perfil: u.perfil });
    return reply.code(201).send(r);
  });

  app.post('/api/sepultamentos/:id/excluir', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    excluirSepultamento(db, id, validar(cancelarSchema, req.body).motivo, usuarioDe(req).id);
    return { ok: true };
  });

  // Exumação: qualquer usuário registra; desfazer é do administrador.
  app.post('/api/sepultamentos/:id/exumar', async (req) => {
    exumar(db, validar(idParam, req.params).id, validar(exumacaoSchema, req.body), usuarioDe(req).id);
    return { ok: true };
  });
  app.post('/api/sepultamentos/:id/desfazer-exumacao', { preHandler: exigirAdmin }, async (req) => {
    desfazerExumacao(db, validar(idParam, req.params).id, validar(cancelarSchema, req.body).motivo, usuarioDe(req).id);
    return { ok: true };
  });

  app.post('/api/socios/:id/sucessao', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    return reply.code(201).send(iniciarSucessao(db, id, validar(sucessaoSchema, req.body), usuarioDe(req).id));
  });

  app.post('/api/sucessoes/:id/cancelar', { preHandler: exigirAdmin }, async (req) => {
    cancelarSucessao(db, validar(idParam, req.params).id, usuarioDe(req).id);
    return { ok: true };
  });
}
