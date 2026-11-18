/** Все типы эффектов и выборов на маленьком синтетическом пакете (homebrew, своя механика). */
import { describe, expect, it } from 'vitest';
import { compute } from '../src/core/engine/compute';
import { MemoryResolver } from '../src/content/resolver';
import { contentPackage } from '../src/content/schema';
import { describePredicate, evaluatePredicate } from '../src/core/predicate';
import { pkg2014 } from './fixtures/packages';
import { build, levels } from './fixtures/build';
import type { ContentUid } from '../src/core/types';

const use = { storeMechanics: true, storeText: true, displayText: true, exportText: true, share: true };
const F = (slug: string, effects: unknown[] = [], choices: unknown[] = []) => ({ id: `tx:feature/${slug}`, name: slug, edition: '2014', type: 'feature', mechanics: { effects, choices } });

const pkg = contentPackage.parse({
  formatVersion: 1, kind: 'content', id: 'tx', name: 'Effects test', version: '0.1.0', language: 'ru', edition: '2014', namespace: 'tx', origin: 'homebrew',
  source: { id: 'tx', title: 'Тест эффектов', edition: '2014', documentVersion: '1', license: { code: 'homebrew-own' }, allowedUse: use },
  items: [
    { id: 'tx:species/winged', name: 'Крылатый', edition: '2014', type: 'species', mechanics: { size: ['small'], speed: 30,
      effects: [{ type: 'speed', mode: 'fly', op: 'equalWalk' }],
      choices: [
        { key: 'tool', label: 'Инструмент', pick: 1, from: { list: ['smith-tools', 'brewer-supplies'] }, grants: 'proficiency.tool' },
        { key: 'abilities', label: 'Характеристики', pick: 2, from: { list: ['str', 'dex', 'int'] }, grants: 'ability.bonus' },
      ] } },
    { id: 'tx:background/sage', name: 'Мудрец', edition: '2014', type: 'background', mechanics: {
      choices: [
        { key: 'languages', label: 'Языки', pick: 2, from: { list: ['elvish', 'dwarvish', 'draconic'] }, grants: 'proficiency.language' },
        { key: 'cantrip', label: 'Заговор', pick: 1, from: { query: { type: 'spell', where: { level: 0 } } }, grants: 'spell' },
        { key: 'kit', label: 'Набор', pick: 1, from: { list: ['tx:gear/ink'] }, grants: 'item' },
      ] } },
    { id: 'tx:spell/light', name: 'Свет', edition: '2014', type: 'spell', mechanics: { level: 0, school: 'evocation', castingTime: '1 action', range: { kind: 'touch' }, components: { v: true, s: false, m: 'firefly' }, duration: '1 hour', concentration: false, ritual: false, classes: [] } },
    { id: 'tx:spell/shield', name: 'Щит', edition: '2014', type: 'spell', mechanics: { level: 1, school: 'abjuration', castingTime: '1 reaction', range: { kind: 'self' }, components: { v: true, s: true }, duration: '1 round', concentration: false, ritual: false, classes: [] } },
    { id: 'tx:class/skald', name: 'Скальд', edition: '2014', type: 'class', mechanics: {
      hitDie: 8, primaryAbilities: ['cha'], savingThrows: ['dex', 'cha'], startingProficiencies: [{ type: 'proficiency', category: 'armor', id: 'light' }],
      multiclass: { prerequisite: { abilityMin: { ability: 'cha', value: 13 } }, proficiencies: [], skillChoice: { key: 'skills', label: 'Навык', pick: 1, from: { list: ['performance'] }, grants: 'proficiency.skill' } },
      skillChoice: { key: 'skills', label: 'Навыки', pick: 1, from: { list: ['performance', 'history'] }, grants: 'proficiency.skill' },
      subclassLevel: 3, asiLevels: [4],
      progression: [{ level: 1, features: ['tx:feature/invocations'] }, { level: 2, features: ['tx:feature/jack', 'tx:feature/blessing-a', 'tx:feature/blessing-b', 'tx:feature/swim'] }],
    } },
    { id: 'tx:class/warrior', name: 'Боец', edition: '2014', type: 'class', mechanics: {
      hitDie: 10, primaryAbilities: ['str'], savingThrows: ['str', 'con'], startingProficiencies: [],
      multiclass: { prerequisite: { abilityMin: { ability: 'str', value: 13 } }, proficiencies: [] },
      skillChoice: { key: 'skills', label: 'Навыки', pick: 1, from: { list: ['athletics'] }, grants: 'proficiency.skill' },
      subclassLevel: 3, asiLevels: [], progression: [],
    } },
    { id: 'tx:subclass/arcane-blade', name: 'Чародейский клинок', edition: '2014', type: 'subclass', mechanics: { class: 'tx:class/skald', progression: [], spellcasting: { ability: 'int', progression: 'third', spellList: 'tx:spell-list/wizard' } } },
    F('invocations', [], [{ key: 'pick', label: 'Воззвание', pick: 1, atLevels: [1, 3], from: { list: ['tx:feature/fleet', 'tx:feature/fleet2', 'tx:feature/tough', 'tx:feature/belt', 'tx:feature/primal'] }, grants: 'feature' }]),
    F('fleet', [{ type: 'speed', mode: 'walk', op: 'bonus', value: 10, stackKey: 'fleet' }]),
    F('fleet2', [{ type: 'speed', mode: 'walk', op: 'bonus', value: 5, stackKey: 'fleet' }]),
    F('tough', [{ type: 'hp.flat', value: '2 * level.total' }]),
    F('belt', [{ type: 'ability.set', ability: 'str', value: 21 }]),
    F('primal', [{ type: 'ability.maxIncrease', ability: 'str', value: 4 }, { type: 'ability.bonus', ability: 'str', value: 4 }]),
    F('jack', [{ type: 'halfProficiency', scope: 'ability-checks' }]),
    F('blessing-a', [{ type: 'ability.bonus', ability: 'cha', value: 2, stackKey: 'blessing' }]),
    F('blessing-b', [{ type: 'ability.bonus', ability: 'cha', value: 1, stackKey: 'blessing' }]),
    F('swim', [{ type: 'speed', mode: 'swim', op: 'set', value: 30 }, { type: 'speed', mode: 'swim', op: 'set', value: 20 }]),
    { id: 'tx:weapon/longsword', name: 'Длинный меч', edition: 'any', type: 'weapon', mechanics: { category: 'martial', kind: 'melee', damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatile: '1d10' } },
    { id: 'tx:magic-item/flame-blade', name: 'Пламенный клинок', edition: 'any', type: 'magic-item', mechanics: { rarity: 'rare', attunement: false, baseItem: 'tx:weapon/longsword', effects: [{ type: 'damage.resistance', damageType: 'fire', level: 'resistance' }] } },
    { id: 'tx:magic-item/ghost-armor', name: 'Призрачный доспех', edition: 'any', type: 'magic-item', mechanics: { rarity: 'rare', attunement: false, baseItem: 'tx:armor/missing', effects: [] } },
  ],
});
const R = new MemoryResolver([pkg, pkg2014]);
const codes = (r: ReturnType<typeof compute>) => r.issues.map((i) => i.code);
const skald = (n: number, choices: Record<number, Record<string, string[]>> = {}, base: [number, number, number, number, number, number] = [15, 12, 14, 13, 10, 14]) =>
  build('2014', { base, speciesUid: 'tx:species/winged' as ContentUid, backgroundUid: 'tx:background/sage' as ContentUid, levels: levels('tx', Array(n).fill('skald'), choices) });

