import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ROTULO_FORMA_PAGAMENTO, reais, type Caixa } from '@cemiterio/shared';
import { api } from '../api/client';
import { useConfiguracoes } from '../hooks';
import { dataBr, dataHoraBr } from '../util/formatar';

/** Fechamento de caixa para a impressora térmica. */
export function CaixaImpressao() {
  const { data: dia } = useParams();
  const [params] = useSearchParams();
  const auto = params.get('auto') === '1';
  const config = useConfiguracoes();
  const { data } = useQuery({ queryKey: ['caixa', dia], queryFn: () => api.get<Caixa>(`/api/relatorios/caixa?data=${dia}`) });
  const impresso = useRef(false);
  const pronto = !!data && !!config.data;

  useEffect(() => {
    if (!pronto || !auto || impresso.current) return;
    impresso.current = true;
    window.addEventListener('afterprint', () => window.parent?.postMessage('recibo-impresso', window.location.origin), { once: true });
    setTimeout(() => window.print(), 150);
  }, [pronto, auto]);

  if (!pronto || !data || !config.data) return <p style={{ fontFamily: 'sans-serif', padding: 16 }}>Preparando…</p>;
  const c = config.data.configuracoes;
  const largura = c.recibo_largura_mm === '58' ? 48 : 72;

  return (
    <>
      <style>{`
        @page { margin: 0; }
        html, body { margin: 0; background: #fff; }
        .cx { width: ${largura}mm; margin: 0 auto; padding: 2mm 0 6mm; color: #000;
          font-family: 'Courier New', Consolas, monospace; font-size: ${c.recibo_largura_mm === '58' ? 10 : 12}px; line-height: 1.35; }
        .c { text-align: center; } .b { font-weight: bold; }
        .sep { border-top: 1px dashed #000; margin: 2mm 0; }
        .l { display: flex; justify-content: space-between; gap: 2mm; }
        @media screen { body { background: #eee; } .cx { background: #fff; margin: 16px auto; padding: 4mm; } }
      `}</style>
      <div className="cx">
        <div className="c b">{c.cemiterio_nome.toUpperCase()}</div>
        <div className="c b">FECHAMENTO DE CAIXA</div>
        <div className="c">{dataBr(data.data)}</div>
        <div className="sep" />
        {data.por_forma.length === 0 && <div className="c">Nenhum recebimento no dia.</div>}
        {data.por_forma.map((f) => (
          <div className="l" key={f.forma}>
            <span>{ROTULO_FORMA_PAGAMENTO[f.forma]} ({f.qtd})</span>
            <span>{reais(f.total_centavos)}</span>
          </div>
        ))}
        <div className="sep" />
        <div className="l b"><span>TOTAL</span><span>{reais(data.total_centavos)}</span></div>
        <div>Recibos: {data.recebimentos.length}</div>
        {data.por_usuario.length > 1 &&
          data.por_usuario.map((u) => (
            <div className="l" key={u.usuario}><span>{u.usuario}</span><span>{reais(u.total_centavos)}</span></div>
          ))}
        <div className="sep" />
        {data.recebimentos.map((r) => (
          <div key={r.id}>
            <div className="l"><span>{r.numero}</span><span>{reais(r.total_centavos)}</span></div>
            <div>  {r.socio_nome.slice(0, 32)}</div>
          </div>
        ))}
        {data.estornados.length > 0 && (
          <>
            <div className="sep" />
            <div className="b">ESTORNADOS (não somam)</div>
            {data.estornados.map((r) => (
              <div className="l" key={r.id}><span>{r.numero}</span><span>{reais(r.total_centavos)}</span></div>
            ))}
          </>
        )}
        <div className="sep" />
        <div>Impresso em {dataHoraBr(new Date().toISOString())}</div>
        <div style={{ marginTop: '8mm' }}>Conferido: ____________________</div>
      </div>
    </>
  );
}
