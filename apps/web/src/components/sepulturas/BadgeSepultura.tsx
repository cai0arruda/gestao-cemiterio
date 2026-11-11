import { Badge } from '@mantine/core';
import { ROTULO_SITUACAO_SEPULTURA, type SituacaoSepultura } from '@cemiterio/shared';

const cores: Record<SituacaoSepultura, string> = { disponivel: 'teal', reservada: 'yellow', vendida: 'blue', ocupada: 'gray' };
const curto: Record<SituacaoSepultura, string> = { disponivel: 'Disponível', reservada: 'Reservada', vendida: 'Vendida', ocupada: 'Ocupada' };

export const BadgeSepultura = ({ situacao, longo = false }: { situacao: SituacaoSepultura; longo?: boolean }) => (
  <Badge color={cores[situacao]} variant="light">{longo ? ROTULO_SITUACAO_SEPULTURA[situacao] : curto[situacao]}</Badge>
);
