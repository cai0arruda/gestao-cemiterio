import { Anchor, Image, Stack, Text } from '@mantine/core';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { CircleMarker, MapContainer, Polygon, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router';
import { ROTULO_TIPO_SEPULTURA, type PinSepultura, type Setor } from '@cemiterio/shared';
import { BadgeSepultura } from '../sepulturas/BadgeSepultura';
import { CamadasBase, COR_SITUACAO, LimitarAImagem, vistaInicial, type DadosMapa } from './base';

export type ModoCor = 'situacao' | 'adimplencia';

export function corDoPin(p: PinSepultura, modo: ModoCor) {
  if (modo === 'situacao') return COR_SITUACAO[p.situacao];
  if (!p.socio_id) return '#adb5bd';
  return p.titular_pendente ? '#fa5252' : '#40c057';
}

/** Move o mapa para um pin e abre o balão dele. */
function Foco({ alvo, marcadores }: { alvo: { id: number; seq: number } | null; marcadores: React.RefObject<Map<number, L.CircleMarker>> }) {
  const mapa = useMap();
  useEffect(() => {
    if (!alvo) return;
    const m = marcadores.current?.get(alvo.id);
    if (!m) return;
    mapa.flyTo(m.getLatLng(), Math.max(mapa.getZoom(), 20), { duration: 0.8 });
    setTimeout(() => m.openPopup(), 850);
  }, [alvo, mapa, marcadores]);
  return null;
}

function ObservarMapa({ aoMudar }: { aoMudar?: (m: L.Map) => void }) {
  const mapa = useMapEvents({ moveend: () => aoMudar?.(mapa), zoomend: () => aoMudar?.(mapa) });
  useEffect(() => aoMudar?.(mapa), [mapa, aoMudar]);
  return null;
}

export function MapaGeral({
  dados,
  modo,
  mostrarCodigos,
  alvo,
  aoMudarMapa,
  setoresVisiveis = true,
  ocultarSetorId,
  children,
  altura = '100%',
}: {
  dados: DadosMapa;
  modo: ModoCor;
  mostrarCodigos: boolean;
  alvo: { id: number; seq: number } | null;
  aoMudarMapa?: (m: L.Map) => void;
  setoresVisiveis?: boolean;
  ocultarSetorId?: number | null;
  children?: React.ReactNode;
  altura?: string | number;
}) {
  const marcadores = useRef(new Map<number, L.CircleMarker>());
  const vista = vistaInicial(dados.config);

  return (
    <MapContainer center={vista.centro} zoom={vista.zoom} maxZoom={22} zoomSnap={0.25} zoomDelta={0.5} wheelPxPerZoomLevel={90} style={{ height: altura, width: '100%', borderRadius: 8 }}>
      <CamadasBase config={dados.config} />
      <LimitarAImagem config={dados.config} enquadrar={vista.enquadrar} />
      {setoresVisiveis &&
        dados.setores
          .filter((s) => s.id !== ocultarSetorId)
          .map((s: Setor) => (
            <Polygon
              key={`${s.id}-${s.cor}-${JSON.stringify(s.poligono).length}`}
              positions={s.poligono.map((anel) => anel.map(([lng, lat]) => [lat, lng] as [number, number]))}
              pathOptions={{ color: s.cor, weight: 2, fillOpacity: 0.12 }}
              interactive={false}
            >
              <Tooltip sticky>{s.nome}</Tooltip>
            </Polygon>
          ))}
      {dados.pins.map((pin) => (
        <CircleMarker
          key={pin.id}
          ref={(m) => {
            if (m) marcadores.current.set(pin.id, m);
            else marcadores.current.delete(pin.id);
          }}
          center={[pin.latitude, pin.longitude]}
          radius={7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: corDoPin(pin, modo), fillOpacity: 1 }}
        >
          {mostrarCodigos && (
            <Tooltip permanent direction="right" offset={[8, 0]} className="rotulo-pin">
              {pin.codigo}
            </Tooltip>
          )}
          <Popup minWidth={220}>
            <BalaoPin pin={pin} />
          </Popup>
        </CircleMarker>
      ))}
      <Foco alvo={alvo} marcadores={marcadores} />
      <ObservarMapa aoMudar={aoMudarMapa} />
      {children}
    </MapContainer>
  );
}

function BalaoPin({ pin }: { pin: PinSepultura }) {
  return (
    <Stack gap={4}>
      <Text fw={700} ff="monospace">{pin.codigo}</Text>
      <div><BadgeSepultura situacao={pin.situacao} /></div>
      {pin.foto_id && <Image src={`/api/sepultura-fotos/${pin.foto_id}/arquivo?miniatura=1`} h={110} fit="cover" radius="sm" />}
      <Text size="xs">
        {ROTULO_TIPO_SEPULTURA[pin.tipo]} · {pin.ocupacao} de {pin.capacidade}
        {pin.setor_nome && ` · ${pin.setor_nome}`}
      </Text>
      {pin.socio_nome && (
        <Text size="xs">
          Titular: <b>{pin.socio_nome}</b>
          {pin.titular_pendente && <Text span c="red" size="xs"> (pendente)</Text>}
        </Text>
      )}
      {pin.sepultados.length > 0 && <Text size="xs">Sepultados: {pin.sepultados.join(', ')}</Text>}
      {pin.referencia && <Text size="xs" c="dimmed">{pin.referencia}</Text>}
      <Anchor component={Link} to={`/sepulturas/${pin.id}`} size="sm">Abrir ficha</Anchor>
    </Stack>
  );
}
