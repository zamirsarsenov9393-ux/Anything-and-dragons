/**
 * Схема SQLite (Drizzle ORM). БД живёт в браузере: SQLite WASM в Web Worker,
 * хранение в OPFS; запасной путь — снимок БД в IndexedDB.
 * Полнотекстовый поиск (FTS5) создаётся сырой миграцией: Drizzle не описывает виртуальные таблицы.
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { CharacterBuild, Edition } from '../core/types';

const id = () => text('id').primaryKey(); // ULID
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`);

type EditionCol = Edition | 'any';
type AllowedUse = { storeMechanics: boolean; storeText: boolean; displayText: boolean; exportText: boolean; share: boolean };

// ===========================================================================
// Служебное
// ===========================================================================

/** настройки: язык интерфейса, язык контента, запасной язык и т. п. хранятся здесь же */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ===========================================================================
// Библиотека контента
// ===========================================================================

/** Источник = книга/документ. Хранит лицензию и разрешённое использование. */
export const contentSource = sqliteTable('content_source', {
  id: id(),
  title: text('title').notNull(),
  publisher: text('publisher'),
  edition: text('edition').$type<EditionCol>().notNull(),
  documentVersion: text('document_version').notNull(),
  url: text('url'),
  licenseCode: text('license_code').notNull(),
  licenseUrl: text('license_url'),
  attribution: text('attribution'),
  modifications: text('modifications'),
  rightsBasis: text('rights_basis'),
  allowedUse: text('allowed_use', { mode: 'json' }).$type<AllowedUse>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
});

export const contentPackage = sqliteTable('content_package', {
  id: text('id').notNull(),
  version: text('version').notNull(),
  sourceId: text('source_id').notNull().references(() => contentSource.id),
  name: text('name').notNull(),
  namespace: text('namespace'),
  edition: text('edition').$type<EditionCol>(),
  formatVersion: integer('format_version').notNull(),
  origin: text('origin').$type<'builtin' | 'imported' | 'homebrew'>().notNull(),
  kind: text('kind').$type<'content' | 'translation'>().notNull().default('content'),
  language: text('language').$type<'ru' | 'en'>().notNull(),
  /** для перевода: какой пакет переводится */
  targetPackageId: text('target_package_id'),
  hash: text('hash').notNull(),
  /** активна ровно одна версия пакета */
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  installedAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.id, t.version] }),
  index('pkg_active_idx').on(t.id, t.active),
]);

/** Элемент контента конкретной версии пакета. */
export const contentItem = sqliteTable('content_item', {
  uid: text('uid').notNull(),               // srd521:class/wizard
  packageId: text('package_id').notNull(),
  packageVersion: text('package_version').notNull(),
  type: text('type').notNull(),
  edition: text('edition').$type<EditionCol>().notNull(),
  /** название на языке пакета; локализованные — в content_item_text */
  name: text('name').notNull(),
  mechanics: text('mechanics', { mode: 'json' }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  /** колонки для фильтров без разбора JSON */
  spellLevel: integer('spell_level'),
  spellSchool: text('spell_school'),
  concentration: integer('concentration', { mode: 'boolean' }),
  ritual: integer('ritual', { mode: 'boolean' }),
  sourceRef: text('source_ref'),
  hash: text('hash').notNull(),
}, (t) => [
  primaryKey({ columns: [t.uid, t.packageId, t.packageVersion] }),
  index('item_type_edition_idx').on(t.type, t.edition),
  index('item_spell_idx').on(t.spellLevel, t.spellSchool),
]);

/**
 * Названия и тексты по языкам. Строка появляется из пакета с контентом
 * (его родной язык) или из пакета-перевода. Тексты не пишутся, если лицензия
 * источника запрещает их хранить — тогда остаётся только название.
 */
export const contentItemText = sqliteTable('content_item_text', {
  uid: text('uid').notNull(),
  locale: text('locale').$type<'ru' | 'en'>().notNull(),
  /** пакет, из которого пришла строка (контент или перевод) */
  fromPackageId: text('from_package_id').notNull(),
  fromPackageVersion: text('from_package_version').notNull(),
  name: text('name').notNull(),
  summary: text('summary'),
  body: text('body'),
  sourceTextHash: text('source_text_hash'),
  /** перевод сделан с другой версии текста → пометка «перевод может быть устаревшим» */
  stale: integer('stale', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.uid, t.locale, t.fromPackageId] }),
  index('text_locale_idx').on(t.locale, t.name),
]);

/** Граф зависимостей: подкласс→класс, способность→класс@уровень, заклинание→список класса. */
export const contentDependency = sqliteTable('content_dependency', {
  fromUid: text('from_uid').notNull(),
  toUid: text('to_uid').notNull(),
  packageId: text('package_id').notNull(),
  packageVersion: text('package_version').notNull(),
  kind: text('kind').$type<'requires' | 'subclass-of' | 'granted-by' | 'on-spell-list' | 'base-item' | 'replaces'>().notNull(),
  level: integer('level'),
}, (t) => [
  primaryKey({ columns: [t.fromUid, t.toUid, t.kind, t.packageId, t.packageVersion] }),
  index('dep_to_idx').on(t.toUid, t.kind),
]);

// ===========================================================================
// Кампании и игроки
// ===========================================================================

