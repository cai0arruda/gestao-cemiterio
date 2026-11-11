import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { ImageOverlay, Marker, useMap } from 'react-leaflet';
import { larguraEmMetros, limitesProporcionais, type AneisPoligono } from '@cemiterio/shared';

/** Converte a camada desenhada para os anéis em [longitude, latitude] (GeoJSON). */
export function aneisDaCamada(camada: L.Polygon): AneisPoligono {
  const geo = camada.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
  return geo.geometry.coordinates.map((anel) => anel.map(([lng, lat]) => [lng!, lat!] as [number, number]));
}

/** Modo desenho: o usuário clica os cantos do setor e fecha no primeiro ponto. */
export function DesenharSetor({ aoTerminar }: { aoTerminar: (aneis: AneisPoligono) => void }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.pm.setLang('pt_br');
    mapa.pm.enableDraw('Polygon', { snappable: true, templineStyle: { color: '#fab005' }, hintlineStyle: { color: '#fab005', dashArray: '5,5' } });
    const criado = (e: { layer: L.Layer }) => {
      const camada = e.layer as L.Polygon;
      const aneis = aneisDaCamada(camada);
      camada.remove();
      aoTerminar(aneis);
    };
    mapa.on('pm:create', criado);
    return () => {
      mapa.off('pm:create', criado);
      mapa.pm.disableDraw();
    };
  }, [mapa, aoTerminar]);
  return null;
}

/** Modo edição da forma de um setor existente: arraste os vértices. */
export function EditarFormaSetor({
  aneis,
  cor,
  camadaRef,
}: {
  aneis: AneisPoligono;
  cor: string;
  camadaRef: React.RefObject<L.Polygon | null>;
}) {
  const mapa = useMap();
  useEffect(() => {
    const camada = L.polygon(
      aneis.map((anel) => anel.slice(0, -1).map(([lng, lat]) => [lat, lng] as [number, number])),
      { color: cor, weight: 3, fillOpacity: 0.2 },
    ).addTo(mapa);
    camada.pm.enable({ allowSelfIntersection: false });
    camadaRef.current = camada;
    return () => {
      camada.pm.disable();
      camada.remove();
      camadaRef.current = null;
    };
  }, [mapa, aneis, cor, camadaRef]);
  return null;
}

const iconeCanto = (texto: string) =>
  L.divIcon({
    className: '',
    html: `<div style="background:#fab005;color:#000;font:600 11px sans-serif;padding:2px 6px;border-radius:4px;border:2px solid #fff;white-space:nowrap;transform:translate(-50%,-50%)">${texto}</div>`,
  });

/**
 * Ajuste da imagem aérea mantendo a proporção da foto:
 * o canto de baixo à esquerda MOVE a imagem e o de cima à direita muda o TAMANHO.
 */
export function AjustarImagemAerea({
  url,
  limites,
  opacidade,
  proporcao,
  aoMudar,
}: {
  url: string;
  limites: [[number, number], [number, number]];
  opacidade: number;
  proporcao: number;
  aoMudar: (l: [[number, number], [number, number]]) => void;
}) {
  const [[s, o], [n, l]] = limites;
  const largura = larguraEmMetros(limites);
  return (
    <>
      <ImageOverlay url={url} bounds={limites} opacity={opacidade} />
      <Marker
        position={[s, o]}
        draggable
        icon={iconeCanto('✥ mover')}
        eventHandlers={{
          drag: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            aoMudar([[p.lat, p.lng], [p.lat + (n - s), p.lng + (l - o)]]);
          },
        }}
      />
      <Marker
        position={[n, l]}
        draggable
        icon={iconeCanto('⤡ tamanho')}
        eventHandlers={{
          drag: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            const nova = larguraEmMetros([[s, o], [s, p.lng]]);
            if (nova > 2) aoMudar(limitesProporcionais(s, o, nova, proporcao));
          },
          // Ao soltar, o marcador volta para o canto certo (a proporção pode ter mudado a altura).
          dragend: () => aoMudar(limitesProporcionais(s, o, Math.max(largura, 2), proporcao)),
        }}
      />
    </>
  );
}
