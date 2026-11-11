import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { loginSchema, senhaSchema, trocarSenhaSchema } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { usuarios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, requisicaoInvalida } from '../../shared/erros.js';
import { validar } from '../../shared/validacao.js';
import { COOKIE_SESSAO, exigirLogin, usuarioDe } from './guard.js';
import {
  autenticar,
  criarSessao,
  encerrarSessao,
  encerrarSessoesDoUsuario,
  existeAlgumUsuario,
  hashSenha,
  paraUsuario,
  verificarSenha,
} from './service.js';

const setupSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(100),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Use de 3 a 50 caracteres: letras, números, ponto, hífen ou _'),
  senha: senhaSchema,
});

export async function rotasAuth(app: FastifyInstance, { db, config }: AppContext) {
  const gravarCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE_SESSAO, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSeguro,
      maxAge: config.sessaoMinutosInatividade * 60,
    });

  /** Primeira execução: indica se ainda é preciso criar o administrador. */
  app.get('/api/setup/status', async () => ({ precisaConfigurar: !existeAlgumUsuario(db) }));

  app.post('/api/setup', async (req, reply) => {
    const dados = validar(setupSchema, req.body);
    if (existeAlgumUsuario(db)) throw conflito('O sistema já foi configurado.', 'ja_configurado');
    const senhaHash = await hashSenha(dados.senha);
    const usuario = db.transaction((tx) => {
      // Confere de novo dentro da transação: duas abas podem ter enviado ao mesmo tempo.
      if (tx.select({ id: usuarios.id }).from(usuarios).limit(1).get()) {
        throw conflito('O sistema já foi configurado.', 'ja_configurado');
      }
      return tx.insert(usuarios).values({ nome: dados.nome, login: dados.login, senhaHash, perfil: 'admin' }).returning().get();
    });
    registrarAuditoria(db, { usuarioId: usuario.id, acao: 'configuracao_inicial', entidade: 'usuario', entidadeId: usuario.id });
    gravarCookie(reply, criarSessao(db, usuario.id));
    return { usuario: paraUsuario(usuario) };
  });

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { login, senha } = validar(loginSchema, req.body);
      const usuario = await autenticar(db, login, senha);
      gravarCookie(reply, criarSessao(db, usuario.id));
      registrarAuditoria(db, { usuarioId: usuario.id, acao: 'login', entidade: 'usuario', entidadeId: usuario.id });
      return { usuario };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.tokenSessao) encerrarSessao(db, req.tokenSessao);
    reply.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: exigirLogin }, async (req) => ({ usuario: usuarioDe(req) }));

  app.post('/api/auth/trocar-senha', { preHandler: exigirLogin }, async (req) => {
    const { senha_atual, nova_senha } = validar(trocarSenhaSchema, req.body);
    const eu = usuarioDe(req);
    const u = db.select().from(usuarios).where(eq(usuarios.id, eu.id)).get()!;
    if (!(await verificarSenha(u.senhaHash, senha_atual))) throw requisicaoInvalida('A senha atual está incorreta.');
    db.update(usuarios).set({ senhaHash: await hashSenha(nova_senha) }).where(eq(usuarios.id, eu.id)).run();
    encerrarSessoesDoUsuario(db, eu.id, req.tokenSessao ?? undefined);
    registrarAuditoria(db, { usuarioId: eu.id, acao: 'trocar_senha', entidade: 'usuario', entidadeId: eu.id });
    return { ok: true };
  });
}
