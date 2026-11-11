import { Badge, Tooltip } from '@mantine/core';
import { ROTULO_DESTINO_EXUMACAO, type Sepultado } from '@cemiterio/shared';
import { dataBr } from '../../util/formatar';

/** Etiqueta da exumação: "ossada no local" (restos ficaram aqui) ou "exumado em … → destino". */
export function BadgeExumacao({ s }: { s: Sepultado }) {
  if (!s.exumado_em || !s.exumacao_destino) return null;
  const detalhe = `${ROTULO_DESTINO_EXUMACAO[s.exumacao_destino]}${
    s.exumacao_sepultura_destino_codigo ? ` (${s.exumacao_sepultura_destino_codigo})` : ''
  }${s.exumacao_observacao ? ` — ${s.exumacao_observacao}` : ''}`;
  return (
    <Tooltip multiline w={280} label={`Exumação em ${dataBr(s.exumado_em)}: ${detalhe}`}>
      {s.exumacao_destino === 'mesma_sepultura' ? (
        <Badge ml={6} size="xs" color="orange" variant="light">ossada no local · lugar liberado em {dataBr(s.exumado_em)}</Badge>
      ) : (
        <Badge ml={6} size="xs" color="grape" variant="light">
          exumado em {dataBr(s.exumado_em)}
          {s.exumacao_sepultura_destino_codigo && ` → ${s.exumacao_sepultura_destino_codigo}`}
        </Badge>
      )}
    </Tooltip>
  );
}

/** Ordem na lista: quem está no lugar, depois ossadas guardadas aqui, depois quem foi levado. */
export const ordemSepultado = (s: Sepultado) => (!s.exumado_em ? 0 : s.exumacao_destino === 'mesma_sepultura' ? 1 : 2);
