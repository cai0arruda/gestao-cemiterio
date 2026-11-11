import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconArrowsExchange, IconCoin, IconDeviceFloppy, IconDots, IconPlus, IconShovel, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ROTULO_DESTINO_EXUMACAO,
  ROTULO_TIPO_SEPULTURA,
  TIPOS_SEPULTURA,
  reais,
  type FotoSepultura,
  type Sepultado,
  type SepulturaDetalhe,
} from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { CampoMascara } from '../components/CampoMascara';
import { GaleriaFotos } from '../components/GaleriaFotos';
import { CardLocalizacao } from '../components/mapa/CardLocalizacao';
import { SeletorSocio } from '../components/SeletorSocio';
import { BadgeSepultura } from '../components/sepulturas/BadgeSepultura';
import { BadgeExumacao, ordemSepultado } from '../components/sepulturas/BadgeExumacao';
import { ModalExumacao } from '../components/sepulturas/ModalExumacao';
import { ModalSepultamento } from '../components/sepulturas/ModalSepultamento';
import { ModalSucessao } from '../components/sepulturas/ModalSucessao';
import { ModalVenda } from '../components/sepulturas/ModalVenda';
import { dataBr, dataIso } from '../util/formatar';
import { mascaraData } from '../util/mascaras';
import { validarDataBr } from '../util/socioForm';

const ROTULO_MOTIVO = { cadastro: 'Cadastro inicial', compra: 'Compra', sucessao: 'Sucessão', transferencia: 'Transferência' } as const;

