import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieDe, criarAmbiente } from './helpers.js';

const ANO = new Date().getFullYear();
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

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const req = (method: Metodo, url: string, payload?: unknown, c = cookie) =>
  amb.app.inject({ method, url, headers: { cookie: c }, payload: payload as object });
const json = async (method: Metodo, url: string, payload?: unknown) => (await req(method, url, payload)).json();

const novoSocio = async (nome: string, extra: Record<string, unknown> = {}) =>
  (await json('POST', '/api/socios', { nome_completo: nome, ...extra })).socio;
const novaSepultura = async (extra: Record<string, unknown> = {}) =>
  (await json('POST', '/api/sepulturas', { tipo: 'tumulo', capacidade: 2, ...extra })).sepultura;
const socio = async (id: number) => (await json('GET', `/api/socios/${id}`)).socio;
const sepultura = async (id: number) => (await json('GET', `/api/sepulturas/${id}`)).sepultura;
const cobrancas = async (id: number) => (await json('GET', `/api/socios/${id}/financeiro`)).cobrancas;
const pagar = async (socioId: number, ids: number[]) =>
  req('POST', '/api/recebimentos', { socio_id: socioId, itens: ids.map((cobranca_id) => ({ cobranca_id })), forma: 'dinheiro' });
const sepultar = (d: Record<string, unknown>) =>
  req('POST', '/api/sepultamentos', { data_sepultamento: HOJE, nome_sepultado: 'Pessoa Sepultada', ...d });

/** Sócio ativo, em dia, com uma sepultura (cadastrada como já dele). */
async function socioComSepultura(nome = 'Maria da Silva') {
  const s = await novoSocio(nome);
  const sep = await novaSepultura({ socio_id: s.id });
  return { s, sep };
}

describe('sepulturas', () => {
  it('gera código sequencial e registra titular de sepultura antiga', async () => {
    const a = await novaSepultura();
    expect(a).toMatchObject({ codigo: 'S-0001', situacao: 'disponivel', socio_id: null });
    const { s, sep } = await socioComSepultura();
    expect(sep).toMatchObject({ codigo: 'S-0002', situacao: 'vendida', socio_id: s.id });
    expect(sep.titulares).toEqual([expect.objectContaining({ socio_id: s.id, motivo: 'cadastro', fim: null })]);
    expect((await req('POST', '/api/sepulturas', { codigo: 's-0001', tipo: 'tumulo', capacidade: 1 })).statusCode).toBe(409);
  });

  it('venda: reserva, pagamento transfere e estorno desfaz', async () => {
    const s = await novoSocio('Comprador Teste');
    const sep = await novaSepultura();
    expect((await req('POST', `/api/sepulturas/${sep.id}/venda`, { socio_id: s.id, valor_centavos: 300000 })).statusCode).toBe(200);
    expect((await sepultura(sep.id)).situacao).toBe('reservada');
    expect((await req('POST', `/api/sepulturas/${sep.id}/venda`, { socio_id: s.id, valor_centavos: 300000 })).statusCode).toBe(409);

    const c = (await cobrancas(s.id))[0];
    expect(c.descricao).toBe('Compra de sepultura S-0001');
    const rec = (await (await pagar(s.id, [c.id])).json()).recebimento;
    expect(await sepultura(sep.id)).toMatchObject({ situacao: 'vendida', socio_id: s.id, data_aquisicao: HOJE });

    await req('POST', `/api/recebimentos/${rec.id}/estornar`, { motivo: 'Desistiu da compra' });
    const depois = await sepultura(sep.id);
    expect(depois).toMatchObject({ situacao: 'reservada', socio_id: null, titulares: [] });

    await req('POST', `/api/cobrancas/${c.id}/cancelar`, { motivo: 'Desistiu da compra' });
    expect((await sepultura(sep.id)).situacao).toBe('disponivel');
  });

  it('busca por código, titular e nome de sepultado', async () => {
    const { s, sep } = await socioComSepultura('Joana Pereira');
    await sepultar({ sepultura_id: sep.id, historico: true, nome_sepultado: 'José Antônio Pereira' });
    const buscar = async (q: string) => (await json('GET', `/api/sepulturas?q=${encodeURIComponent(q)}`)).sepulturas;
    expect(await buscar('s-0001')).toHaveLength(1);
    expect(await buscar('joana')).toHaveLength(1);
    expect(await buscar('jose antonio')).toHaveLength(1);
    expect((await json('GET', '/api/sepultados?q=antonio')).sepultados[0]).toMatchObject({ sepultura_codigo: 'S-0001' });
    expect(s).toBeTruthy();
  });
});

