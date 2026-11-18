/**
 * Ядро Rules Engine: типы. Чистый TypeScript, без React и без БД.
 * Персонаж хранится как журнал решений (CharacterBuild), лист персонажа
 * (Sheet) всегда вычисляется из него заново.
 */

export type Edition = '2014' | '2024';
export type AbilityId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: readonly AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Стабильная ссылка на элемент контента: `srd521:class/wizard`. */
export type ContentUid = `${string}:${string}/${string}`;

/** Закреплённая версия элемента, которую использует конкретная ревизия персонажа. */
export interface PinnedRef {
  uid: ContentUid;
  packageId: string;
  packageVersion: string;
  /** sha-256 канонического JSON механики элемента */
  hash: string;
}

// ---------------------------------------------------------------------------
// Журнал решений
// ---------------------------------------------------------------------------

export type AbilityMethod = 'standard-array' | 'point-buy' | 'roll-4d6' | 'manual';
export type HpMethod = 'average' | 'rolled' | 'max';

export interface RulesetOptions {
  abilityMethod: AbilityMethod;
  hpMethod: HpMethod;
  /** 2014: черты — опциональное правило */
  allowFeats: boolean;
  allowMulticlass: boolean;
  /** Смешивание редакций только по явному разрешению пользователя */
  allowCrossEdition: boolean;
  variantRules: string[];
}

/** Ответ пользователя на конкретный выбор. choiceId = `${featureUid}#${choiceKey}` (+ `@L${level}` если выбор повторяется). */
export interface ChoiceResolution {
  choiceId: string;
  selected: string[];
}

export interface LevelEntry {
  /** 1..20, уровень персонажа после этой записи */
  characterLevel: number;
  classUid: ContentUid;
  /** уровень в этом классе после записи */
  classLevel: number;
  /** бросок кости хитов; для 1 уровня первого класса не используется */
  hpRoll?: number;
  choices: ChoiceResolution[];
}

export interface CharacterBuild {
  schemaVersion: 1;
  edition: Edition;
  options: RulesetOptions;
  baseAbilities: Record<AbilityId, number>;
  rolledPool?: number[];
  speciesUid?: ContentUid;
  backgroundUid?: ContentUid;
  originChoices: ChoiceResolution[];
  /** index 0 = 1-й уровень персонажа. Создание на 15 уровне и level up — один и тот же код. */
  levels: LevelEntry[];
}

// ---------------------------------------------------------------------------
// Результат вычисления
// ---------------------------------------------------------------------------

/** Каждое число на листе объяснимо: из чего оно сложилось. */
export interface StatComponent {
  label: string;
  sourceUid?: ContentUid | 'rule' | 'equipment' | 'user';
  value: number;
  kind: 'base' | 'bonus' | 'set' | 'formula' | 'ignored';
  /** почему компонент не применён (например, не складывается) */
  note?: string;
}

export interface Stat {
  value: number;
  components: StatComponent[];
}

export interface PendingChoice {
  choiceId: string;
  level: number;
  sourceUid: ContentUid;
  pick: number;
  /** уже отфильтрованные допустимые варианты */
  options: ContentUid[] | string[];
  required: boolean;
}

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  severity: Severity;
  message: string;
  level?: number;
  sourceUid?: ContentUid;
}

export interface SpellSlots {
  /** индекс 0 = ячейки 1 круга */
  standard: number[];
  pact?: { count: number; slotLevel: number };
}

