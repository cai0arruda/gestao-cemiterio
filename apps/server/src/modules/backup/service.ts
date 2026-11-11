import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupInfo } from '@cemiterio/shared';
import type { Config } from '../../config.js';
import type { DB } from '../../db/index.js';
import { pastaUploads } from '../socios/documentos.js';

const PADRAO_NOME = /^backup-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})(-auto)?\.zip$/;

export const pastaBackups = (config: Config) => path.join(config.dataDir, 'backups');

const doisDigitos = (n: number) => String(n).padStart(2, '0');
function carimbo(d = new Date()) {
  const data = `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
  return { data, completo: `${data}_${doisDigitos(d.getHours())}-${doisDigitos(d.getMinutes())}-${doisDigitos(d.getSeconds())}` };
}

const LEIA_ME = `BACKUP DO SISTEMA DE GESTÃO DO CEMITÉRIO

Conteúdo:
  cemiterio.db  -> banco de dados (sócios, usuários, histórico)
  uploads/      -> fotos (fichas, sepulturas)

Para restaurar:
  1. Pare o sistema.
  2. Substitua o arquivo data/cemiterio.db por este cemiterio.db
     (apague também data/cemiterio.db-wal e data/cemiterio.db-shm, se existirem).
  3. Substitua a pasta data/uploads pela pasta uploads deste backup.
  4. Inicie o sistema novamente.
`;

/** Gera um .zip com uma cópia consistente do banco (feita com o sistema rodando) e as fotos. */
export async function criarBackup(db: DB, config: Config, automatico: boolean): Promise<BackupInfo> {
  const pasta = pastaBackups(config);
  await fs.mkdir(pasta, { recursive: true });
  const { completo } = carimbo();
  const nome = `backup-${completo}${automatico ? '-auto' : ''}.zip`;
  const destino = path.join(pasta, nome);
  const copiaBanco = path.join(pasta, `.tmp-${completo}-${process.pid}.db`);

  try {
    await db.$client.backup(copiaBanco);
    await new Promise<void>((resolve, reject) => {
      const saida = createWriteStream(destino);
      const zip = new ZipArchive({ zlib: { level: 6 } });
      saida.on('close', resolve);
      saida.on('error', reject);
      zip.on('error', reject);
      zip.pipe(saida);
      zip.file(copiaBanco, { name: 'cemiterio.db' });
      zip.append(LEIA_ME, { name: 'LEIA-ME.txt' });
      const uploads = pastaUploads(config.dataDir);
      if (existsSync(uploads)) zip.directory(uploads, 'uploads');
      void zip.finalize();
    });
  } catch (e) {
    await fs.rm(destino, { force: true });
    throw e;
  } finally {
    await fs.rm(copiaBanco, { force: true });
  }
  const st = await fs.stat(destino);
  return { arquivo: nome, tamanho_bytes: st.size, criado_em: st.mtime.toISOString(), automatico };
}

export async function listarBackups(config: Config): Promise<BackupInfo[]> {
  const pasta = pastaBackups(config);
  if (!existsSync(pasta)) return [];
  const nomes = (await fs.readdir(pasta)).filter((n) => PADRAO_NOME.test(n));
  const lista = await Promise.all(
    nomes.map(async (n) => {
      const st = await fs.stat(path.join(pasta, n));
      return { arquivo: n, tamanho_bytes: st.size, criado_em: st.mtime.toISOString(), automatico: n.endsWith('-auto.zip') };
    }),
  );
  return lista.sort((a, b) => b.arquivo.localeCompare(a.arquivo));
}

/** Caminho seguro de um backup pelo nome (impede acessar arquivos fora da pasta). */
export function caminhoBackup(config: Config, nome: string): string | null {
  if (!PADRAO_NOME.test(nome)) return null;
  const caminho = path.join(pastaBackups(config), nome);
  return existsSync(caminho) ? caminho : null;
}

/** Remove backups automáticos mais antigos que a retenção. Backups manuais são mantidos. */
export async function rotacionarBackups(config: Config) {
  const limite = Date.now() - config.backupDiasRetencao * 86_400_000;
  for (const b of await listarBackups(config)) {
    if (b.automatico && Date.parse(b.criado_em) < limite) {
      await fs.rm(path.join(pastaBackups(config), b.arquivo), { force: true });
    }
  }
}

/** Faz o backup automático do dia, se ainda não existir. Verifica de hora em hora. */
export function agendarBackupDiario(db: DB, config: Config, log: { info: (m: string) => void; error: (e: unknown, m: string) => void }) {
  let rodando = false;
  const verificar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const hoje = carimbo().data;
      const jaTem = (await listarBackups(config)).some((b) => b.automatico && b.arquivo.startsWith(`backup-${hoje}`));
      if (!jaTem) {
        const b = await criarBackup(db, config, true);
        log.info(`Backup automático criado: ${b.arquivo}`);
      }
      await rotacionarBackups(config);
    } catch (e) {
      log.error(e, 'Falha no backup automático');
    } finally {
      rodando = false;
    }
  };
  const inicial = setTimeout(verificar, 60_000);
  const intervalo = setInterval(verificar, 60 * 60_000);
  inicial.unref();
  intervalo.unref();
  return () => {
    clearTimeout(inicial);
    clearInterval(intervalo);
  };
}
