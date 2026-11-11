import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { socioInputSchema, socioSituacaoSchema } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { requisicaoInvalida } from '../../shared/erros.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import { apagarArquivos, caminhoDocumento, excluirDocumento, listarDocumentos, salvarDocumento } from './documentos.js';
import {
  ajustarSituacao,
  atualizarSocio,
  buscarDuplicados,
  criarSocio,
  excluirSocio,
  listarSocios,
  obterSocio,
  proximaMatricula,
} from './service.js';

const duplicadosSchema = z.object({
  nome_completo: z.string().trim().min(1),
  data_nascimento: z.string().nullish(),
  cpf: z.string().nullish(),
  ignorar_id: z.number().int().positive().nullish(),
});

export async function rotasSocios(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  app.get('/api/socios', async (req) => {
    const { q } = validar(z.object({ q: z.string().max(100).optional() }), req.query);
    return { socios: listarSocios(db, q) };
  });

  app.get('/api/socios/proxima-matricula', async () => ({ matricula: proximaMatricula(db) }));

  app.post('/api/socios/verificar-duplicados', async (req) => {
    const d = validar(duplicadosSchema, req.body);
    return {
      duplicados: buscarDuplicados(db, {
        nome_completo: d.nome_completo,
        data_nascimento: d.data_nascimento,
        cpf: d.cpf,
        ignorarId: d.ignorar_id ?? undefined,
      }),
    };
  });

  app.get('/api/socios/:id', async (req) => {
    const { id } = validar(idParam, req.params);
    return { socio: obterSocio(db, id) };
  });

  app.post('/api/socios', async (req, reply) => {
    const dados = validar(socioInputSchema, req.body);
    return reply.code(201).send({ socio: criarSocio(db, dados, usuarioDe(req).id) });
  });

  app.put('/api/socios/:id', async (req) => {
    const { id } = validar(idParam, req.params);
    const dados = validar(socioInputSchema, req.body);
    return { socio: atualizarSocio(db, id, dados, usuarioDe(req).id) };
  });

  app.patch('/api/socios/:id/situacao', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    const ajuste = validar(socioSituacaoSchema, req.body);
    return { socio: ajustarSituacao(db, id, ajuste, usuarioDe(req).id) };
  });

  app.delete('/api/socios/:id', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    const arquivos = excluirSocio(db, id, usuarioDe(req).id);
    await apagarArquivos(config.dataDir, arquivos);
    return { ok: true };
  });

  // ---------- Documentos (foto da ficha em papel etc.) ----------

  app.get('/api/socios/:id/documentos', async (req) => {
    const { id } = validar(idParam, req.params);
    return { documentos: listarDocumentos(db, id) };
  });

  app.post('/api/socios/:id/documentos', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const arquivo = await req.file();
    if (!arquivo) throw requisicaoInvalida('Nenhum arquivo enviado.');
    const buffer = await arquivo.toBuffer();
    const campo = (nome: string) => {
      const f = arquivo.fields[nome];
      return f && !Array.isArray(f) && f.type === 'field' ? String(f.value).trim() : '';
    };
    const tipo = campo('tipo') === 'outro' ? 'outro' : 'ficha';
    const legenda = campo('legenda').slice(0, 200) || null;
    const doc = await salvarDocumento(db, config.dataDir, id, buffer, { tipo, legenda }, usuarioDe(req).id);
    return reply.code(201).send({ documento: doc });
  });

  app.get('/api/documentos/:id/arquivo', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const { miniatura } = validar(z.object({ miniatura: z.string().optional() }), req.query);
    const caminho = caminhoDocumento(db, config.dataDir, id, miniatura === '1');
    return reply
      .type('image/jpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .send(createReadStream(caminho));
  });

  app.delete('/api/documentos/:id', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    await excluirDocumento(db, config.dataDir, id, usuarioDe(req).id);
    return { ok: true };
  });
}
