import { Alert, Badge, Box, Button, Center, Container, Divider, Group, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconCross, IconMapPin, IconPhone, IconReceipt } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { reais, ROTULO_SITUACAO_SOCIO, type PortalSocio as Dados } from '@cemiterio/shared';
import { api, ErroApi } from '../api/client';
import { dataBr, dataHoraBr } from '../util/formatar';

/** Página pública que o sócio abre pelo QR code do recibo. Sem login. */
export function PortalSocio() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const codigo = params.get('r');

  const { data, error, isLoading } = useQuery({
    queryKey: ['portal', token, codigo],
    queryFn: () =>
      api.get<Dados>(`/api/publico/socio/${encodeURIComponent(token ?? '')}${codigo ? `?r=${encodeURIComponent(codigo)}` : ''}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (error || !data) {
    const naoAchou = error instanceof ErroApi && error.status === 404;
    const muitas = error instanceof ErroApi && error.status === 429;
    return (
      <Container size={420} py="xl">
        <Alert color={naoAchou ? 'red' : 'orange'} icon={<IconAlertTriangle />} title={naoAchou ? 'Link inválido' : 'Não foi possível consultar'}>
          {naoAchou
            ? 'Este link não corresponde a nenhum sócio. Ele pode ter sido substituído por um novo. Procure a secretaria do cemitério.'
            : muitas
              ? 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.'
              : 'Tente novamente em alguns instantes.'}
        </Alert>
      </Container>
    );
  }

  const { socio, financeiro: f, recibo, cemiterio } = data;

  return (
    <Box bg="gray.1" mih="100vh" py="md">
      <Container size={440} px="sm">
        <Group gap="xs" justify="center" mb="md">
          <ThemeIcon color="teal.8" radius="md">
            <IconCross size={18} />
          </ThemeIcon>
          <Text fw={700}>{cemiterio.nome}</Text>
        </Group>

        {recibo && <BlocoRecibo recibo={recibo} />}

        <Paper withBorder radius="md" p="lg" mb="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Sócio</Text>
          <Title order={2}>{socio.nome}</Title>
          <Text size="sm" c="dimmed">Matrícula {socio.matricula}</Text>
          <Divider my="md" />

          {socio.situacao === 'ativo' ? (
            <Stack gap={6} align="center">
              <ThemeIcon size={64} radius="xl" color={f.em_dia ? 'teal' : 'red'} variant="light">
                {f.em_dia ? <IconCircleCheck size={40} /> : <IconCircleX size={40} />}
              </ThemeIcon>
              <Title order={2} c={f.em_dia ? 'teal.8' : 'red.7'}>{f.em_dia ? 'EM DIA' : 'PENDENTE'}</Title>
              {f.em_dia && f.quitado_ate && <Text>Anuidades quitadas até {f.quitado_ate}</Text>}
              {!f.em_dia && f.anos_pendentes.length > 0 && <Text>Anuidade(s) em aberto: {f.anos_pendentes.join(', ')}</Text>}
              {f.proximo_vencimento && <Text size="sm" c="dimmed">Próximo vencimento: {dataBr(f.proximo_vencimento)}</Text>}
            </Stack>
          ) : (
            <Stack gap={6} align="center">
              <Badge size="xl" color={socio.situacao === 'falecido' ? 'gray' : 'orange'} variant="light">
                {ROTULO_SITUACAO_SOCIO[socio.situacao]}
              </Badge>
              {socio.situacao === 'associacao_encerrada' && (
                <Text size="sm" ta="center">O benefício da associação já foi utilizado pela família. Para renovar, é só procurar a secretaria.</Text>
              )}
              {socio.situacao === 'pendente' && (
                <Text size="sm" ta="center">A associação começa quando a taxa de associação for paga.</Text>
              )}
            </Stack>
          )}

          {socio.situacao === 'ativo' && (
            <Group justify="center" mt="md">
              <Badge variant="dot" color={socio.direito_sepultamento === 'disponivel' ? 'teal' : 'orange'}>
                {socio.direito_sepultamento === 'disponivel' ? 'Benefícios da associação garantidos' : 'Benefício já utilizado'}
              </Badge>
            </Group>
          )}
        </Paper>

        {data.sepulturas.length > 0 && (
          <Paper withBorder radius="md" p="lg" mb="md">
            <Text fw={600} mb="xs">{data.sepulturas.length > 1 ? 'Sepulturas' : 'Sepultura'}</Text>
            <Stack gap={4}>
              {data.sepulturas.map((s) => (
                <Group key={s.codigo} justify="space-between" wrap="nowrap">
                  <div>
                    <Text fw={600} ff="monospace">
                      {s.codigo}
                      {s.setor && <Text span ff="inherit" fw={400} c="dimmed" size="sm"> · {s.setor}</Text>}
                    </Text>
                    {s.referencia && <Text size="sm" c="dimmed">{s.referencia}</Text>}
                  </div>
                  {s.latitude !== null && s.longitude !== null && (
                    <Button
                      component="a"
                      size="xs"
                      variant="light"
                      leftSection={<IconMapPin size={14} />}
                      href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}&travelmode=walking`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Como chegar
                    </Button>
                  )}
                </Group>
              ))}
            </Stack>
          </Paper>
        )}

        {f.ultimas_anuidades.length > 0 && (
          <Paper withBorder radius="md" p="lg" mb="md">
            <Text fw={600} mb="xs">Últimas anuidades pagas</Text>
            <Stack gap={4}>
              {f.ultimas_anuidades.map((a) => (
                <Group key={a.ano} justify="space-between">
                  <Text>Anuidade {a.ano}</Text>
                  <Text size="sm" c="dimmed">paga em {dataBr(a.pago_em)}</Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}

        {cemiterio.telefone && (
          <Group justify="center" gap={6} mb="xs">
            <IconPhone size={16} />
            <Text size="sm">Dúvidas: {cemiterio.telefone}</Text>
          </Group>
        )}
        <Text size="xs" c="dimmed" ta="center">Consultado em {dataHoraBr(data.consultado_em)}</Text>
        <Text size="xs" c="dimmed" ta="center">Guarde o recibo: o QR code é a sua comprovação de sócio.</Text>
      </Container>
    </Box>
  );
}

function BlocoRecibo({ recibo }: { recibo: NonNullable<Dados['recibo']> }) {
  if (recibo.situacao === 'valido') {
    return (
      <Alert color="teal" icon={<IconReceipt />} title={`Recibo ${recibo.numero ?? ''} válido`} mb="md" radius="md">
        Pago em {dataBr(recibo.data_pagamento)} — {recibo.descricao} — {reais(recibo.total_centavos ?? 0)}
      </Alert>
    );
  }
  if (recibo.situacao === 'estornado') {
    return (
      <Alert color="red" icon={<IconCircleX />} title={`Recibo ${recibo.numero ?? ''} cancelado`} mb="md" radius="md">
        Este pagamento foi estornado e o recibo não vale mais. Procure a secretaria.
      </Alert>
    );
  }
  return (
    <Alert color="orange" icon={<IconAlertTriangle />} title="Recibo não encontrado" mb="md" radius="md">
      O código deste recibo não confere. Procure a secretaria.
    </Alert>
  );
}
