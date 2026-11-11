import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { abrirBanco } from '../src/db/index.js';

export async function criarAmbiente() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cemiterio-teste-'));
  const config: Config = {
    porta: 0,
    host: '127.0.0.1',
    producao: false,
    dataDir,
    publicUrl: 'http://localhost',
    cookieSeguro: false,
    sessaoMinutosInatividade: 60,
    backupDiasRetencao: 30,
    webDist: path.join(dataDir, 'sem-front'),
    https: null,
  };
  const db = abrirBanco(':memory:');
  const app = await criarApp({ db, config });

  /** Cria o admin pela configuração inicial e devolve o cookie de sessão. */
  async function configurarAdmin() {
    const r = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { nome: 'Administrador', login: 'admin', senha: 'senha-de-teste-123' },
    });
    if (r.statusCode !== 200) throw new Error(r.body);
    return cookieDe(r);
  }

  const limpar = async () => {
    await app.close();
    db.$client.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { app, db, config, configurarAdmin, limpar };
}

export function cookieDe(r: { headers: Record<string, unknown> }): string {
  const sc = r.headers['set-cookie'];
  const primeiro = Array.isArray(sc) ? sc[0] : String(sc);
  return primeiro.split(';')[0]!;
}
