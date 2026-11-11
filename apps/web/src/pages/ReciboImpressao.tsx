import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ROTULO_FORMA_PAGAMENTO, reais, type RecebimentoDetalhe } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { hojeIso, useConfiguracoes } from '../hooks';
import { dataBr, dataHoraBr } from '../util/formatar';

/**
 * Recibo para impressora térmica (80 mm ou 58 mm). Abre num iframe invisível (?auto=1),
 * registra a via, imprime e avisa a janela principal.
 */
export function ReciboImpressao() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const auto = params.get('auto') === '1';
  const config = useConfiguracoes();
  const [via, setVia] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const impresso = useRef(false);
  const viaPedida = useRef(false);

  const { data } = useQuery({
    queryKey: ['recebimento', id],
    queryFn: () => api.get<{ recebimento: RecebimentoDetalhe }>(`/api/recebimentos/${id}`),
  });
  const r = data?.recebimento;

  // Registra a via (1ª, 2ª...) uma única vez.
  useEffect(() => {
    if (!r || viaPedida.current) return;
    viaPedida.current = true; // evita contar duas vias (o React pode rodar o efeito duas vezes)
    api
      .post<{ via: number }>(`/api/recebimentos/${r.id}/impressao`)
      .then((x) => setVia(x.via))
      .catch((e) => setErro(mensagemDeErro(e)));
  }, [r]);

  useEffect(() => {
    if (!r || !config.data) return;
    const url = `${config.data.public_url.replace(/\/$/, '')}/s/${r.socio_token_publico}?r=${r.codigo_verificacao}`;
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr);
  }, [r, config.data]);

  const pronto = !!r && !!qr && via !== null && !!config.data;
  useEffect(() => {
    if (!pronto || !auto || impresso.current) return;
    impresso.current = true;
    const fim = () => window.parent?.postMessage('recibo-impresso', window.location.origin);
    window.addEventListener('afterprint', fim, { once: true });
    setTimeout(() => window.print(), 150);
  }, [pronto, auto]);

  if (erro) return <p style={{ fontFamily: 'sans-serif', padding: 16 }}>Não foi possível imprimir: {erro}</p>;
  if (!pronto || !r || !config.data) return <p style={{ fontFamily: 'sans-serif', padding: 16 }}>Preparando recibo…</p>;

  const c = config.data.configuracoes;
  const largura = c.recibo_largura_mm === '58' ? 48 : 72; // área imprimível
  const fonte = c.recibo_largura_mm === '58' ? 10 : 12;
  const res = r.resumo_atual;
  const anoProximo = (res.quitado_ate ?? new Date().getFullYear() - 1) + 1;
  const proximoVencimento = `${anoProximo}-11-02`;
  const mostrarProximo = res.em_dia && proximoVencimento >= hojeIso();

  return (
    <>
      <style>{`
        @page { margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .recibo { width: ${largura}mm; padding: 2mm 0 6mm; margin: 0 auto; color: #000;
          font-family: 'Courier New', Consolas, monospace; font-size: ${fonte}px; line-height: 1.35; }
        .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 1.25em; }
        .sep { border-top: 1px dashed #000; margin: 2mm 0; }
        .linha { display: flex; justify-content: space-between; gap: 2mm; }
        .qr { width: 30mm; margin: 2mm auto 1mm; } .qr svg { width: 100%; height: auto; display: block; }
        @media screen { body { background: #eee; } .recibo { background: #fff; margin: 16px auto; padding: 4mm; box-shadow: 0 1px 4px #0003; } }
      `}</style>
      <div className="recibo">
        <div className="c b g">{c.cemiterio_nome.toUpperCase()}</div>
        {c.cemiterio_cnpj && <div className="c">CNPJ {c.cemiterio_cnpj}</div>}
        {c.cemiterio_endereco && <div className="c">{c.cemiterio_endereco}</div>}
        {c.cemiterio_telefone && <div className="c">{c.cemiterio_telefone}</div>}
        <div className="sep" />
        <div className="c b">RECIBO DE PAGAMENTO</div>
        <div className="c b">Nº {r.numero}{via > 1 ? ` — ${via}ª VIA` : ''}</div>
        <div className="sep" />
        <div>Sócio: <span className="b">{r.socio_nome.toUpperCase()}</span></div>
        <div>Matrícula: {r.socio_matricula}</div>
        <div className="sep" />
        {r.itens.map((i) => (
          <div key={i.cobranca_id}>
            <div className="linha"><span>{i.descricao}</span><span>{reais(i.valor_centavos)}</span></div>
            {i.desconto_centavos > 0 && (
              <div className="linha"><span>  desconto</span><span>-{reais(i.desconto_centavos)}</span></div>
            )}
          </div>
        ))}
        <div className="sep" />
        <div className="linha b g"><span>TOTAL</span><span>{reais(r.total_centavos)}</span></div>
        <div>Forma: {ROTULO_FORMA_PAGAMENTO[r.forma]}</div>
        <div>Pago em: {dataBr(r.data_pagamento)}</div>
        <div>Emitido: {dataHoraBr(r.registrado_em)}</div>
        {r.registrado_por && <div>Atendente: {r.registrado_por}</div>}
        {r.observacao && <div>Obs.: {r.observacao}</div>}
        <div className="sep" />
        {res.em_dia ? (
          <div className="c b">SITUAÇÃO: EM DIA{res.quitado_ate ? ` · QUITADO ATÉ ${res.quitado_ate}` : ''}</div>
        ) : (
          <div className="c b">PENDENTE: {res.anos_pendentes.join(', ') || reais(res.total_vencido_centavos)}</div>
        )}
        {mostrarProximo && <div className="c">Próximo vencimento: {dataBr(proximoVencimento)}</div>}
        <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="c">Aponte a câmera do celular para</div>
        <div className="c">conferir o recibo e a sua situação</div>
        <div className="c">Código: {r.codigo_verificacao}</div>
        {c.recibo_mensagem && <div className="c" style={{ marginTop: '2mm' }}>{c.recibo_mensagem}</div>}
        <div className="sep" />
        <div className="c b">NÃO É DOCUMENTO FISCAL</div>
      </div>
    </>
  );
}
