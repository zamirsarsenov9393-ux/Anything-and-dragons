/**
 * Проверка и импорт контент-пакетов.
 * Порядок: схема (Zod) → редакция → лицензия → дубликаты → ссылки → формулы → отчёт.
 */
import { contentPackage, type ContentItem, type ContentPackage } from './schema';
import { validateFormula } from '../core/formula';

export interface ImportIssue { code: string; message: string; uid?: string }
export interface ImportReport {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** пакет после очистки: тексты убраны, если лицензия их не разрешает */
  sanitized?: ContentPackage;
  summary: Record<string, number>;
}

const UID_RE = /^[a-z0-9-]+:[a-z-]+\/[a-z0-9-]+$/;
const FORMULA_FIELDS: Record<string, string[]> = { 'ac.base': ['formula'], 'hp.flat': ['value'], 'initiative.bonus': ['value'], resource: ['max'], weaponMastery: ['count'], 'spell.grant': ['uses'] };

function walk(v: unknown, visit: (o: Record<string, unknown>) => void) {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
  else if (v && typeof v === 'object') { visit(v as Record<string, unknown>); Object.values(v).forEach((x) => walk(x, visit)); }
}
function refsOf(v: unknown, out: Set<string>) {
  if (typeof v === 'string') { if (UID_RE.test(v)) out.add(v); }
  else if (Array.isArray(v)) v.forEach((x) => refsOf(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => refsOf(x, out));
}

/** Проверка уже разобранного пакета против установленных. */
export function validatePackage(pkg: ContentPackage, installed: ContentPackage[]): ImportReport {
  const errors: ImportIssue[] = [], warnings: ImportIssue[] = [];
  const summary: Record<string, number> = {};
  const others = installed.filter((p) => p.id !== pkg.id);
  const known = new Map<string, { pkg: string; item: ContentItem }>();
  for (const p of others) if (p.kind === 'content') for (const it of p.items) known.set(it.id, { pkg: p.id, item: it });

  if (pkg.source.license.code === 'unknown') {
    errors.push({ code: 'license-unknown', message: 'Права на материал не установлены: можно сохранить только библиографические данные источника, без элементов' });
  }

  if (pkg.kind === 'translation') {
    const target = others.find((p) => p.id === pkg.target.packageId);
    if (!target || target.kind !== 'content') errors.push({ code: 'translation-target-missing', message: `Не установлен пакет, который переводится: ${pkg.target.packageId}` });
    else {
      const ids = new Set(target.items.map((i) => i.id));
      const missing = pkg.entries.filter((e) => !ids.has(e.uid));
      if (missing.length) warnings.push({ code: 'translation-orphans', message: `${missing.length} записей перевода не нашли элемент в ${target.id}` });
    }
    summary.translations = pkg.entries.length;
    return { ok: errors.length === 0, errors, warnings, sanitized: pkg, summary };
  }

  const own = new Map<string, ContentItem>();
  for (const it of pkg.items) {
    summary[it.type] = (summary[it.type] ?? 0) + 1;
    if (own.has(it.id)) errors.push({ code: 'duplicate-uid', message: `Повторяющийся идентификатор ${it.id}`, uid: it.id });
    own.set(it.id, it);
    const conflict = known.get(it.id);
    if (conflict) errors.push({ code: 'uid-conflict', message: `${it.id} уже есть в пакете ${conflict.pkg}`, uid: it.id });
    if (!it.id.startsWith(`${pkg.namespace}:`)) warnings.push({ code: 'foreign-namespace', message: `${it.id} не в пространстве имён пакета (${pkg.namespace})`, uid: it.id });
    if (it.edition !== 'any' && pkg.edition !== 'any' && it.edition !== pkg.edition) {
      errors.push({ code: 'edition-mismatch', message: `«${it.name}» помечен редакцией ${it.edition}, а пакет — ${pkg.edition}`, uid: it.id });
    }
  }

  // возможные дубликаты: то же название и тип в той же редакции в другом пакете
  const byName = new Map<string, string>();
  for (const { pkg: pid, item } of known.values()) byName.set(`${item.type}|${item.edition}|${item.name.toLowerCase()}`, pid);
  for (const it of pkg.items) {
    const hit = byName.get(`${it.type}|${it.edition}|${it.name.toLowerCase()}`);
    if (hit) warnings.push({ code: 'possible-duplicate', message: `«${it.name}» (${it.type}) уже есть в пакете ${hit}`, uid: it.id });
  }

  // ссылки
  for (const it of pkg.items) {
    const refs = new Set<string>();
    refsOf(it.mechanics, refs);
    refsOf(it.prerequisite, refs);
    it.requires.forEach((r) => refs.add(r));
    for (const r of refs) if (!own.has(r) && !known.has(r)) errors.push({ code: 'dangling-ref', message: `${it.id} ссылается на отсутствующий ${r}`, uid: it.id });
  }

  // формулы
  for (const it of pkg.items) {
    walk(it.mechanics, (o) => {
      const fields = typeof o.type === 'string' ? FORMULA_FIELDS[o.type] : undefined;
      for (const f of fields ?? []) {
        if (typeof o[f] !== 'string') continue;
        const err = validateFormula(o[f] as string);
        if (err) errors.push({ code: 'bad-formula', message: `${it.id}: ${err}`, uid: it.id });
      }
      if (typeof o.preparedFormula === 'string') { const err = validateFormula(o.preparedFormula); if (err) errors.push({ code: 'bad-formula', message: `${it.id}: ${err}`, uid: it.id }); }
      if (typeof o.charges === 'string') { const err = validateFormula(o.charges); if (err) errors.push({ code: 'bad-formula', message: `${it.id}: ${err}`, uid: it.id }); }
    });
  }

  // лицензия: тексты только если разрешено хранить
  let sanitized: ContentPackage = pkg;
  if (!pkg.source.allowedUse.storeText) {
    const withText = pkg.items.filter((i) => i.text?.body || i.text?.summary).length;
    if (withText) {
      warnings.push({ code: 'text-stripped', message: `Лицензия не разрешает хранить тексты: описания убраны у ${withText} элементов` });
      sanitized = { ...pkg, items: pkg.items.map((i) => ({ ...i, text: undefined })) };
    }
  }
  if (!pkg.source.allowedUse.storeMechanics) {
    errors.push({ code: 'mechanics-not-allowed', message: 'Лицензия не разрешает хранить механику: импорт элементов невозможен' });
  }

  return { ok: errors.length === 0, errors, warnings, sanitized, summary };
}

/** Полный импорт из JSON-строки: разбор, схема, проверки. */
export function importPackageJson(json: string, installed: ContentPackage[]): ImportReport {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return { ok: false, errors: [{ code: 'bad-json', message: `Файл не является JSON: ${(e as Error).message}` }], warnings: [], summary: {} };
  }
  const parsed = contentPackage.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, warnings: [], summary: {}, errors: parsed.error.issues.slice(0, 50).map((i) => ({ code: 'schema', message: `${i.path.join('.') || '(корень)'}: ${i.message}` })) };
  }
  return validatePackage(parsed.data, installed);
}
