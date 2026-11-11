import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { QueryClient } from '@tanstack/react-query';
import { reais, type Cobranca } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';

/** Pergunta e exclui uma anuidade em aberto gerada por engano. */
export function confirmarExclusaoAnuidade(c: Cobranca, qc: QueryClient) {
  modals.openConfirmModal({
    title: `Excluir a ${c.descricao}?`,
    children: (
      <Text size="sm">
        Use quando a anuidade ({reais(c.valor_centavos)}) foi gerada por engano. Ela sai da lista do sócio; a exclusão fica
        registrada no histórico.
      </Text>
    ),
    labels: { confirm: 'Excluir anuidade', cancel: 'Voltar' },
    confirmProps: { color: 'red' },
    onConfirm: async () => {
      try {
        await api.delete(`/api/cobrancas/${c.id}`);
        notifications.show({ color: 'teal', message: `${c.descricao} excluída.` });
        qc.invalidateQueries({ queryKey: ['financeiro', c.socio_id] });
        qc.invalidateQueries({ queryKey: ['socios'] });
        qc.invalidateQueries({ queryKey: ['historico-socio', c.socio_id] });
      } catch (e) {
        notifications.show({ color: 'red', title: 'Não foi possível excluir', message: mensagemDeErro(e), autoClose: 10_000 });
      }
    },
  });
}
