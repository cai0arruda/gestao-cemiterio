import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ne, notInArray, sql } from 'drizzle-orm';
import { usuarioAtualizarSchema, usuarioCriarSchema } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { auditoria, usuarios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, naoEncontrado, requisicaoInvalida } from '../../shared/erros.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, usuarioDe } from '../auth/guard.js';
import { encerrarSessoesDoUsuario, hashSenha, paraUsuario } from '../auth/service.js';

export async function rotasUsuarios(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', exigirAdmin);

  app.get('/api/usuarios', async () => ({
    usuarios: db.select().from(usuarios).orderBy(asc(usuarios.nome)).all().map(paraUsuario),
  }));

  app.post('/api/usuarios', async (req, reply) => {
    const dados = validar(usuarioCriarSchema, req.body);
    if (db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.login, dados.login)).get()) {
      throw conflito('Já existe um usuário com esse login.');
    }
    const u = db
      .insert(usuarios)
      .values({ nome: dados.nome, login: dados.login, perfil: dados.perfil, senhaHash: await hashSenha(dados.senha) })
      .returning()
      .get();
    registrarAuditoria(db, {
      usuarioId: usuarioDe(req).id,
      acao: 'criar',
      entidade: 'usuario',
      entidadeId: u.id,
      detalhes: { login: u.login, perfil: u.perfil },
    });
    return reply.code(201).send({ usuario: paraUsuario(u) });
  });

  app.patch('/api/usuarios/:id', async (req) => {
    const { id } = validar(idParam, req.params);
    const dados = validar(usuarioAtualizarSchema, req.body);
    const eu = usuarioDe(req);
    const atual = db.select().from(usuarios).where(eq(usuarios.id, id)).get();
    if (!atual) throw naoEncontrado('Usuário');

    // Ninguém se tranca para fora: desativar a si mesmo ou tirar o próprio acesso de administrador
    // só pode ser feito por outro administrador.
    if (id === eu.id && dados.ativo === false) {
      throw requisicaoInvalida('Você não pode desativar o seu próprio usuário. Peça a outro administrador.');
    }
    if (id === eu.id && dados.perfil && dados.perfil !== atual.perfil) {
      throw requisicaoInvalida('Você não pode mudar o seu próprio perfil. Peça a outro administrador.');
    }

    const perdeAdmin =
      atual.perfil === 'admin' && atual.ativo && (dados.ativo === false || (dados.perfil && dados.perfil !== 'admin'));
    if (perdeAdmin) {
      const outrosAdmins = db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(and(eq(usuarios.perfil, 'admin'), eq(usuarios.ativo, true), ne(usuarios.id, id)))
        .all();
      if (outrosAdmins.length === 0) throw requisicaoInvalida('É preciso manter pelo menos um administrador ativo.');
    }

    const alteracoes: Partial<typeof usuarios.$inferInsert> = {};
    if (dados.nome !== undefined) alteracoes.nome = dados.nome;
    if (dados.perfil !== undefined) alteracoes.perfil = dados.perfil;
    if (dados.ativo !== undefined) alteracoes.ativo = dados.ativo;
    if (dados.nova_senha !== undefined) {
      alteracoes.senhaHash = await hashSenha(dados.nova_senha);
      alteracoes.tentativasFalhas = 0;
      alteracoes.bloqueadoAte = null;
    }
    const u = db.update(usuarios).set(alteracoes).where(eq(usuarios.id, id)).returning().get();
    if (dados.ativo === false || dados.nova_senha !== undefined) {
      encerrarSessoesDoUsuario(db, id, id === eu.id ? (req.tokenSessao ?? undefined) : undefined);
    }
    registrarAuditoria(db, {
      usuarioId: eu.id,
      acao: 'atualizar',
      entidade: 'usuario',
      entidadeId: id,
      detalhes: { ...dados, nova_senha: dados.nova_senha ? '(redefinida)' : undefined },
    });
    return { usuario: paraUsuario(u) };
  });

  /**
   * Exclui um usuário que ainda não fez nada no sistema (ex.: criado por engano).
   * Quem já tem registros (pagamentos, cadastros, alterações) só pode ser desativado,
   * para o histórico e os recibos continuarem mostrando quem fez cada coisa.
   */
  app.delete('/api/usuarios/:id', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const eu = usuarioDe(req);
    const alvo = db.select().from(usuarios).where(eq(usuarios.id, id)).get();
    if (!alvo) throw naoEncontrado('Usuário');
    if (id === eu.id) throw requisicaoInvalida('Você não pode excluir o seu próprio usuário.');
    if (alvo.perfil === 'admin' && alvo.ativo) {
      const outrosAdmins = db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(and(eq(usuarios.perfil, 'admin'), eq(usuarios.ativo, true), ne(usuarios.id, id)))
        .all();
      if (outrosAdmins.length === 0) throw requisicaoInvalida('É preciso manter pelo menos um administrador ativo.');
    }
    if (temRegistros(id)) {
      throw conflito(
        'Este usuário já tem registros no sistema (pagamentos, cadastros ou alterações). Desative-o em vez de excluir, assim o histórico continua mostrando quem fez cada coisa.',
        'usuario_com_registros',
      );
    }
    db.transaction((tx) => {
      // Entradas de login e troca de senha não contam como trabalho: saem junto com o usuário.
      tx.delete(auditoria).where(and(eq(auditoria.usuarioId, id), eq(auditoria.entidade, 'usuario'), eq(auditoria.entidadeId, id))).run();
      tx.delete(usuarios).where(eq(usuarios.id, id)).run();
    });
    registrarAuditoria(db, {
      usuarioId: eu.id,
      acao: 'excluir',
      entidade: 'usuario',
      entidadeId: id,
      detalhes: { nome: alvo.nome, login: alvo.login, perfil: alvo.perfil },
    });
    return reply.code(204).send();
  });

  /** Tabelas que guardam "quem fez" e que não podem perder essa informação. */
  const COLUNAS_AUTOR = [
    ['socio_documentos', 'criado_por'],
    ['tabela_valores', 'definido_por'],
    ['cobrancas', 'criado_por'],
    ['cobrancas', 'cancelado_por'],
    ['recebimentos', 'registrado_por'],
    ['recebimentos', 'estornado_por'],
    ['sepultura_fotos', 'criado_por'],
    ['sepultamentos', 'registrado_por'],
    ['sepultamentos', 'exumacao_registrada_por'],
    ['sucessoes', 'criado_por'],
    ['avisos_cobranca', 'usuario_id'],
  ] as const;

  function temRegistros(id: number) {
    for (const [tabela, coluna] of COLUNAS_AUTOR) {
      const r = db.get<{ n: number }>(sql`select count(*) as n from ${sql.identifier(tabela)} where ${sql.identifier(coluna)} = ${id}`);
      if (r && r.n > 0) return true;
    }
    // No histórico, só contam ações de trabalho; login e troca da própria senha não.
    const acoes = db
      .select({ n: sql<number>`count(*)` })
      .from(auditoria)
      .where(and(eq(auditoria.usuarioId, id), notInArray(auditoria.acao, ['login', 'trocar_senha', 'configuracao_inicial'])))
      .get();
    return (acoes?.n ?? 0) > 0;
  }
}