describe('выборы вида и предыстории', () => {
  const b = { ...skald(1), originChoices: [
    { choiceId: 'tx:species/winged#tool', selected: ['smith-tools'] },
    { choiceId: 'tx:species/winged#abilities', selected: ['str', 'int'] },
    { choiceId: 'tx:background/sage#languages', selected: ['elvish', 'draconic'] },
    { choiceId: 'tx:background/sage#cantrip', selected: ['tx:spell/light'] },
    { choiceId: 'tx:background/sage#kit', selected: ['tx:gear/ink'] },
  ] };
  const s = compute(b, R).sheet;
  it('инструмент, языки, +1 к двум характеристикам', () => {
    expect(s.proficiencies.tool).toContain('smith-tools');
    expect(s.proficiencies.language).toEqual(['elvish', 'draconic']);
    expect(s.abilities.str.value).toBe(16);
    expect(s.abilities.int.value).toBe(14);
  });
  it('заговор из запроса к библиотеке (только 0 круг)', () => {
    expect(s.grantedSpells.map((g) => g.uid)).toEqual(['tx:spell/light']);
    const bad = compute({ ...b, originChoices: [...b.originChoices.slice(0, 3), { choiceId: 'tx:background/sage#cantrip', selected: ['tx:spell/shield'] }] }, R);
    expect(codes(bad)).toContain('choice-invalid');
  });
  it('маленький размер, полёт равен ходьбе', () => {
    expect(s.size).toBe('small');
    expect(s.speed.fly!.value).toBe(30);
  });
});

