import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  anuidadesSocioSchema,
  cancelarSchema,
  gerarAnuidadesSchema,
  lancamentoHistoricoSchema,
  recebimentoSchema,
  valorSchema,
} from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import {
  cancelarCobranca,
  cobrarTaxaAssociacao,
  definirValor,
  excluirCobranca,
  estornarRecebimento,
  financeiroDoSocio,
  gerarAnuidades,
  gerarAnuidadesSocio,
  previaAnuidadesSocio,
  lancarAnuidadesAntigas,
  listarRecebimentos,
  listarValores,
  obterRecebimento,
  previaGeracaoAnuidades,
  registrarImpressao,
  registrarRecebimento,
  resumoAnuidadesPorAno,
} from './service.js';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function rotasFinanceiro(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  // Valores e reajustes
  app.get('/api/valores', async () => ({ valores: listarValores(db) }));
  app.put('/api/valores', { preHandler: exigirAdmin }, async (req) => {
    definirValor(db, validar(valorSchema, req.body), usuarioDe(req).id);
    return { valores: listarValores(db) };
  });

  // Anuidades
  app.get('/api/anuidades/resumo', async () => ({ anos: resumoAnuidadesPorAno(db) }));
  app.get('/api/anuidades/previa', async (req) => previaGeracaoAnuidades(db, validar(gerarAnuidadesSchema, req.query).ano));
  app.post('/api/anuidades/gerar', { preHandler: exigirAdmin }, async (req) =>
    gerarAnuidades(db, validar(gerarAnuidadesSchema, req.body).ano, usuarioDe(req).id),
  );

  // Financeiro do sócio
  app.get('/api/socios/:id/financeiro', async (req) => financeiroDoSocio(db, validar(idParam, req.params).id));
  // Anuidades avulsas de um sócio (adiantar o pagamento ou pagar vários anos de uma vez).
  app.get('/api/socios/:id/anuidades/previa', async (req) => {
    const { id } = validar(idParam, req.params);
    const d = validar(anuidadesSocioSchema, { ano_inicial: (req.query as Record<string, string>).de, ano_final: (req.query as Record<string, string>).ate });
    return { anos: previaAnuidadesSocio(db, id, d.ano_inicial, d.ano_final) };
  });
  app.post('/api/socios/:id/anuidades', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const d = validar(anuidadesSocioSchema, req.body);
    return reply.code(201).send(gerarAnuidadesSocio(db, id, d.ano_inicial, d.ano_final, usuarioDe(req).id));
  });
  app.post('/api/socios/:id/taxa-associacao', async (req, reply) => {
    const cobranca = cobrarTaxaAssociacao(db, validar(idParam, req.params).id, usuarioDe(req).id);
    return reply.code(201).send({ cobranca });
  });
  app.post('/api/socios/:id/anuidades-antigas', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    return lancarAnuidadesAntigas(db, id, validar(lancamentoHistoricoSchema, req.body), usuarioDe(req).id);
  });
  // Qualquer usuário (quem gera no balcão também pode desfazer um engano); fica no histórico.
  app.delete('/api/cobrancas/:id', async (req) => {
    excluirCobranca(db, validar(idParam, req.params).id, usuarioDe(req).id);
    return { ok: true };
  });
  app.post('/api/cobrancas/:id/cancelar', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    cancelarCobranca(db, id, validar(cancelarSchema, req.body).motivo, usuarioDe(req).id);
    return { ok: true };
  });

  // Recebimentos (pagamentos + recibo)
  app.get('/api/recebimentos', async (req) => {
    const f = validar(
      z.object({ de: data.optional(), ate: data.optional(), limite: z.coerce.number().int().min(1).max(2000).optional() }),
      req.query,
    );
    return { recebimentos: listarRecebimentos(db, f) };
  });
  app.post('/api/recebimentos', async (req, reply) => {
    const u = usuarioDe(req);
    const recebimento = registrarRecebimento(db, validar(recebimentoSchema, req.body), { id: u.id, perfil: u.perfil });
    return reply.code(201).send({ recebimento });
  });
  app.get('/api/recebimentos/:id', async (req) => ({ recebimento: obterRecebimento(db, validar(idParam, req.params).id) }));
  app.post('/api/recebimentos/:id/impressao', async (req) => ({
    via: registrarImpressao(db, validar(idParam, req.params).id, usuarioDe(req).id),
  }));
  app.post('/api/recebimentos/:id/estornar', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    estornarRecebimento(db, id, validar(cancelarSchema, req.body).motivo, usuarioDe(req).id);
    return { recebimento: obterRecebimento(db, id) };
  });
}
