import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconeRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icone from 'leaflet/dist/images/marker-icon.png';
import sombra from 'leaflet/dist/images/marker-shadow.png';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ImageOverlay, LayerGroup, LayersControl, TileLayer, useMap } from 'react-leaflet';
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

const SATELITE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics',
};
const RUAS = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; colaboradores do OpenStreetMap' };

/**
 * Fundo do mapa. Se houver imagem aérea própria (drone), ela é o fundo padrão — mais nítida
 * que o satélite. Satélite e ruas continuam no botão de camadas para comparar.
 */
export function CamadasBase({ config, semImagemAerea = false }: { config?: ConfigMapa; semImagemAerea?: boolean }) {
  const aerea = semImagemAerea ? null : config?.imagem_aerea;
  const imagem = aerea && (
    <ImageOverlay url={`/api/mapa/imagem-aerea.jpg?v=${aerea.versao}`} bounds={aerea.limites} opacity={aerea.opacidade} />
  );
  return (
    <LayersControl position="topright">
      {aerea && (
        <LayersControl.BaseLayer checked name="Imagem do drone">
          <LayerGroup>{imagem}</LayerGroup>
        </LayersControl.BaseLayer>
      )}
      {aerea && (
        <LayersControl.BaseLayer name="Drone sobre o satélite">
          <LayerGroup>
            <TileLayer url={SATELITE.url} attribution={SATELITE.attribution} maxNativeZoom={19} maxZoom={22} />
            {imagem}
          </LayerGroup>
        </LayersControl.BaseLayer>
      )}
      <LayersControl.BaseLayer checked={!aerea} name="Satélite">
        <TileLayer url={SATELITE.url} attribution={SATELITE.attribution} maxNativeZoom={19} maxZoom={22} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Ruas">
        <TileLayer url={RUAS.url} attribution={RUAS.attribution} maxNativeZoom={19} maxZoom={22} />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}

/**
 * Posição inicial: com imagem do drone, abre enquadrado nela (a não ser que a posição
 * salva já esteja dentro da imagem). Sem imagem, usa a posição salva ou o Brasil.
 */
export function vistaInicial(config?: ConfigMapa): { centro: [number, number]; zoom: number; enquadrar: boolean } {
  const p = config?.posicao;
  const aerea = config?.imagem_aerea;
  if (aerea) {
    const limites = L.latLngBounds(aerea.limites);
    if (!p || !limites.contains([p.latitude, p.longitude])) {
      const c = limites.getCenter();
      return { centro: [c.lat, c.lng], zoom: 17, enquadrar: true };
    }
  }
  const q = p ?? POSICAO_INICIAL;
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
      mapa.setMinZoom(Math.max(mapa.getBoundsZoom(limites.pad(0.6)), 1));
      mapa.setMaxBounds(limites.pad(0.6));
      if (enquadrar) mapa.fitBounds(limites, { padding: [10, 10], animate: false });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chave, enquadrar]);
  return null;
}
