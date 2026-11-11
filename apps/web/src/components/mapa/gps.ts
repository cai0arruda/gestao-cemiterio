import { useEffect, useState } from 'react';

export interface LeituraGps {
  latitude: number;
  longitude: number;
  precisao: number;
}

/** O navegador só libera o GPS em HTTPS (ou em localhost). */
export const gpsDisponivel = () => typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;

/** Acompanha a posição do aparelho enquanto `ativo` for true. */
export function useGps(ativo: boolean) {
  const [leitura, setLeitura] = useState<LeituraGps | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) return;
    if (!gpsDisponivel()) {
      setErro('O GPS só funciona com conexão segura (HTTPS). Toque no mapa para marcar a posição.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setErro(null);
        setLeitura({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy });
      },
      (e) =>
        setErro(
          e.code === e.PERMISSION_DENIED
            ? 'Permissão de localização negada. Libere a localização para este site nas configurações do navegador.'
            : 'Não foi possível obter o GPS. Vá para um lugar aberto ou toque no mapa para marcar.',
        ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativo]);
  return { leitura, erro };
}
