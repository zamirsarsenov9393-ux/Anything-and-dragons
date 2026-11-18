/**
 * Формат контент-пакета (JSON). Проверяется Zod при импорте.
 * Механика и текст разделены: `mechanics` — данные для движка,
 * `text` — описания, которые хранятся и показываются только если лицензия разрешает.
 */
import { z } from 'zod';

export const FORMAT_VERSION = 1;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const semver = z.string().regex(/^\d+\.\d+\.\d+(-[0-9a-z.-]+)?$/i);
export const contentUid = z.string().regex(/^[a-z0-9-]+:[a-z-]+\/[a-z0-9-]+$/, 'uid вида ns:type/slug');
const ability = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const edition = z.enum(['2014', '2024', 'any']);

/** Формула — строка на маленьком безопасном языке, парсится в AST (без eval). */
export const formula = z.string().min(1).max(200);

// ---------------------------------------------------------------------------
// Лицензия и происхождение
// ---------------------------------------------------------------------------

export const licenseCode = z.enum([
  'CC-BY-4.0',          // SRD 5.1 / 5.2.1
  'OGL-1.0a',
  'homebrew-own',       // написано пользователем
  'permission-granted', // есть письменное разрешение правообладателя
  'user-owned-private', // пользователь владеет книгой; только личное хранение
  'unknown',            // права не установлены → только библиография
]);

export const allowedUse = z.object({
  storeMechanics: z.boolean(),
  storeText: z.boolean(),
  displayText: z.boolean(),
  exportText: z.boolean(),
  share: z.boolean(),
});

export const sourceInfo = z.object({
  id: slug,
  title: z.string(),
  publisher: z.string().optional(),
  edition: edition,
  documentVersion: z.string(),
  url: z.url().optional(),
  license: z.object({
    code: licenseCode,
    url: z.url().optional(),
    attribution: z.string().optional(),
    /** что изменено относительно оригинала (обязательно для перевода CC-BY) */
    modifications: z.string().optional(),
    rightsBasis: z.string().optional(),
  }),
  allowedUse,
});

// ---------------------------------------------------------------------------
// Условия, эффекты, выборы
// ---------------------------------------------------------------------------

export const predicate: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(predicate) }),
    z.object({ any: z.array(predicate) }),
    z.object({ not: predicate }),
    z.object({ armor: z.enum(['none', 'light', 'medium', 'heavy', 'any']) }),
    z.object({ shield: z.boolean() }),
    z.object({ classLevel: z.object({ class: contentUid, min: z.number().int() }) }),
    z.object({ totalLevel: z.object({ min: z.number().int() }) }),
    z.object({ abilityMin: z.object({ ability, value: z.number().int() }) }),
    z.object({ hasFeature: contentUid }),
    z.object({ proficient: z.string() }),
    z.object({ equipped: contentUid }),
    z.object({ attuned: contentUid }),
  ]),
);
export type Predicate =
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { armor: 'none' | 'light' | 'medium' | 'heavy' | 'any' } | { shield: boolean }
  | { classLevel: { class: string; min: number } } | { totalLevel: { min: number } }
  | { abilityMin: { ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; value: number } }
  | { hasFeature: string } | { proficient: string } | { equipped: string } | { attuned: string };

const effectBase = {
  when: predicate.optional(),
  /** эффекты с одинаковым ключом не складываются: берётся лучший */
  stackKey: z.string().optional(),
};

export const effect = z.discriminatedUnion('type', [
  z.object({ ...effectBase, type: z.literal('ability.bonus'), ability, value: z.number().int(), max: z.number().int().optional() }),
  z.object({ ...effectBase, type: z.literal('ability.set'), ability, value: z.number().int(), onlyIfHigher: z.boolean().default(true) }),
  z.object({ ...effectBase, type: z.literal('ability.maxIncrease'), ability, value: z.number().int() }),
  z.object({ ...effectBase, type: z.literal('proficiency'), category: z.enum(['save', 'skill', 'armor', 'weapon', 'tool', 'language']), id: z.string() }),
  z.object({ ...effectBase, type: z.literal('expertise'), skill: z.string() }),
  z.object({ ...effectBase, type: z.literal('halfProficiency'), scope: z.enum(['ability-checks', 'initiative']) }),
  z.object({ ...effectBase, type: z.literal('ac.base'), formula, label: z.string() }),
  z.object({ ...effectBase, type: z.literal('ac.bonus'), value: z.number().int() }),
  z.object({ ...effectBase, type: z.literal('speed'), mode: z.enum(['walk', 'fly', 'swim', 'climb', 'burrow']), op: z.enum(['set', 'bonus', 'equalWalk']), value: z.number().int().optional() }),
  z.object({ ...effectBase, type: z.literal('hp.perLevel'), value: z.number().int() }),
  z.object({ ...effectBase, type: z.literal('hp.flat'), value: formula }),
  z.object({ ...effectBase, type: z.literal('initiative.bonus'), value: formula }),
  z.object({ ...effectBase, type: z.literal('sense'), sense: z.string(), range: z.number().int() }),
  z.object({ ...effectBase, type: z.literal('damage.resistance'), damageType: z.string(), level: z.enum(['resistance', 'immunity', 'vulnerability']) }),
  z.object({ ...effectBase, type: z.literal('attacks.perAction'), count: z.number().int() }),
  z.object({ ...effectBase, type: z.literal('spell.grant'), spell: contentUid, alwaysPrepared: z.boolean().default(true), countsAgainstLimit: z.boolean().default(false), uses: formula.optional(), recharge: z.enum(['short', 'long', 'dawn', 'none']).optional(), ability: ability.optional() }),
  z.object({ ...effectBase, type: z.literal('resource'), id: slug, label: z.string(), max: formula, recharge: z.enum(['short', 'long', 'dawn', 'none']) }),
  z.object({ ...effectBase, type: z.literal('weaponMastery'), count: formula }),
  z.object({ ...effectBase, type: z.literal('note'), key: z.string() }),
]);
export type Effect = z.infer<typeof effect>;

