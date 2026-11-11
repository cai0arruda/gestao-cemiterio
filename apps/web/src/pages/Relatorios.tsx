import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconCheck,
  IconFileSpreadsheet,
  IconPrinter,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_SITUACAO_SEPULTURA,
  ROTULO_SITUACAO_SOCIO,
  ROTULO_TIPO_COBRANCA,
  SITUACOES_SEPULTURA,
  SITUACOES_SOCIO,
  linkWhatsapp,
  montarMensagem,
  reais,
  type Aniversariante,
  type Arrecadacao,
  type Caixa,
  type Devedor,
  type Sepultado,
  type VisaoGeral,
} from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { CampoMascara } from '../components/CampoMascara';
import { imprimirCaixa, imprimirRecibo } from '../components/financeiro/imprimir';
import { hojeIso, useConfiguracoes } from '../hooks';
import { baixarCsv, reaisCsv } from '../util/csv';
import { dataBr, dataHoraBr, dataIso, telefoneBr } from '../util/formatar';
import { mascaraData } from '../util/mascaras';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function Relatorios() {
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') ?? 'geral';
  return (
    <>
      <Title order={2} mb="md" className="nao-imprimir">Relatórios</Title>
      <Tabs value={aba} onChange={(v) => setParams(v ? { aba: v } : {})} keepMounted={false}>
        <Tabs.List mb="md" className="nao-imprimir">
          <Tabs.Tab value="geral">Visão geral</Tabs.Tab>
          <Tabs.Tab value="inadimplencia">Inadimplência</Tabs.Tab>
          <Tabs.Tab value="lembretes">Lembrete de Finados</Tabs.Tab>
          <Tabs.Tab value="caixa">Caixa do dia</Tabs.Tab>
          <Tabs.Tab value="arrecadacao">Arrecadação</Tabs.Tab>
          <Tabs.Tab value="aniversariantes">Aniversariantes</Tabs.Tab>
          <Tabs.Tab value="sepultamentos">Sepultamentos</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="geral"><PainelGeral /></Tabs.Panel>
        <Tabs.Panel value="inadimplencia"><Devedores modo="vencidas" /></Tabs.Panel>
        <Tabs.Panel value="lembretes"><Devedores modo="a_vencer" /></Tabs.Panel>
        <Tabs.Panel value="caixa"><CaixaDoDia /></Tabs.Panel>
        <Tabs.Panel value="arrecadacao"><RelArrecadacao /></Tabs.Panel>
        <Tabs.Panel value="aniversariantes"><Aniversariantes /></Tabs.Panel>
        <Tabs.Panel value="sepultamentos"><Sepultamentos /></Tabs.Panel>
      </Tabs>
    </>
  );
}

/** Cabeçalho que só aparece na impressão em A4. */
function TituloImpressao({ titulo, sub }: { titulo: string; sub?: string }) {
  const config = useConfiguracoes();
  return (
    <div className="so-impressao" style={{ marginBottom: 12 }}>
      <Text fw={700}>{config.data?.configuracoes.cemiterio_nome}</Text>
      <Text fw={600} size="lg">{titulo}</Text>
      {sub && <Text size="sm">{sub}</Text>}
      <Text size="xs">Emitido em {dataHoraBr(new Date().toISOString())}</Text>
    </div>
  );
}

function BotoesExportar({ aoCsv, semImprimir = false }: { aoCsv?: () => void; semImprimir?: boolean }) {
  return (
    <Group gap="xs" className="nao-imprimir">
      {aoCsv && (
        <Button size="xs" variant="default" leftSection={<IconFileSpreadsheet size={14} />} onClick={aoCsv}>
          Planilha (CSV)
        </Button>
      )}
      {!semImprimir && (
        <Button size="xs" variant="default" leftSection={<IconPrinter size={14} />} onClick={() => window.print()}>
          Imprimir
        </Button>
      )}
    </Group>
  );
}

function Periodo({ de, ate, setDe, setAte }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  return (
    <Group gap="xs" className="nao-imprimir">
      <CampoMascara size="xs" w={110} label="De" mascara={mascaraData} value={de} onChange={setDe} />
      <CampoMascara size="xs" w={110} label="Até" mascara={mascaraData} value={ate} onChange={setAte} />
    </Group>
  );
}

