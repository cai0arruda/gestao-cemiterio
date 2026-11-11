import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { PinSepultura } from '@cemiterio/shared';
import { CamadasBase, COR_SITUACAO, LimitarAImagem, useMapa, vistaInicial } from './base';

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
 * Mostra as outras sepulturas como referência sobre a imagem aérea.
 */
export function MapaPosicionar({
  posicao,
  aoMudar,
  editavel,
  ignorarId,
  altura = 320,
}: {
  posicao: [number, number] | null;
  aoMudar: (lat: number, lng: number) => void;
  editavel: boolean;
  ignorarId?: number;
  altura?: number | string;
}) {
  const { data } = useMapa();
  if (!data) return null;
  const vista = vistaInicial(data.config);
  // Com a foto do drone, abre mostrando a foto inteira (aproximar demais deixa a foto borrada).
  const aerea = !!data.config.imagem_aerea;
  const centro: [number, number] = aerea ? vista.centro : (posicao ?? vista.centro);
  const zoom = aerea || !posicao ? vista.zoom : 20;
  const outros = data.pins.filter((x: PinSepultura) => x.id !== ignorarId);

  return (
    <MapContainer center={centro} zoom={zoom} maxZoom={22} zoomSnap={0.25} zoomDelta={0.5} wheelPxPerZoomLevel={90} style={{ height: altura, width: '100%', borderRadius: 8 }}>
      <CamadasBase config={data.config} />
      <LimitarAImagem config={data.config} enquadrar={vista.enquadrar} />
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
      {posicao && (
        <Marker
          position={posicao}
          draggable={editavel}
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); aoMudar(ll.lat, ll.lng); } }}
        />
      )}
      {editavel && <Cliques aoClicar={aoMudar} />}
      <Seguir alvo={posicao} zoom={aerea ? vista.zoom : 20} />
    </MapContainer>
  );
}
