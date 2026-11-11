import { ActionIcon, Button, Card, FileButton, Group, Image, Modal, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconExternalLink, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { dataHoraBr } from '../util/formatar';

interface Foto {
  id: number;
  legenda: string | null;
  criado_em: string;
}

/** Galeria de fotos com envio (arquivo, arrastar ou câmera do celular) e exclusão (admin). */
export function GaleriaFotos({
  titulo,
  chave,
  listar,
  enviar,
  urlArquivo,
  excluir,
  vazio,
  aoMudar,
}: {
  titulo: string;
  chave: unknown[];
  listar: () => Promise<Foto[]>;
  enviar: (arquivo: File) => Promise<unknown>;
  urlArquivo: (id: number, miniatura?: boolean) => string;
  excluir: (id: number) => Promise<unknown>;
  vazio: string;
  aoMudar?: () => void;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const [aberta, setAberta] = useState<Foto | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const { data } = useQuery({ queryKey: chave, queryFn: listar });

  const envio = useMutation({
    mutationFn: async (arquivos: File[]) => {
      for (const a of arquivos) await enviar(a);
    },
    onSuccess: (_d, arquivos) =>
      notifications.show({ color: 'teal', message: arquivos.length > 1 ? `${arquivos.length} fotos anexadas.` : 'Foto anexada.' }),
    onError: (e) => notifications.show({ color: 'red', title: 'Não foi possível anexar', message: mensagemDeErro(e) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chave });
      aoMudar?.();
    },
  });
  const exclusao = useMutation({
    mutationFn: excluir,
    onSuccess: () => {
      setAberta(null);
      qc.invalidateQueries({ queryKey: chave });
      aoMudar?.();
    },
    onError: (e) => notifications.show({ color: 'red', message: mensagemDeErro(e) }),
  });

  const receber = (lista: File[] | File | null) => {
    const arquivos = (Array.isArray(lista) ? lista : lista ? [lista] : []).filter(
      (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name),
    );
    if (arquivos.length) envio.mutate(arquivos);
  };
  const fotos = data ?? [];

  return (
    <Card
      withBorder
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        receber(Array.from(e.dataTransfer.files));
      }}
      style={arrastando ? { outline: '2px dashed var(--mantine-color-teal-6)' } : undefined}
    >
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{titulo}</Text>
        <Group gap="xs">
          <FileButton onChange={receber} accept="image/*" capture="environment">
            {(p) => (
              <Tooltip label="Usar a câmera (celular)">
                <ActionIcon variant="light" size="lg" {...p} loading={envio.isPending}>
                  <IconCamera size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </FileButton>
          <FileButton onChange={receber} accept="image/*" multiple>
            {(p) => (
              <Button size="xs" variant="light" leftSection={<IconPhotoPlus size={16} />} loading={envio.isPending} {...p}>
                Anexar foto
              </Button>
            )}
          </FileButton>
        </Group>
      </Group>

      {fotos.length === 0 ? (
        <Text size="sm" c="dimmed">{vazio}</Text>
      ) : (
        <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
          {fotos.map((f) => (
            <Image
              key={f.id}
              src={urlArquivo(f.id, true)}
              radius="sm"
              h={90}
              fit="cover"
              style={{ cursor: 'pointer' }}
              onClick={() => setAberta(f)}
              alt={f.legenda ?? titulo}
            />
          ))}
        </SimpleGrid>
      )}

      <Modal opened={!!aberta} onClose={() => setAberta(null)} size="xl" title={aberta ? `Anexada em ${dataHoraBr(aberta.criado_em)}` : ''}>
        {aberta && (
          <Stack>
            <Image src={urlArquivo(aberta.id)} alt={titulo} />
            <Group justify="space-between">
              <Button component="a" href={urlArquivo(aberta.id)} target="_blank" variant="default" leftSection={<IconExternalLink size={16} />}>
                Abrir em tamanho real
              </Button>
              {usuario?.perfil === 'admin' && (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={16} />}
                  loading={exclusao.isPending}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: 'Excluir foto?',
                      children: <Text size="sm">A foto será apagada definitivamente.</Text>,
                      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
                      confirmProps: { color: 'red' },
                      onConfirm: () => exclusao.mutate(aberta.id),
                    })
                  }
                >
                  Excluir
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}