describe('повторяемые выборы и правила сложения', () => {
  it('выбор на 1 и 3 уровне класса; бонусы скорости с одним ключом не складываются', () => {
    const r = compute(skald(3, { 1: { 'tx:feature/invocations#pick@1': ['tx:feature/fleet'] }, 3: { 'tx:feature/invocations#pick@3': ['tx:feature/fleet2'] } }), R);
    expect(r.sheet.speed.walk!.value).toBe(40);
    expect(r.pending.map((p) => p.choiceId)).not.toContain('tx:feature/invocations#pick@3');
  });
  it('на 2 уровне второй выбор ещё не открыт', () => {
    const r = compute(skald(2), R);
    expect(r.pending.map((p) => p.choiceId)).toContain('tx:feature/invocations#pick@1');
    expect(r.pending.map((p) => p.choiceId)).not.toContain('tx:feature/invocations#pick@3');
  });
  it('повышение предела характеристики и «установить значение»', () => {
    const r = compute(skald(3, { 1: { 'tx:feature/invocations#pick@1': ['tx:feature/primal'] }, 3: { 'tx:feature/invocations#pick@3': ['tx:feature/belt'] } }), R);
    expect(r.sheet.abilities.str.value).toBe(21);
    const primalOnly = compute(skald(1, { 1: { 'tx:feature/invocations#pick@1': ['tx:feature/primal'] } }, [19, 12, 14, 13, 10, 14]), R);
    expect(primalOnly.sheet.abilities.str.value).toBe(23);
    const beltLow = compute(skald(1, { 1: { 'tx:feature/invocations#pick@1': ['tx:feature/belt'] } }, [23, 12, 14, 13, 10, 14]), R);
    expect(beltLow.sheet.abilities.str.value).toBe(23);
    expect(beltLow.sheet.abilities.str.components.at(-1)!.kind).toBe('ignored');
  });
  it('хиты по формуле: 2 × уровень', () => {
    const r = compute(skald(3, { 1: { 'tx:feature/invocations#pick@1': ['tx:feature/tough'] } }), R);
    expect(r.sheet.hitPointsMax.value).toBe(8 + 2 + 2 * (5 + 2) + 6);
  });
  it('одинаковый ключ у бонусов характеристики: +2 остаётся, +1 помечен', () => {
    const s = compute(skald(2), R).sheet;
    expect(s.abilities.cha.value).toBe(16);
    expect(s.abilities.cha.components.some((c) => c.kind === 'ignored' && c.note === 'не складывается')).toBe(true);
  });
  it('мастер на все руки: половина бонуса к навыкам без владения и к инициативе', () => {
    const s = compute(skald(2), R).sheet;
    expect(s.skills.arcana!.proficiency).toBe(0.5);
    expect(s.skills.arcana!.value).toBe(1 + 1);
    expect(s.initiative.value).toBe(1 + 1);
  });
  it('скорость плавания: из двух «установить» берётся большая', () => expect(compute(skald(2), R).sheet.speed.swim!.value).toBe(30));
});

describe('подкласс-заклинатель и мультикласс', () => {
  it('третичный заклинатель через подкласс: ячейки с 3 уровня', () => {
    const s = compute(skald(3, { 3: { 'tx:class/skald#subclass': ['tx:subclass/arcane-blade'] } }), R).sheet;
    expect(s.spellcasting[0]!.ability).toBe('int');
    expect(s.spellcasting[0]!.saveDc.value).toBe(8 + 2 + 1);
    expect(s.spellSlots.standard).toEqual([2]);
  });
  it('чужой подкласс — ошибка', () => {
    expect(codes(compute(skald(3, { 3: { 'tx:class/skald#subclass': ['t14:subclass/champion'] } }), R))).toContain('choice-invalid');
  });
  it('выбор навыка при мультиклассе', () => {
    const b = build('2014', { base: [15, 12, 14, 13, 10, 14], levels: levels('tx', ['warrior', 'skald']) });
    expect(compute(b, R).pending.map((p) => p.choiceId)).toContain('tx:class/skald#skills@mc');
  });
});

