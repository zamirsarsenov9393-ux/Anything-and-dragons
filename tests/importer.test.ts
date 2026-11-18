import { describe, expect, it } from 'vitest';
import { importPackageJson, validatePackage } from '../src/content/importer';
import { contentPackage, type ContentPackage } from '../src/content/schema';
import { pkg2014 } from './fixtures/packages';

const use = (o: Partial<Record<string, boolean>> = {}) => ({ storeMechanics: true, storeText: true, displayText: true, exportText: true, share: true, ...o });
const base = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  formatVersion: 1, kind: 'content', id: 'hb', name: 'HB', version: '1.0.0', language: 'ru', edition: '2014', namespace: 'hb', origin: 'homebrew',
  source: { id: 'hb', title: 'Мой хоумбрю', edition: '2014', documentVersion: '1', license: { code: 'homebrew-own' }, allowedUse: use() },
  items, ...extra,
});
const feat = (id: string, effects: unknown[] = [], edition = '2014') => ({ id, name: id, edition, type: 'feat', text: { body: 'Описание' }, mechanics: { effects } });
const codes = (r: ReturnType<typeof importPackageJson>) => [...r.errors, ...r.warnings].map((e) => e.code);

describe('импорт пакетов', () => {
  it('битый JSON и нарушение схемы — понятные ошибки', () => {
    expect(codes(importPackageJson('{oops', []))).toEqual(['bad-json']);
    const r = importPackageJson(JSON.stringify({ formatVersion: 1 }), []);
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.code).toBe('schema');
  });
  it('корректный хоумбрю проходит, сводка по типам', () => {
    const r = importPackageJson(JSON.stringify(base([feat('hb:feat/tough-guy', [{ type: 'hp.flat', value: '2 * level.total' }])])), [pkg2014]);
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({ feat: 1 });
  });
  it('висящая ссылка, плохая формула, чужая редакция, дубликат, чужое пространство имён', () => {
    const r = importPackageJson(JSON.stringify(base([
      feat('hb:feat/a', [{ type: 'spell.grant', spell: 'hb:spell/missing' }]),
      feat('hb:feat/b', [{ type: 'resource', id: 'x', label: 'x', max: 'evil()', recharge: 'long' }]),
      feat('hb:feat/c', [], '2024'),
      feat('hb:feat/a'),
      feat('zz:feat/d'),
    ])), []);
    expect(codes(r)).toEqual(expect.arrayContaining(['dangling-ref', 'bad-formula', 'edition-mismatch', 'duplicate-uid', 'foreign-namespace']));
  });
  it('конфликт идентификатора и возможный дубликат по названию', () => {
    const r = importPackageJson(JSON.stringify(base([{ ...feat('t14:feat/alert'), name: 'Alert' }, { ...feat('hb:feat/alert2'), name: 'Alert' }])), [pkg2014]);
    expect(codes(r)).toEqual(expect.arrayContaining(['uid-conflict', 'possible-duplicate']));
  });
  it('лицензия без права хранить текст — тексты убираются', () => {
    const p = contentPackage.parse(base([feat('hb:feat/a')], { source: { id: 'hb', title: 'Книга', edition: '2014', documentVersion: '1', license: { code: 'user-owned-private' }, allowedUse: use({ storeText: false, exportText: false, share: false }) } }));
    const r = validatePackage(p, []);
    expect(codes(r)).toContain('text-stripped');
    expect(r.sanitized!.kind === 'content' && r.sanitized!.items[0]!.text).toBeUndefined();
  });
  it('неизвестные права и запрет хранить механику — импорт элементов невозможен', () => {
    const p = contentPackage.parse(base([feat('hb:feat/a')], { source: { id: 'hb', title: 'Книга', edition: '2014', documentVersion: '1', license: { code: 'unknown' }, allowedUse: use({ storeMechanics: false, storeText: false }) } }));
    expect(codes(validatePackage(p, []))).toEqual(expect.arrayContaining(['license-unknown', 'mechanics-not-allowed']));
  });
  it('пакет перевода: цель должна быть установлена, сироты — предупреждение', () => {
    const tr = (target: string) => contentPackage.parse({
      formatVersion: 1, kind: 'translation', id: 'tr', name: 'RU', version: '1.0.0', language: 'ru', origin: 'homebrew',
      source: { id: 'tr', title: 'Перевод', edition: 'any', documentVersion: '1', license: { code: 'homebrew-own' }, allowedUse: use() },
      target: { packageId: target, range: '^1.0.0' }, entries: [{ uid: 't14:feat/alert', name: 'Бдительный' }, { uid: 't14:feat/nope', name: '???' }],
    }) as ContentPackage;
    expect(codes(validatePackage(tr('missing'), [pkg2014]))).toContain('translation-target-missing');
    const ok = validatePackage(tr('test-2014'), [pkg2014]);
    expect(ok.ok).toBe(true);
    expect(codes(ok)).toContain('translation-orphans');
  });
});