export const campaign = sqliteTable('campaign', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  dmName: text('dm_name'),
  mode: text('mode').$type<'campaign' | 'oneshot'>().notNull().default('campaign'),
  edition: text('edition').$type<Edition>().notNull(),
  status: text('status').$type<'planned' | 'active' | 'paused' | 'finished'>().notNull().default('active'),
  currentLevel: integer('current_level'),
  /** разрешённые пакеты, вариантные правила, смешивание редакций */
  settings: text('settings', { mode: 'json' }).$type<{ allowedPackages?: string[]; variantRules?: string[]; allowCrossEdition?: boolean }>().notNull().default(sql`'{}'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const player = sqliteTable('player', {
  id: id(),
  name: text('name').notNull(),
  contact: text('contact'),
  createdAt: createdAt(),
});

export const campaignPlayer = sqliteTable('campaign_player', {
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => player.id, { onDelete: 'cascade' }),
  role: text('role').$type<'player' | 'dm' | 'guest'>().notNull().default('player'),
}, (t) => [primaryKey({ columns: [t.campaignId, t.playerId] })]);

export const adventureLog = sqliteTable('adventure_log', {
  id: id(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  sessionNo: integer('session_no'),
  playedAt: integer('played_at', { mode: 'timestamp_ms' }),
  title: text('title').notNull(),
  body: text('body'),
  levelAfter: integer('level_after'),
  createdAt: createdAt(),
}, (t) => [index('log_campaign_idx').on(t.campaignId, t.playedAt)]);

// ===========================================================================
// Персонажи: ревизии неизменяемы, current_revision_id — указатель
// ===========================================================================

export const character = sqliteTable('character', {
  id: id(),
  name: text('name').notNull(),
  campaignId: text('campaign_id').references(() => campaign.id, { onDelete: 'set null' }),
  playerId: text('player_id').references(() => player.id, { onDelete: 'set null' }),
  edition: text('edition').$type<Edition>().notNull(),
  status: text('status').$type<'draft' | 'active' | 'retired' | 'dead' | 'missing'>().notNull().default('draft'),
  currentRevisionId: text('current_revision_id'),
  biography: text('biography', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('char_campaign_idx').on(t.campaignId)]);

export const characterRevision = sqliteTable('character_revision', {
  id: id(),
  characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  seq: integer('seq').notNull(),
  kind: text('kind').$type<'create' | 'level-up' | 'edit' | 'import' | 'restore' | 'content-migration'>().notNull(),
  build: text('build', { mode: 'json' }).$type<CharacterBuild>().notNull(),
  engineVersion: text('engine_version').notNull(),
  /** кэш для списков: уровень, классы, КЗ, хиты — пересчитывается, не источник истины */
  summary: text('summary', { mode: 'json' }).$type<{ level: number; classes: string; ac: number; hp: number }>().notNull(),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('rev_char_seq_idx').on(t.characterId, t.seq),
]);

/**
 * Закреплённые версии контента для ревизии + снимок механики.
 * Если источник отключат или удалят, персонаж считается по снимку.
 */
export const characterContentRef = sqliteTable('character_content_ref', {
  revisionId: text('revision_id').notNull().references(() => characterRevision.id, { onDelete: 'cascade' }),
  uid: text('uid').notNull(),
  packageId: text('package_id').notNull(),
  packageVersion: text('package_version').notNull(),
  hash: text('hash').notNull(),
  name: text('name').notNull(),
  mechanicsSnapshot: text('mechanics_snapshot', { mode: 'json' }),
}, (t) => [
  primaryKey({ columns: [t.revisionId, t.uid] }),
  index('ref_pkg_idx').on(t.packageId),
]);

/** Изменчивое игровое состояние: не порождает ревизий. */
export const characterState = sqliteTable('character_state', {
  characterId: text('character_id').primaryKey().references(() => character.id, { onDelete: 'cascade' }),
  hpCurrent: integer('hp_current'),
  hpTemp: integer('hp_temp').notNull().default(0),
  hitDiceUsed: text('hit_dice_used', { mode: 'json' }).$type<Record<string, number>>().notNull().default(sql`'{}'`),
  slotsUsed: text('slots_used', { mode: 'json' }).$type<{ standard: number[]; pact: number }>().notNull().default(sql`'{"standard":[],"pact":0}'`),
  resourcesUsed: text('resources_used', { mode: 'json' }).$type<Record<string, number>>().notNull().default(sql`'{}'`),
  conditions: text('conditions', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  exhaustion: integer('exhaustion').notNull().default(0),
  preparedSpells: text('prepared_spells', { mode: 'json' }).$type<Record<string, string[]>>().notNull().default(sql`'{}'`),
  currency: text('currency', { mode: 'json' }).$type<{ cp: number; sp: number; ep: number; gp: number; pp: number }>().notNull().default(sql`'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'`),
  updatedAt: updatedAt(),
});

export const inventoryItem = sqliteTable('inventory_item', {
  id: id(),
  characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
  /** ссылка на библиотеку или NULL для своего предмета */
  contentUid: text('content_uid'),
  customName: text('custom_name'),
  customMechanics: text('custom_mechanics', { mode: 'json' }),
  qty: integer('qty').notNull().default(1),
  slot: text('slot').$type<'armor' | 'shield' | 'main-hand' | 'off-hand' | 'two-hands' | 'worn' | null>(),
  attuned: integer('attuned', { mode: 'boolean' }).notNull().default(false),
  containerId: text('container_id'),
  magicBonus: integer('magic_bonus').notNull().default(0),
  chargesUsed: integer('charges_used').notNull().default(0),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('inv_char_idx').on(t.characterId)]);

export const note = sqliteTable('note', {
  id: id(),
  ownerType: text('owner_type').$type<'campaign' | 'character'>().notNull(),
  ownerId: text('owner_id').notNull(),
  title: text('title'),
  body: text('body').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('note_owner_idx').on(t.ownerType, t.ownerId)]);

export const backupRecord = sqliteTable('backup_record', {
  id: id(),
  kind: text('kind').$type<'auto' | 'manual' | 'pre-migration' | 'pre-restore'>().notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: createdAt(),
});
