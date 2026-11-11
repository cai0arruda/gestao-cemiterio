import { Button, Card, Group, Modal, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ROTULO_TIPO_COBRANCA, TIPOS_COBRANCA, reais, type TipoCobranca, type ValorTabela } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { CampoDinheiro } from '../../components/CampoDinheiro';
import { dataHoraBr } from '../../util/formatar';

const AJUDA: Record<TipoCobranca, string> = {
  anuidade: 'Cobrada de cada sócio ativo, vence em 02/11 (Finados).',
  taxa_associacao: 'Paga por sócio novo, por familiar que assume ou na renovação.',
  compra_sepultura: 'Preço padrão da sepultura (usado na Fase 4; pode ser ajustado na venda).',
};

export function Valores() {
  const anoAtual = new Date().getFullYear();
  const { data } = useQuery({ queryKey: ['valores'], queryFn: () => api.get<{ valores: ValorTabela[] }>('/api/valores') });
  const [editando, setEditando] = useState<{ tipo: TipoCobranca; ano: number; valor_centavos: number | null } | null>(null);
  const valores = data?.valores ?? [];

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Title order={2}>Valores e reajustes</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando({ tipo: 'anuidade', ano: anoAtual + 1, valor_centavos: null })}>
          Cadastrar valor / reajuste
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Cada valor vale para um ano. Para reajustar, cadastre o valor do novo ano. Cobranças já geradas mantêm o valor da época.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {TIPOS_COBRANCA.map((tipo) => {
          const lista = valores.filter((v) => v.tipo === tipo);
          const vigente = lista.find((v) => v.ano === anoAtual);
          return (
            <Card withBorder key={tipo}>
              <Text fw={600}>{ROTULO_TIPO_COBRANCA[tipo]}</Text>
              <Text size="xs" c="dimmed" mb="sm">{AJUDA[tipo]}</Text>
              <Text size="xl" fw={700} c={vigente ? undefined : 'orange'}>
                {vigente ? reais(vigente.valor_centavos) : 'Sem valor'}
              </Text>
              <Text size="xs" c="dimmed" mb="sm">em {anoAtual}</Text>
              <Table fz="sm" verticalSpacing={4}>
                <Table.Tbody>
                  {lista.map((v) => (
                    <Table.Tr key={v.ano} style={{ cursor: 'pointer' }} onClick={() => setEditando(v)}>
                      <Table.Td fw={600}>{v.ano}</Table.Td>
                      <Table.Td ta="right">{reais(v.valor_centavos)}</Table.Td>
                      <Table.Td c="dimmed" fz="xs">{v.definido_por} · {dataHoraBr(v.definido_em)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Button
                mt="sm"
                size="xs"
                variant="light"
                onClick={() => setEditando({ tipo, ano: vigente ? anoAtual + 1 : anoAtual, valor_centavos: vigente?.valor_centavos ?? null })}
              >
                {vigente ? 'Reajustar para o próximo ano' : `Cadastrar valor de ${anoAtual}`}
              </Button>
            </Card>
          );
        })}
      </SimpleGrid>
      {editando && <ModalValor inicial={editando} fechar={() => setEditando(null)} />}
    </>
  );
}

function ModalValor({
  inicial,
  fechar,
}: {
  inicial: { tipo: TipoCobranca; ano: number; valor_centavos: number | null };
  fechar: () => void;
}) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { tipo: inicial.tipo as string, ano: String(inicial.ano), valor_centavos: inicial.valor_centavos },
    validate: {
      ano: (v) => (/^\d{4}$/.test(v) ? null : 'Ano inválido'),
      valor_centavos: (v) => (!v || v <= 0 ? 'Informe o valor' : null),
    },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      await api.put('/api/valores', { tipo: v.tipo, ano: Number(v.ano), valor_centavos: v.valor_centavos });
      qc.invalidateQueries({ queryKey: ['valores'] });
      qc.invalidateQueries({ queryKey: ['previa-anuidades'] });
      notifications.show({ color: 'teal', message: 'Valor salvo.' });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  return (
    <Modal opened onClose={fechar} title="Valor por ano">
      <form onSubmit={salvar}>
        <Stack>
          <Select
            label="Tipo"
            data={TIPOS_COBRANCA.map((t) => ({ value: t, label: ROTULO_TIPO_COBRANCA[t] }))}
            allowDeselect={false}
            {...form.getInputProps('tipo')}
          />
          <TextInput label="Ano" maxLength={4} {...form.getInputProps('ano')} />
          <CampoDinheiro
            label="Valor"
            autoFocus
            value={form.values.valor_centavos}
            onChange={(v) => form.setFieldValue('valor_centavos', v)}
            error={form.errors.valor_centavos}
          />
          <Button type="submit" loading={form.submitting}>Salvar</Button>
        </Stack>
      </form>
    </Modal>
  );
}
