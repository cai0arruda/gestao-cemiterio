import { Alert, Button, Card, Group, Kbd, Loader, ScrollArea, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { IconArrowLeft, IconSearch, IconUser } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { normalizarTexto, reais, type RecebimentoDetalhe, type Socio, type SocioResumo } from '@cemiterio/shared';
import { api } from '../api/client';
import { BadgeResumo, useFinanceiro } from '../components/financeiro/FinanceiroSocio';
import { imprimirRecibo } from '../components/financeiro/imprimir';
import { PainelPagamento } from '../components/financeiro/PainelPagamento';
import { BadgeDireito, BadgeSituacao } from '../components/Situacao';
import { dataBr } from '../util/formatar';

/** Balcão: buscar o sócio → ver o que deve → receber → imprimir. Pensada para o Dia de Finados. */
export function Atendimento() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [socioId, setSocioId] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<RecebimentoDetalhe | null>(null);
  const [selecionado, setSelecionado] = useState(0);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Todos os sócios de uma vez (são poucas centenas); o filtro é feito aqui, enquanto digita.
  // "always": sempre que a tela abre, busca a situação atualizada no servidor.
  const todos = useQuery({
    queryKey: ['socios', 'atendimento'],
    queryFn: () => api.get<{ socios: SocioResumo[] }>('/api/socios'),
    refetchOnMount: 'always',
  });
  const lista = useMemo(() => filtrarSocios(todos.data?.socios ?? [], busca), [todos.data, busca]);
  const atual = Math.min(selecionado, Math.max(lista.length - 1, 0));

  function abrir(id: number) {
    setSocioId(id);
  }

  async function novoAtendimento() {
    setSocioId(null);
    setBusca('');
    setSelecionado(0);
    setTimeout(() => buscaRef.current?.focus(), 0);
  }

  return (
    <>
      <Title order={2} mb="md">Atendimento</Title>

      {ultimo && (
        <Alert color="teal" mb="md" withCloseButton onClose={() => setUltimo(null)} title={`Último recibo: ${ultimo.numero}`}>
          <Group justify="space-between">
            <Text size="sm">
              {ultimo.socio_nome} — {ultimo.descricao} — {reais(ultimo.total_centavos)}
            </Text>
            <Button size="xs" variant="white" onClick={() => imprimirRecibo(ultimo.id)}>Imprimir de novo</Button>
          </Group>
        </Alert>
      )}

      {socioId === null ? (
        <Card withBorder maw={760}>
          <TextInput
            ref={buscaRef}
            size="lg"
            autoFocus
            placeholder="Filtrar por nome, matrícula ou CPF"
            leftSection={<IconSearch size={20} />}
            rightSection={todos.isFetching ? <Loader size="xs" /> : null}
            value={busca}
            onChange={(e) => {
              setBusca(e.currentTarget.value);
              setSelecionado(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && lista[atual]) abrir(lista[atual].id);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelecionado(Math.min(atual + 1, lista.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelecionado(Math.max(atual - 1, 0));
              }
            }}
          />
          <Group justify="space-between" mt={6}>
            <Text size="xs" c="dimmed">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> escolhem, <Kbd>Enter</Kbd> abre.
            </Text>
            <Text size="xs" c="dimmed">
              {busca.trim() ? `${lista.length} de ${todos.data?.socios.length ?? 0}` : `${lista.length}`} sócio(s)
            </Text>
          </Group>

          {todos.isLoading && <Loader mt="md" />}
          {todos.isError && (
            <Alert color="red" mt="sm">
              Não foi possível carregar os sócios.{' '}
              <Button size="compact-xs" variant="subtle" onClick={() => todos.refetch()}>Tentar de novo</Button>
            </Alert>
          )}

          <ScrollArea.Autosize mah="calc(100dvh - 300px)" mt="sm" type="auto" offsetScrollbars>
            <Stack gap={4}>
              {lista.map((s, i) => (
                <UnstyledButton
                  key={s.id}
                  onClick={() => abrir(s.id)}
                  onMouseEnter={() => setSelecionado(i)}
                  p="xs"
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--mantine-color-gray-3)',
                    background: i === atual ? 'var(--mantine-color-teal-0)' : undefined,
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <IconUser size={16} />
                      <Text size="sm" fw={500}>{s.matricula} — {s.nome_completo}</Text>
                      {s.data_nascimento && <Text size="xs" c="dimmed" visibleFrom="sm">nasc. {dataBr(s.data_nascimento)}</Text>}
                    </Group>
                    {s.situacao !== 'ativo' ? (
                      <BadgeSituacao situacao={s.situacao} />
                    ) : s.pendencias > 0 ? (
                      <Text size="xs" c="red" fw={600} style={{ whiteSpace: 'nowrap' }}>{s.pendencias} pendente(s)</Text>
                    ) : (
                      <Text size="xs" c="teal" style={{ whiteSpace: 'nowrap' }}>em dia</Text>
                    )}
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {todos.data && lista.length === 0 && (
            <Text size="sm" c="dimmed" mt="sm">
              {todos.data.socios.length === 0 ? 'Nenhum sócio cadastrado ainda.' : 'Nenhum sócio encontrado.'}
            </Text>
          )}
        </Card>
      ) : (
        <AtendimentoSocio
          socioId={socioId}
          voltar={novoAtendimento}
          aoRegistrar={async (r) => {
            setUltimo(r);
            // Garante que a lista volte já com a situação nova do sócio (ex.: "em dia").
            await qc.refetchQueries({ queryKey: ['socios', 'atendimento'] });
            novoAtendimento();
          }}
        />
      )}
    </>
  );
}

/** Filtra sem acento e sem diferenciar maiúsculas: todas as palavras do nome, matrícula ou CPF. */
function filtrarSocios(lista: SocioResumo[], busca: string): SocioResumo[] {
  const termo = normalizarTexto(busca);
  if (!termo) return lista;
  const palavras = termo.split(' ');
  const digitos = busca.replace(/\D/g, '');
  return lista.filter((s) => {
    const nome = normalizarTexto(s.nome_completo);
    if (palavras.every((p) => nome.includes(p))) return true;
    if (s.matricula.toLowerCase() === busca.trim().toLowerCase()) return true;
    return digitos.length >= 3 && (s.matricula.includes(digitos) || (s.cpf ?? '').includes(digitos));
  });
}

function AtendimentoSocio({
  socioId,
  voltar,
  aoRegistrar,
}: {
  socioId: number;
  voltar: () => void;
  aoRegistrar: (r: RecebimentoDetalhe) => void;
}) {
  const socio = useQuery({ queryKey: ['socio', socioId], queryFn: () => api.get<{ socio: Socio }>(`/api/socios/${socioId}`) });
  const fin = useFinanceiro(socioId);
  if (!socio.data || !fin.data) return <Loader />;
  const s = socio.data.socio;

  return (
    <Card withBorder maw={820}>
      <Group justify="space-between" mb="sm">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={voltar}>
          Outro sócio
        </Button>
        <Button component={Link} to={`/socios/${s.id}`} variant="subtle" size="xs">
          Abrir ficha completa
        </Button>
      </Group>
      <Title order={3}>{s.nome_completo}</Title>
      <Group gap="xs" mt={4} mb="md">
        <Text size="sm" c="dimmed">Matrícula {s.matricula}</Text>
        <BadgeSituacao situacao={s.situacao} />
        <BadgeDireito direito={s.direito_sepultamento} situacao={s.situacao} />
      </Group>
      <BadgeResumo resumo={fin.data.resumo} />
      <Stack mt="md">
        <PainelPagamento socioId={s.id} cobrancas={fin.data.cobrancas} aoRegistrar={aoRegistrar} />
      </Stack>
    </Card>
  );
}
