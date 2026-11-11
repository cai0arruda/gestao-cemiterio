import {
  Alert,
  Anchor,
  Checkbox,
  Tabs,
  Breadcrumbs,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAdjustments, IconCash, IconDeviceFloppy, IconId, IconGrave2, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ROTULO_SITUACAO_SOCIO,
  SITUACOES_SOCIO,
  type RegistroAuditoria,
  type Socio,
} from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { CampoMascara } from '../components/CampoMascara';
import { CamposEndereco } from '../components/CamposEndereco';
import { CardPortal } from '../components/CardPortal';
import { DocumentosSocio } from '../components/DocumentosSocio';
import { FinanceiroSocio } from '../components/financeiro/FinanceiroSocio';
import { SepulturasSocio } from '../components/sepulturas/SepulturasSocio';
import { confirmarSemDuplicados } from '../components/duplicados';
import { BadgeDireito, BadgeSituacao } from '../components/Situacao';
import { dataBr, dataHoraBr, dataIso, idade } from '../util/formatar';
import { mascaraCpf, mascaraData, mascaraTelefone } from '../util/mascaras';
import { socioParaValores, validarDataBr, valoresParaInput, valoresVazios, type ValoresSocio } from '../util/socioForm';

export function SocioPagina() {
  const { id } = useParams();
  const novo = id === 'novo';
  const socioId = novo ? null : Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';

  const consulta = useQuery({
    queryKey: ['socio', socioId],
    queryFn: () => api.get<{ socio: Socio }>(`/api/socios/${socioId}`),
    enabled: socioId !== null,
  });
  const proxima = useQuery({
    queryKey: ['proxima-matricula'],
    queryFn: () => api.get<{ matricula: string }>('/api/socios/proxima-matricula'),
    enabled: novo,
  });

  const [cobrarTaxa, setCobrarTaxa] = useState(true);
  const [aba, setAba] = useState<string | null>('financeiro');
  const form = useForm<ValoresSocio>({
    initialValues: valoresVazios(),
    validate: {
      nome_completo: (v) => (v.trim().length < 3 ? 'Informe o nome completo' : null),
      data_nascimento: (v) => validarDataBr(v),
      data_associacao: (v) => validarDataBr(v),
    },
  });

  const socio = consulta.data?.socio;
  useEffect(() => {
    if (socio) {
      form.setValues(socioParaValores(socio));
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socio]);

  const salvar = form.onSubmit(async (v) => {
    const corpo = { ...valoresParaInput(v), ...(novo ? { cobrar_taxa_associacao: cobrarTaxa } : {}) };
    try {
      const nomeMudou = novo || v.nome_completo !== socio?.nome_completo || corpo.data_nascimento !== socio?.data_nascimento;
      if (nomeMudou) {
        const seguir = await confirmarSemDuplicados({
          nome_completo: v.nome_completo,
          data_nascimento: corpo.data_nascimento as string | null,
          ignorar_id: socioId ?? undefined,
        });
        if (!seguir) return;
      }
      const r = novo
        ? await api.post<{ socio: Socio }>('/api/socios', corpo)
        : await api.put<{ socio: Socio }>(`/api/socios/${socioId}`, corpo);
      qc.setQueryData(['socio', r.socio.id], { socio: r.socio });
      qc.invalidateQueries({ queryKey: ['socios'] });
      qc.invalidateQueries({ queryKey: ['proxima-matricula'] });
      qc.invalidateQueries({ queryKey: ['historico-socio', r.socio.id] });
      notifications.show({ color: 'teal', message: novo ? `Sócio cadastrado com a matrícula ${r.socio.matricula}.` : 'Alterações salvas.' });
      if (novo) navigate(`/socios/${r.socio.id}`, { replace: true });
      else form.resetDirty();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      else if (e instanceof ErroApi && e.codigo === 'cpf_duplicado') form.setFieldError('cpf', e.message);
      else if (e instanceof ErroApi && e.codigo === 'matricula_duplicada') form.setFieldError('matricula', e.message);
      notifications.show({ color: 'red', title: 'Não foi possível salvar', message: mensagemDeErro(e) });
    }
  });

  const excluir = () =>
    modals.openConfirmModal({
      title: 'Excluir sócio?',
      children: (
        <Text size="sm">
          O cadastro de <b>{socio?.nome_completo}</b> e as fotos anexadas serão apagados definitivamente. Use apenas para
          corrigir cadastros feitos por engano.
        </Text>
      ),
      labels: { confirm: 'Excluir definitivamente', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.delete(`/api/socios/${socioId}`);
          qc.invalidateQueries({ queryKey: ['socios'] });
          notifications.show({ message: 'Cadastro excluído.' });
          navigate('/socios');
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });

  if (!novo && consulta.isLoading) return <Loader m="xl" />;
  if (!novo && consulta.isError) return <Alert color="red">{mensagemDeErro(consulta.error)}</Alert>;

  const anos = idade(dataIso(form.values.data_nascimento));

  const formulario = (
          <form onSubmit={salvar}>
            <Stack>
              <Card withBorder>
                <Text fw={600} mb="sm">Identificação</Text>
                <Grid gap="sm">
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <TextInput
                      label="Matrícula"
                      placeholder={proxima.data?.matricula}
                      description={novo ? 'Vazio = próxima automática' : undefined}
                      {...form.getInputProps('matricula')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 9 }}>
                    <TextInput label="Nome completo" withAsterisk autoFocus={novo} {...form.getInputProps('nome_completo')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 4 }}>
                    <CampoMascara
                      label="Data de nascimento"
                      placeholder="DD/MM/AAAA"
                      mascara={mascaraData}
                      description={anos !== null && anos >= 0 ? `${anos} anos` : undefined}
                      {...form.getInputProps('data_nascimento')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 4 }}>
                    <CampoMascara label="CPF" placeholder="000.000.000-00" mascara={mascaraCpf} {...form.getInputProps('cpf')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <CampoMascara
                      label="Data de associação"
                      placeholder="DD/MM/AAAA"
                      mascara={mascaraData}
                      {...form.getInputProps('data_associacao')}
                    />
                  </Grid.Col>
                </Grid>
              </Card>

              <Card withBorder>
                <Text fw={600} mb="sm">Contato</Text>
                <Grid gap="sm">
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <CampoMascara label="Telefone" placeholder="(00) 00000-0000" mascara={mascaraTelefone} {...form.getInputProps('telefone')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <CampoMascara label="Telefone 2" mascara={mascaraTelefone} {...form.getInputProps('telefone2')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <TextInput label="E-mail" type="email" {...form.getInputProps('email')} />
                  </Grid.Col>
                </Grid>
              </Card>

              <Card withBorder>
                <Text fw={600} mb="sm">Endereço</Text>
                <CamposEndereco form={form} />
              </Card>

              <Card withBorder>
                <Textarea label="Observações" autosize minRows={2} maxRows={8} {...form.getInputProps('observacoes')} />
              </Card>

              {novo && (
                <Card withBorder>
                  <Checkbox
                    label="Sócio novo: cobrar a taxa de associação"
                    description="Ele fica “aguardando taxa” e passa a ativo quando pagar. Desmarque para fichas antigas (sócios que já são associados)."
                    checked={cobrarTaxa}
                    onChange={(e) => setCobrarTaxa(e.currentTarget.checked)}
                  />
                </Card>
              )}

              <Group justify="flex-end">
                {!novo && form.isDirty() && (
                  <Button variant="default" onClick={() => { if (socio) { form.setValues(socioParaValores(socio)); form.resetDirty(); } }}>
                    Descartar alterações
                  </Button>
                )}
                <Button type="submit" loading={form.submitting} leftSection={<IconDeviceFloppy size={18} />}>
                  {novo ? 'Cadastrar sócio' : 'Salvar alterações'}
                </Button>
              </Group>
            </Stack>
          </form>
  );

  return (
    <>
      <Breadcrumbs mb="xs">
        <Anchor component={Link} to="/socios" size="sm">Sócios</Anchor>
        <Text size="sm">{novo ? 'Novo sócio' : socio?.matricula}</Text>
      </Breadcrumbs>
      <Group justify="space-between" mb="md" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Title order={2}>{novo ? 'Novo sócio' : socio?.nome_completo}</Title>
          {socio && (
            <Group gap="xs" mt={6}>
              <BadgeSituacao situacao={socio.situacao} />
              <BadgeDireito direito={socio.direito_sepultamento} situacao={socio.situacao} />
            </Group>
          )}
        </div>
        {admin && socio && (
          <Button variant="subtle" color="red" style={{ flexShrink: 0 }} leftSection={<IconTrash size={16} />} onClick={excluir}>
            Excluir
          </Button>
        )}
      </Group>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: socio ? 8 : 12 }}>
          {socio ? (
            <Tabs value={aba} onChange={setAba} keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="financeiro" leftSection={<IconCash size={16} />}>Financeiro</Tabs.Tab>
                <Tabs.Tab value="sepulturas" leftSection={<IconGrave2 size={16} />}>Sepulturas</Tabs.Tab>
                <Tabs.Tab value="cadastro" leftSection={<IconId size={16} />}>
                  Cadastro{form.isDirty() ? ' •' : ''}
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="financeiro">
                <FinanceiroSocio socio={socio} />
              </Tabs.Panel>
              <Tabs.Panel value="sepulturas">
                <SepulturasSocio socio={socio} />
              </Tabs.Panel>
              <Tabs.Panel value="cadastro">{formulario}</Tabs.Panel>
            </Tabs>
          ) : (
            formulario
          )}
        </Grid.Col>

        {socio && (
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack>
              <DocumentosSocio socioId={socio.id} />
              <CardSituacao socio={socio} admin={admin} />
              <CardPortal socio={socio} />
              {admin && <HistoricoSocio socioId={socio.id} />}
            </Stack>
          </Grid.Col>
        )}
      </Grid>
    </>
  );
}

