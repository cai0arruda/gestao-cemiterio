import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import {
  SITUACOES_SEPULTURA,
  sepulturaCriarSchema,
  sepulturaInputSchema,
  transferenciaSchema,
  vendaSepulturaSchema,
} from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { requisicaoInvalida } from '../../shared/erros.js';
import { apagarArquivos } from '../../shared/imagens.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import {
  atualizarSepultura,
  caminhoFoto,
  criarSepultura,
  excluirFoto,
  excluirSepultura,
  iniciarVenda,
  listarFotos,
  listarSepulturas,
  obterSepultura,
  proximoCodigo,
  salvarFoto,
  transferirSepultura,
} from './service.js';

export async function rotasSepulturas(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  app.get('/api/sepulturas', async (req) => {
    const f = validar(z.object({ q: z.string().max(100).optional(), situacao: z.enum(SITUACOES_SEPULTURA).optional() }), req.query);
    return { sepulturas: listarSepulturas(db, { busca: f.q, situacao: f.situacao }) };
  });
  app.get('/api/sepulturas/proximo-codigo', async () => ({ codigo: proximoCodigo(db) }));
  app.get('/api/sepulturas/:id', async (req) => ({ sepultura: obterSepultura(db, validar(idParam, req.params).id) }));

  app.post('/api/sepulturas', async (req, reply) => {
    const d = validar(sepulturaCriarSchema, req.body);
    return reply.code(201).send({ sepultura: criarSepultura(db, d, usuarioDe(req).id) });
  });
  app.put('/api/sepulturas/:id', async (req) => {
    const { id } = validar(idParam, req.params);
    return { sepultura: atualizarSepultura(db, id, validar(sepulturaInputSchema, req.body), usuarioDe(req).id) };
  });
  app.delete('/api/sepulturas/:id', { preHandler: exigirAdmin }, async (req) => {
    const arquivos = excluirSepultura(db, validar(idParam, req.params).id, usuarioDe(req).id);
    await apagarArquivos(config.dataDir, arquivos);
    return { ok: true };
  });

  app.post('/api/sepulturas/:id/venda', async (req) => {
    const { id } = validar(idParam, req.params);
    const d = validar(vendaSepulturaSchema, req.body);
    iniciarVenda(db, id, d.socio_id, d.valor_centavos, usuarioDe(req).id);
    return { sepultura: obterSepultura(db, id) };
  });
  app.post('/api/sepulturas/:id/transferir', { preHandler: exigirAdmin }, async (req) => {
    const { id } = validar(idParam, req.params);
    const d = validar(transferenciaSchema, req.body);
    transferirSepultura(db, id, d.socio_id, d.motivo, usuarioDe(req).id);
    return { sepultura: obterSepultura(db, id) };
  });

  // Fotos
  app.get('/api/sepulturas/:id/fotos', async (req) => ({ fotos: listarFotos(db, validar(idParam, req.params).id) }));
  app.post('/api/sepulturas/:id/fotos', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const arquivo = await req.file();
    if (!arquivo) throw requisicaoInvalida('Nenhum arquivo enviado.');
    const legenda = arquivo.fields.legenda;
    const texto = legenda && !Array.isArray(legenda) && legenda.type === 'field' ? String(legenda.value).slice(0, 200) : null;
    return reply.code(201).send({ foto: await salvarFoto(db, config.dataDir, id, await arquivo.toBuffer(), texto || null, usuarioDe(req).id) });
  });
  app.get('/api/sepultura-fotos/:id/arquivo', async (req, reply) => {
    const { id } = validar(idParam, req.params);
    const { miniatura } = validar(z.object({ miniatura: z.string().optional() }), req.query);
    return reply
      .type('image/jpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .send(createReadStream(caminhoFoto(db, config.dataDir, id, miniatura === '1')));
  });
  app.delete('/api/sepultura-fotos/:id', { preHandler: exigirAdmin }, async (req) => {
    await apagarArquivos(config.dataDir, excluirFoto(db, validar(idParam, req.params).id, usuarioDe(req).id));
    return { ok: true };
  });
}
