/**
 * Механика особенностей SRD, размеченная вручную по тексту правил.
 * Ключ — индекс особенности в 5e-database (`feat:<index>` для черт).
 * tbl(class, key) — формула-таблица из class_specific данных уровней.
 */
type J = Record<string, any>;
type Tbl = (cls: string, key: string) => string;
export type Override = { effects?: J[]; choices?: J[] };

const SKILLS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'];
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const NO_ARMOR = { armor: 'none' };
const NO_ARMOR_NO_SHIELD = { all: [{ armor: 'none' }, { shield: false }] };

const acBase = (formula: string, label: string, when: J = NO_ARMOR) => ({ type: 'ac.base', formula, label, when, stackKey: 'unarmored-defense' });
const extra = (count: number) => ({ effects: [{ type: 'attacks.perAction', count, stackKey: 'extra-attack' }] });
const res = (id: string, label: string, max: string, recharge: string) => ({ type: 'resource', id, label, max, recharge });
const saves = (...a: string[]) => a.map((id) => ({ type: 'proficiency', category: 'save', id }));
const defense = { effects: [{ type: 'ac.bonus', value: 1, when: { armor: 'any' }, stackKey: 'fs-defense' }] };
const expertise = (pick = 2) => ({ choices: [{ key: 'expertise', label: 'Компетентность', pick, from: { list: SKILLS }, grants: 'expertise' }] });
const unarmoredMovement = (cls: string, steps: [number, number][], when: J) =>
  steps.map(([min, value]) => ({ type: 'speed', mode: 'walk', op: 'bonus', value, stackKey: 'unarmored-movement', when: { all: [when, { classLevel: { class: cls, min } }] } }));

let _tbl: Tbl = () => '0';
export const setTable = (t: Tbl) => { _tbl = t; };

