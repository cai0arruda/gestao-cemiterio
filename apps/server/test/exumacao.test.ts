import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieDe, criarAmbiente } from './helpers.js';

const HOJE = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let cookie: string;
beforeEach(async () => {
  amb = await criarAmbiente();
  cookie = await amb.configurarAdmin();
});
afterEach(() => amb.limpar());

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH';
const req = (method: Metodo, url: string, payload?: unknown, c = cookie) =>
  amb.app.inject({ method, url, headers: { cookie: c }, payload: payload as object });
const json = async (method: Metodo, url: string, payload?: unknown) => (await req(method, url, payload)).json();
const sepultura = async (id: number) => (await json('GET', `/api/sepulturas/${id}`)).sepultura;

async function cenario() {
  const s = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
  const cova = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1, socio_id: s.id })).sepultura;
  const ossuario = (await json('POST', '/api/sepulturas', { tipo: 'ossuario', capacidade: 1 })).sepultura;
  await req('POST', '/api/sepultamentos', {
    sepultura_id: cova.id, historico: true, nome_sepultado: 'José da Silva', data_sepultamento: '2000-05-01', socio_direito_id: s.id,
  });
  const reg = (await sepultura(cova.id)).sepultados[0];
  return { s, cova, ossuario, reg };
}

describe('exumação', () => {
  it('mantém o registro e libera o lugar', async () => {
    const { cova, reg } = await cenario();
    expect((await sepultura(cova.id)).situacao).toBe('ocupada');
    const r = await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'familia', observacao: 'Levado para Porto Alegre' });
    expect(r.statusCode).toBe(200);
    const depois = await sepultura(cova.id);
    expect(depois).toMatchObject({ situacao: 'vendida', ocupacao: 0 });
    expect(depois.sepultados[0]).toMatchObject({ nome_sepultado: 'José da Silva', exumado_em: HOJE, exumacao_destino: 'familia' });
    // continua aparecendo na busca de sepultados
    expect((await json('GET', '/api/sepultados?q=jose')).sepultados).toHaveLength(1);
    // não dá para exumar duas vezes
    expect((await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'familia' })).statusCode).toBe(409);
  });

  it('transfere para outra sepultura (ossuário) e desfazer volta tudo', async () => {
    const { cova, ossuario, reg } = await cenario();
    await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'outra_sepultura', sepultura_destino_id: ossuario.id });
    const oss = await sepultura(ossuario.id);
    expect(oss).toMatchObject({ situacao: 'ocupada', ocupacao: 1 });
    expect(oss.sepultados[0]).toMatchObject({ nome_sepultado: 'José da Silva', transferido_de_codigo: cova.codigo, data_sepultamento: HOJE });
    expect((await sepultura(cova.id)).sepultados[0].exumacao_sepultura_destino_codigo).toBe(ossuario.codigo);

    // o registro transferido não pode ser excluído direto
    expect((await req('POST', `/api/sepultamentos/${oss.sepultados[0].id}/excluir`, { motivo: 'Teste de exclusão' })).statusCode).toBe(409);

    // ossuário cheio: outra transferência é recusada
    const outro = (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 1 })).sepultura;
    await req('POST', '/api/sepultamentos', { sepultura_id: outro.id, historico: true, nome_sepultado: 'Ana Souza', data_sepultamento: '2001-01-01' });
    const reg2 = (await sepultura(outro.id)).sepultados[0];
    expect((await req('POST', `/api/sepultamentos/${reg2.id}/exumar`, { data_exumacao: HOJE, destino: 'outra_sepultura', sepultura_destino_id: ossuario.id })).statusCode).toBe(409);

    expect((await req('POST', `/api/sepultamentos/${reg.id}/desfazer-exumacao`, { motivo: 'Registrado por engano' })).statusCode).toBe(200);
    expect(await sepultura(ossuario.id)).toMatchObject({ situacao: 'disponivel', ocupacao: 0, sepultados: [] });
    expect(await sepultura(cova.id)).toMatchObject({ situacao: 'ocupada', ocupacao: 1 });
  });

  it('valida datas e destino; desfazer é só do administrador', async () => {
    const { reg } = await cenario();
    expect((await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: '1999-01-01', destino: 'familia' })).statusCode).toBe(400);
    expect((await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: '2999-01-01', destino: 'familia' })).statusCode).toBe(400);
    expect((await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'outra_sepultura' })).statusCode).toBe(400);

    await req('POST', '/api/usuarios', { nome: 'At', login: 'atendente', senha: 'senha-atendente-1', perfil: 'atendente' });
    const c = cookieDe(await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'atendente', senha: 'senha-atendente-1' } }));
    expect((await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'cremacao' }, c)).statusCode).toBe(200);
    expect((await req('POST', `/api/sepultamentos/${reg.id}/desfazer-exumacao`, { motivo: 'Tentativa do atendente' }, c)).statusCode).toBe(403);
  });

  it('restos na mesma sepultura: libera o lugar, mas o nome continua no local e no mapa', async () => {
    const { cova, reg } = await cenario();
    await req('PUT', `/api/sepulturas/${cova.id}/localizacao`, { latitude: -29.69, longitude: -51.12 });
    const r = await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'mesma_sepultura', observacao: 'Ossada em caixa' });
    expect(r.statusCode).toBe(200);
    const s = await sepultura(cova.id);
    expect(s).toMatchObject({ situacao: 'vendida', ocupacao: 0 });
    expect(s.sepultados[0]).toMatchObject({ exumacao_destino: 'mesma_sepultura', exumacao_sepultura_destino_id: null });
    const pin = (await json('GET', '/api/mapa')).pins.find((p: { id: number }) => p.id === cova.id);
    expect(pin.sepultados).toEqual(['José da Silva']);
    expect(pin.ocupacao).toBe(0);
    // desfazer funciona igual
    expect((await req('POST', `/api/sepultamentos/${reg.id}/desfazer-exumacao`, { motivo: 'Registrado por engano' })).statusCode).toBe(200);
    expect((await sepultura(cova.id)).ocupacao).toBe(1);
  });

  it('lugar liberado pela exumação pode receber novo sepultamento', async () => {
    const { s, cova, reg } = await cenario();
    await req('POST', `/api/sepultamentos/${reg.id}/exumar`, { data_exumacao: HOJE, destino: 'familia' });
    const d = await json('GET', `/api/socios/${s.id}/direito?sepultura_id=${cova.id}`);
    expect(d.itens.find((i: { regra: string }) => i.regra === 'Há espaço na sepultura').ok).toBe(true);
  });
});
