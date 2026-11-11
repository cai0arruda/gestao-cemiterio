import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpfValido } from '@cemiterio/shared';
import { criarAmbiente } from './helpers.js';

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let cookie: string;
beforeEach(async () => {
  amb = await criarAmbiente();
  cookie = await amb.configurarAdmin();
});
afterEach(() => amb.limpar());

const criar = (payload: Record<string, unknown>) =>
  amb.app.inject({ method: 'POST', url: '/api/socios', headers: { cookie }, payload });

describe('CPF', () => {
  it('valida dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});

describe('cadastro de sócios', () => {
  it('cria com matrícula automática sequencial e normaliza campos vazios', async () => {
    const a = await criar({ nome_completo: 'Maria da Silva', telefone: '', cep: '93890-000' });
    expect(a.statusCode).toBe(201);
    expect(a.json().socio).toMatchObject({ matricula: '0001', telefone: null, cep: '93890000', situacao: 'ativo' });
    const b = await criar({ nome_completo: 'João Souza', matricula: '0457' });
    expect(b.json().socio.matricula).toBe('0457');
    const c = await criar({ nome_completo: 'Pedro Lima' });
    expect(c.json().socio.matricula).toBe('0458');
  });

  it('recusa matrícula e CPF repetidos', async () => {
    await criar({ nome_completo: 'Maria da Silva', matricula: '10', cpf: '52998224725' });
    expect((await criar({ nome_completo: 'Outra Pessoa', matricula: '10' })).statusCode).toBe(409);
    const cpf = await criar({ nome_completo: 'Outra Pessoa', cpf: '529.982.247-25' });
    expect(cpf.statusCode).toBe(409);
    expect(cpf.json().codigo).toBe('cpf_duplicado');
  });

  it('valida dados', async () => {
    const r = await criar({ nome_completo: 'Al', cpf: '123', data_nascimento: '31/12/1950' });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().campos)).toEqual(expect.arrayContaining(['nome_completo', 'cpf', 'data_nascimento']));
  });

  it('busca ignorando acentos e maiúsculas, e por matrícula', async () => {
    await criar({ nome_completo: 'José Antônio Pereira', matricula: '0042' });
    await criar({ nome_completo: 'Ana Paula Gonçalves' });
    const buscar = async (q: string) =>
      (await amb.app.inject({ url: `/api/socios?q=${encodeURIComponent(q)}`, headers: { cookie } })).json().socios;
    expect(await buscar('jose pereira')).toHaveLength(1);
    expect(await buscar('GONCALVES')).toHaveLength(1);
    expect((await buscar('0042'))[0].nome_completo).toBe('José Antônio Pereira');
  });

  it('marca cadastro incompleto quando faltam campos essenciais', async () => {
    await criar({ nome_completo: 'Sem Dados' });
    await criar({
      nome_completo: 'Com Dados',
      data_nascimento: '1950-03-10',
      telefone: '51999999999',
      logradouro: 'Rua A',
      cidade: 'Cidade',
    });
    const lista = (await amb.app.inject({ url: '/api/socios', headers: { cookie } })).json().socios;
    const porNome = Object.fromEntries(lista.map((s: { nome_completo: string; incompleto: boolean }) => [s.nome_completo, s.incompleto]));
    expect(porNome).toEqual({ 'Sem Dados': true, 'Com Dados': false });
  });

  it('detecta possíveis duplicados', async () => {
    await criar({ nome_completo: 'Maria Aparecida da Silva', data_nascimento: '1948-05-02' });
    const verificar = async (payload: Record<string, unknown>) =>
      (
        await amb.app.inject({ method: 'POST', url: '/api/socios/verificar-duplicados', headers: { cookie }, payload })
      ).json().duplicados;
    expect(await verificar({ nome_completo: 'MARIA APARECIDA DA SILVA' })).toHaveLength(1);
    expect(await verificar({ nome_completo: 'Maria Silva', data_nascimento: '1948-05-02' })).toHaveLength(1);
    expect(await verificar({ nome_completo: 'Maria Aparecida Silva' })).toHaveLength(1);
    expect(await verificar({ nome_completo: 'Maria Silva', data_nascimento: '1960-01-01' })).toHaveLength(0);
    expect(await verificar({ nome_completo: 'Carlos Alberto Souza' })).toHaveLength(0);
  });

  it('registra auditoria das alterações', async () => {
    const s = (await criar({ nome_completo: 'Maria da Silva' })).json().socio;
    const r = await amb.app.inject({
      method: 'PUT',
      url: `/api/socios/${s.id}`,
      headers: { cookie },
      payload: { ...s, telefone: '51988887777' },
    });
    expect(r.statusCode).toBe(200);
    const aud = (await amb.app.inject({ url: `/api/auditoria?entidade=socio&entidade_id=${s.id}`, headers: { cookie } })).json();
    expect(aud.registros[0].acao).toBe('atualizar');
    expect(JSON.parse(aud.registros[0].detalhes)).toEqual({ telefone: { de: null, para: '51988887777' } });
  });

  it('ajuste manual de situação exige justificativa e data de falecimento', async () => {
    const s = (await criar({ nome_completo: 'Maria da Silva' })).json().socio;
    const url = `/api/socios/${s.id}/situacao`;
    const semData = await amb.app.inject({
      method: 'PATCH', url, headers: { cookie },
      payload: { situacao: 'falecido', direito_sepultamento: 'utilizado', justificativa: 'Ficha antiga' },
    });
    expect(semData.statusCode).toBe(400);
    const ok = await amb.app.inject({
      method: 'PATCH', url, headers: { cookie },
      payload: { situacao: 'falecido', direito_sepultamento: 'utilizado', data_falecimento: '2020-02-10', justificativa: 'Ficha antiga' },
    });
    expect(ok.json().socio).toMatchObject({ situacao: 'falecido', data_falecimento: '2020-02-10' });
  });
});

describe('fotos da ficha', () => {
  it('recebe imagem, gera miniatura e serve com login', async () => {
    const s = (await criar({ nome_completo: 'Maria da Silva' })).json().socio;
    const imagem = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#ccc' } }).png().toBuffer();
    const limite = '----teste';
    const corpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="tipo"\r\n\r\nficha\r\n`),
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="ficha.png"\r\nContent-Type: image/png\r\n\r\n`),
      imagem,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const up = await amb.app.inject({
      method: 'POST',
      url: `/api/socios/${s.id}/documentos`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: corpo,
    });
    expect(up.statusCode).toBe(201);
    const id = up.json().documento.id;

    const grande = await amb.app.inject({ url: `/api/documentos/${id}/arquivo`, headers: { cookie } });
    expect(grande.statusCode).toBe(200);
    expect((await sharp(grande.rawPayload).metadata()).width).toBe(2000);
    const mini = await amb.app.inject({ url: `/api/documentos/${id}/arquivo?miniatura=1`, headers: { cookie } });
    expect((await sharp(mini.rawPayload).metadata()).width).toBe(360);
    expect((await amb.app.inject({ url: `/api/documentos/${id}/arquivo` })).statusCode).toBe(401);

    // a contagem de fotos na lista é por sócio
    await criar({ nome_completo: 'Outra Pessoa' });
    const lista = (await amb.app.inject({ url: '/api/socios', headers: { cookie } })).json().socios;
    const fotos = Object.fromEntries(lista.map((x: { nome_completo: string; qtd_documentos: number }) => [x.nome_completo, x.qtd_documentos]));
    expect(fotos).toEqual({ 'Maria da Silva': 1, 'Outra Pessoa': 0 });
  });

  it('recusa arquivo que não é imagem', async () => {
    const s = (await criar({ nome_completo: 'Maria da Silva' })).json().socio;
    const limite = '----teste';
    const corpo = `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\nola\r\n--${limite}--\r\n`;
    const up = await amb.app.inject({
      method: 'POST',
      url: `/api/socios/${s.id}/documentos`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: corpo,
    });
    expect(up.statusCode).toBe(400);
  });
});
