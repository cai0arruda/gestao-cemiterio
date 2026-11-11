import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { AneisPoligono } from '@cemiterio/shared';

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
