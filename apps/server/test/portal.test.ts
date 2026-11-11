import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nomeAbreviado } from '@cemiterio/shared';
import { criarAmbiente } from './helpers.js';

const ANO = new Date().getFullYear();
let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let cookie: string;
beforeEach(async () => {
  amb = await criarAmbiente();
  cookie = await amb.configurarAdmin();
});
afterEach(() => amb.limpar());

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH';
const req = (method: Metodo, url: string, payload?: unknown) =>
  amb.app.inject({ method, url, headers: { cookie }, payload: payload as object });
const publico = (url: string) => amb.app.inject({ method: 'GET', url });
const tokenDe = (url: string) => url.split('/s/')[1]!;

async function cenario() {
  const s = (
    await req('POST', '/api/socios', {
      nome_completo: 'Maria Aparecida da Silva',
      cpf: '529.982.247-25',
      telefone: '51999887766',
      data_nascimento: '1948-05-02',
      logradouro: 'Rua das Flores',
    })
  ).json().socio;
  await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO - 1, valor_centavos: 10000 });
  await req('POST', '/api/anuidades/gerar', { ano: ANO - 1 });
  const c = (await req('GET', `/api/socios/${s.id}/financeiro`)).json().cobrancas[0];
  const rec = (await req('POST', '/api/recebimentos', { socio_id: s.id, itens: [{ cobranca_id: c.id }], forma: 'pix' })).json().recebimento;
  const url = (await req('GET', `/api/socios/${s.id}/link-portal`)).json().url as string;
  return { s, rec, token: tokenDe(url) };
}

describe('nome abreviado', () => {
  it('mostra só o primeiro nome e a inicial do último sobrenome', () => {
    expect(nomeAbreviado('Maria Aparecida da Silva')).toBe('MARIA S.');
    expect(nomeAbreviado('João')).toBe('JOÃO');
  });
});

describe('portal público', () => {
  it('funciona sem login e não expõe dados pessoais', async () => {
    const { token } = await cenario();
    const r = await publico(`/api/publico/socio/${token}`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const corpo = r.json();
    expect(corpo.socio).toEqual({ nome: 'MARIA S.', matricula: '0001', situacao: 'ativo', direito_sepultamento: 'disponivel' });
    expect(corpo.financeiro).toMatchObject({ em_dia: true, quitado_ate: ANO - 1, ultimas_anuidades: [{ ano: ANO - 1 }] });
    const texto = r.body;
    for (const proibido of ['52998224725', '51999887766', '1948-05-02', 'Rua das Flores', 'Aparecida', 'token']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('token desconhecido ou malformado dá 404', async () => {
    expect((await publico('/api/publico/socio/abc')).statusCode).toBe(404);
    expect((await publico('/api/publico/socio/AAAAAAAAAAAAAAAAAAAAAAAA')).statusCode).toBe(404);
  });

  it('confere o recibo: válido, estornado e de outro sócio', async () => {
    const { rec, token } = await cenario();
    const valido = (await publico(`/api/publico/socio/${token}?r=${rec.codigo_verificacao}`)).json().recibo;
    expect(valido).toMatchObject({ situacao: 'valido', numero: rec.numero, total_centavos: 10000, descricao: `Anuidade ${ANO - 1}` });

    expect((await publico(`/api/publico/socio/${token}?r=XXXXXXXXXX`)).json().recibo).toEqual({ situacao: 'nao_encontrado' });

    const outro = (await req('POST', '/api/socios', { nome_completo: 'Outra Pessoa' })).json().socio;
    const tokenOutro = tokenDe((await req('GET', `/api/socios/${outro.id}/link-portal`)).json().url);
    expect((await publico(`/api/publico/socio/${tokenOutro}?r=${rec.codigo_verificacao}`)).json().recibo.situacao).toBe('nao_encontrado');

    await req('POST', `/api/recebimentos/${rec.id}/estornar`, { motivo: 'Teste de estorno' });
    const estornado = (await publico(`/api/publico/socio/${token}?r=${rec.codigo_verificacao}`)).json();
    expect(estornado.recibo.situacao).toBe('estornado');
    expect(estornado.financeiro.em_dia).toBe(false);
  });

  it('gerar novo link invalida o antigo', async () => {
    const { s, token } = await cenario();
    const novo = tokenDe((await req('POST', `/api/socios/${s.id}/link-portal/novo`)).json().url);
    expect(novo).not.toBe(token);
    expect((await publico(`/api/publico/socio/${token}`)).statusCode).toBe(404);
    expect((await publico(`/api/publico/socio/${novo}`)).statusCode).toBe(200);
  });

  it('limita consultas por IP', async () => {
    const { token } = await cenario();
    let ultimo = 0;
    for (let i = 0; i < 31; i++) ultimo = (await publico(`/api/publico/socio/${token}`)).statusCode;
    expect(ultimo).toBe(429);
  });
});
