/** Экспорт и импорт персонажа в JSON, сохранение файлов на телефоне. */
import { z } from 'zod';
import { compute } from '../core/engine/compute';
import type { CharacterBuild, ContentUid } from '../core/types';
import type { CharacterBundle } from '../data/repo';
import type { MechanicsSnapshot } from '../content/resolver';
import { ENGINE_VERSION, equipmentOf, summaryOf } from './engine';
import { useApp } from './store';
import { tr } from './i18n';

export async function saveFile(name: string, data: Blob) {
  const file = new File([data], name, { type: data.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const exportSchema = z.object({
  format: z.literal('aandd-character'),
  version: z.literal(1),
  character: z.object({ name: z.string().min(1), edition: z.enum(['2014', '2024']), status: z.string().optional(), biography: z.record(z.string(), z.string()).optional() }),
  build: z.custom<CharacterBuild>((v) => !!v && typeof v === 'object' && Array.isArray((v as CharacterBuild).levels) && !!(v as CharacterBuild).baseAbilities),
  inventory: z.array(z.object({ contentUid: z.string().nullable().optional(), customName: z.string().nullable().optional(), qty: z.number(), slot: z.string().nullable().optional(), attuned: z.boolean().optional(), magicBonus: z.number().optional() })).default([]),
  state: z.record(z.string(), z.unknown()).optional(),
  content: z.array(z.object({ uid: z.string(), packageId: z.string(), packageVersion: z.string(), hash: z.string(), name: z.string(), type: z.string().optional(), edition: z.string().optional(), mechanics: z.unknown().optional(), prerequisite: z.unknown().optional() })).default([]),
});

/** В файл попадает механика только из источников, которые разрешают делиться. */
export function exportCharacter(b: CharacterBundle) {
  const { lib } = useApp.getState();
  const shareable = new Set(lib!.packages.filter((p) => p.pkg.source.allowedUse.share).map((p) => p.pkg.id));
  const content = b.snapshots.map((s) => (shareable.has(s.packageId) ? s : { uid: s.uid, packageId: s.packageId, packageVersion: s.packageVersion, hash: s.hash, name: s.name }));
  const data = {
    format: 'aandd-character', version: 1, exportedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION,
    character: { name: b.character.name, edition: b.character.edition, status: b.character.status, biography: b.character.biography },
    build: b.revision.build,
    inventory: b.inventory.map((i) => ({ contentUid: i.contentUid, customName: i.customName, qty: i.qty, slot: i.slot, attuned: i.attuned, magicBonus: i.magicBonus })),
    state: { currency: b.state.currency, preparedSpells: b.state.preparedSpells, conditions: b.state.conditions },
    content,
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function importCharacterFile(file: File): Promise<string | undefined> {
  const { repo, lib, contentLang, toast } = useApp.getState();
  try {
    const parsed = exportSchema.safeParse(JSON.parse(await file.text()));
    if (!parsed.success) { toast(tr('Это не файл персонажа A&D', 'This is not an A&D character file'), 'error'); return; }
    const d = parsed.data;
    const snaps = d.content.filter((c) => c.mechanics !== undefined).map((c) => ({ ...c, type: c.type ?? 'feature', edition: (c.edition ?? 'any') as MechanicsSnapshot['edition'], uid: c.uid as ContentUid })) as MechanicsSnapshot[];
    const resolver = lib!.resolver.withSnapshots(snaps);
    const inv = d.inventory.map((i, n) => ({ id: String(n), characterId: '', contentUid: i.contentUid ?? null, customName: i.customName ?? null, customMechanics: null, qty: i.qty, slot: (i.slot ?? null) as never, attuned: !!i.attuned, containerId: null, magicBonus: i.magicBonus ?? 0, chargesUsed: 0, notes: null, sortOrder: n }));
    const r = compute(d.build, resolver, { equipment: equipmentOf(inv) });
    const id = await repo!.createCharacter({
      name: d.character.name, edition: d.character.edition, build: d.build, summary: summaryOf(r, lib!, contentLang), snapshots: resolver.snapshotOf(r.usedContent), engineVersion: ENGINE_VERSION,
      biography: d.character.biography, inventory: d.inventory.filter((i) => i.contentUid).map((i) => ({ contentUid: i.contentUid!, qty: i.qty, slot: (i.slot ?? null) as never })),
    });
    if (d.state) await repo!.saveState(id, { currency: d.state.currency as never, preparedSpells: (d.state.preparedSpells ?? {}) as never });
    const missing = r.issues.filter((i) => i.code === 'content-missing').length;
    toast(missing ? tr(`Импортировано. Не установлено элементов контента: ${missing}`, `Imported. Missing content items: ${missing}`) : tr('Персонаж импортирован', 'Character imported'), missing ? 'warn' : 'ok');
    return id;
  } catch (e) {
    toast(`${tr('Ошибка импорта', 'Import failed')}: ${(e as Error).message}`, 'error');
  }
}
