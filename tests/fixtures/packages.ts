/**
 * Тестовые пакеты. Только механика (числа и структура правил из SRD 5.1 / 5.2.1, CC-BY-4.0),
 * без текстов. Это не контент приложения — настоящие пакеты SRD собираются на этапе 3.
 */
import { contentPackage, type ContentPackage } from '../../src/content/schema';

const allUse = { storeMechanics: true, storeText: true, displayText: true, exportText: true, share: true };
const srcInfo = (id: string, edition: '2014' | '2024') => ({
  id, title: `Test fixtures ${edition}`, edition, documentVersion: 'test',
  license: { code: 'CC-BY-4.0' as const, attribution: 'Механика по SRD (CC-BY-4.0), тестовые данные' }, allowedUse: allUse,
});

const p = (cat: string, id: string) => ({ type: 'proficiency' as const, category: cat, id });
const skillChoice = (n: number, list: string[]) => ({ key: 'skills', label: 'Навыки', pick: n, from: { list }, grants: 'proficiency.skill' as const });
const ab = (a: string, v: number) => ({ abilityMin: { ability: a, value: v } });
const progression = (map: Record<number, string[]>) => Object.entries(map).map(([level, features]) => ({ level: Number(level), features }));
const ASI = [4, 8, 12, 16, 19];
const FULL_CANTRIPS = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const PACT = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]].map(([count, slotLevel]) => ({ count: count!, slotLevel: slotLevel! }));
const feature = (ns: string, edition: string, slug: string, effects: unknown[] = [], choices: unknown[] = []) =>
  ({ id: `${ns}:feature/${slug}`, name: slug, edition, type: 'feature', mechanics: { effects, choices } });

