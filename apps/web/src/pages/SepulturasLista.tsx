import { Anchor, Badge, Button, Card, Group, Loader, SegmentedControl, Table, Tabs, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCoin, IconMapPin, IconPhoto, IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROTULO_TIPO_SEPULTURA, type Sepultado, type SepulturaResumo } from '@cemiterio/shared';
import { api } from '../api/client';
import { BadgeExumacao } from '../components/sepulturas/BadgeExumacao';
import { BadgeSepultura } from '../components/sepulturas/BadgeSepultura';
import { ModalVenda } from '../components/sepulturas/ModalVenda';
import { dataBr } from '../util/formatar';

export function SepulturasLista() {
  const [aba, setAba] = useState<string | null>('sepulturas');
  const [vendendo, setVendendo] = useState(false);
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Sepulturas</Title>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconCoin size={18} />} onClick={() => setVendendo(true)}>Vender sepultura</Button>
          <Button component={Link} to="/sepulturas/nova" leftSection={<IconPlus size={18} />}>Nova sepultura</Button>
        </Group>
      </Group>
      <Tabs value={aba} onChange={setAba} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="sepulturas">Sepulturas</Tabs.Tab>
          <Tabs.Tab value="sepultados">Quem está (ou esteve) sepultado</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="sepulturas"><ListaSepulturas /></Tabs.Panel>
        <Tabs.Panel value="sepultados"><ListaSepultados /></Tabs.Panel>
      </Tabs>
      {vendendo && <ModalVenda fechar={() => setVendendo(false)} />}
    </>
  );
}

function ListaSepulturas() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [termo] = useDebouncedValue(busca.trim(), 250);
  const { data, isFetching } = useQuery({
    queryKey: ['sepulturas', termo, situacao],
    queryFn: () => {
      const p = new URLSearchParams();
      if (termo) p.set('q', termo);
      if (situacao !== 'todas') p.set('situacao', situacao);
      return api.get<{ sepulturas: SepulturaResumo[] }>(`/api/sepulturas?${p}`);
    },
    placeholderData: (a) => a,
  });
  const lista = data?.sepulturas ?? [];
  return (
    <Card withBorder p={0} className="card-tabela">
      <Group p="md" gap="sm" wrap="wrap">
        <TextInput
          flex={1}
          miw={220}
          placeholder="Código, referência, titular ou nome de sepultado"
          leftSection={<IconSearch size={16} />}
          rightSection={isFetching ? <Loader size="xs" /> : null}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
        />
        <SegmentedControl
          value={situacao}
          onChange={setSituacao}
          data={[
            { value: 'todas', label: 'Todas' },
            { value: 'disponivel', label: 'Disponíveis' },
            { value: 'reservada', label: 'Reservadas' },
            { value: 'vendida', label: 'Vendidas' },
            { value: 'ocupada', label: 'Ocupadas' },
          ]}
        />
        <Text size="sm" c="dimmed">
          {lista.length} {lista.length === 1 ? 'sepultura' : 'sepulturas'}
        </Text>
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>Código</Table.Th>
              <Table.Th w={90}>Tipo</Table.Th>
              <Table.Th>Titular</Table.Th>
              <Table.Th>Setor / referência</Table.Th>
              <Table.Th w={90}>Ocupação</Table.Th>
              <Table.Th w={150}>Situação</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((s) => (
              <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/sepulturas/${s.id}`)}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text ff="monospace" size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>{s.codigo}</Text>
                    {s.qtd_fotos > 0 && <IconPhoto size={14} color="var(--mantine-color-gray-6)" />}
                    {s.tem_localizacao && <IconMapPin size={14} color="var(--mantine-color-gray-6)" />}
                  </Group>
                </Table.Td>
                <Table.Td>{ROTULO_TIPO_SEPULTURA[s.tipo]}</Table.Td>
                <Table.Td>{s.socio_nome ?? <Text span c="dimmed" size="sm">—</Text>}</Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1} component="div">
                    {s.setor_nome && <Badge size="xs" variant="outline" mr={4}>{s.setor_nome}</Badge>}
                    {s.referencia}
                  </Text>
                </Table.Td>
                <Table.Td>{s.ocupacao} de {s.capacidade}</Table.Td>
                <Table.Td><BadgeSepultura situacao={s.situacao} /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {lista.length === 0 && !isFetching && (
        <Text c="dimmed" ta="center" py="xl">
          {termo || situacao !== 'todas' ? 'Nenhuma sepultura encontrada.' : 'Nenhuma sepultura cadastrada ainda.'}
        </Text>
      )}
    </Card>
  );
}

function ListaSepultados() {
  const [busca, setBusca] = useState('');
  const [termo] = useDebouncedValue(busca.trim(), 250);
  const { data, isFetching } = useQuery({
    queryKey: ['sepultados', termo],
    queryFn: () => api.get<{ sepultados: Sepultado[] }>(`/api/sepultados${termo ? `?q=${encodeURIComponent(termo)}` : ''}`),
    placeholderData: (a) => a,
  });
  const lista = data?.sepultados ?? [];
  return (
    <Card withBorder p={0} className="card-tabela">
      <Group p="md">
        <TextInput
          flex={1}
          autoFocus
          placeholder="Nome de quem foi sepultado"
          leftSection={<IconSearch size={16} />}
          rightSection={isFetching ? <Loader size="xs" /> : null}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
        />
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Sepultura</Table.Th>
              <Table.Th>Falecimento</Table.Th>
              <Table.Th>Sepultamento</Table.Th>
              <Table.Th>Sócio</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td fw={500}>
                  {s.nome_sepultado}
                  <BadgeExumacao s={s} />
                  {s.transferido_de_codigo && <Badge ml={6} size="xs" color="grape" variant="outline">veio de {s.transferido_de_codigo}</Badge>}
                  {s.historico && !s.transferido_de_codigo && (
                    <Tooltip label="Lançamento antigo (ficha)">
                      <Badge ml={6} size="xs" variant="outline" color="gray">antigo</Badge>
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/sepulturas/${s.sepultura_id}`} ff="monospace" size="sm">{s.sepultura_codigo}</Anchor>
                </Table.Td>
                <Table.Td>{dataBr(s.data_falecimento)}</Table.Td>
                <Table.Td>{dataBr(s.data_sepultamento)}</Table.Td>
                <Table.Td>
                  {s.socio_direito_id && (
                    <Anchor component={Link} to={`/socios/${s.socio_direito_id}`} size="sm">{s.socio_direito_nome}</Anchor>
                  )}
                  {s.parentesco && <Text span c="dimmed" size="xs"> ({s.parentesco})</Text>}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {lista.length === 0 && !isFetching && <Text c="dimmed" ta="center" py="xl">Nenhum registro encontrado.</Text>}
    </Card>
  );
}

