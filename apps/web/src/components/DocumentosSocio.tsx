import { useQueryClient } from '@tanstack/react-query';
import type { DocumentoSocio } from '@cemiterio/shared';
import { api } from '../api/client';
import { GaleriaFotos } from './GaleriaFotos';

export async function enviarDocumento(socioId: number, arquivo: File, tipo: 'ficha' | 'outro' = 'ficha') {
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('arquivo', arquivo);
  return api.post<{ documento: DocumentoSocio }>(`/api/socios/${socioId}/documentos`, fd);
}

export function DocumentosSocio({ socioId }: { socioId: number }) {
  const qc = useQueryClient();
  return (
    <GaleriaFotos
      titulo="Fichas e documentos"
      chave={['documentos', socioId]}
      listar={async () => (await api.get<{ documentos: DocumentoSocio[] }>(`/api/socios/${socioId}/documentos`)).documentos}
      enviar={(a) => enviarDocumento(socioId, a)}
      urlArquivo={(id, mini) => `/api/documentos/${id}/arquivo${mini ? '?miniatura=1' : ''}`}
      excluir={(id) => api.delete(`/api/documentos/${id}`)}
      vazio="Nenhuma foto ainda. Fotografe a ficha em papel e anexe aqui (ou arraste a imagem para este quadro)."
      aoMudar={() => qc.invalidateQueries({ queryKey: ['socios'] })}
    />
  );
}
