/** Помощники мастера создания: план уровней, распределение характеристик, стартовые наборы. */
import type { AbilityId, CharacterBuild, ContentUid, Edition, LevelEntry } from '../../core/types';
import type { Library } from '../content';
import { byType, nameOf } from '../content';

export type ClassPlan = { classUid: string; levels: number }[];

/** План классов → записи уровней. Сделанные выборы сохраняются, если класс и его уровень не изменились. */
export function applyPlan(b: CharacterBuild, plan: ClassPlan): CharacterBuild {
  const old = new Map(b.levels.map((l) => [`${l.classUid}#${l.classLevel}`, l]));
  const seq: string[] = [];
  const [first, ...rest] = plan.filter((p) => p.levels > 0);
  if (first) { seq.push(...Array(first.levels).fill(first.classUid)); for (const p of rest) seq.push(...Array(p.levels).fill(p.classUid)); }
  const seen: Record<string, number> = {};
  const levels: LevelEntry[] = seq.map((uid, i) => {
    const cl = (seen[uid] = (seen[uid] ?? 0) + 1);
    const prev = old.get(`${uid}#${cl}`);
    return { characterLevel: i + 1, classUid: uid as ContentUid, classLevel: cl, hpRoll: prev?.hpRoll, choices: prev?.choices ?? [] };
  });
  return { ...b, levels };
}
export function planOf(b: CharacterBuild): ClassPlan {
  const out: ClassPlan = [];
  for (const l of b.levels) { const p = out.find((x) => x.classUid === l.classUid); if (p) p.levels++; else out.push({ classUid: l.classUid, levels: 1 }); }
  return out;
}

export function priorityFor(lib: Library, classUid?: string): AbilityId[] {
  const prim = ((classUid && (lib.items.get(classUid)?.item.mechanics as { primaryAbilities?: AbilityId[] })?.primaryAbilities) || []) as AbilityId[];
  return [...prim, 'con', 'dex', 'wis', 'str', 'int', 'cha'].filter((a, i, arr) => arr.indexOf(a) === i) as AbilityId[];
}
export function assign(values: number[], prio: AbilityId[]): Record<AbilityId, number> {
  const sorted = [...values].sort((a, b) => b - a);
  return Object.fromEntries(prio.map((a, i) => [a, sorted[i] ?? 8])) as Record<AbilityId, number>;
}
export function roll4d6(): number[] {
  return Array.from({ length: 6 }, () => {
    const d = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
    return d[1]! + d[2]! + d[3]!;
  });
}
export const POINT_BUY_DEFAULT = [15, 15, 13, 10, 10, 8];

/** Вид и подвид одним списком: если у вида есть подвиды, выбирается подвид. */
export function speciesOptions(lib: Library, edition: Edition, lang: 'ru' | 'en') {
  const species = byType(lib, 'species', edition);
  const subs = byType(lib, 'subspecies', edition);
  const out: { uid: string; label: string; group: string }[] = [];
  for (const s of species) {
    const children = subs.filter((x) => (x.mechanics as { parent?: string }).parent === s.id);
    if (!children.length || edition === '2024') out.push({ uid: s.id, label: nameOf(lib, s.id, lang), group: nameOf(lib, s.id, lang) });
    for (const c of children) out.push({ uid: c.id, label: nameOf(lib, c.id, lang), group: nameOf(lib, s.id, lang) });
  }
  return out;
}

const KITS: Record<string, string[]> = {
  barbarian: ['greataxe', 'handaxe'], bard: ['leather-armor', 'rapier', 'dagger'], cleric: ['scale-mail', 'shield', 'mace'], druid: ['leather-armor', 'shield', 'scimitar'],
  fighter: ['chain-mail', 'shield', 'longsword', 'light-crossbow', 'crossbow-light'], monk: ['shortsword', 'dart'], paladin: ['chain-mail', 'shield', 'longsword', 'javelin'], ranger: ['leather-armor', 'longbow', 'shortsword'],
  rogue: ['leather-armor', 'rapier', 'shortbow', 'dagger'], sorcerer: ['dagger', 'light-crossbow', 'crossbow-light'], warlock: ['leather-armor', 'dagger', 'light-crossbow', 'crossbow-light'], wizard: ['quarterstaff', 'dagger'],
};
const TWO_HANDED = (lib: Library, uid: string) => ((lib.items.get(uid)?.item.mechanics as { properties?: string[] })?.properties ?? []).includes('two-handed');

/** Стартовый набор класса из снаряжения SRD, сразу с надетым доспехом и оружием в руке. */
export function starterKit(lib: Library, classUid: string) {
  const cls = classUid.slice(classUid.lastIndexOf('/') + 1);
  const ns = classUid.split(':')[0];
  const out: { contentUid: string; qty: number; slot: 'armor' | 'shield' | 'main-hand' | 'two-hands' | null }[] = [];
  let hasMain = false;
  for (const slug of KITS[cls] ?? []) {
    const uid = [`${ns}:armor/${slug}`, `${ns}:weapon/${slug}`].find((u) => lib.items.has(u));
    if (!uid || out.some((o) => o.contentUid === uid)) continue;
    const it = lib.items.get(uid)!.item;
    if (it.type === 'armor') out.push({ contentUid: uid, qty: 1, slot: (it.mechanics as { category: string }).category === 'shield' ? 'shield' : 'armor' });
    else { out.push({ contentUid: uid, qty: slug === 'dart' || slug === 'javelin' ? 5 : 1, slot: hasMain ? null : TWO_HANDED(lib, uid) ? 'two-hands' : 'main-hand' }); hasMain = true; }
  }
  if (out.some((o) => o.slot === 'two-hands')) for (const o of out) if (o.slot === 'shield') o.slot = null;
  return out;
}

const NAMES = ['Аэлина', 'Брогар', 'Вейра', 'Гордрик', 'Дарина', 'Эйвин', 'Жослен', 'Зарек', 'Ильва', 'Кассиан', 'Лиара', 'Морвен', 'Нерис', 'Освальд', 'Пейдж', 'Ровена', 'Сайлас', 'Талия', 'Ульрик', 'Фаэлан', 'Хельга', 'Ценна', 'Шейн', 'Элдрин', 'Юна', 'Ярослав'];
export const randomName = () => NAMES[Math.floor(Math.random() * NAMES.length)]!;