export const choice = z.object({
  key: slug,
  label: z.string(),
  pick: z.number().int().min(1),
  required: z.boolean().default(true),
  /** явный список или фильтр по библиотеке */
  from: z.union([
    z.object({ list: z.array(z.string()).min(1) }),
    z.object({ query: z.object({ type: z.string(), where: z.record(z.string(), z.unknown()).optional() }) }),
  ]),
  /** что даёт каждый выбранный вариант, если это не элемент контента (например, навык) */
  grants: z.enum(['proficiency.skill', 'proficiency.tool', 'proficiency.language', 'expertise', 'ability.bonus', 'item', 'spell', 'feat', 'feature']),
  /** повторяемый выбор на нескольких уровнях */
  atLevels: z.array(z.number().int().min(1).max(20)).optional(),
});

// ---------------------------------------------------------------------------
// Элементы
// ---------------------------------------------------------------------------

const itemBase = {
  id: contentUid,
  name: z.string(),
  edition,
  tags: z.array(z.string()).default([]),
  requires: z.array(contentUid).default([]),
  prerequisite: predicate.optional(),
  /** страница/раздел источника — библиографическая ссылка */
  sourceRef: z.string().optional(),
  /** текст на языке пакета (`language`); переводы — отдельными пакетами kind='translation' */
  text: z.object({ summary: z.string().optional(), body: z.string().optional() }).optional(),
};

const grantsAtLevel = z.object({
  level: z.number().int().min(1).max(20),
  features: z.array(contentUid).default([]),
});

export const classItem = z.object({
  ...itemBase,
  type: z.literal('class'),
  mechanics: z.object({
    hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    primaryAbilities: z.array(ability),
    savingThrows: z.array(ability).length(2),
    startingProficiencies: z.array(effect),
    multiclass: z.object({ prerequisite: predicate, proficiencies: z.array(effect), skillChoice: choice.optional() }),
    skillChoice: choice,
    subclassLevel: z.number().int().min(1).max(20),
    asiLevels: z.array(z.number().int()),
    progression: z.array(grantsAtLevel),
    spellcasting: z.object({
      ability,
      progression: z.enum(['full', 'half', 'third', 'pact']),
      preparation: z.enum(['prepared', 'known']),
      spellList: contentUid,
      /** таблицы по уровням класса (индекс 0 = 1 уровень) */
      cantripsKnown: z.array(z.number().int()).length(20).optional(),
      spellsKnown: z.array(z.number().int()).length(20).optional(),
      preparedTable: z.array(z.number().int()).length(20).optional(),
      preparedFormula: formula.optional(),
      ritualCasting: z.enum(['none', 'prepared', 'book', 'any-known']).default('none'),
      pactSlots: z.array(z.object({ count: z.number().int(), slotLevel: z.number().int() })).length(20).optional(),
    }).optional(),
    resources: z.array(effect).default([]),
  }),
});

export const subclassItem = z.object({
  ...itemBase,
  type: z.literal('subclass'),
  mechanics: z.object({
    class: contentUid,
    progression: z.array(grantsAtLevel),
    spellcasting: z.object({ ability, progression: z.enum(['third']), spellList: contentUid }).optional(),
    expandedSpells: z.array(z.object({ level: z.number().int(), spells: z.array(contentUid) })).default([]),
  }),
});

export const featureItem = z.object({
  ...itemBase,
  type: z.literal('feature'),
  mechanics: z.object({ effects: z.array(effect).default([]), choices: z.array(choice).default([]) }),
});

export const speciesItem = z.object({
  ...itemBase,
  type: z.enum(['species', 'subspecies']),
  mechanics: z.object({
    parent: contentUid.optional(),
    size: z.array(z.enum(['tiny', 'small', 'medium', 'large'])).min(1),
    speed: z.number().int(),
    effects: z.array(effect).default([]),
    choices: z.array(choice).default([]),
    features: z.array(contentUid).default([]),
  }),
});

export const backgroundItem = z.object({
  ...itemBase,
  type: z.literal('background'),
  mechanics: z.object({
    effects: z.array(effect).default([]),
    choices: z.array(choice).default([]),
    /** 2024: три характеристики, между которыми распределяется +2/+1 или +1/+1/+1 */
    abilityOptions: z.array(ability).length(3).optional(),
    originFeat: contentUid.optional(),
    equipmentOptions: z.array(z.array(z.object({ item: contentUid, qty: z.number().int().default(1) }))).default([]),
  }),
});

