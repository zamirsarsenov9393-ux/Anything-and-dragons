/** Настоящие пакеты SRD 5.1 и 5.2: импорт, проверки и расчёт персонажей всех классов. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contentPackage, type ContentPackage } from '../src/content/schema';
import { importPackageJson, validatePackage } from '../src/content/importer';
import { MemoryResolver } from '../src/content/resolver';
import { compute } from '../src/core/engine/compute';
import { autoResolve } from '../src/core/engine/auto';
import { build, levels } from './fixtures/build';
import type { ContentUid } from '../src/core/types';

const raw51 = readFileSync('content/packages/srd-5-1.json', 'utf8');
const raw52 = readFileSync('content/packages/srd-5-2.json', 'utf8');
const srd51 = contentPackage.parse(JSON.parse(raw51));
const srd52 = contentPackage.parse(JSON.parse(raw52));
const R = new MemoryResolver([srd51, srd52]);
const errors = (r: ReturnType<typeof compute>) => r.issues.filter((i) => i.severity === 'error');

const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];

describe('импорт пакетов SRD', () => {
  it('оба пакета проходят проверку без ошибок', () => {
    expect(importPackageJson(raw51, []).errors).toEqual([]);
    expect(importPackageJson(raw52, [srd51]).errors).toEqual([]);
  });
  it('повторный импорт того же пакета рядом с другим — конфликт идентификаторов', () => {
    const copy = { ...srd51, id: 'srd-5-1-copy' } as ContentPackage;
    expect(validatePackage(copy, [srd51]).errors.some((e) => e.code === 'uid-conflict')).toBe(true);
  });
  it('у каждого источника есть лицензия и атрибуция CC-BY', () => {
    for (const p of [srd51, srd52]) {
      expect(p.source.license.code).toBe('CC-BY-4.0');
      expect(p.source.license.attribution).toMatch(/Creative Commons Attribution 4\.0/);
    }
  });
  it('12 классов, 12 подклассов, заклинания и снаряжение в обеих редакциях', () => {
    for (const p of [srd51, srd52]) {
      if (p.kind !== 'content') throw new Error();
      const n = (t: string) => p.items.filter((i) => i.type === t).length;
      expect(n('class')).toBe(12);
      expect(n('subclass')).toBe(12);
      expect(n('spell')).toBeGreaterThan(300);
      expect(n('weapon')).toBeGreaterThan(30);
      expect(n('armor')).toBe(13);
    }
  });
});

describe.each(['2014', '2024'] as const)('все классы %s, уровни 1 и 20, быстрое создание', (ed) => {
  const ns = ed === '2014' ? 'srd51' : 'srd52';
  const species = ed === '2014' ? 'srd51:species/human' : 'srd52:species/human';
  const background = ed === '2014' ? 'srd51:background/acolyte' : 'srd52:background/soldier';
  it.each(CLASSES)('%s', (cls) => {
    for (const lvl of [1, 20]) {
      const b0 = build(ed, { base: [15, 14, 13, 12, 10, 8], speciesUid: species as ContentUid, backgroundUid: background as ContentUid, levels: levels(ns, Array(lvl).fill(cls)) });
      const b = autoResolve(b0, R);
      const r = compute(b, R);
      expect(errors(r)).toEqual([]);
      expect(r.pending.filter((p) => p.required)).toEqual([]);
      expect(r.sheet.hitPointsMax.value).toBeGreaterThan(0);
      expect(r.sheet.totalLevel).toBe(lvl);
    }
  });
});

describe('эталоны на настоящих данных', () => {
  it('2014 · холмовой дварф, жрец 1 (Жизнь) в кольчуге со щитом', () => {
    const b = autoResolve(build('2014', {
      base: [14, 10, 13, 8, 15, 12], speciesUid: 'srd51:subspecies/hill-dwarf' as ContentUid, backgroundUid: 'srd51:background/acolyte' as ContentUid,
      levels: levels('srd51', ['cleric'], { 1: { 'srd51:class/cleric#subclass': ['srd51:subclass/life'] } }),
    }), R);
    const r = compute(b, R, { equipment: [{ uid: 'srd51:armor/chain-mail' as ContentUid, slot: 'armor' }, { uid: 'srd51:armor/shield' as ContentUid, slot: 'shield' }] });
    expect(errors(r)).toEqual([]);
    expect(r.sheet.hitPointsMax.value).toBe(11);
    expect(r.sheet.armorClass.value).toBe(18);
    expect(r.sheet.speed.walk!.value).toBe(25);
    expect(r.sheet.senses.darkvision).toBe(60);
    expect(r.sheet.spellcasting[0]!.preparedMax).toBe(4);
    expect(r.sheet.grantedSpells.map((g) => g.uid)).toEqual(expect.arrayContaining(['srd51:spell/bless', 'srd51:spell/cure-wounds']));
    expect(r.sheet.grantedSpells.map((g) => g.uid)).not.toContain('srd51:spell/spiritual-weapon');
    expect(r.issues.find((i) => i.code === 'armor-not-proficient')).toBeUndefined();
  });
  it('2014 · жрец 3 (Жизнь) получает заклинания домена 3 уровня', () => {
    const b = autoResolve(build('2014', { base: [10, 10, 14, 10, 16, 10], levels: levels('srd51', ['cleric', 'cleric', 'cleric'], { 1: { 'srd51:class/cleric#subclass': ['srd51:subclass/life'] } }) }), R);
    expect(compute(b, R).sheet.grantedSpells.map((g) => g.uid)).toContain('srd51:spell/spiritual-weapon');
  });
  it('2014 · варвар 20: ярость безгранична (99), СИЛ и ТЕЛ до 24', () => {
    const b = autoResolve(build('2014', { base: [15, 13, 14, 8, 12, 10], levels: levels('srd51', Array(20).fill('barbarian')) }), R);
    const s = compute(b, R).sheet;
    expect(s.resources.find((x) => x.id === 'rage')?.max).toBe(99);
    expect(s.abilities.str.value).toBe(24);
    expect(s.abilities.con.value).toBeGreaterThanOrEqual(18);
    expect(s.attacksPerAction).toBe(2);
    expect(s.armorClass.value).toBe(10 + s.modifiers.dex + s.modifiers.con);
  });
  it('2014 · монах 10: скорость +20 без доспехов', () => {
    const b = autoResolve(build('2014', { base: [10, 15, 13, 8, 14, 12], speciesUid: 'srd51:species/human' as ContentUid, levels: levels('srd51', Array(10).fill('monk')) }), R);
    expect(compute(b, R).sheet.speed.walk!.value).toBe(50);
  });
  it('2014 · колдун 5: 2 ячейки 3 круга и 3 воззвания', () => {
    const b = autoResolve(build('2014', { base: [8, 14, 13, 12, 10, 15], levels: levels('srd51', Array(5).fill('warlock')) }), R);
    const r = compute(b, R);
    expect(r.sheet.spellSlots.pact).toEqual({ count: 2, slotLevel: 3 });
    const inv = b.levels.flatMap((l) => l.choices).filter((c) => c.choiceId.includes('invocations'));
    expect(inv.reduce((n, c) => n + c.selected.length, 0)).toBe(3);
  });
  it('2014 · плут 6: компетентность на 1 и 6 уровне — четыре навыка', () => {
    const b = autoResolve(build('2014', { base: [8, 15, 14, 12, 10, 13], levels: levels('srd51', Array(6).fill('rogue')) }), R);
    const s = compute(b, R).sheet;
    expect(Object.values(s.skills).filter((x) => x.proficiency === 2)).toHaveLength(4);
  });
  it('2024 · воин 1, человек-солдат: «Бдительный» от черты «Разносторонний», мастерство оружия 3', () => {
    const b = autoResolve(build('2024', { base: [15, 14, 13, 12, 10, 8], speciesUid: 'srd52:species/human' as ContentUid, backgroundUid: 'srd52:background/soldier' as ContentUid, levels: levels('srd52', ['fighter']) }), R);
    const r = compute(b, R);
    expect(errors(r)).toEqual([]);
    expect(r.sheet.weaponMasteryCount).toBe(3);
    expect(r.sheet.initiative.value).toBe(r.sheet.modifiers.dex + 2);
    expect(r.sheet.resources.find((x) => x.id === 'second-wind')?.max).toBe(2);
    expect(r.sheet.abilities.str.value).toBe(17);
  });
  it('2024 · паладин 1: 2 ячейки 1 круга, 2 подготовленных', () => {
    const b = autoResolve(build('2024', { base: [15, 10, 13, 8, 12, 14], levels: levels('srd52', ['paladin']) }), R);
    const s = compute(b, R).sheet;
    expect(s.spellSlots.standard).toEqual([2]);
    expect(s.spellcasting[0]!.preparedMax).toBe(2);
  });
  it('2024 · волшебник 5 / жрец 3 → ячейки уровня заклинателя 8', () => {
    const b = autoResolve(build('2024', { base: [8, 14, 13, 15, 14, 10], levels: levels('srd52', [...Array(5).fill('wizard'), 'cleric', 'cleric', 'cleric']) }), R);
    const r = compute(b, R);
    expect(errors(r)).toEqual([]);
    expect(r.sheet.spellSlots.standard).toEqual([4, 3, 3, 2]);
  });
});
