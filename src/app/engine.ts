/** Связка интерфейса с движком правил и базой. */
import { useCallback, useEffect, useState } from 'react';
import { compute, ENGINE_VERSION } from '../core/engine/compute';
import type { CharacterBuild, ContentUid, EngineResult, EquippedItem, Edition } from '../core/types';
import type { CharacterBundle, InventoryRow, Summary } from '../data/repo';
import { nameOf, type Library } from './content';
import { useApp } from './store';
import type { MemoryResolver } from '../content/resolver';

export { ENGINE_VERSION };

export function equipmentOf(inv: InventoryRow[]): EquippedItem[] {
  return inv.filter((i) => i.contentUid && i.slot).map((i) => ({ uid: i.contentUid as ContentUid, slot: i.slot, attuned: i.attuned, magicBonus: i.magicBonus }));
}

export function classLine(r: EngineResult, lib: Library, lang: 'ru' | 'en') {
  return Object.entries(r.sheet.classLevels).map(([uid, l]) => `${nameOf(lib, uid, lang)} ${l}`).join(' / ') || '—';
}

export function summaryOf(r: EngineResult, lib: Library, lang: 'ru' | 'en'): Summary {
  return { level: r.sheet.totalLevel, classes: classLine(r, lib, lang), ac: r.sheet.armorClass.value, hp: r.sheet.hitPointsMax.value };
}

export function emptyBuild(edition: Edition): CharacterBuild {
  return {
    schemaVersion: 1, edition,
    options: { abilityMethod: 'standard-array', hpMethod: 'average', allowFeats: true, allowMulticlass: true, allowCrossEdition: false, variantRules: [] },
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    originChoices: [], levels: [],
  };
}

/** Записать результат расчёта в базу новой ревизией. */
export async function persistRevision(characterId: string, kind: 'level-up' | 'edit' | 'restore' | 'content-migration', build: CharacterBuild, resolver: MemoryResolver, inv: InventoryRow[], note?: string) {
  const { repo, lib, contentLang } = useApp.getState();
  const r = compute(build, resolver, { equipment: equipmentOf(inv) });
  await repo!.addRevision(characterId, kind, build, summaryOf(r, lib!, contentLang), resolver.snapshotOf(r.usedContent), ENGINE_VERSION, note);
  return r;
}

export function useCharacter(id: string) {
  const { repo, lib, version } = useApp();
  const [bundle, setBundle] = useState<CharacterBundle | null | undefined>(undefined);
  const reload = useCallback(async () => { setBundle((await repo!.getCharacter(id)) ?? null); }, [repo, id]);
  useEffect(() => { void reload(); }, [reload, version]);
  if (!bundle || !lib) return { bundle, reload } as const;
  const resolver = lib.resolver.withSnapshots(bundle.snapshots);
  const result = compute(bundle.revision.build, resolver, { equipment: equipmentOf(bundle.inventory) });
  return { bundle, reload, resolver, result } as const;
}