export interface Sheet {
  edition: Edition;
  totalLevel: number;
  classLevels: Record<string, number>;
  abilities: Record<AbilityId, Stat>;
  modifiers: Record<AbilityId, number>;
  proficiencyBonus: number;
  armorClass: Stat;
  initiative: Stat;
  hitPointsMax: Stat;
  speed: Record<string, Stat>;
  savingThrows: Record<AbilityId, Stat & { proficient: boolean }>;
  skills: Record<string, Stat & { proficiency: 0 | 0.5 | 1 | 2; ability: AbilityId }>;
  passivePerception: Stat;
  proficiencies: Record<'armor' | 'weapon' | 'tool' | 'language', string[]>;
  spellcasting: Array<{
    classUid: ContentUid;
    ability: AbilityId;
    saveDc: Stat;
    attackBonus: Stat;
    preparedMax?: number;
    knownMax?: number;
    cantripsMax?: number;
  }>;
  spellSlots: SpellSlots;
  attacks: Array<{ name: string; toHit: Stat; damage: string; damageType: string; sourceUid?: ContentUid }>;
  attacksPerAction: number;
  features: Array<{ uid: ContentUid; level: number; name: string }>;
  resources: Array<{ id: string; label: string; max: number; recharge: 'short' | 'long' | 'dawn' | 'none' }>;
  size: string;
  senses: Record<string, number>;
  damageModifiers: Array<{ damageType: string; level: 'resistance' | 'immunity' | 'vulnerability' }>;
  /** заклинания, выданные особенностями (домен, клятва, черта) */
  grantedSpells: Array<{ uid: ContentUid; sourceUid: ContentUid; alwaysPrepared: boolean; countsAgainstLimit: boolean }>;
  weaponMasteryCount: number;
  carryingCapacity: number;
  attunedCount: number;
}

/** Экипировка приходит из инвентаря (таблица inventory_item), не из журнала решений. */
export interface EquippedItem {
  uid?: ContentUid;
  slot: 'armor' | 'shield' | 'main-hand' | 'off-hand' | 'two-hands' | 'worn' | null;
  attuned?: boolean;
  magicBonus?: number;
}

export interface ComputeOptions {
  equipment?: EquippedItem[];
}

export interface EngineResult {
  sheet: Sheet;
  pending: PendingChoice[];
  issues: ValidationIssue[];
  /** все элементы контента, повлиявшие на расчёт — сохраняются как PinnedRef */
  usedContent: PinnedRef[];
  engineVersion: string;
}

// ---------------------------------------------------------------------------
// Редакции: всё, что отличается в правилах (не в контенте), — здесь.
// ---------------------------------------------------------------------------

export interface MulticlassCasterInput {
  classUid: ContentUid;
  classLevel: number;
  progression: 'full' | 'half' | 'third' | 'pact' | 'none';
}

export interface RuleSet {
  edition: Edition;
  version: string;
  proficiencyBonus(totalLevel: number): number;
  abilityModifier(score: number): number;
  pointBuy: { budget: number; min: number; max: number; cost: Record<number, number> };
  standardArray: number[];
  /** 2014: бонусы от вида; 2024: от предыстории (+2/+1 или +1/+1/+1) */
  originAbilitySource: 'species' | 'background';
  /** уровень заклинателя для общей таблицы ячеек при мультиклассе */
  multiclassCasterLevel(classes: MulticlassCasterInput[]): number;
  spellSlotsForCasterLevel(casterLevel: number): number[];
  hpAtLevel(args: { hitDie: number; conMod: number; isFirstCharacterLevel: boolean; method: HpMethod; roll?: number }): number;
  carryingCapacity(strScore: number, size: string): number;
}

/** Контент приходит через это — движок не знает про SQLite. */
export interface ContentResolver {
  get(uid: ContentUid): ResolvedItem | undefined;
  query(filter: { type: string; edition: Edition; where?: Record<string, unknown> }): ResolvedItem[];
}

export interface ResolvedItem {
  uid: ContentUid;
  type: string;
  edition: Edition | 'any';
  name: string;
  mechanics: unknown;
  /** условие получения (предпосылка черты и т. п.) — тоже механика */
  prerequisite?: unknown;
  pinned: PinnedRef;
  /** элемент взят из снимка, потому что источник отключён/удалён */
  fromSnapshot: boolean;
}
