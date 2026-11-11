import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  ColorInput,
  Divider,
  FileButton,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconPhotoUp, IconPolygon, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type L from 'leaflet';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { larguraEmMetros, limitesProporcionais, normalizarTexto, type AneisPoligono, type ConfigMapa, type Setor } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { COR_SITUACAO, useMapa } from '../components/mapa/base';
import { DesenharSetor, EditarFormaSetor, aneisDaCamada } from '../components/mapa/editores';
import { corDoPin, MapaGeral, type ModoCor } from '../components/mapa/MapaGeral';

type Edicao =
  | { tipo: 'nenhuma' }
  | { tipo: 'desenhar' }
  | { tipo: 'forma'; setor: Setor };

export function Mapa() {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const { data, isLoading } = useMapa();
  const [params] = useSearchParams();
  const [modo, setModo] = useState<ModoCor>('situacao');
  const [codigos, setCodigos] = useState(false);
  const [busca, setBusca] = useState('');
  const [alvo, setAlvo] = useState<{ id: number; seq: number } | null>(() => {
    const id = Number(params.get('sepultura'));
    return id ? { id, seq: 1 } : null;
  });
  const [edicao, setEdicao] = useState<Edicao>({ tipo: 'nenhuma' });
  const [novoSetor, setNovoSetor] = useState<AneisPoligono | null>(null);
  const [setorEmEdicao, setSetorEmEdicao] = useState<Setor | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const formaRef = useRef<L.Polygon | null>(null);
  const aoMudarMapa = useCallback((m: L.Map) => {
    mapaRef.current = m;
  }, []);
  const terminarDesenho = useCallback((aneis: AneisPoligono) => {
    setEdicao({ tipo: 'nenhuma' });
    setNovoSetor(aneis);
  }, []);

  const resultados = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!data || termo.length < 2) return [];
    return data.pins
      .filter((p) =>
        [p.codigo, p.socio_nome ?? '', p.referencia ?? '', p.setor_nome ?? '', ...p.sepultados].some((t) => normalizarTexto(t).includes(termo)),
      )
      .slice(0, 12);
  }, [busca, data]);

  if (isLoading || !data) return <Loader m="xl" />;
  const aerea = data.config.imagem_aerea;
  const atualizar = () => qc.invalidateQueries({ queryKey: ['mapa'] });

  async function enviarImagem(arquivo: File | null) {
    const m = mapaRef.current;
    if (!arquivo || !m) return;
    const proporcao = await proporcaoDoArquivo(arquivo);
    // Ao trocar a foto, a nova ocupa o mesmo lugar da antiga (as sepulturas ficam onde estavam).
    // Na primeira vez, ocupa o meio da tela.
    const limites = aerea
      ? limitesProporcionais(aerea.limites[0][0], aerea.limites[0][1], larguraEmMetros(aerea.limites), proporcao)
      : limitesNaTela(m, proporcao);
    const fd = new FormData();
    fd.append('limites', JSON.stringify(limites));
    fd.append('arquivo', arquivo);
    try {
      notifications.show({ id: 'envio-aerea', loading: true, message: 'Enviando imagem…', autoClose: false });
      await api.post<{ config: ConfigMapa }>('/api/mapa/imagem-aerea', fd);
      notifications.update({ id: 'envio-aerea', loading: false, color: 'teal', message: 'Foto do drone enviada.', autoClose: 5000 });
      await atualizar();
    } catch (e) {
      notifications.update({ id: 'envio-aerea', loading: false, color: 'red', message: mensagemDeErro(e), autoClose: 8000 });
    }
  }

  async function salvarForma() {
    if (edicao.tipo !== 'forma' || !formaRef.current) return;
    try {
      await api.put(`/api/setores/${edicao.setor.id}`, { nome: edicao.setor.nome, cor: edicao.setor.cor, poligono: aneisDaCamada(formaRef.current) });
      setEdicao({ tipo: 'nenhuma' });
      atualizar();
      qc.invalidateQueries({ queryKey: ['sepulturas'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  }

  const excluirSetor = (s: Setor) =>
    modals.openConfirmModal({
      title: `Excluir o setor "${s.nome}"?`,
      children: <Text size="sm">As sepulturas continuam no mapa; só deixam de pertencer a este setor.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await api.delete(`/api/setores/${s.id}`);
        atualizar();
        qc.invalidateQueries({ queryKey: ['sepulturas'] });
      },
    });


  return (
    <Box h="calc(100dvh - 56px - 2 * var(--mantine-spacing-md))" style={{ display: 'flex', gap: 'var(--mantine-spacing-md)' }}>
      <Card withBorder w={300} p="sm" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }} visibleFrom="sm">
        <Title order={3} mb="xs">Mapa</Title>
        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
          <Stack gap="sm">
            <TextInput
              placeholder="Código, titular ou sepultado"
              leftSection={<IconSearch size={16} />}
              value={busca}
              onChange={(e) => setBusca(e.currentTarget.value)}
            />
            {resultados.length > 0 && (
              <Stack gap={2}>
                {resultados.map((p) => (
                  <UnstyledButton key={p.id} onClick={() => setAlvo({ id: p.id, seq: Date.now() })} p={6} style={{ borderRadius: 6 }} className="item-busca">
                    <Group gap={6} wrap="nowrap">
                      <Box w={10} h={10} style={{ borderRadius: 10, background: corDoPin(p, modo), flexShrink: 0 }} />
                      <Text size="sm" ff="monospace" fw={600}>{p.codigo}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{p.socio_nome ?? p.sepultados[0] ?? ''}</Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
            {busca.length >= 2 && resultados.length === 0 && (
              <Text size="xs" c="dimmed">Nada encontrado entre as sepulturas que já estão no mapa.</Text>
            )}

            <Divider />
            <SegmentedControl
              size="xs"
              value={modo}
              onChange={(v) => setModo(v as ModoCor)}
              data={[
                { value: 'situacao', label: 'Situação' },
                { value: 'adimplencia', label: 'Pagamentos' },
              ]}
            />
            <Legenda modo={modo} />
            <Switch label="Mostrar códigos no mapa" checked={codigos} onChange={(e) => setCodigos(e.currentTarget.checked)} size="sm" />
            <Text size="xs" c="dimmed">
              {data.pins.length} sepultura(s) no mapa. Para posicionar uma sepultura, abra a ficha dela e marque-a sobre a foto do drone.
            </Text>

            <Divider label="Setores" labelPosition="left" />
            {data.setores.length === 0 && <Text size="xs" c="dimmed">Nenhum setor desenhado.</Text>}
            {data.setores.map((s) => (
              <Group key={s.id} justify="space-between" wrap="nowrap" gap={4}>
                <Group gap={6} wrap="nowrap">
                  <Box w={12} h={12} style={{ background: s.cor, borderRadius: 3, flexShrink: 0 }} />
                  <Text size="sm" lineClamp={1}>{s.nome}</Text>
                  <Text size="xs" c="dimmed">({s.qtd_sepulturas})</Text>
                </Group>
                {admin && (
                  <Group gap={0} wrap="nowrap">
                    <Tooltip label="Nome e cor">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSetorEmEdicao(s)}><IconEdit size={14} /></ActionIcon>
                    </Tooltip>
                    <Tooltip label="Editar forma">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setEdicao({ tipo: 'forma', setor: s })}><IconPolygon size={14} /></ActionIcon>
                    </Tooltip>
                    <Tooltip label="Excluir">
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => excluirSetor(s)}><IconTrash size={14} /></ActionIcon>
                    </Tooltip>
                  </Group>
                )}
              </Group>
            ))}

            {admin && (
              <>
                <Button size="xs" variant="light" leftSection={<IconPolygon size={14} />} onClick={() => setEdicao({ tipo: 'desenhar' })} disabled={edicao.tipo !== 'nenhuma'}>
                  Desenhar novo setor
                </Button>
                <Divider label="Administração do mapa" labelPosition="left" />
                <FileButton onChange={enviarImagem} accept="image/*">
                  {(p) => (
                    <Button size="xs" variant="default" leftSection={<IconPhotoUp size={14} />} {...p}>
                      {aerea ? 'Trocar imagem aérea (drone)' : 'Enviar imagem aérea (drone)'}
                    </Button>
                  )}
                </FileButton>
                {aerea && (
                  <Group gap="xs" grow>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() =>
                        modals.openConfirmModal({
                          title: 'Remover a imagem aérea?',
                          labels: { confirm: 'Remover', cancel: 'Cancelar' },
                          confirmProps: { color: 'red' },
                          onConfirm: async () => {
                            await api.delete('/api/mapa/imagem-aerea');
                            atualizar();
                          },
                        })
                      }
                    >
                      Remover foto
                    </Button>
                  </Group>
                )}
              </>
            )}
          </Stack>
        </ScrollArea>
      </Card>

      <Box style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {!aerea && (
          <Alert style={{ position: 'absolute', zIndex: 1000, top: 10, left: 60, right: 60 }} color="blue">
            Nenhuma foto de drone enviada ainda.{' '}
            {admin ? 'Use “Enviar imagem aérea (drone)” no painel ao lado.' : 'Peça ao administrador para enviar a foto.'}
          </Alert>
        )}
        {edicao.tipo !== 'nenhuma' && (
          <Card withBorder shadow="md" style={{ position: 'absolute', zIndex: 1000, bottom: 16, left: '50%', transform: 'translateX(-50%)', minWidth: 320 }}>
            {edicao.tipo === 'desenhar' && (
              <Group justify="space-between">
                <Text size="sm">Clique nos cantos do setor; termine clicando no primeiro ponto.</Text>
                <Button size="xs" variant="default" onClick={() => setEdicao({ tipo: 'nenhuma' })}>Cancelar</Button>
              </Group>
            )}
            {edicao.tipo === 'forma' && (
              <Group justify="space-between">
                <Text size="sm">Arraste os pontos de “{edicao.setor.nome}”.</Text>
                <Group gap="xs">
                  <Button size="xs" variant="default" onClick={() => setEdicao({ tipo: 'nenhuma' })}>Cancelar</Button>
                  <Button size="xs" onClick={salvarForma}>Salvar forma</Button>
                </Group>
              </Group>
            )}
          </Card>
        )}
        <MapaGeral
          dados={data}
          modo={modo}
          mostrarCodigos={codigos}
          alvo={alvo}
          aoMudarMapa={aoMudarMapa}
          ocultarSetorId={edicao.tipo === 'forma' ? edicao.setor.id : null}
        >
          {edicao.tipo === 'desenhar' && <DesenharSetor aoTerminar={terminarDesenho} />}
          {edicao.tipo === 'forma' && <EditarFormaSetor aneis={edicao.setor.poligono} cor={edicao.setor.cor} camadaRef={formaRef} />}
        </MapaGeral>
      </Box>

      {novoSetor && (
        <ModalSetor
          titulo="Novo setor"
          inicial={{ nome: `Setor ${String.fromCharCode(65 + data.setores.length)}`, cor: CORES[data.setores.length % CORES.length]! }}
          fechar={() => setNovoSetor(null)}
          salvar={async (v) => {
            await api.post('/api/setores', { ...v, poligono: novoSetor });
            atualizar();
            qc.invalidateQueries({ queryKey: ['sepulturas'] });
          }}
        />
      )}
      {setorEmEdicao && (
        <ModalSetor
          titulo="Editar setor"
          inicial={{ nome: setorEmEdicao.nome, cor: setorEmEdicao.cor }}
          fechar={() => setSetorEmEdicao(null)}
          salvar={async (v) => {
            await api.put(`/api/setores/${setorEmEdicao.id}`, { ...v, poligono: setorEmEdicao.poligono });
            atualizar();
            qc.invalidateQueries({ queryKey: ['sepulturas'] });
          }}
        />
      )}
    </Box>
  );
}

const CORES = ['#2f9e44', '#1971c2', '#e8590c', '#9c36b5', '#c2255c', '#0c8599', '#f08c00'];

function Legenda({ modo }: { modo: ModoCor }) {
  const itens =
    modo === 'situacao'
      ? [
          { cor: COR_SITUACAO.disponivel, texto: 'Disponível' },
          { cor: COR_SITUACAO.reservada, texto: 'Reservada' },
          { cor: COR_SITUACAO.vendida, texto: 'Vendida' },
          { cor: COR_SITUACAO.ocupada, texto: 'Ocupada' },
        ]
      : [
          { cor: '#40c057', texto: 'Titular em dia' },
          { cor: '#fa5252', texto: 'Titular pendente' },
          { cor: '#adb5bd', texto: 'Sem titular' },
        ];
  return (
    <Group gap="xs">
      {itens.map((i) => (
        <Group key={i.texto} gap={4}>
          <Box w={10} h={10} style={{ borderRadius: 10, background: i.cor }} />
          <Text size="xs">{i.texto}</Text>
        </Group>
      ))}
    </Group>
  );
}

function ModalSetor({
  titulo,
  inicial,
  fechar,
  salvar,
}: {
  titulo: string;
  inicial: { nome: string; cor: string };
  fechar: () => void;
  salvar: (v: { nome: string; cor: string }) => Promise<void>;
}) {
  const form = useForm({ initialValues: inicial, validate: { nome: (v) => (v.trim() ? null : 'Informe o nome') } });
  return (
    <Modal opened onClose={fechar} title={titulo}>
      <form
        onSubmit={form.onSubmit(async (v) => {
          try {
            await salvar(v);
            fechar();
          } catch (e) {
            form.setFieldError('nome', mensagemDeErro(e));
          }
        })}
      >
        <Stack>
          <TextInput label="Nome" autoFocus {...form.getInputProps('nome')} />
          <ColorInput label="Cor" swatches={CORES} {...form.getInputProps('cor')} />
          <Button type="submit" loading={form.submitting}>Salvar</Button>
        </Stack>
      </form>
    </Modal>
  );
}

/** Proporção largura/altura de uma foto escolhida no computador. */
async function proporcaoDoArquivo(arquivo: File): Promise<number> {
  try {
    const bmp = await createImageBitmap(arquivo);
    const p = bmp.width / bmp.height;
    bmp.close();
    return p;
  } catch {
    return 1; // formatos que o navegador não abre (ex.: HEIC): começa quadrada; o servidor converte.
  }
}

/** Cantos para a foto ocupar o meio da tela (60% da largura visível), com a proporção certa. */
function limitesNaTela(m: L.Map, proporcao: number): [[number, number], [number, number]] {
  const b = m.getBounds();
  const visivel = larguraEmMetros([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]);
  const largura = visivel * 0.6;
  const [[s, o], [n, l]] = limitesProporcionais(0, 0, largura, proporcao);
  const c = b.getCenter();
  return limitesProporcionais(c.lat - (n - s) / 2, c.lng - (l - o) / 2, largura, proporcao);
}
