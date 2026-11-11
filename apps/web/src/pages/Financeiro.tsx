import { Alert, Anchor, Badge, Button, Card, Grid, Group, Select, Stack, Table, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCalendarPlus, IconPrinter } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ROTULO_FORMA_PAGAMENTO, reais, type RecebimentoResumo } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { CampoMascara } from '../components/CampoMascara';
import { imprimirRecibo } from '../components/financeiro/imprimir';
import { hojeIso } from '../hooks';
import { dataBr, dataIso } from '../util/formatar';
import { mascaraData } from '../util/mascaras';

interface Previa {
  ano: number;
  vencimento: string;
  valor_centavos: number | null;
  socios_ativos: number;
  ja_geradas: number;
  a_gerar: number;
}
interface ResumoAno {
  ano: number;
  total: number;
  pagas: number;
  abertas: number;
  valor_aberto_centavos: number;
}

export function Financeiro() {
  const { usuario } = useAuth();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Financeiro</Title>
        <Group gap="xs">
          <Button component={Link} to="/relatorios?aba=inadimplencia" variant="default">Inadimplência</Button>
          <Button component={Link} to="/relatorios?aba=caixa" variant="light">Fechar o caixa do dia</Button>
        </Group>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack>
            {usuario?.perfil === 'admin' && <GerarAnuidades />}
            <ResumoAnuidades />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Recebimentos />
        </Grid.Col>
      </Grid>
    </>
  );
}

