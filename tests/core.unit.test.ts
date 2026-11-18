import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { evaluateFormula, parseFormula, validateFormula, FormulaError } from '../src/core/formula';
import { evaluatePredicate } from '../src/core/predicate';
import { rules2014, rules2024, FULL_CASTER_SLOTS } from '../src/core/editions';
import { sha256, canonicalJson } from '../src/content/hash';
import { createHash } from 'node:crypto';

const scope = { abilities: { dex: 16, wis: 14 }, modifiers: { dex: 3, con: 2, wis: 2, cha: -1 }, prof: 3, totalLevel: 7, classLevels: { paladin: 5 } };

describe('формулы', () => {
  it('считает арифметику и переменные', () => {
    expect(evaluateFormula('10 + dex.mod + con.mod', scope)).toBe(15);
    expect(evaluateFormula('max(1, cha.mod + floor(level.class.paladin / 2))', scope)).toBe(1);
    expect(evaluateFormula('prof * 2 - -1', scope)).toBe(7);
    expect(evaluateFormula('dex.score', scope)).toBe(16);
    expect(evaluateFormula('level.class.wizard', scope)).toBe(0);
  });
  it('таблица по уровню', () => {
    expect(evaluateFormula('table(level.class.paladin, 1, 2, 3, 4, 5, 6)', scope)).toBe(5);
    expect(evaluateFormula('table(level.class.wizard, 7, 8)', scope)).toBe(7);
    expect(evaluateFormula('table(30, 7, 8)', scope)).toBe(8);
    expect(evaluateFormula('table(3)', scope)).toBe(0);
  });
  it('округляет итог вниз и не делит на ноль', () => {
    expect(evaluateFormula('7 / 2', scope)).toBe(3);
    expect(evaluateFormula('5 / 0', scope)).toBe(0);
  });
  it('отклоняет неизвестные имена, функции и мусор', () => {
    expect(validateFormula('foo.bar')).toMatch(/Неизвестная переменная/);
    expect(validateFormula('alert(1)')).toMatch(/Неизвестная функция/);
    expect(validateFormula('1 +')).toMatch(/конец/);
    expect(validateFormula('(1')).toMatch(/Ожидалось/);
    expect(validateFormula('1 2')).toMatch(/Лишние/);
    expect(validateFormula('constructor')).not.toBeNull();
    expect(validateFormula('1; 2')).toMatch(/Недопустимый символ/);
  });
  it('на любой строке либо разбирает, либо кидает FormulaError — без других исключений', () => {
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (s) => {
      try { parseFormula(s); } catch (e) { expect(e).toBeInstanceOf(FormulaError); }
    }), { numRuns: 2000 });
  });
});

describe('условия', () => {
  const ps = { armor: 'none' as const, shield: false, classLevels: { 'x:class/monk': 2 }, totalLevel: 2, abilities: { dex: 14 }, features: new Set<string>(), proficiencies: new Set(['armor:heavy']), equipped: new Set<string>(), attuned: new Set<string>() };
  it('вложенные all/any/not', () => {
    expect(evaluatePredicate({ all: [{ armor: 'none' }, { shield: false }] }, ps)).toBe(true);
    expect(evaluatePredicate({ any: [{ armor: 'heavy' }, { not: { shield: true } }] }, ps)).toBe(true);
    expect(evaluatePredicate({ armor: 'any' }, ps)).toBe(false);
    expect(evaluatePredicate({ classLevel: { class: 'x:class/monk', min: 3 } }, ps)).toBe(false);
    expect(evaluatePredicate({ abilityMin: { ability: 'dex', value: 13 } }, ps)).toBe(true);
    expect(evaluatePredicate({ proficient: 'armor:heavy' }, ps)).toBe(true);
    expect(evaluatePredicate(undefined, ps)).toBe(true);
  });
});

describe('редакции', () => {
  it('модификатор = ⌊(x−10)/2⌋ для любых значений', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), (x) => {
      expect(rules2014.abilityModifier(x)).toBe(Math.floor((x - 10) / 2));
    }));
    expect(rules2014.abilityModifier(1)).toBe(-5);
    expect(rules2014.abilityModifier(30)).toBe(10);
  });
  it('бонус мастерства: 2,2,2,2,3,…,6 и не убывает', () => {
    const t = Array.from({ length: 20 }, (_, i) => rules2024.proficiencyBonus(i + 1));
    expect(t).toEqual([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
  });
  it('мультикласс из одних полных заклинателей = таблица одиночного класса суммарного уровня', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), (a, b) => {
      const cl = rules2014.multiclassCasterLevel([
        { classUid: 'x:class/a', classLevel: a, progression: 'full' },
        { classUid: 'x:class/b', classLevel: b, progression: 'full' },
      ]);
      expect(rules2014.spellSlotsForCasterLevel(cl)).toEqual(FULL_CASTER_SLOTS[a + b - 1]);
    }));
  });
  it('одиночный полузаклинатель: 2014 без ячеек на 1 уровне, 2024 с ячейками', () => {
    const pal = (lvl: number) => [{ classUid: 'x:class/paladin' as const, classLevel: lvl, progression: 'half' as const }];
    expect(rules2014.spellSlotsForCasterLevel(rules2014.multiclassCasterLevel(pal(1)))).toEqual([]);
    expect(rules2024.spellSlotsForCasterLevel(rules2024.multiclassCasterLevel(pal(1)))).toEqual([2]);
    expect(rules2014.spellSlotsForCasterLevel(rules2014.multiclassCasterLevel(pal(5)))).toEqual([4, 2]);
    expect(rules2014.spellSlotsForCasterLevel(rules2014.multiclassCasterLevel(pal(20)))).toEqual([4, 3, 3, 3, 2]);
  });
  it('одиночный третичный заклинатель: с 3 уровня', () => {
    const ek = (lvl: number) => [{ classUid: 'x:class/fighter' as const, classLevel: lvl, progression: 'third' as const }];
    expect(rules2014.multiclassCasterLevel(ek(2))).toBe(0);
    expect(rules2014.spellSlotsForCasterLevel(rules2014.multiclassCasterLevel(ek(3)))).toEqual([2]);
    expect(rules2014.spellSlotsForCasterLevel(rules2014.multiclassCasterLevel(ek(7)))).toEqual([4, 2]);
  });
  it('хиты: максимум на 1 уровне, среднее дальше, минимум 1', () => {
    expect(rules2014.hpAtLevel({ hitDie: 10, conMod: 2, isFirstCharacterLevel: true, method: 'average' })).toBe(12);
    expect(rules2014.hpAtLevel({ hitDie: 10, conMod: 2, isFirstCharacterLevel: false, method: 'average' })).toBe(8);
    expect(rules2014.hpAtLevel({ hitDie: 6, conMod: -3, isFirstCharacterLevel: false, method: 'rolled', roll: 1 })).toBe(1);
    expect(rules2014.hpAtLevel({ hitDie: 8, conMod: 0, isFirstCharacterLevel: false, method: 'max' })).toBe(8);
  });
  it('грузоподъёмность = СИЛ × 15 с поправкой на размер', () => {
    expect(rules2014.carryingCapacity(15, 'medium')).toBe(225);
    expect(rules2014.carryingCapacity(10, 'large')).toBe(300);
  });
});

describe('хэш', () => {
  it('SHA-256 совпадает с эталоном', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('совпадает с node:crypto на случайных строках, включая кириллицу и длинные', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s: string) => {
      expect(sha256(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }), { numRuns: 500 });
  });
  it('канонический JSON не зависит от порядка ключей', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
});
