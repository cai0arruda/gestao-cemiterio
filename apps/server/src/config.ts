import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface Config {
  porta: number;
  host: string;
  producao: boolean;
  dataDir: string;
  /** Endereço público (usado nos QR codes). */
  publicUrl: string;
  /** Marca o cookie como Secure — ligar quando estiver em HTTPS. */
  cookieSeguro: boolean;
  /** Minutos sem uso até a sessão expirar. */
  sessaoMinutosInatividade: number;
  backupDiasRetencao: number;
  webDist: string;
  /** Certificado para HTTPS local (opcional). */
  https: { cert: string; key: string } | null;
}

export function carregarConfig(): Config {
  // "--producao" em vez de NODE_ENV=production para o comando funcionar igual no Windows.
  const producao = process.argv.includes('--producao') || process.env.NODE_ENV === 'production';
  // Em desenvolvimento a API fica sempre na API_PORT (padrão 3000), para onde o Vite encaminha /api.
  const porta = Number((producao ? process.env.PORT : process.env.API_PORT) ?? 3000);
  const dataDir = path.resolve(raizProjeto, process.env.DATA_DIR ?? 'data');
  return {
    porta,
    host: process.env.HOST ?? '0.0.0.0',
    producao,
    dataDir,
    // Em desenvolvimento as páginas são servidas pelo Vite (porta 5173).
    publicUrl: process.env.PUBLIC_URL ?? (producao ? `http://localhost:${porta}` : 'http://localhost:5173'),
    cookieSeguro: process.env.COOKIE_SECURE === 'true' || Boolean(process.env.HTTPS_CERT && process.env.HTTPS_KEY),
    sessaoMinutosInatividade: Number(process.env.SESSAO_MINUTOS_INATIVIDADE ?? 720),
    backupDiasRetencao: Number(process.env.BACKUP_DIAS_RETENCAO ?? 30),
    webDist: path.resolve(raizProjeto, 'apps/web/dist'),
    https:
      process.env.HTTPS_CERT && process.env.HTTPS_KEY
        ? { cert: path.resolve(raizProjeto, process.env.HTTPS_CERT), key: path.resolve(raizProjeto, process.env.HTTPS_KEY) }
        : null,
  };
}