describe('regras do direito de sepultamento', () => {
  it('lista o que falta para ter direito', async () => {
    const s = await novoSocio('Sem Sepultura');
    const d = await json('GET', `/api/socios/${s.id}/direito`);
    expect(d.pode).toBe(false);
    expect(d.itens.find((i: { regra: string }) => i.regra === 'Tem sepultura comprada').ok).toBe(false);
  });

  it('bloqueia quem não está em dia; administrador pode registrar exceção com justificativa', async () => {
    const { s, sep } = await socioComSepultura();
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO - 1, valor_centavos: 10000 });
    await req('POST', '/api/anuidades/gerar', { ano: ANO - 1 });

    const r = await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain('Anuidades em dia');

    const exc = await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true, justificativa_excecao: 'Família quitará depois' });
    expect(exc.statusCode).toBe(201);
  });

  it('caso A: o próprio sócio — fica falecido e as anuidades futuras são canceladas', async () => {
    const { s, sep } = await socioComSepultura();
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO + 1, valor_centavos: 10000 });
    await req('POST', '/api/anuidades/gerar', { ano: ANO + 1 });

    const r = await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true, nome_sepultado: 'Maria da Silva' });
    expect(r.json()).toMatchObject({ sugerir_sucessao: true });
    expect(await socio(s.id)).toMatchObject({ situacao: 'falecido', direito_sepultamento: 'utilizado', data_falecimento: HOJE });
    expect((await cobrancas(s.id))[0]).toMatchObject({ situacao: 'cancelada', motivo_cancelamento: 'Falecimento do sócio' });
    expect((await sepultura(sep.id)).situacao).toBe('ocupada');
  });

  it('caso B: familiar — associação encerrada; renovar com a taxa devolve o direito', async () => {
    const { s, sep } = await socioComSepultura();
    await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, nome_sepultado: 'Filho do Sócio', parentesco: 'filho' });
    expect(await socio(s.id)).toMatchObject({ situacao: 'associacao_encerrada', direito_sepultamento: 'utilizado' });

    // Segundo sepultamento sem renovar: bloqueado.
    expect((await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id })).statusCode).toBe(409);

    await req('PUT', '/api/valores', { tipo: 'taxa_associacao', ano: ANO, valor_centavos: 50000 });
    await req('POST', `/api/socios/${s.id}/taxa-associacao`);
    const taxa = (await cobrancas(s.id)).find((c: { tipo: string }) => c.tipo === 'taxa_associacao');
    await pagar(s.id, [taxa.id]);
    expect(await socio(s.id)).toMatchObject({ situacao: 'ativo', direito_sepultamento: 'disponivel' });
    // Basta a taxa: a mesma sepultura (túmulo com 2 lugares) continua sendo dele.
    expect((await json('GET', `/api/socios/${s.id}/direito?sepultura_id=${sep.id}`)).pode).toBe(true);
  });

  it('respeita a capacidade da sepultura', async () => {
    const { s, sep } = await socioComSepultura();
    await req('PUT', `/api/sepulturas/${sep.id}`, { tipo: 'tumulo', capacidade: 1 });
    await sepultar({ sepultura_id: sep.id, historico: true });
    const r = await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true });
    expect(r.json().erro).toContain('Há espaço na sepultura');
  });

  it('atendente não pode registrar exceção', async () => {
    const { s, sep } = await socioComSepultura();
    await req('POST', '/api/usuarios', { nome: 'At', login: 'atendente', senha: 'senha-atendente-1', perfil: 'atendente' });
    const c = cookieDe(await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'atendente', senha: 'senha-atendente-1' } }));
    await req('PATCH', `/api/socios/${s.id}/situacao`, { situacao: 'pendente', direito_sepultamento: 'disponivel', justificativa: 'Teste de bloqueio' });
    const r = await req('POST', '/api/sepultamentos', {
      sepultura_id: sep.id, socio_direito_id: s.id, nome_sepultado: 'Fulano de Tal', data_sepultamento: HOJE, justificativa_excecao: 'Quero',
    }, c);
    expect(r.statusCode).toBe(403);
  });

  it('excluir registro feito por engano desfaz tudo', async () => {
    const { s, sep } = await socioComSepultura();
    await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true });
    const id = (await sepultura(sep.id)).sepultados[0].id;
    expect((await req('POST', `/api/sepultamentos/${id}/excluir`, { motivo: 'Sócio errado' })).statusCode).toBe(200);
    expect(await socio(s.id)).toMatchObject({ situacao: 'ativo', direito_sepultamento: 'disponivel', data_falecimento: null });
    expect((await sepultura(sep.id)).situacao).toBe('vendida');
  });

  it('lançamento antigo não mexe no sócio', async () => {
    const { s, sep } = await socioComSepultura();
    expect((await sepultar({ sepultura_id: sep.id, historico: true, nome_sepultado: 'Avô Antigo', data_sepultamento: '1990-05-01' })).statusCode).toBe(201);
    expect(await socio(s.id)).toMatchObject({ situacao: 'ativo', direito_sepultamento: 'disponivel' });
  });

  it('não aceita data futura', async () => {
    const { s, sep } = await socioComSepultura();
    expect((await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, data_sepultamento: `${ANO + 1}-01-01` })).statusCode).toBe(400);
  });
});

