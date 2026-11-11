import { ActionIcon, Alert, Button, Checkbox, Group, Select, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCalendarPlus, IconCash, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  reais,
  type Cobranca,
  type FormaPagamento,
  type RecebimentoDetalhe,
} from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { useAuth } from '../../auth';
import { hojeIso, useConfiguracoes } from '../../hooks';
import { dataBr, dataIso } from '../../util/formatar';
import { mascaraData } from '../../util/mascaras';
import { validarDataBr } from '../../util/socioForm';
import { CampoDinheiro } from '../CampoDinheiro';
import { CampoMascara } from '../CampoMascara';
import { imprimirRecibo } from './imprimir';
import { confirmarExclusaoAnuidade } from './excluirAnuidade';
import { ModalGerarAnuidades } from './ModalGerarAnuidades';

const opcoesForma = FORMAS_PAGAMENTO.map((f) => ({ value: f, label: ROTULO_FORMA_PAGAMENTO[f] }));

/** Seleção das cobranças em aberto + forma de pagamento + registrar e imprimir. */
export function PainelPagamento({
  socioId,
  cobrancas,
  aoRegistrar,
}: {
  socioId: number;
  cobrancas: Cobranca[];
  aoRegistrar?: (r: RecebimentoDetalhe) => void;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const config = useConfiguracoes();
  // Mais antigas primeiro (ordem natural de quitação).
  const abertas = useMemo(
    () => cobrancas.filter((c) => c.situacao === 'aberta').sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id - b.id),
    [cobrancas],
  );

  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [descontos, setDescontos] = useState<Record<number, number>>({});
  const [forma, setForma] = useState<FormaPagamento>('dinheiro');
  const [data, setData] = useState(dataBr(hojeIso()));
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Por padrão marca tudo o que está em aberto.
  useEffect(() => {
    setMarcadas(new Set(abertas.map((c) => c.id)));
    setDescontos({});
  }, [abertas]);

  const botaoGerar = (
    <Button size="xs" variant="light" leftSection={<IconCalendarPlus size={14} />} onClick={() => setGerando(true)}>
      Gerar anuidades (adiantar)
    </Button>
  );
  const modalGerar = gerando && <ModalGerarAnuidades socioId={socioId} cobrancas={cobrancas} fechar={() => setGerando(false)} />;

  if (abertas.length === 0) {
    return (
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Nenhuma cobrança em aberto.</Text>
        {botaoGerar}
        {modalGerar}
      </Group>
    );
  }

  const selecionadas = abertas.filter((c) => marcadas.has(c.id));
  const total = selecionadas.reduce((t, c) => t + c.valor_centavos - (descontos[c.id] ?? 0), 0);
  const erroData = validarDataBr(data);
  const autoImprimir = config.data?.configuracoes.recibo_impressao_automatica !== 'false';

  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function registrar() {
    if (selecionadas.length === 0 || erroData) return;
    setEnviando(true);
    try {
      const { recebimento } = await api.post<{ recebimento: RecebimentoDetalhe }>('/api/recebimentos', {
        socio_id: socioId,
        itens: selecionadas.map((c) => ({ cobranca_id: c.id, desconto_centavos: descontos[c.id] ?? 0 })),
        forma,
        data_pagamento: dataIso(data),
        observacao,
      });
      notifications.show({
        color: 'teal',
        title: `Pagamento registrado — recibo ${recebimento.numero}`,
        message: `${recebimento.descricao}: ${reais(recebimento.total_centavos)}`,
      });
      for (const aviso of recebimento.avisos ?? []) notifications.show({ color: 'orange', message: aviso, autoClose: 10_000 });
      if (autoImprimir) imprimirRecibo(recebimento.id);
      setObservacao('');
      qc.invalidateQueries({ queryKey: ['financeiro', socioId] });
      qc.invalidateQueries({ queryKey: ['socio', socioId] });
      qc.invalidateQueries({ queryKey: ['socios'] });
      qc.invalidateQueries({ queryKey: ['recebimentos'] });
      qc.invalidateQueries({ queryKey: ['historico-socio', socioId] });
      aoRegistrar?.(recebimento);
    } catch (e) {
      notifications.show({ color: 'red', title: 'Pagamento não registrado', message: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Stack gap="sm">
      <Group justify="flex-end">{botaoGerar}</Group>
      {modalGerar}
      <Table verticalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={30} />
            <Table.Th>Cobrança</Table.Th>
            <Table.Th>Vencimento</Table.Th>
            <Table.Th ta="right">Valor</Table.Th>
            {admin && <Table.Th w={130}>Desconto</Table.Th>}
            <Table.Th w={36} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {abertas.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>
                <Checkbox checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} aria-label={c.descricao} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>{c.descricao}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={c.vencida ? 'red' : undefined}>
                  {dataBr(c.vencimento)} {c.vencida && '(vencida)'}
                </Text>
              </Table.Td>
              <Table.Td ta="right">{reais(c.valor_centavos)}</Table.Td>
              {admin && (
                <Table.Td>
                  <CampoDinheiro
                    size="xs"
                    disabled={!marcadas.has(c.id)}
                    value={descontos[c.id] ?? null}
                    max={c.valor_centavos / 100}
                    onChange={(v) => setDescontos((d) => ({ ...d, [c.id]: Math.min(v ?? 0, c.valor_centavos) }))}
                  />
                </Table.Td>
              )}
              <Table.Td>
                {c.tipo === 'anuidade' && (
                  <Tooltip label="Excluir (gerada por engano)">
                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => confirmarExclusaoAnuidade(c, qc)} aria-label={`Excluir ${c.descricao}`}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Group grow align="flex-start">
        <Select label="Forma de pagamento" data={opcoesForma} value={forma} onChange={(v) => v && setForma(v as FormaPagamento)} allowDeselect={false} />
        <CampoMascara label="Data do pagamento" mascara={mascaraData} value={data} onChange={setData} error={erroData} />
      </Group>
      <TextInput label="Observação (opcional)" value={observacao} onChange={(e) => setObservacao(e.currentTarget.value)} maxLength={300} />

      {!autoImprimir && (
        <Alert variant="light" p="xs">A impressão automática está desligada nas Configurações.</Alert>
      )}

      <Group justify="space-between">
        <Text size="lg" fw={700}>Total: {reais(total)}</Text>
        <Button
          size="md"
          leftSection={autoImprimir ? <IconPrinter size={18} /> : <IconCash size={18} />}
          onClick={registrar}
          loading={enviando}
          disabled={selecionadas.length === 0 || !!erroData}
        >
          {autoImprimir ? 'Registrar e imprimir recibo' : 'Registrar pagamento'}
        </Button>
      </Group>
    </Stack>
  );
}
