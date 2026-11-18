/// <reference lib="webworker" />
/**
 * Воркер базы: SQLite WASM. Хранение — OPFS (VFS opfs-sahpool, работает без COOP/COEP).
 * Если OPFS недоступен — база в памяти, снимок сохраняется в IndexedDB через 1,5 с после записи.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { execProxy, isWrite, migrate, type Method, type OoDb } from './sql';

type Req = { id: number; op: 'open' | 'exec' | 'export' | 'import' | 'batch'; sql?: string; params?: unknown[]; method?: Method; bytes?: Uint8Array; queries?: { sql: string; params: unknown[]; method: Method }[] };

const FILE = '/aandd.sqlite3';
const IDB_NAME = 'aandd-snapshot';
let sqlite3: any;
let pool: any;
let db: (OoDb & { close(): void; pointer: number }) | undefined;
let mode: 'opfs' | 'indexeddb' | 'memory' = 'memory';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('db');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Uint8Array | undefined> {
  const d = await idb();
  return new Promise((res, rej) => { const q = d.transaction('db').objectStore('db').get('main'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbPut(bytes: Uint8Array) {
  const d = await idb();
  await new Promise<void>((res, rej) => { const t = d.transaction('db', 'readwrite'); t.objectStore('db').put(bytes, 'main'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

function deserialize(bytes: Uint8Array) {
  const capi = sqlite3.capi, wasm = sqlite3.wasm;
  const p = wasm.allocFromTypedArray(bytes);
  const rc = capi.sqlite3_deserialize(db!.pointer, 'main', p, bytes.byteLength, bytes.byteLength, capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE);
  if (rc) throw new Error(`sqlite3_deserialize: ${rc}`);
}

async function open() {
  sqlite3 = await sqlite3InitModule();
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'aandd-pool', initialCapacity: 6 });
    db = new pool.OpfsSAHPoolDb(FILE);
    mode = 'opfs';
  } catch {
    db = new sqlite3.oo1.DB(':memory:', 'c');
    try {
      const snap = await idbGet();
      if (snap) deserialize(snap);
      mode = 'indexeddb';
    } catch { mode = 'memory'; }
  }
  const m = migrate(db!);
  return { mode, migratedFrom: m.from, schemaVersion: m.to, sqlite: sqlite3.version.libVersion };
}

function scheduleSave() {
  if (mode !== 'indexeddb') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { idbPut(sqlite3.capi.sqlite3_js_db_export(db!.pointer)).catch(() => { mode = 'memory'; }); }, 1500);
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, op } = ev.data;
  try {
    let result: unknown;
    if (op === 'open') result = await open();
    else if (op === 'exec') {
      result = execProxy(db!, ev.data.sql!, ev.data.params ?? [], ev.data.method ?? 'all');
      if (isWrite(ev.data.sql!)) scheduleSave();
    } else if (op === 'batch') {
      db!.exec({ sql: 'BEGIN;' });
      try {
        result = ev.data.queries!.map((q) => execProxy(db!, q.sql, q.params, q.method));
        db!.exec({ sql: 'COMMIT;' });
      } catch (e) { db!.exec({ sql: 'ROLLBACK;' }); throw e; }
      scheduleSave();
    } else if (op === 'export') result = sqlite3.capi.sqlite3_js_db_export(db!.pointer);
    else if (op === 'import') {
      const bytes = ev.data.bytes!;
      if (mode === 'opfs') { db!.close(); await pool.importDb(FILE, bytes); db = new pool.OpfsSAHPoolDb(FILE); }
      else { db!.close(); db = new sqlite3.oo1.DB(':memory:', 'c'); deserialize(bytes); scheduleSave(); }
      result = migrate(db!);
    }
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (e as Error).message ?? String(e) });
  }
};
