import { and, desc, eq, sql } from 'drizzle-orm';
import {
  CAMPOS_ESSENCIAIS,
  SITUACOES_SEPULTURA,
  SITUACOES_SOCIO,
  type Aniversariante,
  type Arrecadacao,
  type Caixa,
  type Devedor,
  type FormaPagamento,
  type SituacaoSepultura,
  type SituacaoSocio,
  type TipoCobranca,
  type VisaoGeral,
} from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { avisosCobranca, socios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { hojeLocal } from '../../shared/tempo.js';
import { descricaoCobranca, listarRecebimentos } from '../financeiro/service.js';
import { obterLinhaSocio } from '../socios/service.js';

/** Consultas de agregação ficam em SQL puro (mais legível para somas e agrupamentos). */
const todas = <T>(db: DB, sqlTexto: string, ...p: unknown[]) => db.$client.prepare(sqlTexto).all(...p) as T[];
const uma = <T>(db: DB, sqlTexto: string, ...p: unknown[]) => db.$client.prepare(sqlTexto).get(...p) as T;

interface LinhaCobrancaSocio {
  socio_id: number;
  matricula: string;
  nome: string;
  telefone: string | null;
  telefone2: string | null;
  token: string;
  tipo: TipoCobranca;
  ano: number;
  valor: number;
  vencimento: string;
  sepultura_id: number | null;
}

/**
 * Sócios com cobranças em aberto, agrupados.
 * - 'vencidas': inadimplência (vencimento já passou), qualquer sócio não falecido.
 * - 'a_vencer': lembrete antes de Finados (anuidade ainda não vencida), sócios ativos.
 */
export function listarDevedores(db: DB, modo: 'vencidas' | 'a_vencer', publicUrl: string): Devedor[] {
  const hoje = hojeLocal();
  const filtro =
    modo === 'vencidas'
      ? `c.vencimento < ? AND s.situacao <> 'falecido'`
      : `c.vencimento >= ? AND c.tipo = 'anuidade' AND s.situacao = 'ativo'`;
  const linhas = todas<LinhaCobrancaSocio>(
    db,
    `SELECT s.id socio_id, s.matricula, s.nome_completo nome, s.telefone, s.telefone2, s.token_publico token,
            c.tipo, c.ano, c.valor_centavos valor, c.vencimento, c.sepultura_id
       FROM cobrancas c JOIN socios s ON s.id = c.socio_id
      WHERE c.situacao = 'aberta' AND ${filtro}
      ORDER BY s.nome_normalizado, c.vencimento`,
    hoje,
  );
  const avisos = new Map(
    todas<{ socio_id: number; ultimo: string }>(
      db,
      `SELECT socio_id, max(criado_em) ultimo FROM avisos_cobranca WHERE tipo = ? GROUP BY socio_id`,
      modo === 'vencidas' ? 'cobranca' : 'lembrete',
    ).map((a) => [a.socio_id, a.ultimo]),
  );
  const base = publicUrl.replace(/\/$/, '');
  const porSocio = new Map<number, Devedor>();
  for (const l of linhas) {
    let d = porSocio.get(l.socio_id);
    if (!d) {
      d = {
        socio_id: l.socio_id,
        matricula: l.matricula,
        nome: l.nome,
        telefone: l.telefone,
        telefone2: l.telefone2,
        anos: [],
        outras: [],
        total_centavos: 0,
        vencimento_mais_antigo: l.vencimento,
        link_portal: `${base}/s/${l.token}`,
        ultimo_aviso: avisos.get(l.socio_id) ?? null,
      };
      porSocio.set(l.socio_id, d);
    }
    if (l.tipo === 'anuidade') d.anos.push(l.ano);
    else d.outras.push(descricaoCobranca({ tipo: l.tipo, ano: l.ano, sepulturaId: l.sepultura_id }, db));
    d.total_centavos += l.valor;
    if (l.vencimento < d.vencimento_mais_antigo) d.vencimento_mais_antigo = l.vencimento;
  }
  return [...porSocio.values()].sort((a, b) => b.total_centavos - a.total_centavos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function registrarAviso(db: DB, socioId: number, tipo: 'cobranca' | 'lembrete', canal: 'whatsapp' | 'telefone' | 'outro', usuarioId: number) {
  obterLinhaSocio(db, socioId);
  db.insert(avisosCobranca).values({ socioId, tipo, canal, usuarioId }).run();
  registrarAuditoria(db, { usuarioId, acao: tipo === 'cobranca' ? 'aviso_cobranca' : 'aviso_lembrete', entidade: 'socio', entidadeId: socioId, detalhes: { canal } });
}

export function ultimosAvisos(db: DB, socioId: number) {
  return db.select().from(avisosCobranca).where(eq(avisosCobranca.socioId, socioId)).orderBy(desc(avisosCobranca.id)).limit(20).all();
}

export function arrecadacao(db: DB, de: string, ate: string): Arrecadacao {
  const valido = `r.estornado_em IS NULL AND r.historico = 0 AND r.data_pagamento BETWEEN ? AND ?`;
  const total = uma<{ total: number | null; qtd: number }>(
    db,
    `SELECT sum(r.total_centavos) total, count(*) qtd FROM recebimentos r WHERE ${valido}`,
    de,
    ate,
  );
  const descontos = uma<{ d: number | null }>(
    db,
    `SELECT sum(p.desconto_centavos) d FROM pagamentos p JOIN recebimentos r ON r.id = p.recebimento_id WHERE ${valido}`,
    de,
    ate,
  );
  return {
    de,
    ate,
    total_centavos: total.total ?? 0,
    qtd_recibos: total.qtd,
    descontos_centavos: descontos.d ?? 0,
    por_forma: todas<{ forma: FormaPagamento; total_centavos: number; qtd: number }>(
      db,
      `SELECT r.forma, sum(r.total_centavos) total_centavos, count(*) qtd FROM recebimentos r WHERE ${valido} GROUP BY r.forma ORDER BY 2 DESC`,
      de,
      ate,
    ),
    por_tipo: todas<{ tipo: TipoCobranca; total_centavos: number; qtd: number }>(
      db,
      `SELECT c.tipo, sum(p.pago_centavos) total_centavos, count(*) qtd
         FROM pagamentos p JOIN recebimentos r ON r.id = p.recebimento_id JOIN cobrancas c ON c.id = p.cobranca_id
        WHERE ${valido} GROUP BY c.tipo ORDER BY 2 DESC`,
      de,
      ate,
    ),
    por_mes: todas<{ mes: string; total_centavos: number }>(
      db,
      `SELECT substr(r.data_pagamento, 1, 7) mes, sum(r.total_centavos) total_centavos FROM recebimentos r WHERE ${valido} GROUP BY 1 ORDER BY 1`,
      de,
      ate,
    ),
  };
}

/** Fechamento de caixa: o que foi registrado no balcão no dia (pela hora do registro). */
export function caixaDoDia(db: DB, data: string): Caixa {
  const todos = listarRecebimentos(db, { registradoNoDia: data, limite: 2000 }).filter((r) => !r.historico);
  const validos = todos.filter((r) => !r.estornado);
  const agrupar = <K extends string>(chave: (r: (typeof validos)[number]) => K) => {
    const m = new Map<K, { total_centavos: number; qtd: number }>();
    for (const r of validos) {
      const g = m.get(chave(r)) ?? { total_centavos: 0, qtd: 0 };
      g.total_centavos += r.total_centavos;
      g.qtd++;
      m.set(chave(r), g);
    }
    return [...m].sort((a, b) => b[1].total_centavos - a[1].total_centavos);
  };
  return {
    data,
    total_centavos: validos.reduce((t, r) => t + r.total_centavos, 0),
    por_forma: agrupar((r) => r.forma).map(([forma, g]) => ({ forma, ...g })),
    por_usuario: agrupar((r) => r.registrado_por ?? '—').map(([usuario, g]) => ({ usuario, ...g })),
    recebimentos: validos.reverse(),
    estornados: todos.filter((r) => r.estornado),
  };
}

export function visaoGeral(db: DB): VisaoGeral {
  const hoje = hojeLocal();
  const ano = Number(hoje.slice(0, 4));
  const contar = <K extends string>(lista: readonly K[], linhas: { k: K; n: number }[]) =>
    Object.fromEntries(lista.map((k) => [k, linhas.find((l) => l.k === k)?.n ?? 0])) as Record<K, number>;

  const pendentes = uma<{ n: number; total: number | null }>(
    db,
    `SELECT count(DISTINCT c.socio_id) n, sum(c.valor_centavos) total
       FROM cobrancas c JOIN socios s ON s.id = c.socio_id
      WHERE c.situacao = 'aberta' AND c.vencimento < ? AND s.situacao <> 'falecido'`,
    hoje,
  );
  const ativosPendentes = uma<{ n: number }>(
    db,
    `SELECT count(DISTINCT c.socio_id) n FROM cobrancas c JOIN socios s ON s.id = c.socio_id
      WHERE c.situacao = 'aberta' AND c.vencimento < ? AND s.situacao = 'ativo'`,
    hoje,
  ).n;
  const porSituacao = contar(SITUACOES_SOCIO, todas<{ k: SituacaoSocio; n: number }>(db, `SELECT situacao k, count(*) n FROM socios GROUP BY 1`));
  const somaPeriodo = (de: string, ate: string) =>
    uma<{ t: number | null }>(
      db,
      `SELECT sum(total_centavos) t FROM recebimentos WHERE estornado_em IS NULL AND historico = 0 AND data_pagamento BETWEEN ? AND ?`,
      de,
      ate,
    ).t ?? 0;
  const anuidade = uma<{ geradas: number; pagas: number | null }>(
    db,
    `SELECT count(*) geradas, sum(situacao = 'paga') pagas FROM cobrancas WHERE tipo = 'anuidade' AND situacao <> 'cancelada' AND ano = ?`,
    ano,
  );
  const incompletos = uma<{ n: number }>(
    db,
    `SELECT count(*) n FROM socios WHERE situacao <> 'falecido' AND (${CAMPOS_ESSENCIAIS.map((c) => `${c} IS NULL`).join(' OR ')})`,
  ).n;

  return {
    socios: porSituacao,
    ativos_em_dia: porSituacao.ativo - ativosPendentes,
    ativos_pendentes: ativosPendentes,
    total_vencido_centavos: pendentes.total ?? 0,
    arrecadado_mes_centavos: somaPeriodo(`${hoje.slice(0, 7)}-01`, hoje),
    arrecadado_ano_centavos: somaPeriodo(`${ano}-01-01`, hoje),
    sepulturas: contar(SITUACOES_SEPULTURA, todas<{ k: SituacaoSepultura; n: number }>(db, `SELECT situacao k, count(*) n FROM sepulturas GROUP BY 1`)),
    sepulturas_sem_mapa: uma<{ n: number }>(db, `SELECT count(*) n FROM sepulturas WHERE latitude IS NULL`).n,
    sepultamentos_ano: uma<{ n: number }>(db, `SELECT count(*) n FROM sepultamentos WHERE substr(data_sepultamento, 1, 4) = ? AND historico = 0`, String(ano)).n,
    cadastros_incompletos: incompletos,
    anuidade_ano: anuidade.geradas ? { ano, geradas: anuidade.geradas, pagas: anuidade.pagas ?? 0 } : null,
  };
}

export function aniversariantes(db: DB, mes: number): Aniversariante[] {
  const hoje = hojeLocal();
  return db
    .select({
      socio_id: socios.id,
      nome: socios.nomeCompleto,
      matricula: socios.matricula,
      data_nascimento: sql<string>`${socios.dataNascimento}`,
      telefone: socios.telefone,
    })
    .from(socios)
    .where(and(sql`${socios.situacao} <> 'falecido'`, sql`CAST(strftime('%m', ${socios.dataNascimento}) AS INTEGER) = ${mes}`))
    .orderBy(sql`strftime('%d', ${socios.dataNascimento})`)
    .all()
    // Idade que a pessoa completa neste ano.
    .map((s) => ({ ...s, idade: Number(hoje.slice(0, 4)) - Number(s.data_nascimento.slice(0, 4)) }));
}