// ---------------- Visão geral ----------------

function Indicador({ titulo, valor, detalhe, alerta }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <Card withBorder>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{titulo}</Text>
      <Group gap={6} mt={4} align="center">
        {alerta && <IconAlertTriangle size={20} color="var(--mantine-color-red-7)" aria-label="atenção" />}
        <Text fz={26} fw={700}>{valor}</Text>
      </Group>
      {detalhe && <Text size="sm" c="dimmed">{detalhe}</Text>}
    </Card>
  );
}

function PainelGeral() {
  const { data: v } = useQuery({ queryKey: ['visao-geral'], queryFn: () => api.get<VisaoGeral>('/api/relatorios/visao-geral') });
  if (!v) return <Loader />;
  const ano = new Date().getFullYear();
  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Indicador titulo="Sócios ativos" valor={String(v.socios.ativo)} detalhe={`${v.ativos_em_dia} em dia · ${v.ativos_pendentes} pendentes`} />
        <Indicador
          titulo="Em atraso"
          valor={reais(v.total_vencido_centavos)}
          detalhe="soma das cobranças vencidas"
          alerta={v.total_vencido_centavos > 0}
        />
        <Indicador titulo="Recebido no mês" valor={reais(v.arrecadado_mes_centavos)} detalhe={`${reais(v.arrecadado_ano_centavos)} em ${ano}`} />
        <Indicador
          titulo={`Anuidade ${ano}`}
          valor={v.anuidade_ano ? `${v.anuidade_ano.pagas} de ${v.anuidade_ano.geradas}` : '—'}
          detalhe={v.anuidade_ano ? 'pagas' : 'ainda não gerada'}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Text fw={600} mb="xs">Sócios por situação</Text>
          <Table fz="sm">
            <Table.Tbody>
              {SITUACOES_SOCIO.map((s) => (
                <Table.Tr key={s}><Table.Td>{ROTULO_SITUACAO_SOCIO[s]}</Table.Td><Table.Td ta="right" fw={600}>{v.socios[s]}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
        <Card withBorder>
          <Text fw={600} mb="xs">Sepulturas</Text>
          <Table fz="sm">
            <Table.Tbody>
              {SITUACOES_SEPULTURA.map((s) => (
                <Table.Tr key={s}><Table.Td>{ROTULO_SITUACAO_SEPULTURA[s]}</Table.Td><Table.Td ta="right" fw={600}>{v.sepulturas[s]}</Table.Td></Table.Tr>
              ))}
              <Table.Tr><Table.Td c="dimmed">Ainda sem posição no mapa</Table.Td><Table.Td ta="right">{v.sepulturas_sem_mapa}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
        <Card withBorder>
          <Text fw={600} mb="xs">Pendências do cadastro</Text>
          <Stack gap={6}>
            <Text size="sm">
              <b>{v.cadastros_incompletos}</b> sócio(s) com cadastro incompleto (sem nascimento, telefone ou endereço).
            </Text>
            <Text size="sm"><b>{v.sepultamentos_ano}</b> sepultamento(s) registrado(s) em {ano}.</Text>
            <Anchor component={Link} to="/socios" size="sm">Ver sócios</Anchor>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

// ---------------- Inadimplência e lembretes ----------------

function Devedores({ modo }: { modo: 'vencidas' | 'a_vencer' }) {
  const qc = useQueryClient();
  const config = useConfiguracoes();
  const [soNaoAvisados, setSoNaoAvisados] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['devedores', modo],
    queryFn: () => api.get<{ devedores: Devedor[] }>(`/api/relatorios/devedores?modo=${modo}`),
  });
  if (isLoading || !data || !config.data) return <Loader />;

  const cfg = config.data.configuracoes;
  const cobranca = modo === 'vencidas';
  const lista = data.devedores.filter((d) => !soNaoAvisados || !d.ultimo_aviso);
  const total = lista.reduce((t, d) => t + d.total_centavos, 0);
  const titulo = cobranca ? 'Sócios com pagamento em atraso' : 'Lembrete de Finados — anuidades a vencer';

  const mensagem = (d: Devedor) =>
    montarMensagem(cobranca ? cfg.mensagem_cobranca : cfg.mensagem_lembrete, {
      nome: d.nome.split(' ')[0]!,
      cemiterio: cfg.cemiterio_nome,
      anos: [...d.anos.map(String), ...d.outras].join(', '),
      valor: reais(d.total_centavos),
      link: d.link_portal,
      vencimento: dataBr(d.vencimento_mais_antigo),
    });

  async function avisar(d: Devedor, link: string) {
    window.open(link, '_blank', 'noopener');
    try {
      await api.post(`/api/socios/${d.socio_id}/avisos`, { tipo: cobranca ? 'cobranca' : 'lembrete', canal: 'whatsapp' });
      qc.invalidateQueries({ queryKey: ['devedores', modo] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  }

  const csv = () =>
    baixarCsv(
      cobranca ? `inadimplencia-${hojeIso()}` : `lembrete-finados-${hojeIso()}`,
      ['Matrícula', 'Nome', 'Telefone', 'Telefone 2', 'Anos', 'Outras cobranças', 'Total (R$)', 'Último aviso'],
      lista.map((d) => [
        d.matricula,
        d.nome,
        telefoneBr(d.telefone),
        telefoneBr(d.telefone2),
        d.anos.join(', '),
        d.outras.join(', '),
        reaisCsv(d.total_centavos),
        d.ultimo_aviso ? dataHoraBr(d.ultimo_aviso) : '',
      ]),
    );

  return (
    <Stack>
      <TituloImpressao titulo={titulo} sub={`${lista.length} sócio(s) · ${reais(total)}`} />
      <Group justify="space-between" className="nao-imprimir">
        <Group gap="md">
          <Badge size="lg" variant="light" color={cobranca ? 'red' : 'blue'}>
            {lista.length} sócio(s) · {reais(total)}
          </Badge>
          <Checkbox
            label="Só quem ainda não foi avisado"
            checked={soNaoAvisados}
            onChange={(e) => setSoNaoAvisados(e.currentTarget.checked)}
          />
        </Group>
        <BotoesExportar aoCsv={csv} />
      </Group>
      {!cobranca && (
        <Alert variant="light" className="nao-imprimir">
          Para quem tem a anuidade do ano gerada e ainda não pagou. Bom para mandar no começo de outubro. Se a lista estiver
          vazia, gere as anuidades do ano em Financeiro.
        </Alert>
      )}
      <Card withBorder p={0} className="card-tabela">
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing={6} fz="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Sócio</Table.Th>
                <Table.Th>Telefone</Table.Th>
                <Table.Th>{cobranca ? 'Em atraso' : 'A vencer'}</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th className="nao-imprimir">Aviso</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((d) => {
                const link = linkWhatsapp(d.telefone, mensagem(d)) ?? linkWhatsapp(d.telefone2, mensagem(d));
                return (
                  <Table.Tr key={d.socio_id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/socios/${d.socio_id}`} size="sm">{d.matricula} — {d.nome}</Anchor>
                    </Table.Td>
                    <Table.Td>{telefoneBr(d.telefone) || telefoneBr(d.telefone2) || <Text span c="dimmed" size="sm">sem telefone</Text>}</Table.Td>
                    <Table.Td>
                      {[...d.anos.map(String), ...d.outras].join(', ')}
                      {cobranca && <Text span c="dimmed" size="xs"> · desde {dataBr(d.vencimento_mais_antigo)}</Text>}
                    </Table.Td>
                    <Table.Td ta="right" fw={600}>{reais(d.total_centavos)}</Table.Td>
                    <Table.Td className="nao-imprimir">
                      <Group gap={6} wrap="nowrap">
                        {link ? (
                          <Tooltip label="Abre o WhatsApp com a mensagem pronta; você confere e envia">
                            <Button size="compact-xs" color="green" leftSection={<IconBrandWhatsapp size={14} />} onClick={() => avisar(d, link)}>
                              WhatsApp
                            </Button>
                          </Tooltip>
                        ) : null}
                        {d.ultimo_aviso && (
                          <Tooltip label={`Último aviso: ${dataHoraBr(d.ultimo_aviso)}`}>
                            <Badge size="xs" variant="light" color="gray" leftSection={<IconCheck size={10} />}>
                              {dataBr(d.ultimo_aviso.slice(0, 10))}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {lista.length === 0 && (
          <Text c="dimmed" ta="center" py="lg">{cobranca ? 'Ninguém em atraso. 🎉' : 'Nenhuma anuidade a vencer.'}</Text>
        )}
      </Card>
      <Text size="xs" c="dimmed" className="nao-imprimir">
        O texto da mensagem pode ser mudado em Administração → Configurações.
      </Text>
    </Stack>
  );
}

// ---------------- Caixa do dia ----------------

function CaixaDoDia() {
  const [dia, setDia] = useState(dataBr(hojeIso()));
  const iso = dataIso(dia);
  const { data } = useQuery({
    queryKey: ['caixa', iso],
    queryFn: () => api.get<Caixa>(`/api/relatorios/caixa?data=${iso}`),
    enabled: !!iso,
  });
  return (
    <Stack>
      <TituloImpressao titulo="Fechamento de caixa" sub={dia} />
      <Group justify="space-between" align="flex-end" className="nao-imprimir">
        <CampoMascara size="xs" w={120} label="Dia" mascara={mascaraData} value={dia} onChange={setDia} />
        <Group gap="xs">
          <Button size="xs" leftSection={<IconPrinter size={14} />} onClick={() => iso && imprimirCaixa(iso)} disabled={!iso}>
            Imprimir na térmica
          </Button>
          <BotoesExportar />
        </Group>
      </Group>
      {data && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Indicador titulo="Total do dia" valor={reais(data.total_centavos)} detalhe={`${data.recebimentos.length} recibo(s)`} />
            <Card withBorder>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Por forma de pagamento</Text>
              {data.por_forma.length === 0 && <Text size="sm" c="dimmed">—</Text>}
              {data.por_forma.map((f) => (
                <Group key={f.forma} justify="space-between">
                  <Text size="sm">{ROTULO_FORMA_PAGAMENTO[f.forma]} ({f.qtd})</Text>
                  <Text size="sm" fw={600}>{reais(f.total_centavos)}</Text>
                </Group>
              ))}
            </Card>
            <Card withBorder>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Por atendente</Text>
              {data.por_usuario.length === 0 && <Text size="sm" c="dimmed">—</Text>}
              {data.por_usuario.map((u) => (
                <Group key={u.usuario} justify="space-between">
                  <Text size="sm">{u.usuario} ({u.qtd})</Text>
                  <Text size="sm" fw={600}>{reais(u.total_centavos)}</Text>
                </Group>
              ))}
            </Card>
          </SimpleGrid>
          <Card withBorder p={0} className="card-tabela">
            <Table fz="sm" verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Recibo</Table.Th>
                  <Table.Th>Sócio</Table.Th>
                  <Table.Th>Referente</Table.Th>
                  <Table.Th>Forma</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th className="nao-imprimir" w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.recebimentos.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td ff="monospace">{r.numero}</Table.Td>
                    <Table.Td>{r.socio_nome}</Table.Td>
                    <Table.Td>{r.descricao}</Table.Td>
                    <Table.Td>{ROTULO_FORMA_PAGAMENTO[r.forma]}</Table.Td>
                    <Table.Td ta="right">{reais(r.total_centavos)}</Table.Td>
                    <Table.Td className="nao-imprimir">
                      <Button size="compact-xs" variant="subtle" onClick={() => imprimirRecibo(r.id)} aria-label="Reimprimir recibo">
                        <IconPrinter size={14} />
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {data.estornados.map((r) => (
                  <Table.Tr key={r.id} style={{ opacity: 0.5, textDecoration: 'line-through' }}>
                    <Table.Td ff="monospace">{r.numero}</Table.Td>
                    <Table.Td>{r.socio_nome}</Table.Td>
                    <Table.Td>{r.descricao} (estornado)</Table.Td>
                    <Table.Td>{ROTULO_FORMA_PAGAMENTO[r.forma]}</Table.Td>
                    <Table.Td ta="right">{reais(r.total_centavos)}</Table.Td>
                    <Table.Td className="nao-imprimir" />
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {data.recebimentos.length + data.estornados.length === 0 && (
              <Text c="dimmed" ta="center" py="lg">Nenhum recebimento registrado neste dia.</Text>
            )}
          </Card>
          <Text size="xs" c="dimmed" className="nao-imprimir">
            Considera a hora em que o pagamento foi registrado no sistema. Estornados aparecem riscados e não somam.
          </Text>
        </>
      )}
    </Stack>
  );
}

// ---------------- Arrecadação ----------------

function RelArrecadacao() {
  const ano = new Date().getFullYear();
  const [de, setDe] = useState(`01/01/${ano}`);
  const [ate, setAte] = useState(dataBr(hojeIso()));
  const [isoDe, isoAte] = [dataIso(de), dataIso(ate)];
  const { data } = useQuery({
    queryKey: ['arrecadacao', isoDe, isoAte],
    queryFn: () => api.get<Arrecadacao>(`/api/relatorios/arrecadacao?de=${isoDe}&ate=${isoAte}`),
    enabled: !!isoDe && !!isoAte,
  });
  const nomeMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]}/${m.slice(0, 4)}`;
  const csv = () =>
    data &&
    baixarCsv(
      `arrecadacao-${isoDe}-a-${isoAte}`,
      ['Mês', 'Total (R$)'],
      [...data.por_mes.map((m) => [nomeMes(m.mes), reaisCsv(m.total_centavos)]), ['TOTAL', reaisCsv(data.total_centavos)]],
    );
  return (
    <Stack>
      <TituloImpressao titulo="Arrecadação" sub={`${de} a ${ate}`} />
      <Group justify="space-between" align="flex-end">
        <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <BotoesExportar aoCsv={csv} />
      </Group>
      {data && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Indicador titulo="Total recebido" valor={reais(data.total_centavos)} detalhe={`${data.qtd_recibos} recibo(s)`} />
            <Indicador titulo="Descontos concedidos" valor={reais(data.descontos_centavos)} />
            <Card withBorder>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Por tipo</Text>
              {data.por_tipo.map((t) => (
                <Group key={t.tipo} justify="space-between">
                  <Text size="sm">{ROTULO_TIPO_COBRANCA[t.tipo]} ({t.qtd})</Text>
                  <Text size="sm" fw={600}>{reais(t.total_centavos)}</Text>
                </Group>
              ))}
              {data.por_tipo.length === 0 && <Text size="sm" c="dimmed">—</Text>}
            </Card>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder p={0} className="card-tabela">
              <Text fw={600} px="md" pt="md" pb="xs">Por mês</Text>
              <Table fz="sm">
                <Table.Tbody>
                  {data.por_mes.map((m) => (
                    <Table.Tr key={m.mes}><Table.Td>{nomeMes(m.mes)}</Table.Td><Table.Td ta="right">{reais(m.total_centavos)}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
            <Card withBorder p={0} className="card-tabela">
              <Text fw={600} px="md" pt="md" pb="xs">Por forma de pagamento</Text>
              <Table fz="sm">
                <Table.Tbody>
                  {data.por_forma.map((f) => (
                    <Table.Tr key={f.forma}>
                      <Table.Td>{ROTULO_FORMA_PAGAMENTO[f.forma]} ({f.qtd})</Table.Td>
                      <Table.Td ta="right">{reais(f.total_centavos)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

// ---------------- Aniversariantes ----------------

function Aniversariantes() {
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const config = useConfiguracoes();
  const { data } = useQuery({
    queryKey: ['aniversariantes', mes],
    queryFn: () => api.get<{ aniversariantes: Aniversariante[] }>(`/api/relatorios/aniversariantes?mes=${mes}`),
  });
  const lista = data?.aniversariantes ?? [];
  const nomeCemiterio = config.data?.configuracoes.cemiterio_nome ?? 'cemitério';
  return (
    <Stack>
      <TituloImpressao titulo={`Aniversariantes de ${MESES[Number(mes) - 1]}`} />
      <Group justify="space-between" align="flex-end">
        <Select
          className="nao-imprimir"
          label="Mês"
          w={160}
          data={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
          value={mes}
          onChange={(v) => v && setMes(v)}
          allowDeselect={false}
        />
        <BotoesExportar
          aoCsv={() =>
            baixarCsv(`aniversariantes-${MESES[Number(mes) - 1]}`, ['Dia', 'Matrícula', 'Nome', 'Idade', 'Telefone'], lista.map((a) => [
              a.data_nascimento.slice(8, 10),
              a.matricula,
              a.nome,
              a.idade,
              telefoneBr(a.telefone),
            ]))
          }
        />
      </Group>
      <Card withBorder p={0} className="card-tabela">
        <Table fz="sm" verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={60}>Dia</Table.Th>
              <Table.Th>Sócio</Table.Th>
              <Table.Th>Completa</Table.Th>
              <Table.Th>Telefone</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((a) => {
              const link = linkWhatsapp(a.telefone, `Feliz aniversário, ${a.nome.split(' ')[0]}! Um abraço do ${nomeCemiterio}.`);
              return (
                <Table.Tr key={a.socio_id}>
                  <Table.Td fw={600}>{a.data_nascimento.slice(8, 10)}</Table.Td>
                  <Table.Td><Anchor component={Link} to={`/socios/${a.socio_id}`} size="sm">{a.nome}</Anchor></Table.Td>
                  <Table.Td>{a.idade} anos</Table.Td>
                  <Table.Td>
                    {telefoneBr(a.telefone)}
                    {link && (
                      <Anchor href={link} target="_blank" ml="xs" size="xs" c="green" className="nao-imprimir">WhatsApp</Anchor>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {lista.length === 0 && <Text c="dimmed" ta="center" py="lg">Nenhum aniversariante neste mês (ou faltam datas de nascimento).</Text>}
      </Card>
    </Stack>
  );
}

// ---------------- Sepultamentos ----------------

function Sepultamentos() {
  const ano = new Date().getFullYear();
  const [de, setDe] = useState(`01/01/${ano}`);
  const [ate, setAte] = useState(dataBr(hojeIso()));
  const [isoDe, isoAte] = [dataIso(de), dataIso(ate)];
  const { data } = useQuery({
    queryKey: ['rel-sepultamentos', isoDe, isoAte],
    queryFn: () => api.get<{ sepultamentos: Sepultado[] }>(`/api/relatorios/sepultamentos?de=${isoDe}&ate=${isoAte}`),
    enabled: !!isoDe && !!isoAte,
  });
  const lista = data?.sepultamentos ?? [];
  return (
    <Stack>
      <TituloImpressao titulo="Sepultamentos" sub={`${de} a ${ate} · ${lista.length} registro(s)`} />
      <Group justify="space-between" align="flex-end">
        <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <BotoesExportar
          aoCsv={() =>
            baixarCsv(`sepultamentos-${isoDe}-a-${isoAte}`, ['Data', 'Nome', 'Sepultura', 'Falecimento', 'Sócio do direito', 'Parentesco', 'Certidão'], lista.map((s) => [
              dataBr(s.data_sepultamento),
              s.nome_sepultado,
              s.sepultura_codigo,
              dataBr(s.data_falecimento),
              s.socio_direito_nome,
              s.parentesco,
              s.certidao_obito,
            ]))
          }
        />
      </Group>
      <Card withBorder p={0} className="card-tabela">
        <Table fz="sm" verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Sepultura</Table.Th>
              <Table.Th>Sócio do direito</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{dataBr(s.data_sepultamento)}</Table.Td>
                <Table.Td>{s.nome_sepultado}{s.historico && <Badge ml={6} size="xs" variant="outline" color="gray">antigo</Badge>}</Table.Td>
                <Table.Td><Anchor component={Link} to={`/sepulturas/${s.sepultura_id}`} ff="monospace" size="sm">{s.sepultura_codigo}</Anchor></Table.Td>
                <Table.Td>{s.socio_direito_nome}{s.parentesco && <Text span c="dimmed" size="xs"> ({s.parentesco})</Text>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {lista.length === 0 && <Text c="dimmed" ta="center" py="lg">Nenhum sepultamento no período.</Text>}
      </Card>
    </Stack>
  );
}