export const featItem = z.object({
  ...itemBase,
  type: z.literal('feat'),
  mechanics: z.object({
    category: z.enum(['general', 'origin', 'fighting-style', 'epic-boon', 'none']).default('none'),
    repeatable: z.boolean().default(false),
    effects: z.array(effect).default([]),
    choices: z.array(choice).default([]),
  }),
});

export const spellItem = z.object({
  ...itemBase,
  type: z.literal('spell'),
  mechanics: z.object({
    level: z.number().int().min(0).max(9),
    school: z.string(),
    castingTime: z.string(),
    range: z.object({ kind: z.enum(['self', 'touch', 'ranged', 'sight', 'unlimited', 'special']), feet: z.number().int().optional() }),
    components: z.object({ v: z.boolean(), s: z.boolean(), m: z.string().optional(), consumed: z.boolean().default(false), costGp: z.number().optional() }),
    duration: z.string(),
    concentration: z.boolean(),
    ritual: z.boolean(),
    classes: z.array(contentUid),
    attack: z.enum(['melee', 'ranged']).optional(),
    save: ability.optional(),
  }),
});

const physical = {
  weightLb: z.number().nonnegative().default(0),
  costCp: z.number().int().nonnegative().optional(),
};

export const weaponItem = z.object({
  ...itemBase,
  type: z.literal('weapon'),
  mechanics: z.object({
    ...physical,
    category: z.enum(['simple', 'martial']),
    kind: z.enum(['melee', 'ranged']),
    damage: z.string().regex(/^\d+d\d+$|^\d+$/),
    damageType: z.string(),
    properties: z.array(z.string()),
    versatile: z.string().optional(),
    range: z.object({ normal: z.number().int(), long: z.number().int() }).optional(),
    mastery: z.string().optional(),
  }),
});

export const armorItem = z.object({
  ...itemBase,
  type: z.literal('armor'),
  mechanics: z.object({
    ...physical,
    category: z.enum(['light', 'medium', 'heavy', 'shield']),
    baseAc: z.number().int(),
    dexCap: z.number().int().nullable(),
    strengthReq: z.number().int().optional(),
    stealthDisadvantage: z.boolean().default(false),
  }),
});

export const gearItem = z.object({
  ...itemBase,
  type: z.enum(['gear', 'tool', 'consumable', 'pack']),
  mechanics: z.object({ ...physical, contents: z.array(z.object({ item: contentUid, qty: z.number().int() })).optional() }),
});

export const magicItem = z.object({
  ...itemBase,
  type: z.literal('magic-item'),
  mechanics: z.object({
    ...physical,
    rarity: z.enum(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']),
    attunement: z.union([z.boolean(), z.object({ requirement: predicate })]),
    baseItem: contentUid.optional(),
    effects: z.array(effect).default([]),
    charges: formula.optional(),
  }),
});

export const ruleItem = z.object({
  ...itemBase,
  type: z.enum(['rule', 'spell-list', 'condition']),
  mechanics: z.record(z.string(), z.unknown()),
});

export const contentItem = z.discriminatedUnion('type', [
  classItem, subclassItem, featureItem, speciesItem, backgroundItem, featItem,
  spellItem, weaponItem, armorItem, gearItem, magicItem, ruleItem,
]);
export type ContentItem = z.infer<typeof contentItem>;

export const locale = z.enum(['ru', 'en']);
export type Locale = z.infer<typeof locale>;

const packageBase = {
  formatVersion: z.literal(FORMAT_VERSION),
  id: slug,
  name: z.string(),
  version: semver,
  /** язык названий и текстов внутри пакета */
  language: locale,
  origin: z.enum(['builtin', 'imported', 'homebrew']),
  source: sourceInfo,
  dependencies: z.array(z.object({ id: slug, range: z.string() })).default([]),
};

/** Пакет с механикой и текстом на одном языке. */
export const contentDataPackage = z.object({
  ...packageBase,
  kind: z.literal('content'),
  edition,
  namespace: slug,
  items: z.array(contentItem),
});

/**
 * Пакет-перевод: накладывает названия и тексты на другой язык поверх
 * существующих элементов. Механику не трогает. Своя лицензия: перевод
 * CC-BY-текста обязан указывать атрибуцию и изменения.
 */
export const translationPackage = z.object({
  ...packageBase,
  kind: z.literal('translation'),
  target: z.object({ packageId: slug, range: z.string() }),
  entries: z.array(z.object({
    uid: contentUid,
    name: z.string(),
    summary: z.string().optional(),
    body: z.string().optional(),
    /** хэш исходного текста, с которого делался перевод — чтобы ловить устаревшие переводы */
    sourceTextHash: z.string().optional(),
  })),
});

export const contentPackage = z.discriminatedUnion('kind', [contentDataPackage, translationPackage]);
export type ContentPackage = z.infer<typeof contentPackage>;
