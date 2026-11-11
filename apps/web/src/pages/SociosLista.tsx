import { Badge, Button, Card, Group, Loader, SegmentedControl, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPhoto, IconPlus, IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SocioResumo } from '@cemiterio/shared';
import { api } from '../api/client';
import { BadgeSituacao } from '../components/Situacao';
import { dataBr, telefoneBr } from '../util/formatar';

type Filtro = 'todos' | 'ativos' | 'falecidos';

export function SociosLista() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [termo] = useDebouncedValue(busca.trim(), 250);
  // Filtro guardado no endereço da página: ao voltar de uma ficha, continua o mesmo.
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('situacao') as Filtro | null) ?? 'todos';

  const { data, isFetching } = useQuery({
    queryKey: ['socios', termo],
    queryFn: () => api.get<{ socios: SocioResumo[] }>(`/api/socios${termo ? `?q=${encodeURIComponent(termo)}` : ''}`),
    placeholderData: (anterior) => anterior,
  });
  const todos = data?.socios ?? [];
  const contagem = {
    todos: todos.length,
    ativos: todos.filter((s) => s.situacao === 'ativo').length,
    falecidos: todos.filter((s) => s.situacao === 'falecido').length,
  };
  const socios = todos.filter((s) =>
    filtro === 'ativos' ? s.situacao === 'ativo' : filtro === 'falecidos' ? s.situacao === 'falecido' : true,
  );

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Sócios</Title>
        <Group gap="xs">
          <Button component={Link} to="/cadastro-rapido" variant="light" leftSection={<IconUserPlus size={18} />}>
            Cadastro rápido
          </Button>
          <Button component={Link} to="/socios/novo" leftSection={<IconPlus size={18} />}>
            Novo sócio
          </Button>
        </Group>
      </Group>

      <Card withBorder p={0} className="card-tabela">
        <Group p="md" gap="sm">
          <TextInput
            flex={1}
            placeholder="Buscar por nome, matrícula ou CPF"
            leftSection={<IconSearch size={16} />}
            rightSection={isFetching ? <Loader size="xs" /> : null}
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
            autoFocus
          />
          <SegmentedControl
            value={filtro}
            onChange={(v) => setParams(v === 'todos' ? {} : { situacao: v }, { replace: true })}
            data={[
              { value: 'todos', label: `Todos (${contagem.todos})` },
              { value: 'ativos', label: `Ativos (${contagem.ativos})` },
              { value: 'falecidos', label: `Falecidos (${contagem.falecidos})` },
            ]}
          />
          <Text size="sm" c="dimmed">
            {socios.length} {socios.length === 1 ? 'sócio' : 'sócios'}
          </Text>
        </Group>
        <Table.ScrollContainer minWidth={700}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={90}>Matrícula</Table.Th>
                <Table.Th>Nome</Table.Th>
                <Table.Th w={110}>Nascimento</Table.Th>
                <Table.Th w={150}>Telefone</Table.Th>
                <Table.Th w={150}>Cidade</Table.Th>
                <Table.Th w={260}>Situação</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {socios.map((s) => (
                <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/socios/${s.id}`)}>
                  <Table.Td><Text ff="monospace" size="sm">{s.matricula}</Text></Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={500}>{s.nome_completo}</Text>
                      {s.qtd_documentos > 0 && (
                        <Tooltip label={`${s.qtd_documentos} foto(s) anexada(s)`}>
                          <IconPhoto size={15} color="var(--mantine-color-gray-6)" />
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{dataBr(s.data_nascimento)}</Table.Td>
                  <Table.Td>{telefoneBr(s.telefone)}</Table.Td>
                  <Table.Td>{s.cidade}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <BadgeSituacao situacao={s.situacao} />
                      {s.pendencias > 0 && (
                        <Tooltip label="Cobranças vencidas em aberto">
                          <Badge color="red" variant="light">{s.pendencias} pendente{s.pendencias > 1 ? 's' : ''}</Badge>
                        </Tooltip>
                      )}
                      {s.incompleto && (
                        <Tooltip label="Faltam dados: nascimento, telefone ou endereço">
                          <Badge color="yellow" variant="outline">Incompleto</Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {socios.length === 0 && !isFetching && (
          <Text c="dimmed" ta="center" py="xl">
            {termo || filtro !== 'todos'
              ? 'Nenhum sócio encontrado com esse filtro.'
              : 'Nenhum sócio cadastrado ainda.'}
          </Text>
        )}
      </Card>
    </>
  );
}
