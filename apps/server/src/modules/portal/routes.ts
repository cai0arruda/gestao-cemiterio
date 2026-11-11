import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { nomeAbreviado, vencimentoAnuidade, type LinkPortal, type PortalSocio } from '@cemiterio/shared';
import type { AppContext } from '../../app.js';
import { cobrancas, pagamentos, recebimentos, sepulturas, setores, socios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { naoEncontrado } from '../../shared/erros.js';
import { agoraIso, hojeLocal } from '../../shared/tempo.js';
import { idParam, validar } from '../../shared/validacao.js';
import { exigirAdmin, exigirLogin, usuarioDe } from '../auth/guard.js';
import { lerConfiguracoes } from '../configuracoes/routes.js';
import { listarRecebimentos, resumoFinanceiro } from '../financeiro/service.js';
import { obterLinhaSocio } from '../socios/service.js';

const novoToken = () => randomBytes(18).toString('base64url');
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const FORMATO_CODIGO = /^[A-Z0-9]{6,20}$/;

export async function rotasPortal(app: FastifyInstance, { db, config }: AppContext) {
  const urlDoPortal = (token: string) => `${config.publicUrl.replace(/\/$/, '')}/s/${token}`;

  /**
   * Página pública (sem login) aberta pelo QR code do recibo.
   * Mostra só o mínimo: nome abreviado, matrícula, situação e anos pagos.
   */
  app.get(
    '/api/publico/socio/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
      const { token } = validar(z.object({ token: z.string() }), req.params);
      const { r } = validar(z.object({ r: z.string().optional() }), req.query);
      if (!FORMATO_TOKEN.test(token)) throw naoEncontrado('Cadastro');
      const s = db.select().from(socios).where(eq(socios.tokenPublico, token)).get();
      if (!s) throw naoEncontrado('Cadastro');

      const hoje = hojeLocal();
      const resumo = resumoFinanceiro(db, s.id, hoje);
      const ultimas = db
        .select({ ano: cobrancas.ano, pagoEm: recebimentos.dataPagamento })
        .from(cobrancas)
        .innerJoin(pagamentos, eq(pagamentos.cobrancaId, cobrancas.id))
        .innerJoin(recebimentos, eq(recebimentos.id, pagamentos.recebimentoId))
        .where(
          and(
            eq(cobrancas.socioId, s.id),
            eq(cobrancas.tipo, 'anuidade'),
            eq(cobrancas.situacao, 'paga'),
            sql`${recebimentos.estornadoEm} IS NULL`,
          ),
        )
        .orderBy(desc(cobrancas.ano))
        .limit(5)
        .all();

      const cfg = lerConfiguracoes(db);
      const ativo = s.situacao === 'ativo';
      // Só mostra o próximo vencimento se ele ainda não passou (se a anuidade do ano ainda não foi lançada, não inventa data).
      const proximo = vencimentoAnuidade((resumo.quitado_ate ?? Number(hoje.slice(0, 4)) - 1) + 1);
      const resposta: PortalSocio = {
        cemiterio: { nome: cfg.cemiterio_nome, telefone: cfg.cemiterio_telefone },
        socio: {
          nome: nomeAbreviado(s.nomeCompleto),
          matricula: s.matricula,
          situacao: s.situacao,
          direito_sepultamento: s.direitoSepultamento,
        },
        financeiro: {
          em_dia: resumo.em_dia,
          anos_pendentes: resumo.anos_pendentes,
          quitado_ate: resumo.quitado_ate,
          proximo_vencimento: ativo && resumo.em_dia && proximo >= hoje ? proximo : null,
          ultimas_anuidades: ultimas.map((u) => ({ ano: u.ano, pago_em: u.pagoEm })),
        },
        sepulturas: db
          .select({
            codigo: sepulturas.codigo,
            referencia: sepulturas.referencia,
            setor: setores.nome,
            latitude: sepulturas.latitude,
            longitude: sepulturas.longitude,
          })
          .from(sepulturas)
          .leftJoin(setores, eq(setores.id, sepulturas.setorId))
          .where(eq(sepulturas.socioId, s.id))
          .orderBy(sepulturas.codigo)
          .all(),
        consultado_em: agoraIso(),
      };

      if (r !== undefined) {
        const codigo = r.trim().toUpperCase();
        const rec = FORMATO_CODIGO.test(codigo)
          ? db
              .select()
              .from(recebimentos)
              .where(and(eq(recebimentos.codigoVerificacao, codigo), eq(recebimentos.socioId, s.id)))
              .get()
          : undefined;
        if (!rec) {
          resposta.recibo = { situacao: 'nao_encontrado' };
        } else {
          const detalhe = listarRecebimentos(db, { socioId: s.id }).find((x) => x.id === rec.id);
          resposta.recibo = {
            situacao: rec.estornadoEm ? 'estornado' : 'valido',
            numero: rec.numeroRecibo ?? undefined,
            data_pagamento: rec.dataPagamento,
            total_centavos: rec.totalCentavos,
            descricao: detalhe?.descricao,
          };
        }
      }
      return resposta;
    },
  );

  // Link do portal para mostrar/enviar ao sócio (usuários logados).
  app.get('/api/socios/:id/link-portal', { preHandler: exigirLogin }, async (req): Promise<LinkPortal> => {
    const s = obterLinhaSocio(db, validar(idParam, req.params).id);
    return { url: urlDoPortal(s.tokenPublico) };
  });

  // Gera um novo link: o antigo (e os QR codes já impressos) param de funcionar.
  app.post('/api/socios/:id/link-portal/novo', { preHandler: exigirAdmin }, async (req): Promise<LinkPortal> => {
    const { id } = validar(idParam, req.params);
    obterLinhaSocio(db, id);
    const token = novoToken();
    db.update(socios).set({ tokenPublico: token, atualizadoEm: agoraIso() }).where(eq(socios.id, id)).run();
    registrarAuditoria(db, { usuarioId: usuarioDe(req).id, acao: 'novo_link_portal', entidade: 'socio', entidadeId: id });
    return { url: urlDoPortal(token) };
  });
}
