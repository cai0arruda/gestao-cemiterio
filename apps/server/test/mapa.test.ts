import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pontoNoPoligono } from '@cemiterio/shared';
import { criarAmbiente } from './helpers.js';

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let cookie: string;
beforeEach(async () => {
  amb = await criarAmbiente();
  cookie = await amb.configurarAdmin();
});
afterEach(() => amb.limpar());

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';
const req = (method: Metodo, url: string, payload?: unknown) =>
  amb.app.inject({ method, url, headers: { cookie }, payload: payload as object });
const json = async (method: Metodo, url: string, payload?: unknown) => (await req(method, url, payload)).json();

// Quadrado de ~100 m: lat -29.60..-29.599, lng -50.90..-50.899
const quadrado: [number, number][][] = [[[-50.9, -29.6], [-50.899, -29.6], [-50.899, -29.599], [-50.9, -29.599], [-50.9, -29.6]]];

describe('ponto no polígono', () => {
  it('dentro, fora e no buraco', () => {
    expect(pontoNoPoligono(-29.5995, -50.8995, quadrado)).toBe(true);
    expect(pontoNoPoligono(-29.61, -50.8995, quadrado)).toBe(false);
    const comBuraco = [quadrado[0]!, [[-50.8996, -29.5996], [-50.8994, -29.5996], [-50.8994, -29.5994], [-50.8996, -29.5994], [-50.8996, -29.5996]] as [number, number][]];
    expect(pontoNoPoligono(-29.5995, -50.8995, comBuraco)).toBe(false);
  });
});

describe('localização e setores', () => {
  it('posiciona a sepultura e calcula o setor (também ao criar/excluir setor depois)', async () => {
    const s = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1 })).sepultura;
    const r = await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29.5995, longitude: -50.8995 });
    expect(r.json().sepultura).toMatchObject({ latitude: -29.5995, longitude: -50.8995, setor_nome: null, tem_localizacao: true });

    const criado = await req('POST', '/api/setores', { nome: 'Setor A', cor: '#2f9e44', poligono: quadrado });
    expect(criado.statusCode).toBe(201);
    expect(criado.json().setores[0]).toMatchObject({ nome: 'Setor A', qtd_sepulturas: 1 });
    expect((await json('GET', `/api/sepulturas/${s.id}`)).sepultura.setor_nome).toBe('Setor A');
    expect((await json('GET', '/api/sepulturas?q=setor a')).sepulturas).toHaveLength(1);

    // fora do setor
    await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29.7, longitude: -50.8995 });
    expect((await json('GET', `/api/sepulturas/${s.id}`)).sepultura.setor_nome).toBeNull();

    await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29.5995, longitude: -50.8995 });
    const setorId = (await json('GET', '/api/setores')).setores[0].id;
    await req('DELETE', `/api/setores/${setorId}`);
    expect((await json('GET', `/api/sepulturas/${s.id}`)).sepultura.setor_nome).toBeNull();
  });

  it('valida coordenadas, polígono e nome repetido', async () => {
    const s = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1 })).sepultura;
    expect((await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: 120, longitude: 0 })).statusCode).toBe(400);
    expect((await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29, longitude: null })).statusCode).toBe(400);
    expect((await req('POST', '/api/setores', { nome: 'X', cor: '#000000', poligono: [[[0, 0], [1, 1]]] })).statusCode).toBe(400);
    await req('POST', '/api/setores', { nome: 'Setor A', cor: '#2f9e44', poligono: quadrado });
    expect((await req('POST', '/api/setores', { nome: 'Setor A', cor: '#2f9e44', poligono: quadrado })).statusCode).toBe(409);
  });

  it('pins trazem titular, pendência, sepultados e foto', async () => {
    const socio = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
    const s = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 2, socio_id: socio.id })).sepultura;
    await req('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1 }); // sem posição: não aparece
    await req('POST', '/api/sepultamentos', { sepultura_id: s.id, historico: true, nome_sepultado: 'José da Silva', data_sepultamento: '2000-01-01' });
    await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29.5995, longitude: -50.8995 });
    const ano = new Date().getFullYear() - 1;
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano, valor_centavos: 1000 });
    await req('POST', '/api/anuidades/gerar', { ano });

    const { pins } = await json('GET', '/api/mapa');
    expect(pins).toEqual([
      expect.objectContaining({ codigo: 'S-0001', socio_nome: 'Maria da Silva', titular_pendente: true, ocupacao: 1, sepultados: ['José da Silva'], foto_id: null }),
    ]);
  });

  it('remove a localização', async () => {
    const s = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1 })).sepultura;
    await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: -29.5995, longitude: -50.8995 });
    await req('PUT', `/api/sepulturas/${s.id}/localizacao`, { latitude: null, longitude: null });
    expect((await json('GET', '/api/mapa')).pins).toHaveLength(0);
  });
});

describe('configuração do mapa', () => {
  it('posição padrão e imagem aérea', async () => {
    expect((await json('GET', '/api/mapa')).config).toEqual({ posicao: null, imagem_aerea: null });
    await req('PUT', '/api/mapa/posicao', { latitude: -29.5995, longitude: -50.8995, zoom: 19 });

    const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#6a6' } }).png().toBuffer();
    const limite = '----x';
    const corpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="limites"\r\n\r\n[[-29.6,-50.9],[-29.599,-50.899]]\r\n`),
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="drone.png"\r\nContent-Type: image/png\r\n\r\n`),
      img,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const up = await amb.app.inject({
      method: 'POST',
      url: '/api/mapa/imagem-aerea',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: corpo,
    });
    expect(up.statusCode).toBe(200);
    const cfg = up.json().config;
    expect(cfg.posicao).toEqual({ latitude: -29.5995, longitude: -50.8995, zoom: 19 });
    expect(cfg.imagem_aerea).toMatchObject({ limites: [[-29.6, -50.9], [-29.599, -50.899]], opacidade: 1, largura: 400, altura: 300 });
    expect((await req('GET', '/api/mapa/imagem-aerea.jpg')).statusCode).toBe(200);

    expect((await req('PUT', '/api/mapa/imagem-aerea', { limites: [[-29.599, -50.9], [-29.6, -50.899]], opacidade: 0.8 })).statusCode).toBe(400);
    await req('PUT', '/api/mapa/imagem-aerea', { limites: [[-29.6, -50.9], [-29.599, -50.899]], opacidade: 0.7 });
    expect((await json('GET', '/api/mapa')).config.imagem_aerea.opacidade).toBe(0.7);

    await req('DELETE', '/api/mapa/imagem-aerea');
    expect((await json('GET', '/api/mapa')).config.imagem_aerea).toBeNull();
  });
});

describe('proporção da imagem', () => {
  it('limites mantêm a proporção em metros', async () => {
    const { limitesProporcionais, larguraEmMetros } = await import('@cemiterio/shared');
    const l = limitesProporcionais(-29.69, -51.13, 120, 2);
    expect(Math.round(larguraEmMetros(l))).toBe(120);
    const alturaM = (l[1][0] - l[0][0]) * 111_320;
    expect(Math.round(alturaM)).toBe(60);
  });
});
