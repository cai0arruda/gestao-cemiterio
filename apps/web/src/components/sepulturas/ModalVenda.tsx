import { Button, Modal, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SepulturaResumo, ValorTabela } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { CampoDinheiro } from '../CampoDinheiro';
import { SeletorSocio } from '../SeletorSocio';

/** Venda de sepultura: gera a cobrança de compra e reserva a sepultura até o pagamento. */
export function ModalVenda({
  fechar,
  sepultura,
  socio,
}: {
  fechar: () => void;
  sepultura?: { id: number; codigo: string };
  socio?: { id: number; nome: string };
}) {
  const qc = useQueryClient();
  const [socioId, setSocioId] = useState<number | null>(socio?.id ?? null);
  const [sepulturaId, setSepulturaId] = useState<string | null>(sepultura ? String(sepultura.id) : null);
  const [valor, setValor] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  const valores = useQuery({ queryKey: ['valores'], queryFn: () => api.get<{ valores: ValorTabela[] }>('/api/valores') });
  const disponiveis = useQuery({
    queryKey: ['sepulturas', 'disponivel'],
    queryFn: () => api.get<{ sepulturas: SepulturaResumo[] }>('/api/sepulturas?situacao=disponivel'),
    enabled: !sepultura,
  });
  useEffect(() => {
    const ano = new Date().getFullYear();
    const v = valores.data?.valores.find((x) => x.tipo === 'compra_sepultura' && x.ano === ano);
    if (v && valor === null) setValor(v.valor_centavos);
  }, [valores.data, valor]);

  async function vender() {
    if (!socioId || !sepulturaId || !valor) return;
    setEnviando(true);
    try {
      await api.post(`/api/sepulturas/${sepulturaId}/venda`, { socio_id: socioId, valor_centavos: valor });
      qc.invalidateQueries();
      notifications.show({
        color: 'teal',
        autoClose: 10_000,
        message: 'Sepultura reservada. A cobrança foi gerada: registre o pagamento no Atendimento ou na ficha do sócio.',
      });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal opened onClose={fechar} title={`Vender sepultura${sepultura ? ` ${sepultura.codigo}` : ''}`}>
      <Stack gap="sm">
        {!sepultura && (
          <Select
            label="Sepultura disponível"
            searchable
            data={(disponiveis.data?.sepulturas ?? []).map((s) => ({
              value: String(s.id),
              label: `${s.codigo}${s.referencia ? ` — ${s.referencia}` : ''}`,
            }))}
            value={sepulturaId}
            onChange={setSepulturaId}
            nothingFoundMessage="Nenhuma sepultura disponível cadastrada"
          />
        )}
        {socio ? (
          <Text size="sm">Comprador: <b>{socio.nome}</b></Text>
        ) : (
          <SeletorSocio label="Comprador (sócio)" value={socioId} onChange={(id) => setSocioId(id)} />
        )}
        <CampoDinheiro label="Valor" value={valor} onChange={setValor} description="Preço padrão do ano; pode ser ajustado." />
        <Text size="xs" c="dimmed">A sepultura fica reservada e passa para o comprador quando o pagamento for registrado.</Text>
        <Button onClick={vender} loading={enviando} disabled={!socioId || !sepulturaId || !valor}>
          Gerar cobrança e reservar
        </Button>
      </Stack>
    </Modal>
  );
}
