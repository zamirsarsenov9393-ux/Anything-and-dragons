/**
 * Эталонные персонажи из плана тестирования (docs/ARCHITECTURE.md, раздел 8).
 * Ожидаемые числа посчитаны вручную по правилам SRD.
 */
import { describe, expect, it } from 'vitest';
import { compute } from '../src/core/engine/compute';
import { MemoryResolver } from '../src/content/resolver';
import { pkg2014, pkg2024 } from './fixtures/packages';
import { build, levels } from './fixtures/build';
import type { ContentUid, EquippedItem } from '../src/core/types';

const R = new MemoryResolver([pkg2014, pkg2024]);
const eq = (uid: string, slot: EquippedItem['slot'], extra: Partial<EquippedItem> = {}): EquippedItem => ({ uid: uid as ContentUid, slot, ...extra });
const errors = (r: ReturnType<typeof compute>) => r.issues.filter((i) => i.severity === 'error');

describe('1. 2014 · холмовой дварф, жрец 1 (домен Жизни)', () => {
  const b = build('2014', {
    base: [14, 10, 13, 8, 15, 12], options: { abilityMethod: 'standard-array', hpMethod: 'average', allowFeats: false, allowMulticlass: true, allowCrossEdition: false, variantRules: [] },
    speciesUid: 't14:subspecies/hill-dwarf' as ContentUid, backgroundUid: 't14:background/acolyte' as ContentUid,
    levels: levels('t14', ['cleric'], { 1: { 't14:class/cleric#skills': ['history', 'medicine'], 't14:class/cleric#subclass': ['t14:subclass/life-domain'] } }),
  });
  const r = compute(b, R, { equipment: [eq('t14:armor/chain-mail', 'armor'), eq('t14:armor/shield', 'shield')] });
  const s = r.sheet;

  it('характеристики с бонусами вида', () => {
    expect(s.abilities.con.value).toBe(15);
    expect(s.abilities.wis.value).toBe(16);
    expect(s.modifiers.wis).toBe(3);
  });
  it('хиты: 8 + ТЕЛ 2 + дварфская стойкость 1 = 11', () => expect(s.hitPointsMax.value).toBe(11));
  it('КЗ: кольчуга 16 + щит 2 = 18, без предупреждений о владении (тяжёлые доспехи от домена)', () => {
    expect(s.armorClass.value).toBe(18);
    expect(r.issues.find((i) => i.code === 'armor-not-proficient')).toBeUndefined();
  });
  it('скорость 25, тёмное зрение 60, сопротивление яду', () => {
    expect(s.speed.walk!.value).toBe(25);
    expect(s.senses.darkvision).toBe(60);
    expect(s.damageModifiers).toContainEqual({ damageType: 'poison', level: 'resistance' });
  });
  it('заклинания: СЛ 13, атака +5, подготовить 4, 3 заговора, 2 ячейки', () => {
    const sc = s.spellcasting[0]!;
    expect(sc.saveDc.value).toBe(13);
    expect(sc.attackBonus.value).toBe(5);
    expect(sc.preparedMax).toBe(4);
    expect(sc.cantripsMax).toBe(3);
    expect(s.spellSlots.standard).toEqual([2]);
  });
  it('заклинания домена всегда подготовлены и не занимают лимит', () => {
    expect(s.grantedSpells.map((g) => g.uid)).toEqual(['t14:spell/bless', 't14:spell/cure-wounds']);
    expect(s.grantedSpells.every((g) => g.alwaysPrepared && !g.countsAgainstLimit)).toBe(true);
  });
  it('спасброски и навыки', () => {
    expect(s.savingThrows.wis.value).toBe(5);
    expect(s.savingThrows.wis.proficient).toBe(true);
    expect(s.savingThrows.str.proficient).toBe(false);
    expect(s.skills.religion!.value).toBe(1);
    expect(s.skills.medicine!.value).toBe(5);
    expect(s.passivePerception.value).toBe(13);
  });
  it('без ошибок и незакрытых выборов', () => {
    expect(errors(r)).toEqual([]);
    expect(r.pending).toEqual([]);
  });
  it('разбор КЗ объясняет каждое слагаемое', () => {
    expect(s.armorClass.components.map((c) => c.kind)).toEqual(['formula', 'bonus']);
  });
});