describe('экипировка', () => {
  const b = build('2014', { base: [16, 10, 10, 10, 10, 10], levels: levels('t14', ['fighter']) });
  it('магическое оружие на базе обычного: бонус к атаке и урону, эффекты предмета', () => {
    const s = compute(b, R, { equipment: [{ uid: 'tx:magic-item/flame-blade' as ContentUid, slot: 'main-hand', magicBonus: 1 }] }).sheet;
    expect(s.attacks[0]!.toHit.value).toBe(3 + 2 + 1);
    expect(s.attacks[0]!.damage).toBe('1d8+4');
    expect(s.damageModifiers).toContainEqual({ damageType: 'fire', level: 'resistance' });
  });
  it('предметы без слота не учитываются; битая ссылка базового предмета — ошибка', () => {
    const r = compute(b, R, { equipment: [{ uid: 'tx:weapon/longsword' as ContentUid, slot: null }, { slot: 'armor' }, { uid: 'tx:magic-item/ghost-armor' as ContentUid, slot: 'armor' }] });
    expect(r.sheet.attacks).toEqual([]);
    expect(codes(r)).toContain('content-missing');
  });
  it('щит без владения — предупреждение', () => {
    const w = build('2014', { base: [10, 10, 10, 16, 10, 10], levels: levels('t14', ['wizard']) });
    expect(codes(compute(w, R, { equipment: [{ uid: 't14:armor/shield' as ContentUid, slot: 'shield' }] }))).toContain('shield-not-proficient');
  });
  it('без владения оружием — без бонуса мастерства; урон без модификатора пишется как кость', () => {
    const w = build('2014', { base: [10, 10, 10, 16, 10, 10], levels: levels('t14', ['wizard']) });
    const s = compute(w, R, { equipment: [{ uid: 't14:weapon/longsword' as ContentUid, slot: 'main-hand' }] }).sheet;
    expect(s.attacks[0]!.toHit.value).toBe(0);
    expect(s.attacks[0]!.damage).toBe('1d8');
  });
});

describe('ошибки журнала решений', () => {
  it('элемент не того типа', () => {
    const b = build('2014', { base: [10, 10, 10, 10, 10, 10], speciesUid: 't14:class/fighter' as ContentUid });
    expect(codes(compute(b, R))).toContain('content-type');
  });
  it('нарушена последовательность уровней', () => {
    const lv = levels('t14', ['fighter', 'fighter']);
    lv[1] = { ...lv[1]!, characterLevel: 3, classLevel: 5 };
    expect(codes(compute(build('2014', { base: [15, 10, 10, 10, 10, 10], levels: lv }), R)).filter((c) => c === 'level-sequence')).toHaveLength(2);
  });
  it('УХ с одной характеристикой — ошибка', () => {
    const b = build('2014', { base: [15, 10, 10, 10, 10, 10], levels: levels('t14', Array(4).fill('fighter'), { 4: { 't14:class/fighter#asi@4': ['str'] } }) });
    expect(codes(compute(b, R))).toContain('asi-invalid');
  });
  it('черта взята дважды', () => {
    const b = build('2014', { base: [15, 10, 10, 10, 10, 10], levels: levels('t14', Array(6).fill('fighter'), { 4: { 't14:class/fighter#asi@4': ['t14:feat/alert'] }, 6: { 't14:class/fighter#asi@6': ['t14:feat/alert'] } }) });
    expect(codes(compute(b, R))).toContain('feat-duplicate');
  });
  it('броски: неполный набор; ручной ввод вне 1–30', () => {
    const opt = (abilityMethod: 'roll-4d6' | 'manual') => ({ abilityMethod, hpMethod: 'average' as const, allowFeats: false, allowMulticlass: true, allowCrossEdition: false, variantRules: [] });
    expect(codes(compute(build('2014', { base: [10, 10, 10, 10, 10, 10], rolledPool: [10, 10], options: opt('roll-4d6') }), R))).toContain('roll-pool');
    expect(codes(compute(build('2014', { base: [31, 10, 10, 10, 10, 10], options: opt('manual') }), R))).toContain('ability-range');
  });
});

describe('условия: остальные типы', () => {
  const ps = { armor: 'heavy' as const, shield: true, classLevels: {}, totalLevel: 5, abilities: {}, features: new Set(['f']), proficiencies: new Set<string>(), equipped: new Set(['e']), attuned: new Set(['a']) };
  it('особенность, экипировка, настройка, общий уровень', () => {
    expect(evaluatePredicate({ hasFeature: 'f' }, ps)).toBe(true);
    expect(evaluatePredicate({ equipped: 'e' }, ps)).toBe(true);
    expect(evaluatePredicate({ attuned: 'x' }, ps)).toBe(false);
    expect(evaluatePredicate({ totalLevel: { min: 5 } }, ps)).toBe(true);
    expect(evaluatePredicate({ armor: 'any' }, ps)).toBe(true);
  });
  it('описание условия по-человечески', () => {
    expect(describePredicate({ all: [{ abilityMin: { ability: 'str', value: 13 } }, { any: [{ totalLevel: { min: 4 } }, { not: { classLevel: { class: 'x:class/y', min: 2 } } }] }] }))
      .toBe('STR 13+ и уровень 4+ или не (x:class/y 2+)');
    expect(describePredicate({ shield: true })).toBe('{"shield":true}');
  });
});
