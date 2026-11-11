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

const definirValor = (tipo: string, ano: number, valor_centavos: number) => req('PUT', '/api/valores', { tipo, ano, valor_centavos });
const criarSocio = async (nome: string, extra: Record<string, unknown> = {}) =>
  (await req('POST', '/api/socios', { nome_completo: nome, ...extra })).json().socio;
const financeiro = async (id: number) => (await req('GET', `/api/socios/${id}/financeiro`)).json();
const pagar = (socio_id: number, ids: number[], extra: Record<string, unknown> = {}, c = cookie) =>
  req('POST', '/api/recebimentos', { socio_id, itens: ids.map((cobranca_id) => ({ cobranca_id })), forma: 'pix', ...extra }, c);

describe('valores e geração de anuidades', () => {
  it('exige valor cadastrado e gera só para sócios ativos, sem repetir', async () => {
    const a = await criarSocio('Ana Souza');
    await criarSocio('Bruno Lima');
    const enc = await criarSocio('Carla Dias');
    await req('PATCH', `/api/socios/${enc.id}/situacao`, {
      situacao: 'associacao_encerrada', direito_sepultamento: 'utilizado', justificativa: 'Ficha antiga',
    });

    const semValor = await req('POST', '/api/anuidades/gerar', { ano: ANO });
    expect(semValor.statusCode).toBe(400);
    expect(semValor.json().codigo).toBe('valor_nao_cadastrado');

    await definirValor('anuidade', ANO, 12000);
    expect((await req('POST', '/api/anuidades/gerar', { ano: ANO })).json().criadas).toBe(2);
    expect((await req('POST', '/api/anuidades/gerar', { ano: ANO })).json().criadas).toBe(0);

    const f = await financeiro(a.id);
    expect(f.cobrancas).toHaveLength(1);
    expect(f.cobrancas[0]).toMatchObject({ descricao: `Anuidade ${ANO}`, valor_centavos: 12000, vencimento: `${ANO}-11-02` });
  });

  it('reajuste não altera cobranças já geradas', async () => {
    const a = await criarSocio('Ana Souza');
    await definirValor('anuidade', ANO, 12000);
    await req('POST', '/api/anuidades/gerar', { ano: ANO });
    await definirValor('anuidade', ANO, 15000);
    expect((await financeiro(a.id)).cobrancas[0].valor_centavos).toBe(12000);
    const valores = (await req('GET', '/api/valores')).json().valores;
    expect(valores).toEqual([expect.objectContaining({ tipo: 'anuidade', ano: ANO, valor_centavos: 15000 })]);
  });
});

