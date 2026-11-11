import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { existsSync } from 'node:fs';
import type { Config } from './config.js';
import type { DB } from './db/index.js';
import { rotasAuditoria } from './modules/auditoria/routes.js';
import { COOKIE_SESSAO } from './modules/auth/guard.js';
import { rotasAuth } from './modules/auth/routes.js';
import { validarSessao } from './modules/auth/service.js';
import { rotasBackup } from './modules/backup/routes.js';
import { rotasConfiguracoes } from './modules/configuracoes/routes.js';
import { rotasFinanceiro } from './modules/financeiro/routes.js';
import { rotasMapa } from './modules/mapa/routes.js';
import { rotasPortal } from './modules/portal/routes.js';
import { rotasRelatorios } from './modules/relatorios/routes.js';
import { rotasSepultamentos } from './modules/sepultamentos/routes.js';
import { rotasSepulturas } from './modules/sepulturas/routes.js';
import { rotasSocios } from './modules/socios/routes.js';
import { rotasUsuarios } from './modules/usuarios/routes.js';
import { ErroApp } from './shared/erros.js';
import { ErroValidacao } from './shared/validacao.js';

export interface AppContext {
  db: DB;
  config: Config;
}

export async function criarApp(ctx: AppContext, opcoes: FastifyServerOptions = {}) {
  const app = Fastify({ trustProxy: true, ...opcoes });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5 } });

  app.decorateRequest('usuario', null);
  app.decorateRequest('tokenSessao', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    const token = req.cookies[COOKIE_SESSAO];
    if (token) {
      req.tokenSessao = token;
      req.usuario = validarSessao(ctx.db, token, ctx.config.sessaoMinutosInatividade);
    }
  });

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof ErroValidacao) {
      return reply.code(400).send({ erro: erro.message, codigo: 'validacao', campos: erro.campos });
    }
    if (erro instanceof ErroApp) {
      return reply.code(erro.status).send({ erro: erro.message, codigo: erro.codigo });
    }
    const e = erro as { statusCode?: number; code?: string; message?: string };
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ erro: 'Arquivo muito grande (máximo 20 MB).', codigo: 'arquivo_grande' });
    }
    if (e.statusCode === 429) {
      return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde um minuto e tente de novo.', codigo: 'limite' });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ erro: e.message ?? 'Requisição inválida.', codigo: e.code });
    }
    req.log.error(erro);
    return reply.code(500).send({ erro: 'Erro interno no servidor. Tente novamente.', codigo: 'erro_interno' });
  });

  await app.register(rotasAuth, ctx);
  await app.register(rotasUsuarios, ctx);
  await app.register(rotasSocios, ctx);
  await app.register(rotasBackup, ctx);
  await app.register(rotasAuditoria, ctx);
  await app.register(rotasFinanceiro, ctx);
  await app.register(rotasConfiguracoes, ctx);
  await app.register(rotasPortal, ctx);
  await app.register(rotasSepulturas, ctx);
  await app.register(rotasSepultamentos, ctx);
  await app.register(rotasMapa, ctx);
  await app.register(rotasRelatorios, ctx);

  // Em produção, o próprio servidor entrega o frontend já compilado.
  if (existsSync(ctx.config.webDist)) {
    await app.register(fastifyStatic, { root: ctx.config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ erro: 'Rota não encontrada.', codigo: 'nao_encontrado' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ erro: 'Rota não encontrada.', codigo: 'nao_encontrado' }));
  }

  return app;
}
