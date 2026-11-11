import { Badge } from '@mantine/core';
import { ROTULO_SITUACAO_SOCIO, type DireitoSepultamento, type SituacaoSocio } from '@cemiterio/shared';

const cores: Record<SituacaoSocio, string> = { pendente: 'yellow', ativo: 'teal', associacao_encerrada: 'orange', falecido: 'gray' };

export const BadgeSituacao = ({ situacao }: { situacao: SituacaoSocio }) => (
  <Badge color={cores[situacao]} variant="light">{ROTULO_SITUACAO_SOCIO[situacao]}</Badge>
);

export const BadgeDireito = ({ direito, situacao }: { direito: DireitoSepultamento; situacao?: SituacaoSocio }) =>
  situacao === 'pendente' ? (
    <Badge color="yellow" variant="dot">Benefícios após a taxa de associação</Badge>
  ) : direito === 'disponivel' ? (
    <Badge color="teal" variant="dot">Benefícios da associação garantidos</Badge>
  ) : (
    <Badge color="orange" variant="dot">Benefício já utilizado</Badge>
  );
