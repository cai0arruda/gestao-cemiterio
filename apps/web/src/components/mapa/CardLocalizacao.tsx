import { Alert, Anchor, Button, Card, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCurrentLocation, IconMap, IconMapPin } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { SepulturaDetalhe } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../../api/client';
import { useGps } from './gps';
import { MapaPosicionar } from './MapaPosicionar';

/** Card da ficha da sepultura: ver e ajustar o pin no mapa. */
export function CardLocalizacao({ sepultura }: { sepultura: SepulturaDetalhe }) {
  const qc = useQueryClient();
  const atual: [number, number] | null =
    sepultura.latitude !== null && sepultura.longitude !== null ? [sepultura.latitude, sepultura.longitude] : null;
  const [editando, setEditando] = useState(false);
  const [usarGps, setUsarGps] = useState(false);
  const [posicao, setPosicao] = useState<[number, number] | null>(atual);
  const { leitura, erro } = useGps(usarGps);

  const salvar = async (p: [number, number] | null) => {
    try {
      await api.put(`/api/sepulturas/${sepultura.id}/localizacao`, { latitude: p?.[0] ?? null, longitude: p?.[1] ?? null });
      notifications.show({ color: 'teal', message: p ? 'Posição salva.' : 'Posição removida.' });
      setEditando(false);
      setUsarGps(false);
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
          Clique no mapa para marcar a sepultura e arraste o pin para ajustar. No celular, ao lado da sepultura, use o GPS.
        </Text>
      )}
      {!atual && !editando ? (
        <Text size="sm" c="dimmed">Esta sepultura ainda não foi marcada no mapa.</Text>
      ) : (
        <MapaPosicionar
          posicao={editando ? posicao : atual}
          editavel={editando}
          aoMudar={(lat, lng) => setPosicao([lat, lng])}
          gps={usarGps ? leitura : null}
          ignorarId={sepultura.id}
          altura={280}
        />
      )}
      {editando && erro && usarGps && <Alert mt="xs" color="orange" variant="light" p="xs">{erro}</Alert>}
      {editando && usarGps && leitura && (
        <Text size="xs" mt={4} c={leitura.precisao > 10 ? 'orange' : 'teal'}>
          GPS: precisão de {Math.round(leitura.precisao)} m{leitura.precisao > 10 ? ' — aguarde melhorar ou ajuste o pin à mão' : ''}
        </Text>
      )}
      {editando && (
        <Group justify="space-between" mt="sm">
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconCurrentLocation size={14} />} onClick={() => setUsarGps(true)} disabled={usarGps && !leitura}>
              {usarGps && leitura ? 'GPS ativo' : 'Usar meu GPS'}
            </Button>
            {usarGps && leitura && (
              <Button size="xs" variant="light" onClick={() => setPosicao([leitura.latitude, leitura.longitude])}>Pin na minha posição</Button>
            )}
          </Group>
          <Group gap="xs">
            {atual && (
              <Anchor size="xs" c="red" onClick={() => salvar(null)}>remover</Anchor>
            )}
            <Button size="xs" variant="default" onClick={() => { setEditando(false); setUsarGps(false); }}>Cancelar</Button>
            <Button size="xs" onClick={() => posicao && salvar(posicao)} disabled={!posicao}>Salvar</Button>
          </Group>
        </Group>
      )}
    </Card>
  );
}
