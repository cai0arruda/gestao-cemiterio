import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconCash, IconDots, IconHistoryToggle, IconPrinter, IconTrash, IconUserPlus, IconX } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ROTULO_FORMA_PAGAMENTO, reais, type FinanceiroSocio as Dados, type ResumoFinanceiro, type Socio } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { useAuth } from '../../auth';
import { dataBr, dataIso } from '../../util/formatar';
import { mascaraData } from '../../util/mascaras';
import { validarDataBr } from '../../util/socioForm';
import { CampoDinheiro } from '../CampoDinheiro';
import { CampoMascara } from '../CampoMascara';
import { confirmarExclusaoAnuidade } from './excluirAnuidade';
import { imprimirRecibo } from './imprimir';
import { PainelPagamento } from './PainelPagamento';

export function useFinanceiro(socioId: number) {
  return useQuery({
    queryKey: ['financeiro', socioId],
    queryFn: () => api.get<Dados>(`/api/socios/${socioId}/financeiro`),
  });
}

export function BadgeResumo({ resumo }: { resumo: ResumoFinanceiro }) {
  if (resumo.em_dia) {
    return (
      <Badge color="teal" size="lg" variant="light">
        Em dia{resumo.quitado_ate ? ` · quitado até ${resumo.quitado_ate}` : ''}
      </Badge>
    );
  }
  return (
    <Badge color="red" size="lg" variant="light">
      Pendente{resumo.anos_pendentes.length ? `: ${resumo.anos_pendentes.join(', ')}` : ''} · {reais(resumo.total_vencido_centavos)}
    </Badge>
  );
}

const corSituacao = { aberta: 'yellow', paga: 'teal', cancelada: 'gray' } as const;
const rotuloSituacao = { aberta: 'Em aberto', paga: 'Paga', cancelada: 'Cancelada' } as const;

