/** Глобальное состояние приложения: база, библиотека, язык, маршрут, уведомления. */
import { create } from 'zustand';
import { openBrowserDb, type OpenInfo } from '../data/client';
import { Repo } from '../data/repo';
import { buildLibrary, fetchBuiltin, type Library, type PackageInfo } from './content';
import type { ContentPackage } from '../content/schema';

export interface AppState {
  ready: boolean;
  bootError?: string;
  lang: 'ru' | 'en';
  contentLang: 'ru' | 'en';
  route: string;
  repo?: Repo;
  dbInfo?: OpenInfo;
  lib?: Library;
  builtin: ContentPackage[];
  toasts: { id: number; text: string; tone?: 'ok' | 'warn' | 'error' }[];
  version: number;
  boot(): Promise<void>;
  navigate(path: string): void;
  setLang(l: 'ru' | 'en'): void;
  setContentLang(l: 'ru' | 'en'): void;
  toast(text: string, tone?: 'ok' | 'warn' | 'error'): void;
  reloadLibrary(): Promise<void>;
  bump(): void;
}

const BASE = import.meta.env.BASE_URL;
let booting: Promise<void> | undefined;
const readHash = () => (location.hash.replace(/^#/, '') || '/');

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  lang: 'ru',
  contentLang: 'ru',
  route: readHash(),
  builtin: [],
  toasts: [],
  version: 0,

  async boot() {
    if (booting) return booting;
    booting = (async () => { try {
      const [{ db, transport, info }, builtin] = await Promise.all([openBrowserDb(), fetchBuiltin(BASE)]);
      const repo = new Repo(db, transport);
      const registered = new Set((await repo.listPackages()).map((p) => `${p.pkg.id}@${p.pkg.version}`));
      for (const p of builtin) if (!registered.has(`${p.id}@${p.version}`)) await repo.registerPackage(p, 'builtin', false);
      const lang = ((await repo.getMeta('ui.lang')) ?? 'ru') as 'ru' | 'en';
      const contentLang = ((await repo.getMeta('content.lang')) ?? lang) as 'ru' | 'en';
      set({ repo, dbInfo: info, builtin, lang, contentLang });
      await get().reloadLibrary();
      try { await navigator.storage?.persist?.(); } catch { /* не критично */ }
      set({ ready: true });
    } catch (e) {
      set({ bootError: (e as Error).message ?? String(e) });
    } })();
    return booting;
  },

  async reloadLibrary() {
    const { repo, builtin } = get();
    if (!repo) return;
    const rows = await repo.listPackages();
    const infos: PackageInfo[] = [];
    for (const r of rows) {
      const b = builtin.find((p) => p.id === r.pkg.id && p.version === r.pkg.version);
      const pkg = b ?? (await repo.loadStoredPackage(r.pkg.id));
      if (pkg) infos.push({ pkg, origin: r.pkg.origin, enabled: r.pkg.enabled });
    }
    set({ lib: buildLibrary(infos), version: get().version + 1 });
  },

  navigate(path) {
    if (readHash() !== path) location.hash = path;
    set({ route: path });
    window.scrollTo({ top: 0 });
  },
  setLang(l) { set({ lang: l }); void get().repo?.setMeta('ui.lang', l); document.documentElement.lang = l; },
  setContentLang(l) { set({ contentLang: l }); void get().repo?.setMeta('content.lang', l); },
  toast(text, tone = 'ok') {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3200);
  },
  bump() { set({ version: get().version + 1 }); },
}));

window.addEventListener('hashchange', () => useApp.setState({ route: readHash() }));
