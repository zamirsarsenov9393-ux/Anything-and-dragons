/**
 * Правила редакций. Здесь только то, что отличается в ПРАВИЛАХ.
 * Всё, что отличается в контенте (уровни УХ, кости хитов, таблицы), лежит в пакетах.
 */
import type { Edition, HpMethod, MulticlassCasterInput, RuleSet } from '../types';

/** Таблица ячеек полного заклинателя, уровни 1–20 (одинакова в 2014 и 2024). */
export const FULL_CASTER_SLOTS: readonly (readonly number[])[] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const SIZE_CARRY: Record<string, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8 };

function hpAtLevel(a: { hitDie: number; conMod: number; isFirstCharacterLevel: boolean; method: HpMethod; roll?: number }): number {
  let die: number;
  if (a.isFirstCharacterLevel || a.method === 'max') die = a.hitDie;
  else if (a.method === 'rolled' && a.roll !== undefined) die = a.roll;
  else die = a.hitDie / 2 + 1;
  // минимум 1 хит за уровень даже при отрицательном модификаторе Телосложения
  return Math.max(1, die + a.conMod);
}

const common = {
  proficiencyBonus: (lvl: number) => 2 + Math.floor((Math.max(1, Math.min(20, lvl)) - 1) / 4),
  abilityModifier: (s: number) => Math.floor((s - 10) / 2),
  pointBuy: { budget: 27, min: 8, max: 15, cost: POINT_BUY_COST },
  standardArray: [15, 14, 13, 12, 10, 8],
  spellSlotsForCasterLevel: (cl: number) => (cl <= 0 ? [] : [...FULL_CASTER_SLOTS[Math.min(20, cl) - 1]!]),
  hpAtLevel,
  carryingCapacity: (str: number, size: string) => str * 15 * (SIZE_CARRY[size] ?? 1),
};

/**
 * Уровень заклинателя для таблицы ячеек.
 * Один заклинающий класс — по его собственной прогрессии; два и больше — правило мультикласса.
 */
function casterLevel(classes: MulticlassCasterInput[], halfRound: 'down' | 'up', halfFromLevel1: boolean): number {
  const casters = classes.filter((c) => c.progression === 'full' || c.progression === 'half' || c.progression === 'third');
  if (casters.length === 0) return 0;
  if (casters.length === 1) {
    const c = casters[0]!;
    if (c.progression === 'full') return c.classLevel;
    if (c.progression === 'half') return c.classLevel < (halfFromLevel1 ? 1 : 2) ? 0 : Math.ceil(c.classLevel / 2);
    return c.classLevel < 3 ? 0 : Math.ceil(c.classLevel / 3);
  }
  const round = halfRound === 'up' ? Math.ceil : Math.floor;
  return casters.reduce((sum, c) =>
    sum + (c.progression === 'full' ? c.classLevel : c.progression === 'half' ? round(c.classLevel / 2) : Math.floor(c.classLevel / 3)), 0);
}

export const rules2014: RuleSet = {
  edition: '2014',
  version: '1.0.0',
  ...common,
  originAbilitySource: 'species',
  multiclassCasterLevel: (cs) => casterLevel(cs, 'down', false),
};

export const rules2024: RuleSet = {
  edition: '2024',
  version: '1.0.0',
  ...common,
  originAbilitySource: 'background',
  multiclassCasterLevel: (cs) => casterLevel(cs, 'up', true),
};

export function getRuleSet(e: Edition): RuleSet {
  return e === '2014' ? rules2014 : rules2024;
}

export const SKILLS = {
  acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha',
  history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis',
  nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int',
  'sleight-of-hand': 'dex', stealth: 'dex', survival: 'wis',
} as const;
export type SkillId = keyof typeof SKILLS;
