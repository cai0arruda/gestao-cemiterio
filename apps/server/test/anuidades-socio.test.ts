import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieDe, criarAmbiente } from './helpers.js';

const ANO = new Date().getFullYear();
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

describe('anuidades avulsas de um sócio', () => {
  it('prévia mostra existentes e usa o último valor para anos sem valor', async () => {
    const s = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO, valor_centavos: 12000 });
    await req('POST', '/api/anuidades/gerar', { ano: ANO });
    const { anos } = await json('GET', `/api/socios/${s.id}/anuidades/previa?de=${ANO}&ate=${ANO + 2}`);
    expect(anos).toEqual([
      { ano: ANO, vencimento: `${ANO}-11-02`, existente: 'aberta', valor_centavos: 12000, origem: null },
      { ano: ANO + 1, vencimento: `${ANO + 1}-11-02`, existente: null, valor_centavos: 12000, origem: 'ultimo_valor' },
      { ano: ANO + 2, vencimento: `${ANO + 2}-11-02`, existente: null, valor_centavos: 12000, origem: 'ultimo_valor' },
    ]);
  });

  it('gera só os anos que faltam, com o valor do ano quando existir, e pode pagar tudo junto', async () => {
    const s = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO, valor_centavos: 12000 });
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO + 1, valor_centavos: 13000 });
    await req('POST', '/api/anuidades/gerar', { ano: ANO });

    const r = await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO, ano_final: ANO + 2 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ criadas: [ANO + 1, ANO + 2], ja_existiam: [ANO] });

    const cobr = (await json('GET', `/api/socios/${s.id}/financeiro`)).cobrancas as { id: number; ano: number; valor_centavos: number }[];
    const valor = Object.fromEntries(cobr.map((c) => [c.ano, c.valor_centavos]));
    expect(valor).toEqual({ [ANO]: 12000, [ANO + 1]: 13000, [ANO + 2]: 13000 });

    const rec = await req('POST', '/api/recebimentos', { socio_id: s.id, itens: cobr.map((c) => ({ cobranca_id: c.id })), forma: 'pix' });
    expect(rec.json().recebimento.descricao).toBe(`Anuidades ${ANO}, ${ANO + 1}, ${ANO + 2}`);
    expect(rec.json().recebimento.resumo_atual).toMatchObject({ em_dia: true, quitado_ate: ANO + 2 });
  });

  it('atendente também pode gerar; sócio não ativo e sem valor cadastrado são recusados', async () => {
    const s = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
    expect((await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO, ano_final: ANO })).json().codigo).toBe('valor_nao_cadastrado');

    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO, valor_centavos: 12000 });
    await req('POST', '/api/usuarios', { nome: 'At', login: 'atendente', senha: 'senha-atendente-1', perfil: 'atendente' });
    const c = cookieDe(await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'atendente', senha: 'senha-atendente-1' } }));
    expect((await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO + 1, ano_final: ANO + 1 }, c)).statusCode).toBe(201);

    await req('PATCH', `/api/socios/${s.id}/situacao`, { situacao: 'associacao_encerrada', direito_sepultamento: 'utilizado', justificativa: 'Teste de bloqueio' });
    expect((await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO + 2, ano_final: ANO + 2 })).statusCode).toBe(400);
    expect((await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO, ano_final: ANO + 20 })).statusCode).toBe(400);
  });
});

describe('excluir anuidade gerada por engano', () => {
  it('exclui só anuidade em aberto e sem pagamento; o resto pede "cancelar"', async () => {
    const s = (await json('POST', '/api/socios', { nome_completo: 'Maria da Silva' })).socio;
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano: ANO, valor_centavos: 12000 });
    await req('PUT', '/api/valores', { tipo: 'taxa_associacao', ano: ANO, valor_centavos: 50000 });
    await req('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO, ano_final: ANO + 2 });
    const cobr = () => json('GET', `/api/socios/${s.id}/financeiro`).then((f) => f.cobrancas as { id: number; ano: number; tipo: string }[]);
    const porAno = async (ano: number) => (await cobr()).find((c) => c.ano === ano && c.tipo === 'anuidade')!;

    // em aberto e sem pagamento: exclui de verdade
    const a2 = await porAno(ANO + 2);
    expect((await req('DELETE' as Metodo, `/api/cobrancas/${a2.id}`)).statusCode).toBe(200);
    expect((await cobr()).map((c) => c.ano).sort()).toEqual([ANO, ANO + 1]);
    // pode gerar de novo depois
    expect((await json('POST', `/api/socios/${s.id}/anuidades`, { ano_inicial: ANO + 2, ano_final: ANO + 2 })).criadas).toEqual([ANO + 2]);

    // paga: não exclui
    const a0 = await porAno(ANO);
    const rec = (await json('POST', '/api/recebimentos', { socio_id: s.id, itens: [{ cobranca_id: a0.id }], forma: 'pix' })).recebimento;
    expect((await req('DELETE' as Metodo, `/api/cobrancas/${a0.id}`)).statusCode).toBe(400);
    // estornada (voltou a aberta, mas teve pagamento): também não
    await req('POST', `/api/recebimentos/${rec.id}/estornar`, { motivo: 'Teste de estorno' });
    expect((await req('DELETE' as Metodo, `/api/cobrancas/${a0.id}`)).statusCode).toBe(409);

    // outros tipos: usar cancelar
    await req('PATCH', `/api/socios/${s.id}/situacao`, { situacao: 'associacao_encerrada', direito_sepultamento: 'utilizado', justificativa: 'Teste' });
    await req('POST', `/api/socios/${s.id}/taxa-associacao`);
    const taxa = (await cobr()).find((c) => c.tipo === 'taxa_associacao')!;
    expect((await req('DELETE' as Metodo, `/api/cobrancas/${taxa.id}`)).statusCode).toBe(400);

    const hist = (await json('GET', `/api/auditoria?entidade=socio&entidade_id=${s.id}`)).registros;
    expect(hist.some((h: { acao: string }) => h.acao === 'excluir_cobranca')).toBe(true);
  });
});