describe('sucessão', () => {
  async function falecidoComSepulturas() {
    const { s, sep } = await socioComSepultura('Titular Falecido');
    const sep2 = await novaSepultura({ socio_id: s.id });
    await sepultar({ sepultura_id: sep.id, socio_direito_id: s.id, sepultado_e_socio: true, nome_sepultado: 'Titular Falecido' });
    return { s, sep, sep2 };
  }

  it('familiar novo paga a taxa e recebe as sepulturas; estorno devolve', async () => {
    await req('PUT', '/api/valores', { tipo: 'taxa_associacao', ano: ANO, valor_centavos: 50000 });
    const { s, sep, sep2 } = await falecidoComSepulturas();
    const r = await req('POST', `/api/socios/${s.id}/sucessao`, { novo_socio: { nome_completo: 'Filha Herdeira' } });
    expect(r.statusCode).toBe(201);
    const { socio_destino_id: filha, concluida } = r.json();
    expect(concluida).toBe(false);
    expect((await socio(filha)).situacao).toBe('pendente');
    expect((await sepultura(sep.id)).socio_id).toBe(s.id);
    expect((await req('POST', `/api/socios/${s.id}/sucessao`, { novo_socio: { nome_completo: 'Outro Filho' } })).statusCode).toBe(409);

    const taxa = (await cobrancas(filha))[0];
    const rec = (await (await pagar(filha, [taxa.id])).json()).recebimento;
    expect(rec.avisos).toEqual(expect.arrayContaining(['2 sepultura(s) transferida(s) para este sócio (sucessão).']));
    expect((await sepultura(sep.id)).socio_id).toBe(filha);
    expect((await sepultura(sep2.id)).titulares[0]).toMatchObject({ socio_id: filha, motivo: 'sucessao' });
    expect((await json('GET', `/api/socios/${filha}/sepulturas`)).sucessoes[0].situacao).toBe('concluida');

    await req('POST', `/api/recebimentos/${rec.id}/estornar`, { motivo: 'Pagamento devolvido' });
    expect((await sepultura(sep.id)).socio_id).toBe(s.id);
    expect((await json('GET', `/api/socios/${filha}/sepulturas`)).sucessoes[0].situacao).toBe('pendente');
  });

  it('familiar que já é sócio ativo recebe na hora', async () => {
    const { s, sep } = await falecidoComSepulturas();
    const irmao = await novoSocio('Irmão Ativo');
    const r = (await req('POST', `/api/socios/${s.id}/sucessao`, { socio_destino_id: irmao.id })).json();
    expect(r.concluida).toBe(true);
    expect((await sepultura(sep.id)).socio_id).toBe(irmao.id);
  });

  it('só a partir de sócio falecido', async () => {
    const { s } = await socioComSepultura();
    expect((await req('POST', `/api/socios/${s.id}/sucessao`, { novo_socio: { nome_completo: 'Alguém Novo' } })).statusCode).toBe(400);
  });
});

describe('portal', () => {
  it('mostra os códigos das sepulturas do sócio', async () => {
    const { s } = await socioComSepultura();
    const url = (await json('GET', `/api/socios/${s.id}/link-portal`)).url as string;
    const p = (await amb.app.inject({ url: `/api/publico/socio/${url.split('/s/')[1]}` })).json();
    expect(p.sepulturas).toEqual([{ codigo: 'S-0001', referencia: null, setor: null, latitude: null, longitude: null }]);
  });
});
