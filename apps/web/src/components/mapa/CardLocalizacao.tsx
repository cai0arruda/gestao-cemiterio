import { Anchor, Button, Card, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMap, IconMapPin } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { SepulturaDetalhe } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { MapaPosicionar } from './MapaPosicionar';

/** Card da ficha da sepultura: ver e ajustar o pin no mapa. */
export function CardLocalizacao({ sepultura }: { sepultura: SepulturaDetalhe }) {
  const qc = useQueryClient();
  const atual: [number, number] | null =
    sepultura.latitude !== null && sepultura.longitude !== null ? [sepultura.latitude, sepultura.longitude] : null;
  const [editando, setEditando] = useState(false);
  const [posicao, setPosicao] = useState<[number, number] | null>(atual);

  const salvar = async (p: [number, number] | null) => {
    try {
      await api.put(`/api/sepulturas/${sepultura.id}/localizacao`, { latitude: p?.[0] ?? null, longitude: p?.[1] ?? null });
      notifications.show({ color: 'teal', message: p ? 'Posição salva.' : 'Posição removida.' });
      setEditando(false);
      qc.invalidateQueries({ queryKey: ['sepultura', sepultura.id] });
      qc.invalidateQueries({ queryKey: ['mapa'] });
      qc.invalidateQueries({ queryKey: ['sepulturas'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Localização no mapa</Text>
        <Group gap="xs">
          {atual && !editando && (
            <Button size="xs" variant="subtle" component={Link} to={`/mapa?sepultura=${sepultura.id}`} leftSection={<IconMap size={14} />}>
              Mapa geral
            </Button>
          )}
          {!editando && (
            <Button size="xs" variant="light" leftSection={<IconMapPin size={14} />} onClick={() => { setPosicao(atual); setEditando(true); }}>
              {atual ? 'Ajustar' : 'Marcar no mapa'}
            </Button>
          )}
        </Group>
      </Group>
      {editando && (
        <Text size="xs" c="dimmed" mb="xs">
          Localize a sepultura na foto de drone, clique para marcar e arraste o pin para ajustar.
        </Text>
      )}
      {!atual && !editando ? (
        <Text size="sm" c="dimmed">Esta sepultura ainda não foi marcada no mapa.</Text>
      ) : (
        <MapaPosicionar
          posicao={editando ? posicao : atual}
          editavel={editando}
          aoMudar={(lat, lng) => setPosicao([lat, lng])}
          ignorarId={sepultura.id}
          altura={280}
        />
      )}
      {editando && (
        <Group justify="flex-end" gap="xs" mt="sm">
          {atual && (
            <Anchor size="xs" c="red" onClick={() => salvar(null)}>remover</Anchor>
          )}
          <Button size="xs" variant="default" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button size="xs" onClick={() => posicao && salvar(posicao)} disabled={!posicao}>Salvar</Button>
        </Group>
      )}
    </Card>
  );
}
