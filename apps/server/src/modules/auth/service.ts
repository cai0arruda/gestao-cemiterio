import { hash, verify } from '@node-rs/argon2';
import { and, eq, lt, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Usuario } from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { sessoes, usuarios } from '../../db/schema.js';
import { ErroApp } from '../../shared/erros.js';
import { agoraIso, minutosAFrente, minutosAtras } from '../../shared/tempo.js';

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;
/** Hash fixo para gastar o mesmo tempo quando o usuário não existe (evita descobrir logins). */
let hashFicticio: string | undefined;

export const hashSenha = (senha: string) => hash(senha);
export const verificarSenha = (hashSalvo: string, senha: string) => verify(hashSalvo, senha).catch(() => false);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function paraUsuario(u: typeof usuarios.$inferSelect): Usuario {
  return { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil, ativo: u.ativo };
}

export function existeAlgumUsuario(db: DB) {
  return db.select({ id: usuarios.id }).from(usuarios).limit(1).get() !== undefined;
}

export function criarSessao(db: DB, usuarioId: number): string {
  const token = randomBytes(32).toString('base64url');
  db.insert(sessoes).values({ id: sha256(token), usuarioId, ultimoAcesso: agoraIso() }).run();
  return token;
}

export function encerrarSessao(db: DB, token: string) {
  db.delete(sessoes).where(eq(sessoes.id, sha256(token))).run();
}

export function encerrarSessoesDoUsuario(db: DB, usuarioId: number, excetoToken?: string) {
  const cond = excetoToken
    ? and(eq(sessoes.usuarioId, usuarioId), sql`${sessoes.id} <> ${sha256(excetoToken)}`)
    : eq(sessoes.usuarioId, usuarioId);
  db.delete(sessoes).where(cond).run();
}

/** Devolve o usuário da sessão, ou null se não existir/expirou. Renova o "último acesso". */
export function validarSessao(db: DB, token: string, minutosInatividade: number): Usuario | null {
  const id = sha256(token);
  const linha = db
    .select({ sessao: sessoes, usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(eq(sessoes.id, id))
    .get();
  if (!linha) return null;
  if (!linha.usuario.ativo || linha.sessao.ultimoAcesso < minutosAtras(minutosInatividade)) {
    db.delete(sessoes).where(eq(sessoes.id, id)).run();
    return null;
  }
  // Atualiza no máximo uma vez por minuto para não gravar no banco a cada requisição.
  if (linha.sessao.ultimoAcesso < minutosAtras(1)) {
    db.update(sessoes).set({ ultimoAcesso: agoraIso() }).where(eq(sessoes.id, id)).run();
  }
  return paraUsuario(linha.usuario);
}

export function limparSessoesExpiradas(db: DB, minutosInatividade: number) {
  db.delete(sessoes).where(lt(sessoes.ultimoAcesso, minutosAtras(minutosInatividade))).run();
}

export async function autenticar(db: DB, login: string, senha: string): Promise<Usuario> {
  const u = db.select().from(usuarios).where(eq(usuarios.login, login.trim().toLowerCase())).get();
  const invalido = new ErroApp(401, 'Usuário ou senha incorretos.', 'credenciais_invalidas');

  if (!u) {
    hashFicticio ??= await hashSenha(randomBytes(16).toString('hex'));
    await verificarSenha(hashFicticio, senha);
    throw invalido;
  }
  if (u.bloqueadoAte && u.bloqueadoAte > agoraIso()) {
    const min = Math.ceil((Date.parse(u.bloqueadoAte) - Date.now()) / 60_000);
    throw new ErroApp(423, `Muitas tentativas erradas. Tente novamente em ${min} minuto(s).`, 'bloqueado');
  }
  if (!(await verificarSenha(u.senhaHash, senha))) {
    const tentativas = u.tentativasFalhas + 1;
    db.update(usuarios)
      .set(
        tentativas >= MAX_TENTATIVAS
          ? { tentativasFalhas: 0, bloqueadoAte: minutosAFrente(MINUTOS_BLOQUEIO) }
          : { tentativasFalhas: tentativas },
      )
      .where(eq(usuarios.id, u.id))
      .run();
    throw invalido;
  }
  if (!u.ativo) throw new ErroApp(403, 'Este usuário está desativado.', 'usuario_inativo');
  if (u.tentativasFalhas > 0 || u.bloqueadoAte) {
    db.update(usuarios).set({ tentativasFalhas: 0, bloqueadoAte: null }).where(eq(usuarios.id, u.id)).run();
  }
  return paraUsuario(u);
}
