import { Loader, Select, type SelectProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SocioResumo } from '@cemiterio/shared';
import { api } from '../api/client';

interface Props extends Omit<SelectProps, 'data' | 'value' | 'onChange'> {
  value: number | null;
  onChange: (id: number | null, socio?: SocioResumo) => void;
  /** Nome a mostrar quando o valor inicial não está na busca atual. */
  nomeInicial?: string;
}

/** Campo para escolher um sócio digitando nome, matrícula ou CPF. */
export function SeletorSocio({ value, onChange, nomeInicial, ...props }: Props) {
  const [busca, setBusca] = useState('');
  const [termo] = useDebouncedValue(busca, 250);
  const { data, isFetching } = useQuery({
    queryKey: ['socios', termo],
    queryFn: () => api.get<{ socios: SocioResumo[] }>(`/api/socios${termo ? `?q=${encodeURIComponent(termo)}` : ''}`),
    placeholderData: (a) => a,
  });
  const lista = (data?.socios ?? []).slice(0, 30);
  const opcoes = lista.map((s) => ({ value: String(s.id), label: `${s.matricula} — ${s.nome_completo}` }));
  if (value && !opcoes.some((o) => o.value === String(value))) {
    opcoes.unshift({ value: String(value), label: nomeInicial ?? `Sócio #${value}` });
  }
  return (
    <Select
      searchable
      clearable
      placeholder="Digite nome, matrícula ou CPF"
      nothingFoundMessage={isFetching ? 'Buscando…' : 'Nenhum sócio encontrado'}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      {...props}
      data={opcoes}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v ? Number(v) : null, lista.find((s) => String(s.id) === v))}
      searchValue={busca}
      onSearchChange={setBusca}
      filter={({ options }) => options}
    />
  );
}
