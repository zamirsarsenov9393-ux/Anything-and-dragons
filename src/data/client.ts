/** Подключение к базе: в браузере — через воркер, в тестах — напрямую к SQLite в памяти. */
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../db/schema';
import type { Method } from './sql';

export type Db = SqliteRemoteDatabase<typeof schema>;
export interface Transport {
  exec(sql: string, params: unknown[], method: Method): Promise<unknown>;
  batch(queries: { sql: string; params: unknown[]; method: Method }[]): Promise<unknown[]>;
  exportDb(): Promise<Uint8Array>;
  importDb(bytes: Uint8Array): Promise<void>;
}

export function createDb(t: Transport): Db {
  return drizzle(
    async (sql, params, method) => ({ rows: (await t.exec(sql, params, method as Method)) as any[] }),
    async (queries) => {
      const res = await t.batch(queries.map((q) => ({ sql: q.sql, params: q.params, method: q.method as Method })));
      return res.map((rows) => ({ rows: rows as any[] }));
    },
    { schema },
  );
}

export interface OpenInfo { mode: 'opfs' | 'indexeddb' | 'memory'; schemaVersion: number; migratedFrom: number; sqlite: string }

/** Браузер: воркер с SQLite WASM. */
export async function openBrowserDb(): Promise<{ db: Db; transport: Transport; info: OpenInfo }> {
  const worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
  let seq = 0;
  const waiting = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  worker.onmessage = (ev) => {
    const w = waiting.get(ev.data.id);
    if (!w) return;
    waiting.delete(ev.data.id);
    if (ev.data.ok) w.res(ev.data.result); else w.rej(new Error(ev.data.error));
  };
  const call = (msg: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<any>((res, rej) => {
    const id = ++seq;
    waiting.set(id, { res, rej });
    worker.postMessage({ id, ...msg }, transfer);
  });
  const info = (await call({ op: 'open' })) as OpenInfo;
  const transport: Transport = {
    exec: (sql, params, method) => call({ op: 'exec', sql, params, method }),
    batch: (queries) => call({ op: 'batch', queries }),
    exportDb: () => call({ op: 'export' }),
    importDb: async (bytes) => { await call({ op: 'import', bytes }); },
  };
  return { db: createDb(transport), transport, info };
}
