/** Библиотека контента в приложении: встроенные пакеты SRD + пакеты пользователя + переводы названий. */
import { MemoryResolver } from '../content/resolver';
import { contentPackage, type ContentItem, type ContentPackage } from '../content/schema';
import type { ContentUid, Edition } from '../core/types';

export const BUILTIN = ['srd-5-1', 'srd-5-2', 'srd-5-1-ru', 'srd-5-2-ru'] as const;

export interface PackageInfo { pkg: ContentPackage; origin: 'builtin' | 'imported' | 'homebrew'; enabled: boolean }
export interface Library {
  resolver: MemoryResolver;
  packages: PackageInfo[];
  items: Map<string, { item: ContentItem; pkg: ContentPackage }>;
  ru: Map<string, string>;
  ruText: Map<string, { summary?: string; body?: string }>;
}

export async function fetchBuiltin(base: string): Promise<ContentPackage[]> {
  const out: ContentPackage[] = [];
  for (const id of BUILTIN) {
    const res = await fetch(`${base}packages/${id}.json`);
    if (!res.ok) throw new Error(`Не удалось загрузить пакет ${id}: ${res.status}`);
    out.push(contentPackage.parse(await res.json()));
  }
  return out;
}

export function buildLibrary(packages: PackageInfo[]): Library {
  const enabled = packages.filter((p) => p.enabled);
  const content = enabled.map((p) => p.pkg).filter((p) => p.kind === 'content');
  const items = new Map<string, { item: ContentItem; pkg: ContentPackage }>();
  for (const pkg of content) if (pkg.kind === 'content') for (const it of pkg.items) items.set(it.id, { item: it, pkg });
  const ru = new Map<string, string>(), ruText = new Map<string, { summary?: string; body?: string }>();
  for (const { pkg } of enabled) {
    if (pkg.kind === 'translation' && pkg.language === 'ru') for (const e of pkg.entries) { ru.set(e.uid, e.name); if (e.body || e.summary) ruText.set(e.uid, { summary: e.summary, body: e.body }); }
    if (pkg.kind === 'content' && pkg.language === 'ru') for (const it of pkg.items) ru.set(it.id, it.name);
  }
  return { resolver: new MemoryResolver(content), packages, items, ru, ruText };
}

/** Название для показа: русское, если есть перевод и выбран русский язык контента. */
export function nameOf(lib: Library, uid: string, lang: 'ru' | 'en'): string {
  if (lang === 'ru') { const r = lib.ru.get(uid); if (r) return r; }
  return lib.items.get(uid)?.item.name ?? lib.resolver.get(uid as ContentUid)?.name ?? uid.slice(uid.lastIndexOf('/') + 1).replace(/-/g, ' ');
}
export function textOf(lib: Library, uid: string, lang: 'ru' | 'en'): { body?: string; translated: boolean } {
  if (lang === 'ru') { const r = lib.ruText.get(uid); if (r?.body) return { body: r.body, translated: true }; }
  const it = lib.items.get(uid)?.item;
  return { body: it?.text?.body ?? it?.text?.summary, translated: false };
}
export const byType = (lib: Library, type: string, edition?: Edition) =>
  [...lib.items.values()].filter(({ item }) => item.type === type && (!edition || item.edition === edition || item.edition === 'any')).map((x) => x.item);