function classes(ns: string, edition: '2014' | '2024') {
  const sub = edition === '2024' ? 3 : undefined;
  const id = (s: string) => `${ns}:class/${s}`;
  const f = (s: string) => `${ns}:feature/${s}`;
  return [
    { id: id('fighter'), name: 'Fighter', edition, type: 'class', mechanics: {
      hitDie: 10, primaryAbilities: ['str'], savingThrows: ['str', 'con'],
      startingProficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'heavy'), p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')],
      multiclass: { prerequisite: { any: [ab('str', 13), ab('dex', 13)] }, proficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')] },
      skillChoice: skillChoice(2, ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival']),
      subclassLevel: 3, asiLevels: [4, 6, 8, 12, 14, 16, 19],
      progression: progression({ 1: [f('fighting-style'), f('second-wind'), ...(edition === '2024' ? [f('weapon-mastery-fighter')] : [])], 5: [f('extra-attack')], 11: [f('extra-attack-2')], 20: [f('extra-attack-3')] }),
    } },
    { id: id('barbarian'), name: 'Barbarian', edition, type: 'class', mechanics: {
      hitDie: 12, primaryAbilities: ['str'], savingThrows: ['str', 'con'],
      startingProficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')],
      multiclass: { prerequisite: ab('str', 13), proficiencies: [p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')] },
      skillChoice: skillChoice(2, ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival']),
      subclassLevel: 3, asiLevels: ASI, progression: progression({ 1: [f('unarmored-defense-barbarian'), f('rage')], 5: [f('extra-attack')] }),
    } },
    { id: id('monk'), name: 'Monk', edition, type: 'class', mechanics: {
      hitDie: 8, primaryAbilities: ['dex', 'wis'], savingThrows: ['str', 'dex'],
      startingProficiencies: [p('weapon', 'simple')],
      multiclass: { prerequisite: { all: [ab('dex', 13), ab('wis', 13)] }, proficiencies: [p('weapon', 'simple')] },
      skillChoice: skillChoice(2, ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth']),
      subclassLevel: 3, asiLevels: ASI, progression: progression({ 1: [f('unarmored-defense-monk')], 5: [f('extra-attack')] }),
    } },
    { id: id('wizard'), name: 'Wizard', edition, type: 'class', mechanics: {
      hitDie: 6, primaryAbilities: ['int'], savingThrows: ['int', 'wis'],
      startingProficiencies: [p('weapon', 'dagger'), p('weapon', 'quarterstaff')],
      multiclass: { prerequisite: ab('int', 13), proficiencies: [] },
      skillChoice: skillChoice(2, ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion']),
      subclassLevel: sub ?? 2, asiLevels: ASI, progression: [],
      spellcasting: { ability: 'int', progression: 'full', preparation: 'prepared', spellList: `${ns}:spell-list/wizard`, cantripsKnown: FULL_CANTRIPS,
        ...(edition === '2014' ? { preparedFormula: 'int.mod + level.class.wizard' } : { preparedTable: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25] }) },
    } },
    { id: id('cleric'), name: 'Cleric', edition, type: 'class', mechanics: {
      hitDie: 8, primaryAbilities: ['wis'], savingThrows: ['wis', 'cha'],
      startingProficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'shield'), p('weapon', 'simple')],
      multiclass: { prerequisite: ab('wis', 13), proficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'shield')] },
      skillChoice: skillChoice(2, ['history', 'insight', 'medicine', 'persuasion', 'religion']),
      subclassLevel: sub ?? 1, asiLevels: ASI, progression: [],
      spellcasting: { ability: 'wis', progression: 'full', preparation: 'prepared', spellList: `${ns}:spell-list/cleric`, cantripsKnown: FULL_CANTRIPS, preparedFormula: 'wis.mod + level.class.cleric' },
    } },
    { id: id('paladin'), name: 'Paladin', edition, type: 'class', mechanics: {
      hitDie: 10, primaryAbilities: ['str', 'cha'], savingThrows: ['wis', 'cha'],
      startingProficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'heavy'), p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')],
      multiclass: { prerequisite: { all: [ab('str', 13), ab('cha', 13)] }, proficiencies: [p('armor', 'light'), p('armor', 'medium'), p('armor', 'shield'), p('weapon', 'simple'), p('weapon', 'martial')] },
      skillChoice: skillChoice(2, ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion']),
      subclassLevel: 3, asiLevels: ASI, progression: progression({ 5: [f('extra-attack')] }),
      spellcasting: { ability: 'cha', progression: 'half', preparation: 'prepared', spellList: `${ns}:spell-list/paladin`, preparedFormula: 'max(1, cha.mod + floor(level.class.paladin / 2))' },
    } },
    { id: id('warlock'), name: 'Warlock', edition, type: 'class', mechanics: {
      hitDie: 8, primaryAbilities: ['cha'], savingThrows: ['wis', 'cha'],
      startingProficiencies: [p('armor', 'light'), p('weapon', 'simple')],
      multiclass: { prerequisite: ab('cha', 13), proficiencies: [p('armor', 'light'), p('weapon', 'simple')] },
      skillChoice: skillChoice(2, ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion']),
      subclassLevel: sub ?? 1, asiLevels: ASI, progression: [],
      spellcasting: { ability: 'cha', progression: 'pact', preparation: 'known', spellList: `${ns}:spell-list/warlock`, cantripsKnown: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], spellsKnown: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15], pactSlots: PACT },
    } },
    { id: id('rogue'), name: 'Rogue', edition, type: 'class', mechanics: {
      hitDie: 8, primaryAbilities: ['dex'], savingThrows: ['dex', 'int'],
      startingProficiencies: [p('armor', 'light'), p('weapon', 'simple'), p('weapon', 'rapier'), p('tool', 'thieves-tools')],
      multiclass: { prerequisite: ab('dex', 13), proficiencies: [p('armor', 'light'), p('tool', 'thieves-tools')], skillChoice: { ...skillChoice(1, ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth']) } },
      skillChoice: skillChoice(4, ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth']),
      subclassLevel: 3, asiLevels: [4, 8, 10, 12, 16, 19], progression: progression({ 1: [f('expertise')] }),
    } },
  ];
}

function features(ns: string, edition: '2014' | '2024') {
  const F = (slug: string, effects: unknown[] = [], choices: unknown[] = []) => feature(ns, edition, slug, effects, choices);
  return [
    F('fighting-style', [], [{ key: 'style', label: 'Боевой стиль', pick: 1, from: { list: [`${ns}:feature/fs-defense`, `${ns}:feature/fs-dueling`] }, grants: 'feature' }]),
    F('fs-defense', [{ type: 'ac.bonus', value: 1, when: { armor: 'any' } }]),
    F('fs-dueling'),
    F('second-wind', [{ type: 'resource', id: 'second-wind', label: 'Второе дыхание', max: edition === '2024' ? 'min(4, 2 + floor((level.class.fighter + 2) / 10))' : '1', recharge: 'short' }]),
    F('weapon-mastery-fighter', [{ type: 'weaponMastery', count: '3' }]),
    F('extra-attack', [{ type: 'attacks.perAction', count: 2, stackKey: 'extra-attack' }]),
    F('extra-attack-2', [{ type: 'attacks.perAction', count: 3, stackKey: 'extra-attack' }]),
    F('extra-attack-3', [{ type: 'attacks.perAction', count: 4, stackKey: 'extra-attack' }]),
    F('unarmored-defense-barbarian', [{ type: 'ac.base', formula: '10 + dex.mod + con.mod', label: 'Защита без доспехов (варвар)', when: { armor: 'none' }, stackKey: 'unarmored-defense' }]),
    F('unarmored-defense-monk', [{ type: 'ac.base', formula: '10 + dex.mod + wis.mod', label: 'Защита без доспехов (монах)', when: { all: [{ armor: 'none' }, { shield: false }] }, stackKey: 'unarmored-defense' }]),
    F('rage', [{ type: 'resource', id: 'rage', label: 'Ярость', max: '2', recharge: 'long' }]),
    F('expertise', [], [{ key: 'expertise', label: 'Компетентность', pick: 2, from: { list: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth'] }, grants: 'expertise' }]),
    F('improved-critical', [{ type: 'note', key: 'crit-19' }]),
    F('life-domain-bonus', [p('armor', 'heavy'), { type: 'spell.grant', spell: `${ns}:spell/bless` }, { type: 'spell.grant', spell: `${ns}:spell/cure-wounds` }]),
    F('dwarven-resilience', [{ type: 'damage.resistance', damageType: 'poison', level: 'resistance' }]),
  ];
}

const equipment = (ns: string, edition: '2014' | '2024') => [
  { id: `${ns}:armor/chain-mail`, name: 'Chain Mail', edition, type: 'armor', mechanics: { category: 'heavy', baseAc: 16, dexCap: 0, strengthReq: 13, stealthDisadvantage: true, weightLb: 55 } },
  { id: `${ns}:armor/leather`, name: 'Leather', edition, type: 'armor', mechanics: { category: 'light', baseAc: 11, dexCap: null, weightLb: 10 } },
  { id: `${ns}:armor/shield`, name: 'Shield', edition, type: 'armor', mechanics: { category: 'shield', baseAc: 2, dexCap: null, weightLb: 6 } },
  { id: `${ns}:weapon/longsword`, name: 'Longsword', edition, type: 'weapon', mechanics: { category: 'martial', kind: 'melee', damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatile: '1d10', weightLb: 3 } },
  { id: `${ns}:weapon/rapier`, name: 'Rapier', edition, type: 'weapon', mechanics: { category: 'martial', kind: 'melee', damage: '1d8', damageType: 'piercing', properties: ['finesse'], weightLb: 2 } },
  { id: `${ns}:magic-item/ring-of-protection`, name: 'Ring of Protection', edition, type: 'magic-item', mechanics: { rarity: 'rare', attunement: true, effects: [{ type: 'ac.bonus', value: 1 }] } },
  { id: `${ns}:spell/bless`, name: 'Bless', edition, type: 'spell', mechanics: { level: 1, school: 'enchantment', castingTime: '1 action', range: { kind: 'ranged', feet: 30 }, components: { v: true, s: true, m: 'holy water' }, duration: '1 minute', concentration: true, ritual: false, classes: [`${ns}:class/cleric`] } },
  { id: `${ns}:spell/cure-wounds`, name: 'Cure Wounds', edition, type: 'spell', mechanics: { level: 1, school: edition === '2014' ? 'evocation' : 'abjuration', castingTime: '1 action', range: { kind: 'touch' }, components: { v: true, s: true }, duration: 'instantaneous', concentration: false, ritual: false, classes: [`${ns}:class/cleric`] } },
];

export const pkg2014: ContentPackage = contentPackage.parse({
  formatVersion: 1, kind: 'content', id: 'test-2014', name: 'Test 2014', version: '1.0.0', language: 'en', edition: '2014', namespace: 't14', origin: 'builtin',
  source: srcInfo('test-2014', '2014'),
  items: [
    { id: 't14:species/dwarf', name: 'Dwarf', edition: '2014', type: 'species', mechanics: { size: ['medium'], speed: 25, effects: [{ type: 'ability.bonus', ability: 'con', value: 2 }, { type: 'sense', sense: 'darkvision', range: 60 }], features: ['t14:feature/dwarven-resilience'] } },
    { id: 't14:subspecies/hill-dwarf', name: 'Hill Dwarf', edition: '2014', type: 'subspecies', mechanics: { parent: 't14:species/dwarf', size: ['medium'], speed: 25, effects: [{ type: 'ability.bonus', ability: 'wis', value: 1 }, { type: 'hp.perLevel', value: 1 }] } },
    { id: 't14:species/human', name: 'Human', edition: '2014', type: 'species', mechanics: { size: ['medium'], speed: 30, effects: ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => ({ type: 'ability.bonus', ability: a, value: 1 })) } },
    { id: 't14:background/acolyte', name: 'Acolyte', edition: '2014', type: 'background', mechanics: { effects: [p('skill', 'insight'), p('skill', 'religion')] } },
    { id: 't14:feat/alert', name: 'Alert', edition: '2014', type: 'feat', mechanics: { effects: [{ type: 'initiative.bonus', value: '5' }] } },
    { id: 't14:feat/heavy-armor-master', name: 'Heavy Armor Master', edition: '2014', type: 'feat', prerequisite: { proficient: 'armor:heavy' }, mechanics: { effects: [{ type: 'ability.bonus', ability: 'str', value: 1 }] } },
    ...classes('t14', '2014'),
    ...features('t14', '2014'),
    { id: 't14:subclass/champion', name: 'Champion', edition: '2014', type: 'subclass', mechanics: { class: 't14:class/fighter', progression: [{ level: 3, features: ['t14:feature/improved-critical'] }] } },
    { id: 't14:subclass/life-domain', name: 'Life Domain', edition: '2014', type: 'subclass', mechanics: { class: 't14:class/cleric', progression: [{ level: 1, features: ['t14:feature/life-domain-bonus'] }] } },
    { id: 't14:subclass/thief', name: 'Thief', edition: '2014', type: 'subclass', mechanics: { class: 't14:class/rogue', progression: [] } },
    ...equipment('t14', '2014'),
  ],
});

export const pkg2024: ContentPackage = contentPackage.parse({
  formatVersion: 1, kind: 'content', id: 'test-2024', name: 'Test 2024', version: '1.0.0', language: 'en', edition: '2024', namespace: 't24', origin: 'builtin',
  source: srcInfo('test-2024', '2024'),
  items: [
    { id: 't24:species/human', name: 'Human', edition: '2024', type: 'species', mechanics: { size: ['medium', 'small'], speed: 30 } },
    { id: 't24:feat/alert', name: 'Alert', edition: '2024', type: 'feat', mechanics: { category: 'origin', effects: [{ type: 'initiative.bonus', value: 'prof' }] } },
    { id: 't24:background/soldier', name: 'Soldier', edition: '2024', type: 'background', mechanics: { effects: [p('skill', 'athletics'), p('skill', 'intimidation')], abilityOptions: ['str', 'dex', 'con'], originFeat: 't24:feat/alert' } },
    ...classes('t24', '2024'),
    ...features('t24', '2024'),
    { id: 't24:subclass/champion', name: 'Champion', edition: '2024', type: 'subclass', mechanics: { class: 't24:class/fighter', progression: [{ level: 3, features: ['t24:feature/improved-critical'] }] } },
    { id: 't24:subclass/thief', name: 'Thief', edition: '2024', type: 'subclass', mechanics: { class: 't24:class/rogue', progression: [] } },
    ...equipment('t24', '2024'),
  ],
});