export function featureOverrides(ed: '2014' | '2024', ns: string): Record<string, Override> {
  const C = (c: string) => `${ns}:class/${c}`;
  const t = _tbl;
  if (ed === '2014') return {
    'barbarian-unarmored-defense': { effects: [acBase('10 + dex.mod + con.mod', 'Защита без доспехов (варвар)')] },
    'monk-unarmored-defense': { effects: [acBase('10 + dex.mod + wis.mod', 'Защита без доспехов (монах)', NO_ARMOR_NO_SHIELD)] },
    rage: { effects: [res('rage', 'Ярость', t('barbarian', 'rage_count'), 'long')] },
    'fast-movement': { effects: [{ type: 'speed', mode: 'walk', op: 'bonus', value: 10, stackKey: 'fast-movement', when: { not: { armor: 'heavy' } } }] },
    'primal-champion': { effects: [{ type: 'ability.maxIncrease', ability: 'str', value: 4 }, { type: 'ability.maxIncrease', ability: 'con', value: 4 }, { type: 'ability.bonus', ability: 'str', value: 4 }, { type: 'ability.bonus', ability: 'con', value: 4 }] },
    'barbarian-extra-attack': extra(2), 'extra-attack-1': extra(2), 'monk-extra-attack': extra(2), 'paladin-extra-attack': extra(2), 'ranger-extra-attack': extra(2),
    'extra-attack-2': extra(3), 'extra-attack-3': extra(4),
    'bardic-inspiration-d6': { effects: [res('bardic-inspiration', 'Вдохновение барда', 'max(1, cha.mod)', 'long')] },
    'font-of-inspiration': { effects: [res('bardic-inspiration', 'Вдохновение барда', 'max(1, cha.mod)', 'short')] },
    'jack-of-all-trades': { effects: [{ type: 'halfProficiency', scope: 'ability-checks' }] },
    'second-wind': { effects: [res('second-wind', 'Второе дыхание', '1', 'short')] },
    'action-surge-1-use': { effects: [res('action-surge', 'Всплеск действий', '1', 'short')] },
    'action-surge-2-uses': { effects: [res('action-surge', 'Всплеск действий', '2', 'short')] },
    'indomitable-1-use': { effects: [res('indomitable', 'Упорство', '1', 'long')] },
    'indomitable-2-uses': { effects: [res('indomitable', 'Упорство', '2', 'long')] },
    'indomitable-3-uses': { effects: [res('indomitable', 'Упорство', '3', 'long')] },
    'fighter-fighting-style-defense': defense, 'fighting-style-defense': defense, 'ranger-fighting-style-defense': defense,
    ki: { effects: [res('ki', 'Ци', 'level.class.monk', 'short')] },
    'unarmored-movement-1': { effects: unarmoredMovement(C('monk'), [[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]], NO_ARMOR_NO_SHIELD) },
    'diamond-soul': { effects: saves(...AB) },
    'slippery-mind': { effects: saves('wis') },
    'divine-sense': { effects: [res('divine-sense', 'Божественное чувство', '1 + max(0, cha.mod)', 'long')] },
    'lay-on-hands': { effects: [res('lay-on-hands', 'Наложение рук (хиты)', '5 * level.class.paladin', 'long')] },
    'channel-divinity-1-rest': { effects: [res('channel-divinity', 'Божественный канал', '1', 'short')] },
    'channel-divinity-2-rest': { effects: [res('channel-divinity', 'Божественный канал', '2', 'short')] },
    'channel-divinity-3-rest': { effects: [res('channel-divinity', 'Божественный канал', '3', 'short')] },
    'channel-divinity': { effects: [res('channel-divinity-paladin', 'Божественный канал', '1', 'short')] },
    'wild-shape-cr-1-4-or-below-no-flying-or-swim-speed': { effects: [res('wild-shape', 'Дикий облик', '2', 'short')] },
    'draconic-resilience': { effects: [{ type: 'hp.flat', value: 'level.class.sorcerer' }, acBase('13 + dex.mod', 'Драконья устойчивость')] },
    'font-of-magic': { effects: [res('sorcery-points', 'Очки чародейства', 'level.class.sorcerer', 'long')] },
    'arcane-recovery': { effects: [res('arcane-recovery', 'Магическое восстановление', '1', 'long')] },
    'rogue-expertise-1': expertise(), 'rogue-expertise-2': expertise(), 'bard-expertise-1': expertise(), 'bard-expertise-2': expertise(),
    'bonus-proficiency': { effects: [{ type: 'proficiency', category: 'armor', id: 'heavy' }] },
    'bonus-proficiencies': { choices: [{ key: 'skills', label: 'Дополнительные навыки', pick: 3, from: { list: SKILLS }, grants: 'proficiency.skill' }] },
    'feat:grappler': {},
  };
  return {
    'barbarian-unarmored-defense': { effects: [acBase('10 + dex.mod + con.mod', 'Защита без доспехов (варвар)')] },
    'monk-unarmored-defense': { effects: [acBase('10 + dex.mod + wis.mod', 'Защита без доспехов (монах)', NO_ARMOR_NO_SHIELD)] },
    'barbarian-rage': { effects: [res('rage', 'Ярость', t('barbarian', 'rage_count'), 'long')] },
    'barbarian-fast-movement': { effects: [{ type: 'speed', mode: 'walk', op: 'bonus', value: 10, stackKey: 'fast-movement', when: { not: { armor: 'heavy' } } }] },
    'barbarian-extra-attack': extra(2), 'fighter-extra-attack': extra(2), 'monk-extra-attack': extra(2), 'paladin-extra-attack': extra(2), 'ranger-extra-attack': extra(2),
    'fighter-two-extra-attacks': extra(3), 'fighter-three-extra-attacks': extra(4),
    'barbarian-weapon-mastery': { effects: [{ type: 'weaponMastery', count: t('barbarian', 'weapon_mastery') }] },
    'fighter-weapon-mastery': { effects: [{ type: 'weaponMastery', count: t('fighter', 'weapon_mastery') }] },
    'paladin-weapon-mastery': { effects: [{ type: 'weaponMastery', count: t('paladin', 'weapon_mastery') }] },
    'ranger-weapon-mastery': { effects: [{ type: 'weaponMastery', count: t('ranger', 'weapon_mastery') }] },
    'rogue-weapon-mastery': { effects: [{ type: 'weaponMastery', count: t('rogue', 'weapon_mastery') }] },
    'bard-bardic-inspiration': { effects: [res('bardic-inspiration', 'Вдохновение барда', 'max(1, cha.mod)', 'long')] },
    'bard-jack-of-all-trades': { effects: [{ type: 'halfProficiency', scope: 'ability-checks' }] },
    'bard-expertise': expertise(), 'rogue-expertise': expertise(), 'ranger-expertise': expertise(),
    'fighter-second-wind': { effects: [res('second-wind', 'Второе дыхание', t('fighter', 'second_wind_uses'), 'short')] },
    'fighter-action-surge': { effects: [res('action-surge', 'Всплеск действий', 'min(2, 1 + floor(level.class.fighter / 17))', 'short')] },
    'fighter-fighting-style': { choices: [{ key: 'style', label: 'Боевой стиль', pick: 1, from: { query: { type: 'feat', where: { category: 'fighting-style' } } }, grants: 'feat' }] },
    'paladin-fighting-style': { choices: [{ key: 'style', label: 'Боевой стиль', pick: 1, from: { query: { type: 'feat', where: { category: 'fighting-style' } } }, grants: 'feat' }] },
    'ranger-fighting-style': { choices: [{ key: 'style', label: 'Боевой стиль', pick: 1, from: { query: { type: 'feat', where: { category: 'fighting-style' } } }, grants: 'feat' }] },
    'monk-monks-focus': { effects: [res('focus', 'Очки сосредоточенности', t('monk', 'focus_points'), 'short')] },
    'monk-unarmored-movement': { effects: unarmoredMovement(C('monk'), [[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]], NO_ARMOR_NO_SHIELD) },
    'monk-disciplined-survivor': { effects: saves(...AB) },
    'rogue-slippery-mind': { effects: saves('wis', 'cha') },
    'paladin-lay-on-hands': { effects: [res('lay-on-hands', 'Наложение рук (хиты)', '5 * level.class.paladin', 'long')] },
    'paladin-channel-divinity': { effects: [res('channel-divinity-paladin', 'Божественный канал', t('paladin', 'channel_divinity_charges'), 'short')] },
    'cleric-channel-divinity': { effects: [res('channel-divinity', 'Божественный канал', t('cleric', 'channel_divinity_charges'), 'short')] },
    'druid-wild-shape': { effects: [res('wild-shape', 'Дикий облик', t('druid', 'wild_shape_uses'), 'short')] },
    'sorcerer-innate-sorcery': { effects: [res('innate-sorcery', 'Врождённое чародейство', '2', 'long')] },
    'sorcerer-font-of-magic': { effects: [res('sorcery-points', 'Очки чародейства', t('sorcerer', 'sorcery_points'), 'long')] },
    'draconic-sorcery-draconic-resilience': { effects: [{ type: 'hp.flat', value: 'level.class.sorcerer' }, acBase('10 + dex.mod + cha.mod', 'Драконья устойчивость')] },
    'feat:alert': { effects: [{ type: 'initiative.bonus', value: 'prof' }] },
    'feat:defense': defense,
    'feat:ability-score-improvement': { choices: [{ key: 'abilities', label: '+2 к одной или +1 к двум', pick: 2, from: { list: AB }, grants: 'ability.bonus' }] },
    'feat:skilled': { choices: [{ key: 'skills', label: 'Навыки', pick: 3, from: { list: SKILLS }, grants: 'proficiency.skill' }] },
    'feat:magic-initiate': { choices: [
      { key: 'cantrips', label: 'Заговоры', pick: 2, from: { query: { type: 'spell', where: { level: 0 } } }, grants: 'spell' },
      { key: 'spell', label: 'Заклинание 1 круга', pick: 1, from: { query: { type: 'spell', where: { level: 1 } } }, grants: 'spell' },
    ] },
  };
}