export function FinanceiroSocio({ socio }: { socio: Socio }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const { data, isLoading } = useFinanceiro(socio.id);
  const [pagamentoAberto, pagamento] = useDisclosure();
  const [antigasAberto, antigas] = useDisclosure();
  const [motivoPara, setMotivoPara] = useState<{ tipo: 'cancelar' | 'estornar'; id: number; titulo: string } | null>(null);

  if (isLoading || !data) return <Loader />;

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['financeiro', socio.id] });
    qc.invalidateQueries({ queryKey: ['socio', socio.id] });
    qc.invalidateQueries({ queryKey: ['socios'] });
    qc.invalidateQueries({ queryKey: ['historico-socio', socio.id] });
    qc.invalidateQueries({ queryKey: ['recebimentos'] });
  };

  const podeTaxa =
    socio.situacao !== 'falecido' &&
    !(socio.situacao === 'ativo' && socio.direito_sepultamento === 'disponivel') &&
    !data.cobrancas.some((c) => c.tipo === 'taxa_associacao' && c.situacao === 'aberta');

  async function gerarTaxa() {
    try {
      await api.post(`/api/socios/${socio.id}/taxa-associacao`);
      notifications.show({ color: 'teal', message: 'Cobrança da taxa de associação gerada.' });
      atualizar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  }

  const temAberta = data.cobrancas.some((c) => c.situacao === 'aberta');

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between" align="center">
          <BadgeResumo resumo={data.resumo} />
          <Group gap="xs">
            {podeTaxa && (
              <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={gerarTaxa}>
                {socio.situacao === 'associacao_encerrada' ? 'Renovar associação' : 'Cobrar taxa de associação'}
              </Button>
            )}
            {admin && (
              <Button variant="default" leftSection={<IconHistoryToggle size={16} />} onClick={antigas.open}>
                Lançar anuidades antigas
              </Button>
            )}
            <Button leftSection={<IconCash size={18} />} onClick={pagamento.open}>
              {temAberta ? 'Registrar pagamento' : 'Adiantar anuidade'}
            </Button>
          </Group>
        </Group>
        {socio.situacao === 'pendente' && (
          <Alert mt="sm" color="orange" variant="light">
            Sócio novo: fica ativo, com todos os benefícios da associação, assim que a taxa de associação for paga.
          </Alert>
        )}
      </Card>

      <Card withBorder p={0} className="card-tabela">
        <Text fw={600} px="md" pt="md" pb="xs">Cobranças</Text>
        {data.cobrancas.length === 0 ? (
          <Text size="sm" c="dimmed" p="md">
            Nenhuma cobrança. As anuidades são geradas em Financeiro → Gerar anuidades do ano.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Descrição</Table.Th>
                  <Table.Th>Vencimento</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th>Situação</Table.Th>
                  <Table.Th w={64} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.cobrancas.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{c.descricao}</Table.Td>
                    <Table.Td c={c.vencida ? 'red' : undefined}>{dataBr(c.vencimento)}</Table.Td>
                    <Table.Td ta="right">{reais(c.valor_centavos)}</Table.Td>
                    <Table.Td>
                      <Tooltip label={c.motivo_cancelamento} disabled={!c.motivo_cancelamento}>
                        <Badge size="sm" variant="light" color={c.vencida ? 'red' : corSituacao[c.situacao]}>
                          {c.vencida ? 'Vencida' : rotuloSituacao[c.situacao]}
                        </Badge>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={0} wrap="nowrap">
                        {c.situacao === 'aberta' && c.tipo === 'anuidade' && (
                          <Tooltip label="Excluir (gerada por engano)">
                            <ActionIcon variant="subtle" color="gray" onClick={() => confirmarExclusaoAnuidade(c, qc)} aria-label={`Excluir ${c.descricao}`}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {admin && c.situacao === 'aberta' && (
                          <Tooltip label="Cancelar cobrança (isenção, erro...)">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              onClick={() => setMotivoPara({ tipo: 'cancelar', id: c.id, titulo: `Cancelar ${c.descricao}` })}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Card withBorder p={0} className="card-tabela">
        <Text fw={600} px="md" pt="md" pb="xs">Pagamentos</Text>
        {data.recebimentos.length === 0 ? (
          <Text size="sm" c="dimmed" p="md">Nenhum pagamento registrado.</Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Recibo</Table.Th>
                  <Table.Th>Referente</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.recebimentos.map((r) => (
                  <Table.Tr key={r.id} style={r.estornado ? { opacity: 0.55 } : undefined}>
                    <Table.Td>{dataBr(r.data_pagamento)}</Table.Td>
                    <Table.Td>
                      {r.historico ? (
                        <Badge size="xs" variant="outline" color="gray">ficha antiga</Badge>
                      ) : (
                        <Text size="sm" ff="monospace">{r.numero}</Text>
                      )}
                      {r.estornado && <Badge size="xs" color="red" ml={4}>estornado</Badge>}
                    </Table.Td>
                    <Table.Td>
                      {r.descricao}
                      {!r.historico && <Text span c="dimmed" size="xs"> · {ROTULO_FORMA_PAGAMENTO[r.forma]}</Text>}
                    </Table.Td>
                    <Table.Td ta="right">{reais(r.total_centavos)}</Table.Td>
                    <Table.Td>
                      {!r.estornado && (
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {!r.historico && (
                              <Menu.Item leftSection={<IconPrinter size={14} />} onClick={() => imprimirRecibo(r.id)}>
                                Reimprimir recibo
                              </Menu.Item>
                            )}
                            {admin && (
                              <Menu.Item
                                color="red"
                                leftSection={<IconArrowBackUp size={14} />}
                                onClick={() => setMotivoPara({ tipo: 'estornar', id: r.id, titulo: `Estornar ${r.numero ?? 'lançamento'}` })}
                              >
                                Estornar pagamento
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Modal opened={pagamentoAberto} onClose={pagamento.close} title={`Registrar pagamento — ${socio.nome_completo}`} size="lg">
        <PainelPagamento socioId={socio.id} cobrancas={data.cobrancas} aoRegistrar={pagamento.close} />
      </Modal>
      {antigasAberto && <ModalAnuidadesAntigas socioId={socio.id} fechar={antigas.close} aoSalvar={atualizar} />}
      {motivoPara && <ModalMotivo {...motivoPara} fechar={() => setMotivoPara(null)} aoSalvar={atualizar} />}
    </Stack>
  );
}

function ModalMotivo({
  tipo,
  id,
  titulo,
  fechar,
  aoSalvar,
}: {
  tipo: 'cancelar' | 'estornar';
  id: number;
  titulo: string;
  fechar: () => void;
  aoSalvar: () => void;
}) {
  const form = useForm({
    initialValues: { motivo: '' },
    validate: { motivo: (v) => (v.trim().length < 5 ? 'Explique o motivo' : null) },
  });
  const salvar = form.onSubmit(async ({ motivo }) => {
    try {
      await api.post(tipo === 'cancelar' ? `/api/cobrancas/${id}/cancelar` : `/api/recebimentos/${id}/estornar`, { motivo });
      notifications.show({ color: 'teal', message: tipo === 'cancelar' ? 'Cobrança cancelada.' : 'Pagamento estornado.' });
      aoSalvar();
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  return (
    <Modal opened onClose={fechar} title={titulo}>
      <form onSubmit={salvar}>
        <Stack>
          <Text size="sm">
            {tipo === 'cancelar'
              ? 'A cobrança deixa de contar como dívida. Fica registrada no histórico.'
              : 'As cobranças voltam a ficar em aberto e o recibo deixa de valer. Se foi o pagamento da taxa de associação, a situação do sócio volta a ser a anterior.'}
          </Text>
          <Textarea label="Motivo" withAsterisk autoFocus {...form.getInputProps('motivo')} />
          <Button type="submit" color="red" loading={form.submitting}>
            {tipo === 'cancelar' ? 'Cancelar cobrança' : 'Estornar pagamento'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

function ModalAnuidadesAntigas({ socioId, fechar, aoSalvar }: { socioId: number; fechar: () => void; aoSalvar: () => void }) {
  const anoAtual = new Date().getFullYear();
  const form = useForm({
    initialValues: { ano_inicial: String(anoAtual - 1), ano_final: String(anoAtual - 1), valor_centavos: 0 as number | null, data: '', observacao: '' },
    validate: {
      ano_inicial: (v) => (/^\d{4}$/.test(v) ? null : 'Ano inválido'),
      ano_final: (v, t) =>
        !/^\d{4}$/.test(v) ? 'Ano inválido' : Number(v) < Number(t.ano_inicial) ? 'Deve ser ≥ ano inicial' : Number(v) > anoAtual ? 'No máximo o ano atual' : null,
      data: (v) => validarDataBr(v),
    },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      const r = await api.post<{ lancados: number[]; ja_pagos: number[] }>(`/api/socios/${socioId}/anuidades-antigas`, {
        ano_inicial: Number(v.ano_inicial),
        ano_final: Number(v.ano_final),
        valor_centavos: v.valor_centavos ?? 0,
        data_pagamento: v.data ? dataIso(v.data) : null,
        observacao: v.observacao,
      });
      notifications.show({
        color: 'teal',
        message:
          (r.lancados.length ? `Lançadas como pagas: ${r.lancados.join(', ')}.` : 'Nada novo para lançar.') +
          (r.ja_pagos.length ? ` Já estavam pagas: ${r.ja_pagos.join(', ')}.` : ''),
      });
      aoSalvar();
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  return (
    <Modal opened onClose={fechar} title="Lançar anuidades antigas já pagas">
      <form onSubmit={salvar}>
        <Stack>
          <Text size="sm" c="dimmed">
            Para quem está passando as fichas em papel para o sistema: marca os anos como pagos, sem imprimir recibo.
            Anos que já estão pagos são ignorados; anos em aberto passam a pagos.
          </Text>
          <Group grow>
            <TextInput label="Do ano" maxLength={4} {...form.getInputProps('ano_inicial')} />
            <TextInput label="Até o ano" maxLength={4} {...form.getInputProps('ano_final')} />
          </Group>
          <CampoDinheiro
            label="Valor pago por ano"
            description="Deixe R$ 0,00 se não souber o valor"
            value={form.values.valor_centavos}
            onChange={(v) => form.setFieldValue('valor_centavos', v)}
          />
          <CampoMascara label="Data do pagamento (opcional)" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data')} />
          <TextInput label="Observação" placeholder="Conforme ficha em papel" {...form.getInputProps('observacao')} />
          <Button type="submit" loading={form.submitting}>Lançar</Button>
        </Stack>
      </form>
    </Modal>
  );
}