function GerarAnuidades() {
  const qc = useQueryClient();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(String(anoAtual));
  const previa = useQuery({
    queryKey: ['previa-anuidades', ano],
    queryFn: () => api.get<Previa>(`/api/anuidades/previa?ano=${ano}`),
  });
  const p = previa.data;

  const gerar = () =>
    modals.openConfirmModal({
      title: `Gerar anuidades de ${ano}?`,
      children: (
        <Text size="sm">
          Serão criadas {p?.a_gerar} cobranças de {p?.valor_centavos != null && reais(p.valor_centavos)}, com vencimento em{' '}
          {p && dataBr(p.vencimento)}, para os sócios ativos que ainda não têm a anuidade de {ano}.
        </Text>
      ),
      labels: { confirm: 'Gerar', cancel: 'Cancelar' },
      onConfirm: async () => {
        try {
          const r = await api.post<{ criadas: number }>('/api/anuidades/gerar', { ano: Number(ano) });
          notifications.show({ color: 'teal', message: `${r.criadas} anuidades geradas.` });
          qc.invalidateQueries();
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });

  return (
    <Card withBorder>
      <Text fw={600} mb="xs">Gerar anuidades do ano</Text>
      <Text size="sm" c="dimmed" mb="sm">
        Faça no início de outubro, antes de Finados. Cria a anuidade (vencimento 02/11) de todos os sócios ativos.
      </Text>
      <Group align="flex-end">
        <Select
          label="Ano"
          w={110}
          data={[anoAtual - 1, anoAtual, anoAtual + 1].map(String)}
          value={ano}
          onChange={(v) => v && setAno(v)}
          allowDeselect={false}
        />
        <Button leftSection={<IconCalendarPlus size={16} />} onClick={gerar} disabled={!p || p.valor_centavos === null || p.a_gerar === 0}>
          Gerar anuidades
        </Button>
      </Group>
      {p && (
        <Text size="sm" mt="sm">
          {p.socios_ativos} sócios ativos · {p.ja_geradas} já têm · <b>{p.a_gerar} a gerar</b>
          {p.valor_centavos !== null && <> · valor {reais(p.valor_centavos)}</>}
        </Text>
      )}
      {p && p.valor_centavos === null && (
        <Alert color="orange" mt="sm" variant="light">
          Não há valor de anuidade cadastrado para {ano}.{' '}
          <Anchor component={Link} to="/admin/valores" size="sm">Cadastrar em Valores e reajustes</Anchor>
        </Alert>
      )}
    </Card>
  );
}

function ResumoAnuidades() {
  const { data } = useQuery({ queryKey: ['resumo-anuidades'], queryFn: () => api.get<{ anos: ResumoAno[] }>('/api/anuidades/resumo') });
  return (
    <Card withBorder p={0} className="card-tabela">
      <Text fw={600} px="md" pt="md" pb="xs">Anuidades por ano</Text>
      {!data?.anos.length ? (
        <Text size="sm" c="dimmed" p="md">Nenhuma anuidade gerada ainda.</Text>
      ) : (
        <Table fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ano</Table.Th>
              <Table.Th ta="right">Pagas</Table.Th>
              <Table.Th ta="right">Em aberto</Table.Th>
              <Table.Th ta="right">A receber</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.anos.map((a) => (
              <Table.Tr key={a.ano}>
                <Table.Td fw={600}>{a.ano}</Table.Td>
                <Table.Td ta="right">{a.pagas} de {a.total}</Table.Td>
                <Table.Td ta="right" c={a.abertas ? 'red' : undefined}>{a.abertas}</Table.Td>
                <Table.Td ta="right">{reais(a.valor_aberto_centavos)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}

function Recebimentos() {
  const [de, setDe] = useState(dataBr(hojeIso()));
  const [ate, setAte] = useState(dataBr(hojeIso()));
  const isoDe = dataIso(de);
  const isoAte = dataIso(ate);
  const { data } = useQuery({
    queryKey: ['recebimentos', isoDe, isoAte],
    queryFn: () => api.get<{ recebimentos: RecebimentoResumo[] }>(`/api/recebimentos?de=${isoDe}&ate=${isoAte}`),
    enabled: !!isoDe && !!isoAte,
  });
  const lista = (data?.recebimentos ?? []).filter((r) => !r.historico);
  const validos = lista.filter((r) => !r.estornado);
  const total = validos.reduce((t, r) => t + r.total_centavos, 0);
  const porForma = new Map<string, number>();
  for (const r of validos) porForma.set(r.forma, (porForma.get(r.forma) ?? 0) + r.total_centavos);

  return (
    <Card withBorder p={0} className="card-tabela">
      <Group p="md" pb="xs" justify="space-between" align="flex-end">
        <Text fw={600}>Pagamentos recebidos</Text>
        <Group gap="xs">
          <CampoMascara size="xs" w={110} label="De" mascara={mascaraData} value={de} onChange={setDe} />
          <CampoMascara size="xs" w={110} label="Até" mascara={mascaraData} value={ate} onChange={setAte} />
        </Group>
      </Group>
      <Group px="sm" pb="sm" gap="xs">
        <Badge size="lg" variant="light">Total: {reais(total)}</Badge>
        {[...porForma].map(([f, v]) => (
          <Badge key={f} size="lg" variant="outline" color="gray">
            {ROTULO_FORMA_PAGAMENTO[f as keyof typeof ROTULO_FORMA_PAGAMENTO]}: {reais(v)}
          </Badge>
        ))}
      </Group>
      <Table.ScrollContainer minWidth={560}>
        <Table fz="sm" verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Recibo</Table.Th>
              <Table.Th>Sócio</Table.Th>
              <Table.Th>Referente</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((r) => (
              <Table.Tr key={r.id} style={r.estornado ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <Table.Td ff="monospace">{r.numero}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/socios/${r.socio_id}`} size="sm">{r.socio_nome}</Anchor>
                </Table.Td>
                <Table.Td>{r.descricao}</Table.Td>
                <Table.Td ta="right">{reais(r.total_centavos)}</Table.Td>
                <Table.Td>
                  {!r.estornado && (
                    <Button size="compact-xs" variant="subtle" onClick={() => imprimirRecibo(r.id)} aria-label="Reimprimir">
                      <IconPrinter size={14} />
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {lista.length === 0 && <Text size="sm" c="dimmed" p="md">Nenhum pagamento no período.</Text>}
    </Card>
  );
}
