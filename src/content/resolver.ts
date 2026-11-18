/**
 * Резолвер контента в памяти: пакеты + снимки механики из ревизии персонажа.
 * Тот же интерфейс потом реализует слой БД.
 */
import type { ContentResolver, ContentUid, Edition, PinnedRef, ResolvedItem } from '../core/types';
import type { ContentItem, ContentPackage } from './schema';
import { mechanicsHash } from './hash';

export interface MechanicsSnapshot extends PinnedRef {
  type: string;
  edition: Edition | 'any';
  name: string;
  mechanics: unknown;
  prerequisite?: unknown;
}

export class MemoryResolver implements ContentResolver {
  private items = new Map<string, ResolvedItem>();
  private snapshots = new Map<string, MechanicsSnapshot>();

  constructor(packages: ContentPackage[], snapshots: MechanicsSnapshot[] = []) {
    for (const pkg of packages) {
      if (pkg.kind !== 'content') continue;
      for (const it of pkg.items as ContentItem[]) {
        // хэш считается лениво: на телефоне тысячи SHA-256 при каждом открытии ни к чему
        let hash: string | undefined;
        const pinned = { uid: it.id as ContentUid, packageId: pkg.id, packageVersion: pkg.version } as PinnedRef;
        Object.defineProperty(pinned, 'hash', { enumerable: true, get: () => (hash ??= mechanicsHash({ m: it.mechanics, p: it.prerequisite })) });
        this.items.set(it.id, {
          uid: it.id as ContentUid,
          type: it.type,
          edition: it.edition,
          name: it.name,
          mechanics: it.mechanics,
          prerequisite: it.prerequisite,
          pinned,
          fromSnapshot: false,
        });
      }
    }
    for (const s of snapshots) this.snapshots.set(s.uid, s);
  }

  /** Тот же контент + снимки конкретного персонажа, без повторной индексации пакетов. */
  withSnapshots(snapshots: MechanicsSnapshot[]): MemoryResolver {
    const r = Object.create(MemoryResolver.prototype) as MemoryResolver;
    r.items = this.items;
    r.snapshots = new Map(snapshots.map((s) => [s.uid, s]));
    return r;
  }

  get(uid: ContentUid): ResolvedItem | undefined {
    const live = this.items.get(uid);
    if (live) return live;
    const s = this.snapshots.get(uid);
    if (!s) return undefined;
    return { uid: s.uid, type: s.type, edition: s.edition, name: s.name, mechanics: s.mechanics, prerequisite: s.prerequisite, fromSnapshot: true,
      pinned: { uid: s.uid, packageId: s.packageId, packageVersion: s.packageVersion, hash: s.hash } };
  }

  query(filter: { type: string; edition: Edition; where?: Record<string, unknown> }): ResolvedItem[] {
    const out: ResolvedItem[] = [];
    for (const it of this.items.values()) {
      if (it.type !== filter.type) continue;
      if (it.edition !== filter.edition && it.edition !== 'any') continue;
      const m = it.mechanics as Record<string, unknown>;
      if (filter.where && !Object.entries(filter.where).every(([k, v]) => m[k] === v)) continue;
      out.push(it);
    }
    return out.sort((a, b) => a.uid.localeCompare(b.uid));
  }

  /** Снимки для сохранения рядом с ревизией персонажа. */
  snapshotOf(refs: PinnedRef[]): MechanicsSnapshot[] {
    return refs.flatMap((r) => {
      const it = this.get(r.uid);
      return it ? [{ uid: r.uid, packageId: r.packageId, packageVersion: r.packageVersion, hash: r.hash, type: it.type, edition: it.edition, name: it.name, mechanics: it.mechanics, prerequisite: it.prerequisite }] : [];
    });
  }
}