describe('2. 2014 · человек, воин 5 (Чемпион)', () => {
  const b = build('2014', {
    base: [15, 13, 14, 8, 12, 10], options: { abilityMethod: 'standard-array', hpMethod: 'average', allowFeats: true, allowMulticlass: true, allowCrossEdition: false, variantRules: [] },
    speciesUid: 't14:species/human' as ContentUid,
    backgroundUid: 't14:background/acolyte' as ContentUid,
    levels: levels('t14', ['fighter', 'fighter', 'fighter', 'fighter', 'fighter'], {
      1: { 't14:class/fighter#skills': ['athletics', 'perception'], 't14:feature/fighting-style#style': ['t14:feature/fs-defense'] },
      3: { 't14:class/fighter#subclass': ['t14:subclass/champion'] },
      4: { 't14:class/fighter#asi@4': ['str', 'str'] },
    }),
  });
  const r = compute(b, R, { equipment: [eq('t14:armor/chain-mail', 'armor'), eq('t14:armor/shield', 'shield'), eq('t14:weapon/longsword', 'main-hand')] });
  const s = r.sheet;
  it('СИЛ 15 + человек 1 + УХ 2 = 18', () => expect(s.abilities.str.value).toBe(18));
  it('бонус мастерства 3', () => expect(s.proficiencyBonus).toBe(3));
  it('хиты: 10 + 4×6 + ТЕЛ 2×5 = 44', () => expect(s.hitPointsMax.value).toBe(44));
  it('КЗ: кольчуга 16 + щит 2 + стиль «Защита» 1 = 19', () => expect(s.armorClass.value).toBe(19));
  it('дополнительная атака: 2 атаки', () => expect(s.attacksPerAction).toBe(2));
  it('длинный меч: +7, 1d8+4', () => {
    expect(s.attacks[0]!.toHit.value).toBe(7);
    expect(s.attacks[0]!.damage).toBe('1d8+4');
  });
  it('особенность Чемпиона на 3 уровне', () => expect(s.features.some((f) => f.uid === 't14:subclass/champion' && f.level === 3)).toBe(true));
  it('ресурс «Второе дыхание»', () => expect(s.resources).toContainEqual({ id: 'second-wind', label: 'Второе дыхание', max: 1, recharge: 'short' }));
  it('без ошибок и незакрытых выборов', () => {
    expect(errors(r)).toEqual([]);
    expect(r.pending).toEqual([]);
  });
  it('универсальное оружие двумя руками: 1d10', () => {
    const r2 = compute(b, R, { equipment: [eq('t14:weapon/longsword', 'two-hands')] });
    expect(r2.sheet.attacks[0]!.damage).toBe('1d10+4');
    expect(r2.sheet.armorClass.value).toBe(12); // 10 + ЛВК 2, «Защита» без доспеха не работает
  });
});

describe('3. 2014 · варвар 3 / монах 2 — защита без доспехов не складывается', () => {
  const plan = ['barbarian', 'barbarian', 'barbarian', 'monk', 'monk'];
  const mk = (wis: number) => build('2014', { base: [15, 14, 14, 8, wis, 8], levels: levels('t14', plan) });
  it('КЗ 15 (монах), формула варвара 14 помечена как не применённая', () => {
    const s = compute(mk(16), R).sheet;
    expect(s.armorClass.value).toBe(15);
    const ignored = s.armorClass.components.filter((c) => c.kind === 'ignored').map((c) => c.value);
    expect(ignored).toContain(14);
  });
  it('хиты: 12+2, 7+2, 7+2, 5+2, 5+2 = 46', () => expect(compute(mk(16), R).sheet.hitPointsMax.value).toBe(46));
  it('владения мультикласса: монах не даёт спасбросков', () => {
    const s = compute(mk(16), R).sheet;
    expect(s.savingThrows.dex.proficient).toBe(false);
    expect(s.savingThrows.str.proficient).toBe(true);
  });
  it('МДР 12 — ошибка требований мультикласса на 4 уровне', () => {
    const r = compute(mk(12), R);
    const e = r.issues.find((i) => i.code === 'multiclass-prerequisite');
    expect(e?.level).toBe(4);
  });
  it('незакрытый выбор подкласса варвара на 3 уровне', () => {
    expect(compute(mk(16), R).pending.map((p) => p.choiceId)).toContain('t14:class/barbarian#subclass');
  });
});

