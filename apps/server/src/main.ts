import fs from 'node:fs';
import path from 'node:path';
import type { FastifyServerOptions } from 'fastify';
import { criarApp } from './app.js';
import { carregarConfig } from './config.js';
import { abrirBanco } from './db/index.js';
import { limparSessoesExpiradas } from './modules/auth/service.js';
import { agendarBackupDiario } from './modules/backup/service.js';

const config = carregarConfig();
const db = abrirBanco(path.join(config.dataDir, 'cemiterio.db'));
const opcoes = {
  logger: { level: 'info' },
  // HTTPS opcional (ver README): necessário para o GPS do celular na rede local.
  ...(config.https ? { https: { cert: fs.readFileSync(config.https.cert), key: fs.readFileSync(config.https.key) } } : {}),
} as FastifyServerOptions;
const app = await criarApp({ db, config }, opcoes);

const pararBackup = agendarBackupDiario(db, config, {
  info: (m) => app.log.info(m),
  error: (e, m) => app.log.error(e, m),
});
const limpeza = setInterval(() => limparSessoesExpiradas(db, config.sessaoMinutosInatividade), 60 * 60_000);
limpeza.unref();

async function encerrar() {
  pararBackup();
  await app.close();
  db.$client.close();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await app.listen({ port: config.porta, host: config.host });
app.log.info(`Sistema no ar em ${config.publicUrl} (dados em ${config.dataDir})`);
