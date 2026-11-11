import L from 'leaflet';
import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { PinSepultura } from '@cemiterio/shared';
import { CamadasBase, COR_SITUACAO, LimitarAImagem, useMapa, vistaInicial } from './base';
import type { LeituraGps } from './gps';

function Cliques({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Centraliza no ponto quando ele muda de "longe" (não a cada arrasto). */
function Seguir({ alvo, zoom }: { alvo: [number, number] | null; zoom: number }) {
  const mapa = useMap();
  useEffect(() => {
    if (!alvo) return;
    if (!mapa.getBounds().pad(-0.2).contains(alvo)) mapa.setView(alvo, Math.max(mapa.getZoom(), zoom));
  }, [alvo, mapa, zoom]);
  return null;
}

/**
 * Mapa para posicionar UMA sepultura: toque/clique para colocar o pin e arraste para ajustar.
 * Mostra as outras sepulturas como referência e, se houver, a posição do GPS.
 */
export function MapaPosicionar({
  posicao,
  aoMudar,
  editavel,
  gps,
  ignorarId,
  altura = 320,
}: {
  posicao: [number, number] | null;
  aoMudar: (lat: number, lng: number) => void;
  editavel: boolean;
  gps?: LeituraGps | null;
  ignorarId?: number;
  altura?: number | string;
}) {
  const { data } = useMapa();
  if (!data) return null;
  const vista = vistaInicial(data.config);
  const centro: [number, number] = posicao ?? (gps ? [gps.latitude, gps.longitude] : vista.centro);
  const zoom = posicao || gps ? 20 : vista.zoom;
  const outros = data.pins.filter((x: PinSepultura) => x.id !== ignorarId);

  return (
    <MapContainer center={centro} zoom={zoom} maxZoom={22} zoomSnap={0.25} zoomDelta={0.5} wheelPxPerZoomLevel={90} style={{ height: altura, width: '100%', borderRadius: 8 }}>
      <CamadasBase config={data.config} />
      <LimitarAImagem config={data.config} enquadrar={!posicao && !gps && vista.enquadrar} />
      {data.setores.map((s) => (
        <Polygon
          key={s.id}
          positions={s.poligono.map((anel) => anel.map(([lng, lat]) => [lat, lng] as [number, number]))}
          pathOptions={{ color: s.cor, weight: 1, fillOpacity: 0.08 }}
          interactive={false}
        />
      ))}
      {outros.map((x) => (
        <CircleMarker
          key={x.id}
          center={[x.latitude, x.longitude]}
          radius={5}
          pathOptions={{ color: '#fff', weight: 1, fillColor: COR_SITUACAO[x.situacao], fillOpacity: 0.9 }}
        >
          <Tooltip>{x.codigo}</Tooltip>
        </CircleMarker>
      ))}
      {gps && (
        <>
          <Circle center={[gps.latitude, gps.longitude]} radius={gps.precisao} pathOptions={{ color: '#228be6', weight: 1, fillOpacity: 0.1 }} interactive={false} />
          <CircleMarker center={[gps.latitude, gps.longitude]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#228be6', fillOpacity: 1 }} interactive={false} />
        </>
      )}
      {posicao && (
        <Marker
          position={posicao}
          draggable={editavel}
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); aoMudar(ll.lat, ll.lng); } }}
        />
      )}
      {editavel && <Cliques aoClicar={aoMudar} />}
      <Seguir alvo={posicao ?? (gps ? [gps.latitude, gps.longitude] : null)} zoom={20} />
    </MapContainer>
  );
}
