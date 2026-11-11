import { Alert, Badge, Button, Card, Group, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabaseExport, IconDownload, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupInfo } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { dataHoraBr, tamanhoArquivo } from '../../util/formatar';

export function Backup() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['backups'], queryFn: () => api.get<{ backups: BackupInfo[] }>('/api/backups') });
  const criar = useMutation({
    mutationFn: () => api.post<{ backup: BackupInfo }>('/api/backups'),
    onSuccess: ({ backup }) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      notifications.show({ color: 'teal', message: `Backup criado (${tamanhoArquivo(backup.tamanho_bytes)}).` });
      window.location.href = `/api/backups/${backup.arquivo}`;
    },
    onError: (e) => notifications.show({ color: 'red', message: mensagemDeErro(e) }),
  });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Backup</Title>
        <Button leftSection={<IconDatabaseExport size={18} />} loading={criar.isPending} onClick={() => criar.mutate()}>
          Fazer backup agora e baixar
        </Button>
      </Group>
      <Alert icon={<IconInfoCircle />} mb="md" variant="light">
        O sistema faz um backup automático por dia na pasta <b>data/backups</b> e guarda os últimos 30 dias. Mas, se o
        computador estragar, eles se perdem junto. <b>Uma vez por semana, baixe um backup e guarde num pendrive ou na nuvem.</b>{' '}
        Cada arquivo contém o banco de dados e todas as fotos, além de instruções de como restaurar.
      </Alert>
      <Card withBorder p={0} className="card-tabela">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Tamanho</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.backups.map((b) => (
              <Table.Tr key={b.arquivo}>
                <Table.Td>{dataHoraBr(b.criado_em)}</Table.Td>
                <Table.Td>{b.automatico ? <Badge variant="light" color="gray">Automático</Badge> : <Badge variant="light">Manual</Badge>}</Table.Td>
                <Table.Td>{tamanhoArquivo(b.tamanho_bytes)}</Table.Td>
                <Table.Td ta="right">
                  <Button component="a" href={`/api/backups/${b.arquivo}`} size="xs" variant="subtle" leftSection={<IconDownload size={14} />}>
                    Baixar
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {data?.backups.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            Nenhum backup ainda. O primeiro automático é feito cerca de 1 minuto depois que o sistema inicia.
          </Text>
        )}
      </Card>
    </>
  );
}