describe('sócio novo e taxa de associação', () => {
  it('sócio novo fica pendente; ao pagar a taxa fica ativo e recebe a anuidade do ano', async () => {
    expect((await req('POST', '/api/socios', { nome_completo: 'Novo Sócio', cobrar_taxa_associacao: true })).statusCode).toBe(400);
    await definirValor('taxa_associacao', ANO, 50000);
    await definirValor('anuidade', ANO, 12000);
    const s = await criarSocio('Novo Sócio', { cobrar_taxa_associacao: true });
    expect(s.situacao).toBe('pendente');

    const taxa = (await financeiro(s.id)).cobrancas[0];
    expect(taxa).toMatchObject({ tipo: 'taxa_associacao', valor_centavos: 50000 });
    const r = await pagar(s.id, [taxa.id]);
    expect(r.statusCode).toBe(201);
    expect(r.json().recebimento.numero).toBe(`${ANO}/000001`);

    const depois = (await req('GET', `/api/socios/${s.id}`)).json().socio;
    expect(depois).toMatchObject({ situacao: 'ativo', direito_sepultamento: 'disponivel' });
    expect(depois.data_associacao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const anuidade = (await financeiro(s.id)).cobrancas.find((c: { tipo: string }) => c.tipo === 'anuidade');
    expect(anuidade).toMatchObject({ ano: ANO, situacao: 'aberta', valor_centavos: 12000 });

    const r2 = await pagar(s.id, [anuidade.id]);
    expect(r2.json().recebimento.numero).toBe(`${ANO}/000002`);
  });

  it('renovação: sócio com associação encerrada pode gerar a taxa; ativo não', async () => {
    await definirValor('taxa_associacao', ANO, 50000);
    const s = await criarSocio('Ana Souza');
    expect((await req('POST', `/api/socios/${s.id}/taxa-associacao`)).statusCode).toBe(400);
    await req('PATCH', `/api/socios/${s.id}/situacao`, {
      situacao: 'associacao_encerrada', direito_sepultamento: 'utilizado', justificativa: 'Familiar sepultado',
    });
    expect((await req('POST', `/api/socios/${s.id}/taxa-associacao`)).statusCode).toBe(201);
    expect((await req('POST', `/api/socios/${s.id}/taxa-associacao`)).statusCode).toBe(409);
  });
});

describe('pagamentos', () => {
  async function socioComAnuidades(anos: number[]) {
    const s = await criarSocio('Maria da Silva');
    for (const ano of anos) {
      await definirValor('anuidade', ano, 10000);
      await req('POST', '/api/anuidades/gerar', { ano });
    }
    return { s, cobrancas: (await financeiro(s.id)).cobrancas as { id: number; ano: number }[] };
  }

  it('quita vários anos num único recibo e atualiza a situação', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 2, ANO - 1]);
    const antes = (await financeiro(s.id)).resumo;
    expect(antes).toMatchObject({ em_dia: false, anos_pendentes: [ANO - 2, ANO - 1], total_vencido_centavos: 20000 });
    const lista = (await req('GET', '/api/socios')).json().socios;
    expect(lista[0].pendencias).toBe(2);

    const r = (await pagar(s.id, cobrancas.map((c) => c.id))).json().recebimento;
    expect(r.total_centavos).toBe(20000);
    expect(r.descricao).toBe(`Anuidades ${ANO - 2}, ${ANO - 1}`);
    expect(r.resumo_atual).toMatchObject({ em_dia: true, quitado_ate: ANO - 1 });
  });

  it('não paga duas vezes a mesma cobrança', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 1]);
    expect((await pagar(s.id, [cobrancas[0]!.id])).statusCode).toBe(201);
    expect((await pagar(s.id, [cobrancas[0]!.id])).statusCode).toBe(409);
  });

  it('não aceita data futura nem cobrança de outro sócio', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 1]);
    expect((await pagar(s.id, [cobrancas[0]!.id], { data_pagamento: `${ANO + 1}-01-01` })).statusCode).toBe(400);
    const outro = await criarSocio('Outro Sócio');
    expect((await pagar(outro.id, [cobrancas[0]!.id])).statusCode).toBe(400);
  });

  it('desconto só para administrador', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 1]);
    await req('POST', '/api/usuarios', { nome: 'Atendente', login: 'atendente', senha: 'senha-atendente-1', perfil: 'atendente' });
    const login = await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'atendente', senha: 'senha-atendente-1' } });
    const cAtendente = cookieDe(login);
    const comDesconto = { socio_id: s.id, itens: [{ cobranca_id: cobrancas[0]!.id, desconto_centavos: 2000 }], forma: 'dinheiro' };
    expect((await req('POST', '/api/recebimentos', comDesconto, cAtendente)).statusCode).toBe(403);
    const r = await req('POST', '/api/recebimentos', comDesconto);
    expect(r.json().recebimento.total_centavos).toBe(8000);
  });

  it('impressão conta as vias', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 1]);
    const id = (await pagar(s.id, [cobrancas[0]!.id])).json().recebimento.id;
    expect((await req('POST', `/api/recebimentos/${id}/impressao`)).json().via).toBe(1);
    expect((await req('POST', `/api/recebimentos/${id}/impressao`)).json().via).toBe(2);
  });

  it('sócio com pagamento não pode ser excluído', async () => {
    const { s, cobrancas } = await socioComAnuidades([ANO - 1]);
    await pagar(s.id, [cobrancas[0]!.id]);
    expect((await req('DELETE', `/api/socios/${s.id}`)).statusCode).toBe(409);
  });
});

