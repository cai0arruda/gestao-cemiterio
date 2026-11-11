import { List, ThemeIcon } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { VerificacaoDireito } from '@cemiterio/shared';

export function ChecklistDireito({ v }: { v: VerificacaoDireito }) {
  return (
    <List spacing={4} size="sm" center>
      {v.itens.map((i) => (
        <List.Item
          key={i.regra}
          icon={
            <ThemeIcon size={18} radius="xl" color={i.ok ? 'teal' : 'red'}>
              {i.ok ? <IconCheck size={12} /> : <IconX size={12} />}
            </ThemeIcon>
          }
        >
          {i.regra}
          {i.detalhe && !i.ok && <span style={{ color: 'var(--mantine-color-red-7)' }}> — {i.detalhe}</span>}
        </List.Item>
      ))}
    </List>
  );
}
