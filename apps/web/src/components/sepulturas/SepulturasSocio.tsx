import { Alert, Anchor, Badge, Button, Card, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCoin, IconPlus, IconUsersGroup } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ROTULO_TIPO_SEPULTURA, type Socio, type SepulturasDoSocio } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { useAuth } from '../../auth';
import { PerguntaSucessao } from '../../pages/SepulturaPagina';
import { dataBr } from '../../util/formatar';
import { BadgeSepultura } from './BadgeSepultura';
import { ChecklistDireito } from './ChecklistDireito';
import { ModalSepultamento } from './ModalSepultamento';
import { ModalSucessao } from './ModalSucessao';
import { ModalVenda } from './ModalVenda';

/** Aba "Sepulturas" da ficha do sócio: sepulturas, benefício da associação (direito de sepultamento) e sucessão. */
export function SepulturasSocio({ socio }: { socio: Socio }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const [modal, setModal] = useState<null | 'venda' | 'sepultamento' | 'sucessao' | 'pergunta'>(null);
  const { data } = useQuery({
    queryKey: ['sepulturas-socio', socio.id],
    queryFn: () => api.get<SepulturasDoSocio>(`/api/socios/${socio.id}/sepulturas`),
  });
  if (!data) return <Loader />;
  const falecido = socio.situacao === 'falecido';
  const pendente = data.sucessoes.find((x) => x.situacao === 'pendente' && x.socio_origem_id === socio.id);

  const cancelarSucessao = (id: number) =>
    modals.openConfirmModal({
      title: 'Cancelar a sucessão?',
      labels: { confirm: 'Cancelar sucessão', cancel: 'Voltar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.post(`/api/sucessoes/${id}/cancelar`);
          qc.invalidateQueries();
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Benefício da associação</Text>
          <Badge color={data.direito.pode ? 'teal' : 'red'} variant="light" size="lg">
            {data.direito.pode ? 'Garantido' : 'Pendente no momento'}
          </Badge>
        </Group>
        <ChecklistDireito v={data.direito} />
      </Card>

      <Card withBorder p={0} className="card-tabela">
        <Group justify="space-between" px="md" pt="md" pb="xs">
          <Text fw={600}>Sepulturas</Text>
          <Group gap="xs">
            {!falecido && (
              <Button size="xs" variant="light" leftSection={<IconCoin size={14} />} onClick={() => setModal('venda')}>
                Comprar sepultura
              </Button>
            )}
            {data.sepulturas.length > 0 && !falecido && (
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal('sepultamento')}>
                Registrar sepultamento
              </Button>
            )}
          </Group>
        </Group>
        {data.sepulturas.length === 0 ? (
          <Text size="sm" c="dimmed" p="md">Nenhuma sepultura no nome deste sócio.</Text>
        ) : (
          <Table fz="sm" verticalSpacing={6}>
            <Table.Tbody>
              {data.sepulturas.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/sepulturas/${s.id}`} ff="monospace" fw={600}>{s.codigo}</Anchor>
                  </Table.Td>
                  <Table.Td>{ROTULO_TIPO_SEPULTURA[s.tipo]}</Table.Td>
                  <Table.Td>{s.ocupacao} de {s.capacidade}</Table.Td>
                  <Table.Td><Text size="sm" lineClamp={1}>{s.referencia}</Text></Table.Td>
                  <Table.Td><BadgeSepultura situacao={s.situacao} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {(falecido || data.sucessoes.length > 0) && (
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Sucessão</Text>
            {falecido && !pendente && data.sepulturas.length > 0 && (
              <Button size="xs" leftSection={<IconUsersGroup size={14} />} onClick={() => setModal('sucessao')}>
                Familiar vai assumir
              </Button>
            )}
          </Group>
          {data.sucessoes.length === 0 ? (
            <Text size="sm" c="dimmed">Nenhum familiar assumiu as sepulturas ainda.</Text>
          ) : (
            <Stack gap={6}>
              {data.sucessoes.map((x) => (
                <Group key={x.id} justify="space-between">
                  <Text size="sm">
                    <Anchor component={Link} to={`/socios/${x.socio_origem_id}`} size="sm">{x.socio_origem_nome}</Anchor> →{' '}
                    <Anchor component={Link} to={`/socios/${x.socio_destino_id}`} size="sm">{x.socio_destino_nome}</Anchor>
                    <Text span c="dimmed" size="xs"> · {dataBr(x.criado_em.slice(0, 10))}</Text>
                  </Text>
                  <Group gap="xs">
                    <Badge color={x.situacao === 'concluida' ? 'teal' : x.situacao === 'pendente' ? 'yellow' : 'gray'} variant="light">
                      {x.situacao === 'pendente' ? 'aguardando taxa' : x.situacao}
                    </Badge>
                    {x.situacao === 'pendente' && usuario?.perfil === 'admin' && (
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => cancelarSucessao(x.id)}>cancelar</Button>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
          {pendente && (
            <Alert mt="sm" color="yellow" variant="light">
              As sepulturas passam para {pendente.socio_destino_nome} quando a taxa de associação dele for paga.
            </Alert>
          )}
        </Card>
      )}

      {modal === 'venda' && <ModalVenda socio={{ id: socio.id, nome: socio.nome_completo }} fechar={() => setModal(null)} />}
      {modal === 'sepultamento' && (
        <ModalSepultamento
          socioInicial={{ id: socio.id, nome: socio.nome_completo }}
          sepulturasDoSocio={data.sepulturas}
          fechar={() => setModal((m) => (m === 'sepultamento' ? null : m))}
          aoRegistrar={(r) => r.sugerir_sucessao && setModal('pergunta')}
        />
      )}
      {modal === 'pergunta' && <PerguntaSucessao socio={{ id: socio.id, nome: socio.nome_completo }} fechar={() => setModal(null)} />}
      {modal === 'sucessao' && <ModalSucessao socio={{ id: socio.id, nome: socio.nome_completo }} fechar={() => setModal(null)} />}
    </Stack>
  );
}
