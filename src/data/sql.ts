/**
 * Общий слой SQLite для воркера браузера и для тестов в Node.
 * Миграции идут по порядку, номер последней хранится в app_meta.schema_version.
 */
import init0000 from '../../drizzle/0000_init.sql?raw';

/** Минимальный интерфейс oo1.DB из @sqlite.org/sqlite-wasm, который нам нужен. */
export interface OoDb {
  exec(opts: { sql: string; bind?: unknown[]; rowMode?: 'array'; returnValue?: 'resultRows' }): unknown;
  selectValue(sql: string, bind?: unknown[]): unknown;
  pointer?: unknown;
}

export const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: init0000.split('--> statement-breakpoint').join('\n') },
  { version: 2, sql: "CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(uid UNINDEXED, locale UNINDEXED, name, tags, summary, tokenize='unicode61 remove_diacritics 2');" },
];
export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;

export function migrate(db: OoDb): { from: number; to: number } {
  db.exec({ sql: 'PRAGMA foreign_keys = ON;' });
  db.exec({ sql: 'CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY NOT NULL, value text NOT NULL);' });
  const from = Number(db.selectValue("SELECT value FROM app_meta WHERE key = 'schema_version'") ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    db.exec({ sql: 'BEGIN;' });
    try {
      // первая миграция создаёт app_meta сама — пропускаем повтор
      db.exec({ sql: m.sql.replace(/CREATE TABLE `app_meta`[^;]*;/, '') });
      db.exec({ sql: "INSERT INTO app_meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", bind: [String(m.version)] });
      db.exec({ sql: 'COMMIT;' });
    } catch (e) {
      db.exec({ sql: 'ROLLBACK;' });
      throw e;
    }
  }
  return { from, to: SCHEMA_VERSION };
}

export type Method = 'run' | 'all' | 'values' | 'get';

/** Выполнение запроса в формате, который ждёт драйвер drizzle sqlite-proxy. */
export function execProxy(db: OoDb, sql: string, params: unknown[], method: Method): unknown[] | unknown[][] {
  const rows = db.exec({ sql, bind: params.length ? params : undefined, rowMode: 'array', returnValue: 'resultRows' }) as unknown[][];
  if (method === 'run') return [];
  if (method === 'get') return rows[0] ?? [];
  return rows;
}

export const isWrite = (sql: string) => !/^\s*(select|pragma|with\s[\s\S]*select)/i.test(sql);
