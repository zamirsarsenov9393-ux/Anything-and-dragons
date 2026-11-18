import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createDb, type Transport } from '../../src/data/client';
import { execProxy, migrate } from '../../src/data/sql';
import { Repo } from '../../src/data/repo';

/** База в памяти для тестов — та же SQLite WASM, что и в браузере. */
export async function memoryRepo() {
  const sqlite3: any = await (sqlite3InitModule as any)();
  let db = new sqlite3.oo1.DB(':memory:', 'c');
  migrate(db);
  const transport: Transport = {
    exec: async (sql, params, method) => execProxy(db, sql, params, method),
    batch: async (qs) => {
      db.exec({ sql: 'BEGIN;' });
      try { const r = qs.map((q) => execProxy(db, q.sql, q.params, q.method)); db.exec({ sql: 'COMMIT;' }); return r; }
      catch (e) { db.exec({ sql: 'ROLLBACK;' }); throw e; }
    },
    exportDb: async () => sqlite3.capi.sqlite3_js_db_export(db.pointer),
    importDb: async (bytes) => {
      db.close();
      db = new sqlite3.oo1.DB(':memory:', 'c');
      const p = sqlite3.wasm.allocFromTypedArray(bytes);
      const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.byteLength, bytes.byteLength, sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
      if (rc) throw new Error('deserialize ' + rc);
      migrate(db);
    },
  };
  return { repo: new Repo(createDb(transport), transport), raw: () => db };
}
