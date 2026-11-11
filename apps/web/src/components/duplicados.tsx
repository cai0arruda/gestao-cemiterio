import { Anchor, List, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { PossivelDuplicado } from '@cemiterio/shared';
import { api } from '../api/client';
import { dataBr } from '../util/formatar';

/**
 * Procura cadastros parecidos. Se houver, pergunta se quer salvar mesmo assim.
 * Resolve true para continuar salvando, false para cancelar.
 */
export async function confirmarSemDuplicados(dados: {
  nome_completo: string;
  data_nascimento?: string | null;
  cpf?: string | null;
  ignorar_id?: number;
}): Promise<boolean> {
  const { duplicados } = await api.post<{ duplicados: PossivelDuplicado[] }>('/api/socios/verificar-duplicados', dados);
  if (duplicados.length === 0) return true;
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: 'Possível cadastro repetido',
      children: (
        <Stack gap="xs">
          <Text size="sm">Encontramos cadastros parecidos. Confira se não é a mesma pessoa:</Text>
          <List size="sm" spacing={4}>
            {duplicados.map((d) => (
              <List.Item key={d.id}>
                <Anchor href={`/socios/${d.id}`} target="_blank">
                  {d.matricula} — {d.nome_completo}
                </Anchor>
                {d.data_nascimento && <Text span c="dimmed"> · nasc. {dataBr(d.data_nascimento)}</Text>}
                <Text span c="orange.8" size="xs"> ({d.motivo})</Text>
              </List.Item>
            ))}
          </List>
        </Stack>
      ),
      labels: { confirm: 'Não é a mesma pessoa, salvar', cancel: 'Voltar e revisar' },
      confirmProps: { color: 'orange' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}
