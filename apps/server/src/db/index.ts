import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const pastaMigracoes = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Abre (ou cria) o banco e aplica as migrações pendentes. Use ':memory:' nos testes. */
export function abrirBanco(arquivo: string): DB {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const sqlite = new Database(arquivo);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle({ client: sqlite, schema }) as DB;
  migrate(db, { migrationsFolder: pastaMigracoes });
  return db;
}

export { schema };
