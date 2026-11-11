import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listarBackups, rotacionarBackups } from '../src/modules/backup/service.js';
import { criarAmbiente } from './helpers.js';

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let cookie: string;
beforeEach(async () => {
  amb = await criarAmbiente();
  cookie = await amb.configurarAdmin();
});
afterEach(() => amb.limpar());

describe('backup', () => {
  it('gera e permite baixar o zip', async () => {
    await amb.app.inject({ method: 'POST', url: '/api/socios', headers: { cookie }, payload: { nome_completo: 'Maria da Silva' } });
    const r = await amb.app.inject({ method: 'POST', url: '/api/backups', headers: { cookie } });
    expect(r.statusCode).toBe(201);
    const { arquivo, tamanho_bytes } = r.json().backup;
    expect(tamanho_bytes).toBeGreaterThan(0);
    const dl = await amb.app.inject({ url: `/api/backups/${arquivo}`, headers: { cookie } });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('não permite baixar arquivos fora da pasta de backups', async () => {
    const r = await amb.app.inject({ url: `/api/backups/${encodeURIComponent('../cemiterio.db')}`, headers: { cookie } });
    expect(r.statusCode).toBe(404);
  });

  it('remove apenas backups automáticos antigos', async () => {
    const pasta = path.join(amb.config.dataDir, 'backups');
    fs.mkdirSync(pasta, { recursive: true });
    const antigo = new Date(Date.now() - 40 * 86_400_000);
    for (const nome of ['backup-2020-01-01_10-00-00-auto.zip', 'backup-2020-01-01_11-00-00.zip']) {
      fs.writeFileSync(path.join(pasta, nome), 'x');
      fs.utimesSync(path.join(pasta, nome), antigo, antigo);
    }
    await rotacionarBackups(amb.config);
    expect((await listarBackups(amb.config)).map((b) => b.arquivo)).toEqual(['backup-2020-01-01_11-00-00.zip']);
  });
});