export function SepulturaPagina() {
  const { id } = useParams();
  const nova = id === 'nova';
  const sepId = nova ? null : Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const [modal, setModal] = useState<null | 'venda' | 'transferir' | 'sepultamento'>(null);
  const [sucessaoDe, setSucessaoDe] = useState<{ id: number; nome: string } | null>(null);
  const [exumando, setExumando] = useState<Sepultado | null>(null);

  const consulta = useQuery({
    queryKey: ['sepultura', sepId],
    queryFn: () => api.get<{ sepultura: SepulturaDetalhe }>(`/api/sepulturas/${sepId}`),
    enabled: sepId !== null,
  });
  const proximo = useQuery({
    queryKey: ['proximo-codigo-sepultura'],
    queryFn: () => api.get<{ codigo: string }>('/api/sepulturas/proximo-codigo'),
    enabled: nova,
  });
  const s = consulta.data?.sepultura;

  const form = useForm({
    initialValues: {
      codigo: '',
      tipo: 'tumulo' as string,
      capacidade: 1 as number | string,
      referencia: '',
      observacoes: '',
      socio_id: null as number | null,
      data_aquisicao: '',
    },
    validate: { data_aquisicao: (v) => validarDataBr(v) },
  });
  useEffect(() => {
    if (s) {
      form.setValues({ codigo: s.codigo, tipo: s.tipo, capacidade: s.capacidade, referencia: s.referencia ?? '', observacoes: s.observacoes ?? '' });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['sepultura', sepId] });
    qc.invalidateQueries({ queryKey: ['sepulturas'] });
  };

  const salvar = form.onSubmit(async (v) => {
    const corpo = {
      codigo: v.codigo,
      tipo: v.tipo,
      capacidade: Number(v.capacidade),
      referencia: v.referencia,
      observacoes: v.observacoes,
      ...(nova ? { socio_id: v.socio_id, data_aquisicao: v.data_aquisicao ? dataIso(v.data_aquisicao) : null } : {}),
    };
    try {
      const r = nova
        ? await api.post<{ sepultura: SepulturaDetalhe }>('/api/sepulturas', corpo)
        : await api.put<{ sepultura: SepulturaDetalhe }>(`/api/sepulturas/${sepId}`, corpo);
      qc.setQueryData(['sepultura', r.sepultura.id], { sepultura: r.sepultura });
      qc.invalidateQueries({ queryKey: ['sepulturas'] });
      qc.invalidateQueries({ queryKey: ['proximo-codigo-sepultura'] });
      notifications.show({ color: 'teal', message: nova ? `Sepultura ${r.sepultura.codigo} cadastrada.` : 'Alterações salvas.' });
      if (nova) navigate(`/sepulturas/${r.sepultura.id}`, { replace: true });
      else form.resetDirty();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      else if (e instanceof ErroApi && e.codigo === 'codigo_duplicado') form.setFieldError('codigo', e.message);
      notifications.show({ color: 'red', title: 'Não foi possível salvar', message: mensagemDeErro(e) });
    }
  });

  const excluir = () =>
    modals.openConfirmModal({
      title: `Excluir a sepultura ${s?.codigo}?`,
      children: <Text size="sm">Use apenas para corrigir um cadastro feito por engano. As fotos também serão apagadas.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.delete(`/api/sepulturas/${sepId}`);
          qc.invalidateQueries({ queryKey: ['sepulturas'] });
          navigate('/sepulturas');
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });

  const desfazerExumacao = (registroId: number, nome: string) => {
    let motivo = '';
    modals.openConfirmModal({
      title: `Desfazer a exumação de ${nome}?`,
      children: (
        <Stack gap="xs">
          <Text size="sm">Use se a exumação foi registrada por engano. A pessoa volta a ocupar o lugar nesta sepultura.</Text>
          <Textarea label="Motivo" onChange={(e) => (motivo = e.currentTarget.value)} />
        </Stack>
      ),
      labels: { confirm: 'Desfazer exumação', cancel: 'Cancelar' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        try {
          await api.post(`/api/sepultamentos/${registroId}/desfazer-exumacao`, { motivo });
          qc.invalidateQueries();
          notifications.show({ message: 'Exumação desfeita.' });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e), autoClose: 10_000 });
        }
      },
    });
  };

  const excluirSepultamento = (registroId: number, nome: string) => {
    let motivo = '';
    modals.openConfirmModal({
      title: `Excluir o registro de ${nome}?`,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Use só para corrigir um registro feito por engano. O que ele mudou no sócio (situação, direito, anuidades
            canceladas) é desfeito.
          </Text>
          <Textarea label="Motivo" onChange={(e) => (motivo = e.currentTarget.value)} />
        </Stack>
      ),
      labels: { confirm: 'Excluir registro', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.post(`/api/sepultamentos/${registroId}/excluir`, { motivo });
          qc.invalidateQueries();
          notifications.show({ message: 'Registro excluído.' });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });
  };

  if (!nova && consulta.isLoading) return <Loader m="xl" />;
  if (!nova && consulta.isError) return <Alert color="red">{mensagemDeErro(consulta.error)}</Alert>;

  const formulario = (
    <form onSubmit={salvar}>
      <Card withBorder>
        <Text fw={600} mb="sm">Dados da sepultura</Text>
        <Grid gap="sm">
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label="Código"
              placeholder={proximo.data?.codigo}
              description={nova ? 'Vazio = próximo automático' : undefined}
              {...form.getInputProps('codigo')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Select
              label="Tipo"
              data={TIPOS_SEPULTURA.map((t) => ({ value: t, label: ROTULO_TIPO_SEPULTURA[t] }))}
              allowDeselect={false}
              {...form.getInputProps('tipo')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Nº de lugares" min={1} max={50} {...form.getInputProps('capacidade')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Referência de localização"
              placeholder="Ex.: perto do cruzeiro, 3ª à esquerda da capela"
              {...form.getInputProps('referencia')}
            />
          </Grid.Col>
          {nova && (
            <>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <SeletorSocio
                  label="Titular (se já foi vendida antes do sistema)"
                  description="Deixe vazio para sepultura disponível. Para vender agora, use “Vender” depois de salvar."
                  value={form.values.socio_id}
                  onChange={(id) => form.setFieldValue('socio_id', id)}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CampoMascara label="Data da aquisição" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_aquisicao')} />
              </Grid.Col>
            </>
          )}
          <Grid.Col span={12}>
            <Textarea label="Observações" autosize minRows={2} {...form.getInputProps('observacoes')} />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end" mt="sm">
          <Button type="submit" loading={form.submitting} leftSection={<IconDeviceFloppy size={18} />} disabled={!nova && !form.isDirty()}>
            {nova ? 'Cadastrar sepultura' : 'Salvar alterações'}
          </Button>
        </Group>
      </Card>
    </form>
  );

  return (
    <>
      <Breadcrumbs mb="xs">
        <Anchor component={Link} to="/sepulturas" size="sm">Sepulturas</Anchor>
        <Text size="sm">{nova ? 'Nova' : s?.codigo}</Text>
      </Breadcrumbs>
      <Group justify="space-between" mb="md" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Title order={2}>{nova ? 'Nova sepultura' : `Sepultura ${s?.codigo}`}</Title>
          {s && (
            <Group gap="xs" mt={6}>
              <BadgeSepultura situacao={s.situacao} longo />
              <Badge variant="outline" color="gray">{ROTULO_TIPO_SEPULTURA[s.tipo]} · {s.ocupacao} de {s.capacidade} ocupado(s)</Badge>
              {s.sepultados.some((x) => x.exumacao_destino === 'mesma_sepultura') && (
                <Badge variant="light" color="orange">
                  {s.sepultados.filter((x) => x.exumacao_destino === 'mesma_sepultura').length} ossada(s) guardada(s) aqui
                </Badge>
              )}
              {s.setor_nome && <Badge variant="outline">{s.setor_nome}</Badge>}
            </Group>
          )}
        </div>
        {admin && s && (
          <Button variant="subtle" color="red" style={{ flexShrink: 0 }} leftSection={<IconTrash size={16} />} onClick={excluir}>Excluir</Button>
        )}
      </Group>

      {nova || !s ? (
        formulario
      ) : (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Stack>
              <Card withBorder>
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>Titular</Text>
                  <Group gap="xs">
                    {s.situacao === 'disponivel' && (
                      <Button size="xs" leftSection={<IconCoin size={14} />} onClick={() => setModal('venda')}>Vender</Button>
                    )}
                    {admin && s.situacao !== 'reservada' && (
                      <Button size="xs" variant="default" leftSection={<IconArrowsExchange size={14} />} onClick={() => setModal('transferir')}>
                        Transferir
                      </Button>
                    )}
                  </Group>
                </Group>
                {s.socio_id ? (
                  <Text>
                    <Anchor component={Link} to={`/socios/${s.socio_id}`}>{s.socio_matricula} — {s.socio_nome}</Anchor>
                    {s.data_aquisicao && <Text span c="dimmed" size="sm"> · desde {dataBr(s.data_aquisicao)}</Text>}
                  </Text>
                ) : s.reserva ? (
                  <Alert color="yellow" variant="light">
                    Reservada para{' '}
                    <Anchor component={Link} to={`/socios/${s.reserva.socio_id}`}>{s.reserva.socio_nome}</Anchor> — aguardando o
                    pagamento de {reais(s.reserva.valor_centavos)}. Registre no Atendimento ou na ficha do sócio.
                  </Alert>
                ) : (
                  <Text c="dimmed" size="sm">Sem titular (disponível para venda).</Text>
                )}
              </Card>

              <Card withBorder p={0} className="card-tabela">
                <Group justify="space-between" px="md" pt="md" pb="xs">
                  <Text fw={600}>Sepultados</Text>
                  <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal('sepultamento')}>
                    Registrar sepultamento
                  </Button>
                </Group>
                {s.sepultados.length === 0 ? (
                  <Text size="sm" c="dimmed" p="md">Nenhum registro de sepultamento aqui ainda.</Text>
                ) : (
                  <Table.ScrollContainer minWidth={520}>
                    <Table fz="sm" verticalSpacing={6}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Nome</Table.Th>
                          <Table.Th>Falecimento</Table.Th>
                          <Table.Th>Sepultamento</Table.Th>
                          <Table.Th>Benefício de</Table.Th>
                          <Table.Th w={40} />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {[...s.sepultados].sort((a, b) => ordemSepultado(a) - ordemSepultado(b)).map((x) => (
                          <Table.Tr key={x.id} style={ordemSepultado(x) === 2 ? { opacity: 0.6 } : undefined}>
                            <Table.Td fw={500}>
                              {x.nome_sepultado}
                              <BadgeExumacao s={x} />
                              {x.transferido_de_codigo && (
                                <Badge ml={6} size="xs" color="grape" variant="outline">veio de {x.transferido_de_codigo}</Badge>
                              )}
                              {x.historico && !x.transferido_de_codigo && <Badge ml={6} size="xs" variant="outline" color="gray">antigo</Badge>}
                              {x.justificativa_excecao && (
                                <Tooltip label={x.justificativa_excecao}>
                                  <Badge ml={6} size="xs" color="orange">exceção</Badge>
                                </Tooltip>
                              )}
                            </Table.Td>
                            <Table.Td>{dataBr(x.data_falecimento)}</Table.Td>
                            <Table.Td>{dataBr(x.data_sepultamento)}</Table.Td>
                            <Table.Td>
                              {x.socio_direito_id ? (
                                <Anchor component={Link} to={`/socios/${x.socio_direito_id}`} size="sm">
                                  {x.socio_id ? 'o próprio sócio' : x.socio_direito_nome}
                                </Anchor>
                              ) : (
                                '—'
                              )}
                              {x.parentesco && <Text span c="dimmed" size="xs"> ({x.parentesco})</Text>}
                            </Table.Td>
                            <Table.Td>
                              <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                  <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${x.nome_sepultado}`}>
                                    <IconDots size={16} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  {!x.exumado_em && (
                                    <Menu.Item leftSection={<IconShovel size={14} />} onClick={() => setExumando(x)}>
                                      Registrar exumação
                                    </Menu.Item>
                                  )}
                                  {x.exumado_em && admin && (
                                    <Menu.Item leftSection={<IconArrowBackUp size={14} />} onClick={() => desfazerExumacao(x.id, x.nome_sepultado)}>
                                      Desfazer exumação
                                    </Menu.Item>
                                  )}
                                  {admin && (
                                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => excluirSepultamento(x.id, x.nome_sepultado)}>
                                      Excluir registro (engano)
                                    </Menu.Item>
                                  )}
                                </Menu.Dropdown>
                              </Menu>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
              </Card>
              {formulario}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack>
              <CardLocalizacao key={`${s.latitude}-${s.longitude}`} sepultura={s} />
              <GaleriaFotos
                titulo="Fotos da sepultura"
                chave={['fotos-sepultura', s.id]}
                listar={async () => (await api.get<{ fotos: FotoSepultura[] }>(`/api/sepulturas/${s.id}/fotos`)).fotos}
                enviar={(a) => {
                  const fd = new FormData();
                  fd.append('arquivo', a);
                  return api.post(`/api/sepulturas/${s.id}/fotos`, fd);
                }}
                urlArquivo={(fid, mini) => `/api/sepultura-fotos/${fid}/arquivo${mini ? '?miniatura=1' : ''}`}
                excluir={(fid) => api.delete(`/api/sepultura-fotos/${fid}`)}
                vazio="Tire uma foto da sepultura (pelo celular, no local) para facilitar a identificação."
                aoMudar={() => qc.invalidateQueries({ queryKey: ['sepulturas'] })}
              />
              <Card withBorder>
                <Text fw={600} mb="sm">Histórico de titulares</Text>
                {s.titulares.length === 0 ? (
                  <Text size="sm" c="dimmed">Nenhum titular até agora.</Text>
                ) : (
                  <Timeline bulletSize={12} lineWidth={2}>
                    {s.titulares.map((t, i) => (
                      <Timeline.Item key={i} title={<Anchor component={Link} to={`/socios/${t.socio_id}`} size="sm">{t.socio_nome}</Anchor>}>
                        <Text size="xs" c="dimmed">
                          {ROTULO_MOTIVO[t.motivo]} · {dataBr(t.inicio)} {t.fim ? `até ${dataBr(t.fim)}` : '— atual'}
                        </Text>
                        {t.observacao && <Text size="xs">{t.observacao}</Text>}
                      </Timeline.Item>
                    ))}
                  </Timeline>
                )}
              </Card>
            </Stack>
          </Grid.Col>
        </Grid>
      )}

      {s && modal === 'venda' && <ModalVenda sepultura={{ id: s.id, codigo: s.codigo }} fechar={() => { setModal(null); atualizar(); }} />}
      {s && modal === 'transferir' && <ModalTransferir sepultura={s} fechar={() => { setModal(null); atualizar(); }} />}
      {s && modal === 'sepultamento' && (
        <ModalSepultamento
          sepulturaFixa={{ id: s.id, codigo: s.codigo }}
          socioInicial={s.socio_id ? { id: s.socio_id, nome: s.socio_nome ?? '' } : null}
          fechar={() => setModal(null)}
          aoRegistrar={(r) => {
            if (r.sugerir_sucessao && r.socio_id) setSucessaoDe({ id: r.socio_id, nome: s.socio_nome ?? '' });
          }}
        />
      )}
      {sucessaoDe && <PerguntaSucessao socio={sucessaoDe} fechar={() => setSucessaoDe(null)} />}
      {exumando && <ModalExumacao registro={exumando} fechar={() => setExumando(null)} />}
    </>
  );
}

/** Depois de registrar o sepultamento do próprio sócio: "algum familiar vai assumir?" */
export function PerguntaSucessao({ socio, fechar }: { socio: { id: number; nome: string }; fechar: () => void }) {
  const [abrir, setAbrir] = useState(false);
  if (abrir) return <ModalSucessao socio={socio} fechar={fechar} />;
  return (
    <Modal opened onClose={fechar} title="Algum familiar vai assumir?">
      <Stack>
        <Text size="sm">
          {socio.nome} agora consta como falecido(a). Um familiar pode assumir as sepulturas pagando a taxa de associação.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={fechar}>Agora não</Button>
          <Button onClick={() => setAbrir(true)}>Sim, registrar sucessão</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalTransferir({ sepultura, fechar }: { sepultura: SepulturaDetalhe; fechar: () => void }) {
  const form = useForm({
    initialValues: { socio_id: null as number | null, motivo: '' },
    validate: { motivo: (v) => (v.trim().length < 5 ? 'Explique o motivo' : null) },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      await api.post(`/api/sepulturas/${sepultura.id}/transferir`, v);
      notifications.show({ color: 'teal', message: v.socio_id ? 'Titularidade transferida.' : 'Sepultura ficou sem titular.' });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  return (
    <Modal opened onClose={fechar} title={`Transferir ${sepultura.codigo}`}>
      <form onSubmit={salvar}>
        <Stack>
          <Text size="sm">
            Para corrigir ou transferir manualmente. Para herança de sócio falecido, prefira a <b>sucessão</b> na ficha do sócio.
          </Text>
          <SeletorSocio
            label="Novo titular"
            description="Deixe vazio para a sepultura ficar sem titular."
            value={form.values.socio_id}
            onChange={(id) => form.setFieldValue('socio_id', id)}
          />
          <Textarea label="Motivo" withAsterisk {...form.getInputProps('motivo')} />
          <Button type="submit" loading={form.submitting}>Transferir</Button>
        </Stack>
      </form>
    </Modal>
  );
}
