import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconeRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icone from 'leaflet/dist/images/marker-icon.png';
import sombra from 'leaflet/dist/images/marker-shadow.png';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ImageOverlay, useMap } from 'react-leaflet';
import type { ConfigMapa, PinSepultura, Setor, SituacaoSepultura } from '@cemiterio/shared';
import { api } from '../../api/client';

// O Vite não acha sozinho as imagens do marcador padrão do Leaflet: sem isto o Leaflet
// tenta adivinhar a pasta e junta com o caminho, gerando um endereço quebrado.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconeRetina, iconUrl: icone, shadowUrl: sombra });

/** Sem posição definida: Brasil inteiro. */
export const POSICAO_INICIAL = { latitude: -15.8, longitude: -47.9, zoom: 4 };

export interface DadosMapa {
  config: ConfigMapa;
  pins: PinSepultura[];
  setores: Setor[];
}

export function useMapa() {
  return useQuery({ queryKey: ['mapa'], queryFn: () => api.get<DadosMapa>('/api/mapa') });
}

export const COR_SITUACAO: Record<SituacaoSepultura, string> = {
  disponivel: '#12b886',
  reservada: '#fab005',
  vendida: '#228be6',
  ocupada: '#868e96',
};

/**
 * Fundo do mapa: só a foto do drone, sem satélite nem ruas. As sepulturas e os setores
 * ficam desenhados por cima dela.
 */
export function CamadasBase({ config }: { config?: ConfigMapa }) {
  const aerea = config?.imagem_aerea;
  if (!aerea) return null;
  return <ImageOverlay url={`/api/mapa/imagem-aerea.jpg?v=${aerea.versao}`} bounds={aerea.limites} opacity={1} />;
}

/**
 * Posição inicial: com a foto do drone, abre sempre enquadrado nela.
 * Sem foto, usa a posição salva ou o Brasil.
 */
export function vistaInicial(config?: ConfigMapa): { centro: [number, number]; zoom: number; enquadrar: boolean } {
  const aerea = config?.imagem_aerea;
  if (aerea) {
    const c = L.latLngBounds(aerea.limites).getCenter();
    return { centro: [c.lat, c.lng], zoom: 17, enquadrar: true };
  }
  const q = config?.posicao ?? POSICAO_INICIAL;
  return { centro: [q.latitude, q.longitude], zoom: q.zoom, enquadrar: false };
}

/** Com imagem do drone: enquadra nela e não deixa o mapa "fugir" para longe do cemitério. */
export function LimitarAImagem({ config, enquadrar }: { config?: ConfigMapa; enquadrar: boolean }) {
  const mapa = useMap();
  const aerea = config?.imagem_aerea;
  const chave = aerea ? JSON.stringify(aerea.limites) : '';
  useEffect(() => {
    if (!aerea) {
      mapa.setMaxBounds(undefined as unknown as L.LatLngBoundsExpression);
      mapa.setMinZoom(0);
      return;
    }
    const limites = L.latLngBounds(aerea.limites);
    // Espera o mapa ter o tamanho final na tela; senão o zoom calculado sai pequeno demais.
    const t = setTimeout(() => {
      mapa.invalidateSize();
      mapa.setMinZoom(Math.max(mapa.getBoundsZoom(limites.pad(0.15)), 1));
      mapa.setMaxBounds(limites.pad(0.15));
      if (enquadrar) mapa.fitBounds(limites, { padding: [10, 10], animate: false });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chave, enquadrar]);
  return null;
}