export function traitOverrides(ed: '2014' | '2024', _ns: string): Record<string, Override> {
  const resist = (dt: string) => ({ effects: [{ type: 'damage.resistance', damageType: dt, level: 'resistance' }] });
  const sense = (r: number) => ({ effects: [{ type: 'sense', sense: 'darkvision', range: r }] });
  if (ed === '2014') return {
    darkvision: sense(60),
    'dwarven-resilience': resist('poison'), 'hellish-resistance': resist('fire'),
    'dwarven-toughness': { effects: [{ type: 'hp.perLevel', value: 1 }] },
  };
  const out: Record<string, Override> = {
    'darkvision-60': sense(60), 'darkvision-120': sense(120),
    'dwarven-resilience': resist('poison'),
    'dwarven-toughness': { effects: [{ type: 'hp.perLevel', value: 1 }] },
    versatile: { choices: [{ key: 'feat', label: 'Черта происхождения', pick: 1, from: { query: { type: 'feat', where: { category: 'origin' } } }, grants: 'feat' }] },
  };
  for (const dt of ['acid', 'cold', 'fire', 'lightning', 'poison']) out[`draconic-damage-resistance-${dt}`] = resist(dt);
  for (const dt of ['fire', 'necrotic', 'poison']) out[`lineage-resistance-${dt}`] = resist(dt);
  return out;
}

export function magicItemOverrides(_ed: '2014' | '2024', _ns: string): Record<string, Override & { baseItem?: string }> {
  const set = (ability: string, value: number) => ({ effects: [{ type: 'ability.set', ability, value, onlyIfHigher: true }] });
  return {
    'ring-of-protection': { effects: [{ type: 'ac.bonus', value: 1 }] },
    'cloak-of-protection': { effects: [{ type: 'ac.bonus', value: 1 }] },
    'bracers-of-defense': { effects: [{ type: 'ac.bonus', value: 2, when: NO_ARMOR_NO_SHIELD }] },
    'gauntlets-of-ogre-power': set('str', 19),
    'headband-of-intellect': set('int', 19),
    'amulet-of-health': set('con', 19),
    ...(_ed === '2014' ? {
      'belt-of-giant-strength-hill': set('str', 21), 'belt-of-giant-strength-stone': set('str', 23), 'belt-of-giant-strength-frost': set('str', 23),
      'belt-of-giant-strength-fire': set('str', 25), 'belt-of-giant-strength-cloud': set('str', 27), 'belt-of-giant-strength-storm': set('str', 29),
    } : {}),
  };
}
