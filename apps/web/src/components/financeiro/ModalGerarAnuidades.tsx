import { Alert, Badge, Button, Group, Modal, NumberInput, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { reais, type Cobranca, type PreviaAnuidadeSocio } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { dataBr } from '../../util/formatar';

/** Primeiro ano que ainda não tem anuidade (para sugerir na janela). */
export function proximoAnoSemAnuidade(cobrancas: Cobranca[]): number {
  const anos = cobrancas.filter((c) => c.tipo === 'anuidade' && c.situacao !== 'cancelada').map((c) => c.ano ?? 0);
  const atual = new Date().getFullYear();
  return anos.length ? Math.max(Math.max(...anos) + 1, atual - 5) : atual;
}

/**
 * Gera anuidades de um sócio fora da geração anual: para adiantar o pagamento
 * ou para pagar vários anos de uma vez. Mostra os valores antes de confirmar.
 */
export function ModalGerarAnuidades({ socioId, cobrancas, fechar }: { socioId: number; cobrancas: Cobranca[]; fechar: () => void }) {
  const qc = useQueryClient();
  const inicio = proximoAnoSemAnuidade(cobrancas);
  const [de, setDe] = useState<number | string>(inicio);
  const [ate, setAte] = useState<number | string>(inicio);
  const [enviando, setEnviando] = useState(false);
  const anoDe = Number(de);
  const anoAte = Number(ate);
  const valido = anoDe >= 1950 && anoAte >= anoDe && anoAte - anoDe < 10;

  const previa = useQuery({
    queryKey: ['previa-anuidades-socio', socioId, anoDe, anoAte],
    queryFn: () => api.get<{ anos: PreviaAnuidadeSocio[] }>(`/api/socios/${socioId}/anuidades/previa?de=${anoDe}&ate=${anoAte}`),
    enabled: valido,
  });
  const anos = previa.data?.anos ?? [];
  const novas = anos.filter((a) => !a.existente);
  const semValor = novas.some((a) => a.valor_centavos === null);
  const total = novas.reduce((t, a) => t + (a.valor_centavos ?? 0), 0);

  async function gerar() {
    setEnviando(true);
    try {
      const r = await api.post<{ criadas: number[] }>(`/api/socios/${socioId}/anuidades`, { ano_inicial: anoDe, ano_final: anoAte });
      notifications.show({
        color: 'teal',
        message: `${r.criadas.length > 1 ? 'Anuidades geradas' : 'Anuidade gerada'}: ${r.criadas.join(', ')}. Já estão marcadas para pagamento.`,
      });
      await qc.invalidateQueries({ queryKey: ['financeiro', socioId] });
      qc.invalidateQueries({ queryKey: ['socios'] });
      qc.invalidateQueries({ queryKey: ['historico-socio', socioId] });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal opened onClose={fechar} title="Gerar anuidades para este sócio">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Para quem quer adiantar o pagamento ou pagar vários anos de uma vez. As anuidades geradas aparecem na lista para
          pagamento, com vencimento no Dia de Finados de cada ano.
        </Text>
        <Group grow>
          <NumberInput
            label="Do ano"
            value={de}
            onChange={(v) => {
              setDe(v);
              if (Number(v) > Number(ate)) setAte(v);
            }}
            min={1950}
            max={2200}
            allowDecimal={false}
            thousandSeparator=""
          />
          <NumberInput label="Até o ano" value={ate} onChange={setAte} min={1950} max={2200} allowDecimal={false} thousandSeparator="" />
        </Group>
        {!valido && <Text size="xs" c="red">Escolha um intervalo de até 10 anos (o ano final não pode ser antes do inicial).</Text>}

        {valido && anos.length > 0 && (
          <Table fz="sm" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ano</Table.Th>
                <Table.Th>Vencimento</Table.Th>
                <Table.Th ta="right">Valor</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {anos.map((a) => (
                <Table.Tr key={a.ano} style={a.existente ? { opacity: 0.55 } : undefined}>
                  <Table.Td fw={600}>
                    {a.ano}{' '}
                    {a.existente && (
                      <Badge size="xs" variant="light" color={a.existente === 'paga' ? 'teal' : 'yellow'}>
                        {a.existente === 'paga' ? 'já paga' : 'já gerada'}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>{dataBr(a.vencimento)}</Table.Td>
                  <Table.Td ta="right">
                    {a.valor_centavos !== null ? reais(a.valor_centavos) : '—'}
                    {a.origem === 'ultimo_valor' && (
                      <Text span size="xs" c="orange"> *</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {novas.some((a) => a.origem === 'ultimo_valor') && (
          <Text size="xs" c="orange">
            * Ano ainda sem valor cadastrado: usa o valor mais recente. Quem adianta paga o valor de hoje.
          </Text>
        )}
        {semValor && (
          <Alert color="red" variant="light">Não há valor de anuidade cadastrado. Cadastre em Administração → Valores e reajustes.</Alert>
        )}
        {valido && previa.data && novas.length === 0 && (
          <Alert variant="light">Todos esses anos já têm anuidade. Se estiver em aberto, ela já aparece na lista de pagamento.</Alert>
        )}

        <Group justify="space-between">
          <Text fw={600}>{novas.length > 0 && `Total: ${reais(total)}`}</Text>
          <Button onClick={gerar} loading={enviando} disabled={!valido || novas.length === 0 || semValor}>
            {novas.length > 1 ? `Gerar ${novas.length} anuidades` : 'Gerar anuidade'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
