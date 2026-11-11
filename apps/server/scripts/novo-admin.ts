/**
 * Cria um administrador pelo terminal (para quando ninguém consegue entrar no sistema).
 * Uso: npx tsx apps/server/scripts/novo-admin.ts
 */
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { senhaSchema } from '@cemiterio/shared';
import { carregarConfig } from '../src/config.js';
import { abrirBanco } from '../src/db/index.js';
import { usuarios } from '../src/db/schema.js';
import { hashSenha } from '../src/modules/auth/service.js';
import { registrarAuditoria } from '../src/shared/auditoria.js';

let silenciar = false;
const saida = new Writable({
  write(chunk, _enc, cb) {
    if (!silenciar) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: saida, terminal: Boolean(process.stdin.isTTY) });
const linhas = rl[Symbol.asyncIterator]();

/** Lê uma linha; com `oculto`, o que é digitado não aparece na tela (senhas). */
async function perguntar(texto: string, oculto = false) {
  process.stdout.write(texto);
  silenciar = oculto;
  const { value } = await linhas.next();
  silenciar = false;
  if (oculto) process.stdout.write('\n');
  return String(value ?? '');
}

const config = carregarConfig();
const db = abrirBanco(path.join(config.dataDir, 'cemiterio.db'));

const nome = (await perguntar('Nome: ')).trim();
const login = (await perguntar('Usuário (login): ')).trim().toLowerCase();
const senha = await perguntar('Senha (mínimo 8 caracteres): ', true);
const confirmar = await perguntar('Repita a senha: ', true);
rl.close();

if (nome.length < 2 || !/^[a-z0-9._-]{3,50}$/.test(login)) {
  console.error('Nome ou usuário inválido.');
  process.exit(1);
}
if (senha !== confirmar || !senhaSchema.safeParse(senha).success) {
  console.error('As senhas não conferem ou têm menos de 8 caracteres.');
  process.exit(1);
}

const hash = await hashSenha(senha);
const existente = db.select().from(usuarios).where(eq(usuarios.login, login)).get();
const u = existente
  ? db
      .update(usuarios)
      .set({ senhaHash: hash, perfil: 'admin', ativo: true, tentativasFalhas: 0, bloqueadoAte: null })
      .where(eq(usuarios.id, existente.id))
      .returning()
      .get()
  : db.insert(usuarios).values({ nome, login, senhaHash: hash, perfil: 'admin' }).returning().get();
registrarAuditoria(db, { usuarioId: null, acao: existente ? 'redefinir_admin_terminal' : 'criar_admin_terminal', entidade: 'usuario', entidadeId: u.id });
console.log(existente ? `Usuário "${login}" redefinido como administrador.` : `Administrador "${login}" criado.`);
db.$client.close();