describe('4–6. ячейки при мультиклассе', () => {
  it('2014 · волшебник 5 / жрец 3 → уровень заклинателя 8', () => {
    const s = compute(build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', ['wizard', 'wizard', 'wizard', 'wizard', 'wizard', 'cleric', 'cleric', 'cleric']) }), R).sheet;
    expect(s.spellSlots.standard).toEqual([4, 3, 3, 2]);
    expect(s.spellcasting).toHaveLength(2);
    expect(s.spellcasting[0]!.preparedMax).toBe(3 + 5);
    expect(s.spellcasting[1]!.preparedMax).toBe(2 + 3);
  });
  it('2014 · паладин 6 / колдун 3 → общие ячейки паладина, договор отдельно', () => {
    const r = compute(build('2014', { base: [15, 10, 14, 8, 10, 15], levels: levels('t14', ['paladin', 'paladin', 'paladin', 'paladin', 'paladin', 'paladin', 'warlock', 'warlock', 'warlock']) }), R);
    expect(r.sheet.spellSlots.standard).toEqual([4, 2]);
    expect(r.sheet.spellSlots.pact).toEqual({ count: 2, slotLevel: 2 });
    expect(r.issues.filter((i) => i.code === 'multiclass-prerequisite')).toEqual([]);
  });
  it('паладин 3 / волшебник 1: 2014 → [3], 2024 → [4, 2] (округление половины уровня)', () => {
    const plan = ['paladin', 'paladin', 'paladin', 'wizard'];
    const base: [number, number, number, number, number, number] = [15, 10, 12, 14, 8, 15];
    expect(compute(build('2014', { base, levels: levels('t14', plan) }), R).sheet.spellSlots.standard).toEqual([3]);
    expect(compute(build('2024', { base, levels: levels('t24', plan) }), R).sheet.spellSlots.standard).toEqual([4, 2]);
  });
});

describe('7. 2024 · человек-солдат, воин 1', () => {
  const b = build('2024', {
    base: [15, 13, 14, 8, 12, 10], options: { abilityMethod: 'standard-array', hpMethod: 'average', allowFeats: true, allowMulticlass: true, allowCrossEdition: false, variantRules: [] },
    speciesUid: 't24:species/human' as ContentUid, backgroundUid: 't24:background/soldier' as ContentUid,
    originChoices: [{ choiceId: 't24:background/soldier#ability-scores', selected: ['str', 'str', 'con'] }],
    levels: levels('t24', ['fighter'], { 1: { 't24:class/fighter#skills': ['perception', 'survival'], 't24:feature/fighting-style#style': ['t24:feature/fs-dueling'] } }),
  });
  const r = compute(b, R);
  it('бонусы характеристик от предыстории: СИЛ 17, ТЕЛ 15', () => {
    expect(r.sheet.abilities.str.value).toBe(17);
    expect(r.sheet.abilities.con.value).toBe(15);
  });
  it('черта происхождения «Бдительный»: инициатива ЛВК 1 + бонус мастерства 2 = 3', () => expect(r.sheet.initiative.value).toBe(3));
  it('мастерство оружия: 3', () => expect(r.sheet.weaponMasteryCount).toBe(3));
  it('хиты 10 + 2 = 12, «Второе дыхание» 2 раза', () => {
    expect(r.sheet.hitPointsMax.value).toBe(12);
    expect(r.sheet.resources.find((x) => x.id === 'second-wind')?.max).toBe(2);
  });
  it('без ошибок и выборов', () => { expect(errors(r)).toEqual([]); expect(r.pending).toEqual([]); });
  it('неверное распределение +2/+1 — ошибка', () => {
    const bad = compute({ ...b, originChoices: [{ choiceId: 't24:background/soldier#ability-scores', selected: ['str', 'str', 'str'] }] }, R);
    expect(bad.issues.map((i) => i.code)).toContain('background-abilities');
    const wrong = compute({ ...b, originChoices: [{ choiceId: 't24:background/soldier#ability-scores', selected: ['str', 'wis', 'con'] }] }, R);
    expect(wrong.issues.map((i) => i.code)).toContain('background-abilities');
  });
  it('без выбора характеристик — незакрытый выбор', () => {
    expect(compute({ ...b, originChoices: [] }, R).pending.map((p) => p.choiceId)).toContain('t24:background/soldier#ability-scores');
  });
});

describe('8. 2024 · плут 3 — компетентность и подкласс', () => {
  const b = build('2024', {
    base: [8, 16, 14, 12, 13, 10],
    levels: levels('t24', ['rogue', 'rogue', 'rogue'], { 1: { 't24:class/rogue#skills': ['stealth', 'perception', 'acrobatics', 'deception'], 't24:feature/expertise#expertise': ['stealth', 'perception'] } }),
  });
  const r = compute(b, R, { equipment: [eq('t24:weapon/rapier', 'main-hand'), eq('t24:armor/leather', 'armor')] });
  it('скрытность: ЛВК 3 + 2×2 = 7, внимательность пассивная 10 + 1 + 4 = 15', () => {
    expect(r.sheet.skills.stealth!.value).toBe(7);
    expect(r.sheet.skills.stealth!.proficiency).toBe(2);
    expect(r.sheet.passivePerception.value).toBe(15);
  });
  it('рапира: фехтовальное оружие через ЛВК, +5, 1d8+3', () => {
    expect(r.sheet.attacks[0]!.toHit.value).toBe(5);
    expect(r.sheet.attacks[0]!.damage).toBe('1d8+3');
  });
  it('КЗ кожаный доспех 11 + ЛВК 3 = 14', () => expect(r.sheet.armorClass.value).toBe(14));
  it('подкласс на 3 уровне не выбран → незакрытый выбор', () => expect(r.pending.filter((p) => !p.choiceId.startsWith('origin#')).map((p) => p.choiceId)).toEqual(['t24:class/rogue#subclass']));
  it('компетентность в навыке без владения — предупреждение', () => {
    const b2 = { ...b, levels: levels('t24', ['rogue'], { 1: { 't24:class/rogue#skills': ['stealth', 'perception', 'acrobatics', 'deception'], 't24:feature/expertise#expertise': ['stealth', 'athletics'] } }) };
    expect(compute(b2, R).issues.map((i) => i.code)).toContain('expertise-without-proficiency');
  });
});

describe('9. воин 20 — полный проход', () => {
  const plan = Array(20).fill('fighter');
  const b = build('2014', { base: [16, 12, 14, 10, 10, 8], levels: levels('t14', plan) });
  const r = compute(b, R);
  it('бонус мастерства 6, четыре атаки', () => {
    expect(r.sheet.proficiencyBonus).toBe(6);
    expect(r.sheet.attacksPerAction).toBe(4);
  });
  it('хиты: 12 + 19×8 = 164', () => expect(r.sheet.hitPointsMax.value).toBe(164));
  it('незакрытые выборы УХ на 4, 6, 8, 12, 14, 16, 19', () => {
    const asi = r.pending.filter((p) => p.choiceId.includes('#asi@')).map((p) => p.level);
    expect(asi).toEqual([4, 6, 8, 12, 14, 16, 19]);
  });
  it('21-й уровень — ошибка', () => {
    const r21 = compute(build('2014', { base: [16, 12, 14, 10, 10, 8], levels: levels('t14', Array(21).fill('fighter')) }), R);
    expect(r21.issues.map((i) => i.code)).toContain('level-cap');
  });
});

describe('10. способы распределения характеристик', () => {
  const opt = (abilityMethod: 'point-buy' | 'standard-array' | 'roll-4d6') => ({ abilityMethod, hpMethod: 'average' as const, allowFeats: false, allowMulticlass: true, allowCrossEdition: false, variantRules: [] });
  const codes = (p: Parameters<typeof build>[1]) => compute(build('2014', p), R).issues.map((i) => i.code);
  it('покупка очков: 27 очков — ок, 36 — ошибка, 16 — ошибка диапазона', () => {
    expect(codes({ base: [15, 15, 15, 8, 8, 8], options: opt('point-buy') })).not.toContain('point-buy-budget');
    expect(codes({ base: [15, 15, 15, 15, 8, 8], options: opt('point-buy') })).toContain('point-buy-budget');
    expect(codes({ base: [16, 8, 8, 8, 8, 8], options: opt('point-buy') })).toContain('point-buy-range');
    expect(codes({ base: [8, 8, 8, 8, 8, 8], options: opt('point-buy') })).toContain('point-buy-unspent');
  });
  it('стандартный набор в любом порядке', () => {
    expect(codes({ base: [8, 10, 12, 13, 14, 15], options: opt('standard-array') })).not.toContain('standard-array');
    expect(codes({ base: [15, 15, 13, 12, 10, 8], options: opt('standard-array') })).toContain('standard-array');
  });
  it('броски должны совпадать с выброшенными значениями', () => {
    expect(codes({ base: [17, 9, 12, 14, 11, 6], rolledPool: [6, 9, 11, 12, 14, 17], options: opt('roll-4d6') })).not.toContain('roll-mismatch');
    expect(codes({ base: [18, 9, 12, 14, 11, 6], rolledPool: [6, 9, 11, 12, 14, 17], options: opt('roll-4d6') })).toContain('roll-mismatch');
  });
});

describe('11. отключённый и удалённый источник', () => {
  const b = build('2014', {
    base: [15, 13, 14, 8, 12, 10], speciesUid: 't14:species/human' as ContentUid,
    levels: levels('t14', ['fighter', 'fighter', 'fighter'], { 1: { 't14:class/fighter#skills': ['athletics', 'perception'], 't14:feature/fighting-style#style': ['t14:feature/fs-defense'] }, 3: { 't14:class/fighter#subclass': ['t14:subclass/champion'] } }),
  });
  const opts = { equipment: [eq('t14:armor/chain-mail', 'armor')] };
  const live = compute(b, R, opts);
  it('без пакета, но со снимками — тот же лист', () => {
    const snaps = R.snapshotOf(live.usedContent);
    const offline = compute(b, new MemoryResolver([], snaps), opts);
    expect(offline.sheet).toEqual(live.sheet);
    expect(offline.issues.some((i) => i.code === 'content-snapshot')).toBe(true);
    expect(offline.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('без пакета и без снимков — не падает, показывает, чего не хватает', () => {
    const bare = compute(b, new MemoryResolver([]), opts);
    expect(bare.issues.filter((i) => i.code === 'content-missing').length).toBeGreaterThan(0);
    expect(bare.sheet.hitPointsMax.value).toBe(0);
    expect(bare.sheet.abilities.str.value).toBe(15);
  });
  it('закреплённые версии содержат пакет, версию и хэш', () => {
    const ref = live.usedContent.find((u) => u.uid === 't14:class/fighter')!;
    expect(ref.packageId).toBe('test-2014');
    expect(ref.packageVersion).toBe('1.0.0');
    expect(ref.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('12. отмена повышения и детерминизм', () => {
  const plan = ['wizard', 'wizard', 'wizard', 'cleric'];
  const b = build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', plan) });
  it('лист без последнего уровня = лист родительской ревизии', () => {
    const parent = build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', plan.slice(0, 3)) });
    expect(compute({ ...b, levels: b.levels.slice(0, -1) }, R)).toEqual(compute(parent, R));
  });
  it('повторный расчёт даёт тот же результат', () => expect(compute(b, R)).toEqual(compute(b, R)));
});

describe('редакции и границы', () => {
  it('класс 2024 в персонаже 2014 — ошибка; с разрешением смешивать — предупреждение', () => {
    const b = build('2014', { base: [15, 10, 14, 8, 10, 10], levels: [{ characterLevel: 1, classUid: 't24:class/fighter' as ContentUid, classLevel: 1, choices: [] }] });
    expect(compute(b, R).issues.map((i) => i.code)).toContain('edition-mismatch');
    const mixed = compute({ ...b, options: { ...b.options, allowCrossEdition: true } }, R);
    expect(mixed.issues.map((i) => i.code)).toContain('cross-edition');
    expect(mixed.sheet.hitPointsMax.value).toBe(12);
  });
  it('мультикласс выключен — ошибка', () => {
    const b = build('2014', { base: [15, 10, 14, 13, 10, 10], options: { abilityMethod: 'manual', hpMethod: 'average', allowFeats: false, allowMulticlass: false, allowCrossEdition: false, variantRules: [] }, levels: levels('t14', ['fighter', 'wizard']) });
    expect(compute(b, R).issues.map((i) => i.code)).toContain('multiclass-disabled');
  });
  it('черта вместо УХ: 2014 без опционального правила — ошибка; требования черты проверяются', () => {
    const plan = ['wizard', 'wizard', 'wizard', 'wizard'];
    const noFeats = build('2014', { base: [10, 14, 12, 16, 14, 8], options: { abilityMethod: 'manual', hpMethod: 'average', allowFeats: false, allowMulticlass: true, allowCrossEdition: false, variantRules: [] }, levels: levels('t14', plan, { 4: { 't14:class/wizard#asi@4': ['t14:feat/alert'] } }) });
    expect(compute(noFeats, R).issues.map((i) => i.code)).toContain('feats-disabled');
    const ok = build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', plan, { 4: { 't14:class/wizard#asi@4': ['t14:feat/alert'] } }) });
    expect(compute(ok, R).sheet.initiative.value).toBe(2 + 5);
    const hamNoProf = build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', plan, { 4: { 't14:class/wizard#asi@4': ['t14:feat/heavy-armor-master'] } }) });
    expect(compute(hamNoProf, R).issues.map((i) => i.code)).toContain('feat-prerequisite');
  });
  it('предел характеристики 20', () => {
    const b = build('2014', { base: [19, 10, 10, 10, 10, 10], speciesUid: 't14:species/human' as ContentUid, levels: levels('t14', ['fighter', 'fighter', 'fighter', 'fighter'], { 4: { 't14:class/fighter#asi@4': ['str', 'str'] } }) });
    const s = compute(b, R).sheet;
    expect(s.abilities.str.value).toBe(20);
    expect(s.abilities.str.components.some((c) => c.kind === 'ignored' && c.note === 'предел 20')).toBe(true);
  });
  it('недопустимый вариант выбора и неверное количество — ошибки', () => {
    const b = build('2014', { base: [15, 10, 14, 8, 10, 10], levels: levels('t14', ['fighter'], { 1: { 't14:class/fighter#skills': ['arcana'] } }) });
    const codes = compute(b, R).issues.map((i) => i.code);
    expect(codes).toContain('choice-invalid');
    expect(codes).toContain('choice-count');
  });
  it('кольчуга при СИЛ ниже 13 — скорость −10; без владения — предупреждение', () => {
    const b = build('2014', { base: [10, 14, 12, 16, 14, 8], speciesUid: 't14:species/human' as ContentUid, levels: levels('t14', ['wizard']) });
    const r = compute(b, R, { equipment: [eq('t14:armor/chain-mail', 'armor')] });
    expect(r.sheet.speed.walk!.value).toBe(20);
    expect(r.issues.map((i) => i.code)).toContain('armor-not-proficient');
  });
  it('кольцо защиты работает только при настройке; больше 3 настроенных — ошибка', () => {
    const b = build('2014', { base: [10, 14, 12, 16, 14, 8], levels: levels('t14', ['wizard']) });
    expect(compute(b, R, { equipment: [eq('t14:magic-item/ring-of-protection', 'worn')] }).sheet.armorClass.value).toBe(12);
    expect(compute(b, R, { equipment: [eq('t14:magic-item/ring-of-protection', 'worn', { attuned: true })] }).sheet.armorClass.value).toBe(13);
    const four = Array(4).fill(0).map(() => eq('t14:magic-item/ring-of-protection', 'worn', { attuned: true }));
    expect(compute(b, R, { equipment: four }).issues.map((i) => i.code)).toContain('attunement-limit');
  });
  it('броски хитов: проверка диапазона и подстановка среднего', () => {
    const lv = levels('t14', ['fighter', 'fighter', 'fighter']);
    lv[1]!.hpRoll = 9; // d10
    const opt = { abilityMethod: 'manual' as const, hpMethod: 'rolled' as const, allowFeats: false, allowMulticlass: true, allowCrossEdition: false, variantRules: [] };
    const r = compute(build('2014', { base: [15, 10, 14, 8, 10, 10], options: opt, levels: lv }), R);
    expect(r.sheet.hitPointsMax.value).toBe(12 + 11 + 8);
    expect(r.issues.map((i) => i.code)).toContain('hp-roll-missing');
    lv[2]!.hpRoll = 11;
    expect(compute(build('2014', { base: [15, 10, 14, 8, 10, 10], options: opt, levels: lv }), R).issues.map((i) => i.code)).toContain('hp-roll-invalid');
  });
  it('без вида и предыстории — незакрытые выборы происхождения', () => {
    const r = compute(build('2014', { base: [10, 10, 10, 10, 10, 10] }), R);
    expect(r.pending.map((p) => p.choiceId)).toEqual(['origin#species', 'origin#background']);
  });
});