describe('estorno', () => {
  it('reabre as cobranças e bloqueia a reimpressão', async () => {
    const s = await criarSocio('Maria da Silva');
    await definirValor('anuidade', ANO - 1, 10000);
    await req('POST', '/api/anuidades/gerar', { ano: ANO - 1 });
    const c = (await financeiro(s.id)).cobrancas[0];
    const id = (await pagar(s.id, [c.id])).json().recebimento.id;

    expect((await req('POST', `/api/recebimentos/${id}/estornar`, { motivo: 'x' })).statusCode).toBe(400);
    const e = await req('POST', `/api/recebimentos/${id}/estornar`, { motivo: 'Registrado no sócio errado' });
    expect(e.json().recebimento.estornado).toBe(true);
    expect((await financeiro(s.id)).cobrancas[0].situacao).toBe('aberta');
    expect((await req('POST', `/api/recebimentos/${id}/estornar`, { motivo: 'De novo, de novo' })).statusCode).toBe(409);
    expect((await req('POST', `/api/recebimentos/${id}/impressao`)).statusCode).toBe(400);
    // pode pagar de novo depois do estorno
    expect((await pagar(s.id, [c.id])).statusCode).toBe(201);
  });

  it('estorno da taxa devolve o sócio para pendente e cancela a anuidade gerada', async () => {
    await definirValor('taxa_associacao', ANO, 50000);
    await definirValor('anuidade', ANO, 12000);
    const s = await criarSocio('Novo Sócio', { cobrar_taxa_associacao: true });
    const taxa = (await financeiro(s.id)).cobrancas[0];
    const id = (await pagar(s.id, [taxa.id])).json().recebimento.id;
    await req('POST', `/api/recebimentos/${id}/estornar`, { motivo: 'Pagamento devolvido' });

    expect((await req('GET', `/api/socios/${s.id}`)).json().socio).toMatchObject({ situacao: 'pendente', data_associacao: null });
    const cobr = (await financeiro(s.id)).cobrancas;
    expect(cobr.find((c: { tipo: string }) => c.tipo === 'taxa_associacao').situacao).toBe('aberta');
    expect(cobr.find((c: { tipo: string }) => c.tipo === 'anuidade').situacao).toBe('cancelada');
  });
});

describe('anuidades antigas (fichas em papel)', () => {
  it('lança anos pagos sem recibo e pula os já pagos', async () => {
    const s = await criarSocio('Maria da Silva');
    const r1 = await req('POST', `/api/socios/${s.id}/anuidades-antigas`, { ano_inicial: ANO - 3, ano_final: ANO - 2, valor_centavos: 8000 });
    expect(r1.json()).toEqual({ lancados: [ANO - 3, ANO - 2], ja_pagos: [] });
    const r2 = await req('POST', `/api/socios/${s.id}/anuidades-antigas`, { ano_inicial: ANO - 3, ano_final: ANO - 1, valor_centavos: 8000 });
    expect(r2.json()).toEqual({ lancados: [ANO - 1], ja_pagos: [ANO - 3, ANO - 2] });

    const f = await financeiro(s.id);
    expect(f.resumo).toMatchObject({ em_dia: true, quitado_ate: ANO - 1 });
    expect(f.recebimentos.every((r: { historico: boolean; numero: string | null }) => r.historico && r.numero === null)).toBe(true);
    expect(
      (await req('POST', `/api/socios/${s.id}/anuidades-antigas`, { ano_inicial: ANO, ano_final: ANO + 1, valor_centavos: 1 })).statusCode,
    ).toBe(400);
  });
});

describe('configurações', () => {
  it('lê padrões e salva alterações', async () => {
    const r = (await req('GET', '/api/configuracoes')).json();
    expect(r.configuracoes.cemiterio_nome).toBe('Cemitério Campo Vicente');
    const novas = { ...r.configuracoes, cemiterio_cnpj: '00.000.000/0001-00', recibo_largura_mm: '58' };
    expect((await req('PUT', '/api/configuracoes', novas)).json().configuracoes.recibo_largura_mm).toBe('58');
  });
});
