/**
 * Репозиторий: все операции с данными пользователя.
 * Ревизии персонажа неизменяемы: повышение, правка, отмена и восстановление
 * только добавляют записи или двигают указатель current_revision_id.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import * as t from '../db/schema';
import type { Db, Transport } from './client';
import { ulid } from './ids';
import type { CharacterBuild, Edition } from '../core/types';
import type { MechanicsSnapshot } from '../content/resolver';
import type { ContentPackage } from '../content/schema';
import { mechanicsHash } from '../content/hash';

export type Summary = { level: number; classes: string; ac: number; hp: number };
export type CharacterRow = typeof t.character.$inferSelect;
export type RevisionRow = typeof t.characterRevision.$inferSelect;
export type StateRow = typeof t.characterState.$inferSelect;
export type InventoryRow = typeof t.inventoryItem.$inferSelect;
export type CampaignRow = typeof t.campaign.$inferSelect;

export interface CharacterBundle {
  character: CharacterRow;
  revision: RevisionRow;
  revisions: RevisionRow[];
  state: StateRow;
  inventory: InventoryRow[];
  snapshots: MechanicsSnapshot[];
}

export class Repo {
  constructor(readonly db: Db, readonly transport?: Transport) {}

  // --- настройки
  async getMeta(key: string): Promise<string | undefined> {
    const r = await this.db.select().from(t.appMeta).where(eq(t.appMeta.key, key));
    return r[0]?.value;
  }
  async setMeta(key: string, value: string) {
    await this.db.insert(t.appMeta).values({ key, value }).onConflictDoUpdate({ target: t.appMeta.key, set: { value } });
  }

  // --- персонажи
  async listCharacters() {
    const chars = await this.db.select().from(t.character).where(eq(t.character.archived, false)).orderBy(desc(t.character.updatedAt));
    const revIds = chars.map((c) => c.currentRevisionId).filter(Boolean) as string[];
    const revs = revIds.length ? await this.db.select({ id: t.characterRevision.id, summary: t.characterRevision.summary }).from(t.characterRevision).where(inArray(t.characterRevision.id, revIds)) : [];
    const byId = new Map(revs.map((r) => [r.id, r.summary]));
    return chars.map((c) => ({ ...c, summary: byId.get(c.currentRevisionId ?? '') }));
  }

  async getCharacter(id: string): Promise<CharacterBundle | undefined> {
    const [character] = await this.db.select().from(t.character).where(eq(t.character.id, id));
    if (!character) return undefined;
    const revisions = await this.db.select().from(t.characterRevision).where(eq(t.characterRevision.characterId, id)).orderBy(asc(t.characterRevision.seq));
    const revision = revisions.find((r) => r.id === character.currentRevisionId) ?? revisions.at(-1)!;
    const [state] = await this.db.select().from(t.characterState).where(eq(t.characterState.characterId, id));
    const inventory = await this.db.select().from(t.inventoryItem).where(eq(t.inventoryItem.characterId, id)).orderBy(asc(t.inventoryItem.sortOrder));
    const refs = await this.db.select().from(t.characterContentRef).where(eq(t.characterContentRef.revisionId, revision.id));
    const snapshots: MechanicsSnapshot[] = refs.map((r) => {
      const snap = (r.mechanicsSnapshot ?? {}) as { type?: string; edition?: string; mechanics?: unknown; prerequisite?: unknown };
      return { uid: r.uid as MechanicsSnapshot['uid'], packageId: r.packageId, packageVersion: r.packageVersion, hash: r.hash, name: r.name, type: snap.type ?? 'feature', edition: (snap.edition ?? 'any') as MechanicsSnapshot['edition'], mechanics: snap.mechanics, prerequisite: snap.prerequisite };
    });
    return { character, revision, revisions, state: state!, inventory, snapshots };
  }

  private revisionWrites(characterId: string, revId: string, seq: number, parentId: string | null, kind: RevisionRow['kind'], build: CharacterBuild, summary: Summary, snapshots: MechanicsSnapshot[], engineVersion: string, note?: string) {
    const writes: any[] = [
      this.db.insert(t.characterRevision).values({ id: revId, characterId, parentId, seq, kind, build, summary, engineVersion, note }),
    ];
    // снимки пишем пачками, чтобы не упереться в лимит параметров SQLite
    for (let i = 0; i < snapshots.length; i += 50) {
      writes.push(this.db.insert(t.characterContentRef).values(snapshots.slice(i, i + 50).map((s) => ({
        revisionId: revId, uid: s.uid, packageId: s.packageId, packageVersion: s.packageVersion, hash: s.hash, name: s.name,
        mechanicsSnapshot: { type: s.type, edition: s.edition, mechanics: s.mechanics, prerequisite: s.prerequisite },
      }))));
    }
    return writes;
  }

  async createCharacter(a: { name: string; edition: Edition; build: CharacterBuild; summary: Summary; snapshots: MechanicsSnapshot[]; engineVersion: string; campaignId?: string | null; biography?: Record<string, string>; status?: CharacterRow['status']; inventory?: Array<{ contentUid: string; qty: number; slot?: InventoryRow['slot'] }>; hpCurrent?: number }) {
    const id = ulid(), revId = ulid();
    const writes: any[] = [
      this.db.insert(t.character).values({ id, name: a.name, edition: a.edition, campaignId: a.campaignId ?? null, biography: a.biography ?? {}, status: a.status ?? 'active', currentRevisionId: revId }),
      ...this.revisionWrites(id, revId, 1, null, 'create', a.build, a.summary, a.snapshots, a.engineVersion),
      this.db.insert(t.characterState).values({ characterId: id, hpCurrent: a.hpCurrent ?? a.summary.hp }),
    ];
    (a.inventory ?? []).forEach((it, i) => writes.push(this.db.insert(t.inventoryItem).values({ id: ulid(), characterId: id, contentUid: it.contentUid, qty: it.qty, slot: it.slot ?? null, sortOrder: i })));
    await this.db.batch(writes as unknown as [any, ...any[]]);
    return id;
  }

  async addRevision(characterId: string, kind: RevisionRow['kind'], build: CharacterBuild, summary: Summary, snapshots: MechanicsSnapshot[], engineVersion: string, note?: string) {
    const bundle = await this.getCharacter(characterId);
    if (!bundle) throw new Error('Персонаж не найден');
    const seq = Math.max(...bundle.revisions.map((r) => r.seq)) + 1;
    const revId = ulid();
    await this.db.batch([
      ...this.revisionWrites(characterId, revId, seq, bundle.revision.id, kind, build, summary, snapshots, engineVersion, note),
      this.db.update(t.character).set({ currentRevisionId: revId, updatedAt: new Date() }).where(eq(t.character.id, characterId)),
    ] as unknown as [any, ...any[]]);
    return revId;
  }

  /** Отмена последнего изменения: указатель на родителя. Ревизия остаётся в истории. */
  async undo(characterId: string): Promise<boolean> {
    const b = await this.getCharacter(characterId);
    if (!b?.revision.parentId) return false;
    await this.db.update(t.character).set({ currentRevisionId: b.revision.parentId, updatedAt: new Date() }).where(eq(t.character.id, characterId));
    return true;
  }

  /** Восстановление старой версии — новая ревизия с копией журнала решений. */
  async restore(characterId: string, revisionId: string, summary: Summary, snapshots: MechanicsSnapshot[], engineVersion: string) {
    const [old] = await this.db.select().from(t.characterRevision).where(and(eq(t.characterRevision.id, revisionId), eq(t.characterRevision.characterId, characterId)));
    if (!old) throw new Error('Версия не найдена');
    return this.addRevision(characterId, 'restore', old.build, summary, snapshots, engineVersion, `Восстановлена версия №${old.seq}`);
  }

  async updateCharacter(id: string, patch: Partial<Pick<CharacterRow, 'name' | 'status' | 'biography' | 'campaignId' | 'playerId' | 'archived'>>) {
    await this.db.update(t.character).set({ ...patch, updatedAt: new Date() }).where(eq(t.character.id, id));
  }
  async deleteCharacter(id: string) {
    await this.db.delete(t.character).where(eq(t.character.id, id));
  }

  async duplicateCharacter(id: string, engineVersion: string) {
    const b = await this.getCharacter(id);
    if (!b) throw new Error('Персонаж не найден');
    return this.createCharacter({ name: `${b.character.name} (копия)`, edition: b.character.edition, build: b.revision.build, summary: b.revision.summary, snapshots: b.snapshots, engineVersion,
      campaignId: b.character.campaignId, biography: b.character.biography, inventory: b.inventory.filter((i) => i.contentUid).map((i) => ({ contentUid: i.contentUid!, qty: i.qty, slot: i.slot })) });
  }

  async saveState(characterId: string, patch: Partial<Omit<StateRow, 'characterId'>>) {
    await this.db.update(t.characterState).set({ ...patch, updatedAt: new Date() }).where(eq(t.characterState.characterId, characterId));
  }

  // --- инвентарь
  async addItem(characterId: string, item: { contentUid?: string; customName?: string; qty?: number; slot?: InventoryRow['slot'] }) {
    const id = ulid();
    await this.db.insert(t.inventoryItem).values({ id, characterId, contentUid: item.contentUid ?? null, customName: item.customName ?? null, qty: item.qty ?? 1, slot: item.slot ?? null, sortOrder: Date.now() % 1e9 });
    return id;
  }
  async updateItem(id: string, patch: Partial<Omit<InventoryRow, 'id' | 'characterId'>>) {
    await this.db.update(t.inventoryItem).set(patch).where(eq(t.inventoryItem.id, id));
  }
  async removeItem(id: string) { await this.db.delete(t.inventoryItem).where(eq(t.inventoryItem.id, id)); }

  // --- кампании
  async listCampaigns() { return this.db.select().from(t.campaign).orderBy(desc(t.campaign.updatedAt)); }
  async getCampaign(id: string) {
    const [campaign] = await this.db.select().from(t.campaign).where(eq(t.campaign.id, id));
    if (!campaign) return undefined;
    const characters = await this.db.select().from(t.character).where(eq(t.character.campaignId, id));
    const logs = await this.db.select().from(t.adventureLog).where(eq(t.adventureLog.campaignId, id)).orderBy(desc(t.adventureLog.createdAt));
    const players = await this.db.select({ id: t.player.id, name: t.player.name, role: t.campaignPlayer.role }).from(t.campaignPlayer).innerJoin(t.player, eq(t.player.id, t.campaignPlayer.playerId)).where(eq(t.campaignPlayer.campaignId, id));
    const notes = await this.db.select().from(t.note).where(and(eq(t.note.ownerType, 'campaign'), eq(t.note.ownerId, id))).orderBy(desc(t.note.createdAt));
    return { campaign, characters, logs, players, notes };
  }
  async createCampaign(c: { name: string; edition: Edition; mode?: CampaignRow['mode']; description?: string; dmName?: string; currentLevel?: number }) {
    const id = ulid();
    await this.db.insert(t.campaign).values({ id, name: c.name, edition: c.edition, mode: c.mode ?? 'campaign', description: c.description ?? null, dmName: c.dmName ?? null, currentLevel: c.currentLevel ?? null });
    return id;
  }
  async updateCampaign(id: string, patch: Partial<Omit<CampaignRow, 'id' | 'createdAt'>>) {
    await this.db.update(t.campaign).set({ ...patch, updatedAt: new Date() }).where(eq(t.campaign.id, id));
  }
  async deleteCampaign(id: string) { await this.db.delete(t.campaign).where(eq(t.campaign.id, id)); }
  async addPlayer(campaignId: string, name: string, role: 'player' | 'dm' | 'guest' = 'player') {
    const id = ulid();
    await this.db.batch([this.db.insert(t.player).values({ id, name }), this.db.insert(t.campaignPlayer).values({ campaignId, playerId: id, role })]);
    return id;
  }
  async removePlayer(campaignId: string, playerId: string) {
    await this.db.delete(t.campaignPlayer).where(and(eq(t.campaignPlayer.campaignId, campaignId), eq(t.campaignPlayer.playerId, playerId)));
  }
  async addLog(campaignId: string, log: { title: string; body?: string; sessionNo?: number; levelAfter?: number }) {
    const id = ulid();
    await this.db.insert(t.adventureLog).values({ id, campaignId, title: log.title, body: log.body ?? null, sessionNo: log.sessionNo ?? null, levelAfter: log.levelAfter ?? null, playedAt: new Date() });
    return id;
  }
  async removeLog(id: string) { await this.db.delete(t.adventureLog).where(eq(t.adventureLog.id, id)); }
  async addNote(ownerType: 'campaign' | 'character', ownerId: string, body: string, title?: string) {
    const id = ulid();
    await this.db.insert(t.note).values({ id, ownerType, ownerId, body, title: title ?? null });
    return id;
  }
  async listNotes(ownerType: 'campaign' | 'character', ownerId: string) {
    return this.db.select().from(t.note).where(and(eq(t.note.ownerType, ownerType), eq(t.note.ownerId, ownerId))).orderBy(desc(t.note.createdAt));
  }
  async removeNote(id: string) { await this.db.delete(t.note).where(eq(t.note.id, id)); }

  // --- контент-пакеты пользователя
  /** Встроенные пакеты: только запись об источнике и включённости. Пользовательские — целиком. */
  async registerPackage(pkg: ContentPackage, origin: 'builtin' | 'imported' | 'homebrew', storeItems: boolean) {
    const s = pkg.source;
    const hash = mechanicsHash(pkg.kind === 'content' ? pkg.items.map((i) => i.id) : pkg.entries.map((e) => e.uid));
    const writes: any[] = [
      this.db.insert(t.contentSource).values({ id: s.id, title: s.title, publisher: s.publisher ?? null, edition: s.edition, documentVersion: s.documentVersion, url: s.url ?? null, licenseCode: s.license.code, licenseUrl: s.license.url ?? null, attribution: s.license.attribution ?? null, modifications: s.license.modifications ?? null, rightsBasis: s.license.rightsBasis ?? null, allowedUse: s.allowedUse })
        .onConflictDoNothing(),
      this.db.update(t.contentPackage).set({ active: false }).where(eq(t.contentPackage.id, pkg.id)),
      this.db.insert(t.contentPackage).values({ id: pkg.id, version: pkg.version, sourceId: s.id, name: pkg.name, namespace: pkg.kind === 'content' ? pkg.namespace : null, edition: pkg.kind === 'content' ? pkg.edition : null, formatVersion: pkg.formatVersion, origin, kind: pkg.kind, language: pkg.language, targetPackageId: pkg.kind === 'translation' ? pkg.target.packageId : null, hash, active: true })
        .onConflictDoUpdate({ target: [t.contentPackage.id, t.contentPackage.version], set: { active: true, hash } }),
    ];
    if (storeItems) {
      writes.push(this.db.delete(t.contentItem).where(and(eq(t.contentItem.packageId, pkg.id), eq(t.contentItem.packageVersion, pkg.version))));
      writes.push(this.db.delete(t.contentItemText).where(and(eq(t.contentItemText.fromPackageId, pkg.id), eq(t.contentItemText.fromPackageVersion, pkg.version))));
      if (pkg.kind === 'content') {
        for (let i = 0; i < pkg.items.length; i += 40) {
          const chunk = pkg.items.slice(i, i + 40);
          writes.push(this.db.insert(t.contentItem).values(chunk.map((it) => ({
            uid: it.id, packageId: pkg.id, packageVersion: pkg.version, type: it.type, edition: it.edition, name: it.name, tags: it.tags,
            mechanics: { m: it.mechanics, prerequisite: it.prerequisite, requires: it.requires, sourceRef: it.sourceRef },
            spellLevel: it.type === 'spell' ? it.mechanics.level : null, spellSchool: it.type === 'spell' ? it.mechanics.school : null,
            concentration: it.type === 'spell' ? it.mechanics.concentration : null, ritual: it.type === 'spell' ? it.mechanics.ritual : null,
            sourceRef: it.sourceRef ?? null, hash: mechanicsHash({ m: it.mechanics, p: it.prerequisite }),
          }))));
          const texts = chunk.filter((it) => it.text?.body || it.text?.summary);
          if (texts.length) writes.push(this.db.insert(t.contentItemText).values(texts.map((it) => ({ uid: it.id, locale: pkg.language, fromPackageId: pkg.id, fromPackageVersion: pkg.version, name: it.name, summary: it.text?.summary ?? null, body: it.text?.body ?? null }))));
        }
      } else {
        for (let i = 0; i < pkg.entries.length; i += 60) {
          writes.push(this.db.insert(t.contentItemText).values(pkg.entries.slice(i, i + 60).map((e) => ({ uid: e.uid, locale: pkg.language, fromPackageId: pkg.id, fromPackageVersion: pkg.version, name: e.name, summary: e.summary ?? null, body: e.body ?? null, sourceTextHash: e.sourceTextHash ?? null }))));
        }
      }
    }
    await this.db.batch(writes as unknown as [any, ...any[]]);
  }

  async listPackages() {
    return this.db.select({ pkg: t.contentPackage, source: t.contentSource }).from(t.contentPackage).innerJoin(t.contentSource, eq(t.contentSource.id, t.contentPackage.sourceId)).where(eq(t.contentPackage.active, true));
  }
  async setPackageEnabled(id: string, enabled: boolean) {
    await this.db.update(t.contentPackage).set({ enabled }).where(eq(t.contentPackage.id, id));
  }

  /** Пакет, сохранённый в базе, — обратно в формат пакета (для резолвера). */
  async loadStoredPackage(id: string): Promise<ContentPackage | undefined> {
    const [row] = await this.db.select({ pkg: t.contentPackage, source: t.contentSource }).from(t.contentPackage).innerJoin(t.contentSource, eq(t.contentSource.id, t.contentPackage.sourceId)).where(and(eq(t.contentPackage.id, id), eq(t.contentPackage.active, true)));
    if (!row || row.pkg.origin === 'builtin') return undefined;
    const s = row.source;
    const source = { id: s.id, title: s.title, publisher: s.publisher ?? undefined, edition: s.edition, documentVersion: s.documentVersion, url: s.url ?? undefined, license: { code: s.licenseCode as never, url: s.licenseUrl ?? undefined, attribution: s.attribution ?? undefined, modifications: s.modifications ?? undefined, rightsBasis: s.rightsBasis ?? undefined }, allowedUse: s.allowedUse };
    const texts = await this.db.select().from(t.contentItemText).where(and(eq(t.contentItemText.fromPackageId, id), eq(t.contentItemText.fromPackageVersion, row.pkg.version)));
    if (row.pkg.kind === 'translation') {
      return { formatVersion: 1, kind: 'translation', id, name: row.pkg.name, version: row.pkg.version, language: row.pkg.language, origin: row.pkg.origin, source, dependencies: [], target: { packageId: row.pkg.targetPackageId!, range: '*' },
        entries: texts.map((x) => ({ uid: x.uid, name: x.name, summary: x.summary ?? undefined, body: x.body ?? undefined, sourceTextHash: x.sourceTextHash ?? undefined })) } as ContentPackage;
    }
    const items = await this.db.select().from(t.contentItem).where(and(eq(t.contentItem.packageId, id), eq(t.contentItem.packageVersion, row.pkg.version)));
    const textBy = new Map(texts.map((x) => [x.uid, x]));
    return {
      formatVersion: 1, kind: 'content', id, name: row.pkg.name, version: row.pkg.version, language: row.pkg.language, origin: row.pkg.origin, source, dependencies: [],
      edition: row.pkg.edition!, namespace: row.pkg.namespace!,
      items: items.map((it) => {
        const m = it.mechanics as { m: unknown; prerequisite?: unknown; requires?: string[]; sourceRef?: string };
        const tx = textBy.get(it.uid);
        return { id: it.uid, name: it.name, edition: it.edition, type: it.type, tags: it.tags, requires: m.requires ?? [], prerequisite: m.prerequisite, sourceRef: m.sourceRef, mechanics: m.m, text: tx ? { summary: tx.summary ?? undefined, body: tx.body ?? undefined } : undefined };
      }),
    } as ContentPackage;
  }

  /** Удаление пакета. Персонажи продолжают считаться по снимкам механики в своих ревизиях. */
  async deletePackage(id: string, alsoSnapshots = false) {
    const writes: any[] = [
      this.db.delete(t.contentItem).where(eq(t.contentItem.packageId, id)),
      this.db.delete(t.contentItemText).where(eq(t.contentItemText.fromPackageId, id)),
      this.db.delete(t.contentPackage).where(eq(t.contentPackage.id, id)),
    ];
    if (alsoSnapshots) writes.push(this.db.update(t.characterContentRef).set({ mechanicsSnapshot: null }).where(eq(t.characterContentRef.packageId, id)));
    await this.db.batch(writes as unknown as [any, ...any[]]);
  }

  // --- резервная копия
  async exportDatabase(): Promise<Uint8Array> {
    if (!this.transport) throw new Error('Нет доступа к файлу базы');
    return this.transport.exportDb();
  }
  async importDatabase(bytes: Uint8Array) {
    if (!this.transport) throw new Error('Нет доступа к файлу базы');
    const head = new TextDecoder().decode(bytes.slice(0, 15));
    if (head !== 'SQLite format 3') throw new Error('Это не файл базы SQLite');
    await this.transport.importDb(bytes);
  }
}
