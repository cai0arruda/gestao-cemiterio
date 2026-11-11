import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { imagemAereaSchema, localizacaoSchema, mapaPosicaoSchema, setorSchema } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { naoEncontrado, requisicaoInvalida } from '../../shared/erros.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import { obterSepultura } from '../sepulturas/service.js';
import {
  ajustarImagemAerea,
  arquivoImagemAerea,
  definirLocalizacao,
  definirPosicao,
  excluirSetor,
  lerConfigMapa,
  listarPins,
  listarSetores,
  removerImagemAerea,
  salvarImagemAerea,
  salvarSetor,
} from './service.js';

export async function rotasMapa(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', exigirLogin);

  app.get('/api/mapa', async () => ({
    config: await lerConfigMapa(db, config.dataDir),
    pins: listarPins(db),
    setores: listarSetores(db),
  }));

  // Qualquer usuário posiciona sepulturas (cadastro em campo); o resto é do administrador.
  app.put('/api/sepulturas/:id/localizacao', async (req) => {
    const { id } = validar(idParam, req.params);
    const d = validar(localizacaoSchema, req.body);
    definirLocalizacao(db, id, d.latitude, d.longitude, usuarioDe(req).id);
    return { sepultura: obterSepultura(db, id) };
  });

  app.put('/api/mapa/posicao', { preHandler: exigirAdmin }, async (req) => {
    definirPosicao(db, validar(mapaPosicaoSchema, req.body), usuarioDe(req).id);
    return { config: await lerConfigMapa(db, config.dataDir) };
  });

  app.get('/api/setores', async () => ({ setores: listarSetores(db) }));
  app.post('/api/setores', { preHandler: exigirAdmin }, async (req, reply) => {
    salvarSetor(db, null, validar(setorSchema, req.body), usuarioDe(req).id);
    return reply.code(201).send({ setores: listarSetores(db) });
  });
  app.put('/api/setores/:id', { preHandler: exigirAdmin }, async (req) => {
    salvarSetor(db, validar(idParam, req.params).id, validar(setorSchema, req.body), usuarioDe(req).id);
    return { setores: listarSetores(db) };
  });
  app.delete('/api/setores/:id', { preHandler: exigirAdmin }, async (req) => {
    excluirSetor(db, validar(idParam, req.params).id, usuarioDe(req).id);
    return { setores: listarSetores(db) };
  });

  // Imagem aérea própria (drone)
  app.get('/api/mapa/imagem-aerea.jpg', async (_req, reply) => {
    const arquivo = arquivoImagemAerea(config.dataDir);
    if (!existsSync(arquivo)) throw naoEncontrado('Imagem aérea');
    return reply.type('image/jpeg').header('Cache-Control', 'private, max-age=31536000').send(createReadStream(arquivo));
  });
  app.post('/api/mapa/imagem-aerea', { preHandler: exigirAdmin }, async (req) => {
    const arquivo = await req.file({ limits: { fileSize: 80 * 1024 * 1024 } });
    if (!arquivo) throw requisicaoInvalida('Nenhum arquivo enviado.');
    const campo = arquivo.fields.limites;
    const texto = campo && !Array.isArray(campo) && campo.type === 'field' ? String(campo.value) : '';
    let limites: unknown;
    try {
      limites = JSON.parse(texto);
    } catch {
      throw requisicaoInvalida('Limites inválidos.');
    }
    const ok = validar(imagemAereaSchema.shape.limites, limites);
    await salvarImagemAerea(db, config.dataDir, await arquivo.toBuffer(), ok, usuarioDe(req).id);
    return { config: await lerConfigMapa(db, config.dataDir) };
  });
  app.put('/api/mapa/imagem-aerea', { preHandler: exigirAdmin }, async (req) => {
    ajustarImagemAerea(db, config.dataDir, validar(imagemAereaSchema, req.body), usuarioDe(req).id);
    return { config: await lerConfigMapa(db, config.dataDir) };
  });
  app.delete('/api/mapa/imagem-aerea', { preHandler: exigirAdmin }, async (req) => {
    removerImagemAerea(db, config.dataDir, usuarioDe(req).id);
    return { config: await lerConfigMapa(db, config.dataDir) };
  });

}
