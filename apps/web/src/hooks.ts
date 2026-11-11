import { useQuery } from '@tanstack/react-query';
import type { Configuracoes } from '@cemiterio/shared';
import { api } from './api/client';

export function useConfiguracoes() {
  return useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api.get<{ configuracoes: Configuracoes; public_url: string }>('/api/configuracoes'),
    staleTime: 5 * 60_000,
  });
}

export const hojeIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
