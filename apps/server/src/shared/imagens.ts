import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { requisicaoInvalida } from './erros.js';

export const pastaUploads = (dataDir: string) => path.join(dataDir, 'uploads');

/**
 * Corrige a rotação (EXIF), reduz e comprime a foto, gera a miniatura e grava em
 * data/uploads/<subpasta>. Devolve os caminhos relativos.
 */
export async function salvarImagem(
  dataDir: string,
  subpasta: string,
  arquivo: Buffer,
  ladoMaximo = 2000,
): Promise<{ arquivo: string; miniatura: string }> {
  let principal: Buffer;
  let mini: Buffer;
  try {
    const base = sharp(arquivo, { failOn: 'error' }).rotate();
    principal = await base
      .clone()
      .resize({ width: ladoMaximo, height: ladoMaximo, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    mini = await base
      .clone()
      .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    throw requisicaoInvalida('O arquivo enviado não é uma imagem válida (use JPG, PNG, WEBP ou HEIC).');
  }
  const nome = randomUUID();
  const relArquivo = path.join(subpasta, `${nome}.jpg`);
  const relMiniatura = path.join(subpasta, `${nome}_mini.jpg`);
  const raiz = pastaUploads(dataDir);
  await fs.mkdir(path.join(raiz, subpasta), { recursive: true });
  await fs.writeFile(path.join(raiz, relArquivo), principal);
  await fs.writeFile(path.join(raiz, relMiniatura), mini);
  return { arquivo: relArquivo, miniatura: relMiniatura };
}

export async function apagarArquivos(dataDir: string, relativos: string[]) {
  const raiz = pastaUploads(dataDir);
  await Promise.all(relativos.map((r) => fs.rm(path.join(raiz, r), { force: true })));
}
