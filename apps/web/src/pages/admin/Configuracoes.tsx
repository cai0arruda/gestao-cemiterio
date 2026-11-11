import { Alert, Button, Card, Code, Group, SegmentedControl, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { CONFIG_PADRAO, type Configuracoes as Config } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../../api/client';
import { useConfiguracoes } from '../../hooks';

export function Configuracoes() {
  const qc = useQueryClient();
  const { data } = useConfiguracoes();
  const form = useForm<Config>({ initialValues: CONFIG_PADRAO });

  useEffect(() => {
    if (data) {
      form.setValues(data.configuracoes);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const salvar = form.onSubmit(async (v) => {
    try {
      const r = await api.put<{ configuracoes: Config; public_url: string }>('/api/configuracoes', v);
      qc.setQueryData(['configuracoes'], r);
      form.resetDirty();
      notifications.show({ color: 'teal', message: 'Configurações salvas.' });
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });

  return (
    <>
      <Title order={2} mb="md">Configurações</Title>
      <form onSubmit={salvar}>
        <Stack maw={640}>
          <Card withBorder>
            <Text fw={600} mb="sm">Dados do cemitério (cabeçalho do recibo)</Text>
            <Stack gap="sm">
              <TextInput label="Nome" {...form.getInputProps('cemiterio_nome')} />
              <TextInput label="CNPJ" {...form.getInputProps('cemiterio_cnpj')} />
              <TextInput label="Endereço" {...form.getInputProps('cemiterio_endereco')} />
              <TextInput label="Telefone" {...form.getInputProps('cemiterio_telefone')} />
              <TextInput label="Mensagem no fim do recibo" {...form.getInputProps('recibo_mensagem')} />
            </Stack>
          </Card>
          <Card withBorder>
            <Text fw={600} mb="sm">Impressão</Text>
            <Stack gap="sm">
              <div>
                <Text size="sm" fw={500} mb={4}>Largura do papel</Text>
                <SegmentedControl
                  data={[{ value: '80', label: '80 mm (TM-T20X)' }, { value: '58', label: '58 mm' }]}
                  {...form.getInputProps('recibo_largura_mm')}
                />
              </div>
              <Switch
                label="Imprimir o recibo automaticamente ao registrar o pagamento"
                checked={form.values.recibo_impressao_automatica === 'true'}
                onChange={(e) => form.setFieldValue('recibo_impressao_automatica', e.currentTarget.checked ? 'true' : 'false')}
              />
            </Stack>
          </Card>
          <Card withBorder>
            <Text fw={600} mb={4}>Mensagens de WhatsApp</Text>
            <Text size="xs" c="dimmed" mb="sm">
              Use {'{nome}'}, {'{anos}'}, {'{valor}'}, {'{link}'} (portal do sócio), {'{cemiterio}'} e {'{vencimento}'} — o sistema
              troca pelos dados de cada sócio.
            </Text>
            <Stack gap="sm">
              <Textarea label="Cobrança (pagamento em atraso)" autosize minRows={3} {...form.getInputProps('mensagem_cobranca')} />
              <Textarea label="Lembrete antes de Finados" autosize minRows={3} {...form.getInputProps('mensagem_lembrete')} />
            </Stack>
          </Card>
          <Alert variant="light" title="Endereço usado no QR code">
            <Code>{data?.public_url}</Code>
            <Text size="sm" mt={4}>
              Definido no arquivo <Code>.env</Code> (PUBLIC_URL). Quando o sistema estiver online, troque pelo domínio.
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button type="submit" loading={form.submitting} disabled={!form.isDirty()}>Salvar</Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}