function CardSituacao({ socio, admin }: { socio: Socio; admin: boolean }) {
  const [aberto, modal] = useDisclosure();
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Situação</Text>
        {admin && (
          <Button size="xs" variant="subtle" leftSection={<IconAdjustments size={14} />} onClick={modal.open}>
            Ajustar
          </Button>
        )}
      </Group>
      <Stack gap={6}>
        <Group gap="xs"><BadgeSituacao situacao={socio.situacao} /></Group>
        <Group gap="xs"><BadgeDireito direito={socio.direito_sepultamento} situacao={socio.situacao} /></Group>
        {socio.data_falecimento && <Text size="sm">Falecimento: {dataBr(socio.data_falecimento)}</Text>}
        <Text size="xs" c="dimmed" mt={4}>
          A situação muda automaticamente com os pagamentos e sepultamentos (próximas fases). Use “Ajustar” apenas
          para corrigir ou ao digitar fichas antigas.
        </Text>
      </Stack>
      <ModalAjusteSituacao socio={socio} aberto={aberto} fechar={modal.close} />
    </Card>
  );
}

function ModalAjusteSituacao({ socio, aberto, fechar }: { socio: Socio; aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: {
      situacao: socio.situacao as string,
      direito_sepultamento: socio.direito_sepultamento as string,
      data_falecimento: dataBr(socio.data_falecimento),
      justificativa: '',
    },
    validate: {
      data_falecimento: (v, t) =>
        t.situacao === 'falecido' ? (v ? validarDataBr(v) : 'Informe a data de falecimento') : null,
      justificativa: (v) => (v.trim().length < 5 ? 'Explique o motivo do ajuste' : null),
    },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      const r = await api.patch<{ socio: Socio }>(`/api/socios/${socio.id}/situacao`, {
        ...v,
        data_falecimento: v.situacao === 'falecido' ? dataIso(v.data_falecimento) : null,
      });
      qc.setQueryData(['socio', socio.id], { socio: r.socio });
      qc.invalidateQueries({ queryKey: ['socios'] });
      qc.invalidateQueries({ queryKey: ['historico-socio', socio.id] });
      notifications.show({ color: 'teal', message: 'Situação ajustada.' });
      form.setFieldValue('justificativa', '');
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  return (
    <Modal opened={aberto} onClose={fechar} title="Ajuste manual de situação">
      <form onSubmit={salvar}>
        <Stack>
          <Select
            label="Situação"
            data={SITUACOES_SOCIO.map((s) => ({ value: s, label: ROTULO_SITUACAO_SOCIO[s] }))}
            allowDeselect={false}
            {...form.getInputProps('situacao')}
          />
          {form.values.situacao === 'falecido' && (
            <CampoMascara label="Data de falecimento" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_falecimento')} />
          )}
          <Select
            label="Benefício da associação"
            data={[
              { value: 'disponivel', label: 'Garantido (disponível)' },
              { value: 'utilizado', label: 'Já utilizado' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('direito_sepultamento')}
          />
          <Textarea label="Justificativa" placeholder="Ex.: conforme ficha em papel" withAsterisk {...form.getInputProps('justificativa')} />
          <Button type="submit" loading={form.submitting}>Salvar ajuste</Button>
        </Stack>
      </form>
    </Modal>
  );
}

const ROTULO_ACAO: Record<string, string> = {
  registrar_pagamento: 'Pagamento registrado',
  estornar_pagamento: 'Pagamento estornado',
  gerar_taxa_associacao: 'Taxa de associação gerada',
  cancelar_cobranca: 'Cobrança cancelada',
  lancar_anuidades_antigas: 'Anuidades antigas lançadas',
  reimprimir_recibo: 'Recibo reimpresso',
  novo_link_portal: 'Novo link do portal gerado',
  gerar_anuidades_socio: 'Anuidades geradas',
  excluir_cobranca: 'Anuidade excluída',
  aviso_cobranca: 'Cobrança enviada (WhatsApp)',
  aviso_lembrete: 'Lembrete enviado (WhatsApp)',
  registrar_sepultamento: 'Sepultamento registrado',
  sucessao_iniciada: 'Sucessão iniciada',
  sucessao_concluida: 'Sucessão concluída',
  sucessao_cancelada: 'Sucessão cancelada',
  criar: 'Cadastro criado',
  atualizar: 'Dados alterados',
  anexar_documento: 'Foto anexada',
  excluir_documento: 'Foto excluída',
  ajuste_manual_situacao: 'Situação ajustada',
};

const ROTULO_CAMPO: Record<string, string> = {
  nome_completo: 'nome',
  data_nascimento: 'nascimento',
  data_associacao: 'associação',
  telefone2: 'telefone 2',
  observacoes: 'observações',
};

function resumoDetalhes(r: RegistroAuditoria): string | null {
  if (!r.detalhes) return null;
  try {
    const d = JSON.parse(r.detalhes);
    if (r.acao === 'atualizar') return `Campos: ${Object.keys(d).map((k) => ROTULO_CAMPO[k] ?? k).join(', ')}`;
    if (r.acao === 'ajuste_manual_situacao') return `Motivo: ${d.justificativa}`;
    if (r.acao === 'registrar_pagamento') return `Recibo ${d.recibo}`;
    if (r.acao === 'excluir_cobranca') return d.descricao;
    if (r.acao === 'estornar_pagamento' || r.acao === 'cancelar_cobranca') return `Motivo: ${d.motivo}`;
    if (r.acao === 'lancar_anuidades_antigas' || r.acao === 'gerar_anuidades_socio') return `Anos: ${(d.anos ?? []).join(', ')}`;
  } catch {
    /* detalhes não-JSON */
  }
  return null;
}

function HistoricoSocio({ socioId }: { socioId: number }) {
  const { data } = useQuery({
    queryKey: ['historico-socio', socioId],
    queryFn: () => api.get<{ registros: RegistroAuditoria[] }>(`/api/auditoria?entidade=socio&entidade_id=${socioId}&limite=50`),
  });
  const registros = data?.registros ?? [];
  return (
    <Card withBorder>
      <Text fw={600} mb="sm">Histórico</Text>
      <Timeline bulletSize={12} lineWidth={2}>
        {registros.map((r) => (
          <Timeline.Item key={r.id} title={<Text size="sm">{ROTULO_ACAO[r.acao] ?? r.acao}</Text>}>
            <Text size="xs" c="dimmed">
              {dataHoraBr(r.criado_em)} · {r.usuario_nome ?? 'sistema'}
            </Text>
            {resumoDetalhes(r) && <Text size="xs">{resumoDetalhes(r)}</Text>}
          </Timeline.Item>
        ))}
      </Timeline>
    </Card>
  );
}
