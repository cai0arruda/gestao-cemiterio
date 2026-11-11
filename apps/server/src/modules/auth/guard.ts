import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Usuario } from '@cemiterio/shared';
import { naoAutenticado, proibido } from '../../shared/erros.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
    tokenSessao: string | null;
  }
}

export const COOKIE_SESSAO = 'sid';

export async function exigirLogin(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.usuario) throw naoAutenticado();
}

export async function exigirAdmin(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.usuario) throw naoAutenticado();
  if (req.usuario.perfil !== 'admin') throw proibido('Apenas administradores podem fazer isso.');
}

/** Usuário logado (use somente em rotas protegidas por exigirLogin/exigirAdmin). */
export const usuarioDe = (req: FastifyRequest): Usuario => req.usuario!;
