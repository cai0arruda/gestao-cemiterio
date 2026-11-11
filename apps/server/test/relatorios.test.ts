import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkWhatsapp, montarMensagem } from '@cemiterio/shared';
import { criarAmbiente } from './helpers.js';

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

type Metodo = 'GET' | 'POST' | 'PUT';
const req = (method: Metodo, url: string, payload?: unknown) =>
  amb.app.inject({ method, url, headers: { cookie }, payload: payload as object });
const json = async (method: Metodo, url: string, payload?: unknown) => (await req(method, url, payload)).json();

async function cenario() {
  const ana = (await json('POST', '/api/socios', { nome_completo: 'Ana Souza', telefone: '51999990001', data_nascimento: '1950-03-15' })).socio;
  const bia = (await json('POST', '/api/socios', { nome_completo: 'Beatriz Lima', telefone: '51999990002' })).socio;
  for (const ano of [ANO - 2, ANO - 1, ANO + 1]) {
    await req('PUT', '/api/valores', { tipo: 'anuidade', ano, valor_centavos: 10000 });
    await req('POST', '/api/anuidades/gerar', { ano });
  }
  // Bia paga tudo o que venceu, metade em dinheiro e metade no PIX.
  const cb = (await json('GET', `/api/socios/${bia.id}/financeiro`)).cobrancas.filter((c: { ano: number }) => c.ano < ANO);
  await req('POST', '/api/recebimentos', { socio_id: bia.id, itens: [{ cobranca_id: cb[0].id }], forma: 'dinheiro' });
  const r2 = (await json('POST', '/api/recebimentos', { socio_id: bia.id, itens: [{ cobranca_id: cb[1].id, desconto_centavos: 1000 }], forma: 'pix' })).recebimento;
  return { ana, bia, r2 };
}

describe('mensagens', () => {
  it('preenche o modelo e monta o link do WhatsApp', () => {
    expect(montarMensagem('Olá {nome}, {valor} {x}', { nome: 'Ana', valor: 'R$ 10,00' })).toBe('Olá Ana, R$ 10,00 {x}');
    expect(linkWhatsapp('(51) 99999-0001', 'oi')).toBe('https://wa.me/5551999990001?text=oi');
    expect(linkWhatsapp('123', 'oi')).toBeNull();
  });
});

describe('relatórios', () => {
  it('inadimplentes e lembretes (a vencer)', async () => {
    const { ana, bia } = await cenario();
    const venc = (await json('GET', '/api/relatorios/devedores?modo=vencidas')).devedores;
    expect(venc).toHaveLength(1);
    expect(venc[0]).toMatchObject({ socio_id: ana.id, anos: [ANO - 2, ANO - 1], total_centavos: 20000, ultimo_aviso: null });
    expect(venc[0].link_portal).toMatch(/\/s\/[A-Za-z0-9_-]+$/);

    await req('POST', `/api/socios/${ana.id}/avisos`, { tipo: 'cobranca' });
    expect((await json('GET', '/api/relatorios/devedores?modo=vencidas')).devedores[0].ultimo_aviso).not.toBeNull();

    const avencer = (await json('GET', '/api/relatorios/devedores?modo=a_vencer')).devedores;
    expect(avencer.map((d: { socio_id: number }) => d.socio_id).sort()).toEqual([ana.id, bia.id].sort());
    expect(avencer[0].anos).toEqual([ANO + 1]);
  });

  it('arrecadação por forma, tipo e mês; estorno não conta', async () => {
    const { r2 } = await cenario();
    const a = await json('GET', `/api/relatorios/arrecadacao?de=${ANO}-01-01&ate=${HOJE}`);
    expect(a).toMatchObject({ total_centavos: 19000, descontos_centavos: 1000, qtd_recibos: 2 });
    expect(a.por_forma).toEqual(expect.arrayContaining([
      { forma: 'dinheiro', total_centavos: 10000, qtd: 1 },
      { forma: 'pix', total_centavos: 9000, qtd: 1 },
    ]));
    expect(a.por_tipo).toEqual([{ tipo: 'anuidade', total_centavos: 19000, qtd: 2 }]);
    expect(a.por_mes).toEqual([{ mes: HOJE.slice(0, 7), total_centavos: 19000 }]);

    await req('POST', `/api/recebimentos/${r2.id}/estornar`, { motivo: 'Teste de estorno' });
    expect((await json('GET', `/api/relatorios/arrecadacao?de=${ANO}-01-01&ate=${HOJE}`)).total_centavos).toBe(10000);
  });

  it('caixa do dia separa estornados', async () => {
    const { r2 } = await cenario();
    await req('POST', `/api/recebimentos/${r2.id}/estornar`, { motivo: 'Teste de estorno' });
    const c = await json('GET', `/api/relatorios/caixa?data=${HOJE}`);
    expect(c.total_centavos).toBe(10000);
    expect(c.recebimentos).toHaveLength(1);
    expect(c.estornados).toHaveLength(1);
    expect(c.por_usuario[0]).toMatchObject({ usuario: 'Administrador', total_centavos: 10000 });
    expect((await json('GET', '/api/relatorios/caixa?data=2000-01-01')).total_centavos).toBe(0);
  });

  it('visão geral e aniversariantes', async () => {
    await cenario();
    const v = await json('GET', '/api/relatorios/visao-geral');
    expect(v).toMatchObject({ ativos_em_dia: 1, ativos_pendentes: 1, total_vencido_centavos: 20000, arrecadado_ano_centavos: 19000 });
    expect(v.socios.ativo).toBe(2);
    expect((await json('GET', '/api/relatorios/aniversariantes?mes=3')).aniversariantes).toEqual([
      expect.objectContaining({ nome: 'Ana Souza', idade: ANO - 1950 }),
    ]);
  });
});
