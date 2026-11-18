/**
 * Автоматическое закрытие выборов — основа «быстрого создания» для ваншотов.
 * Повторяет расчёт и закрывает открытые выборы разумными значениями,
 * пока выборов не останется. Пользователь потом может поменять любое решение.
 */
import { compute } from './compute';
import { ABILITIES, type AbilityId, type CharacterBuild, type ComputeOptions, type ContentResolver, type ContentUid, type PendingChoice } from '../types';

export interface AutoPrefs {
  /** характеристики по убыванию важности; по умолчанию — из основных характеристик класса */
  abilityPriority?: AbilityId[];
}

function priorities(build: CharacterBuild, resolver: ContentResolver, prefs: AutoPrefs): AbilityId[] {
  if (prefs.abilityPriority?.length) return prefs.abilityPriority;
  const first = build.levels[0] && resolver.get(build.levels[0].classUid);
  const prim = ((first?.mechanics as { primaryAbilities?: AbilityId[] } | undefined)?.primaryAbilities ?? []);
  const byScore = [...ABILITIES].sort((a, b) => build.baseAbilities[b] - build.baseAbilities[a]);
  return [...prim, 'con', ...byScore].filter((a, i, arr) => arr.indexOf(a) === i) as AbilityId[];
}

export function autoResolve(input: CharacterBuild, resolver: ContentResolver, opts: ComputeOptions = {}, prefs: AutoPrefs = {}): CharacterBuild {
  const b: CharacterBuild = structuredClone(input);
  const prio = priorities(b, resolver, prefs);
  for (let guard = 0; guard < 80; guard++) {
    const r = compute(b, resolver, opts);
    const todo = r.pending.filter((p) => p.required);
    if (!todo.length) break;
    const p = todo[0]!;
    // решение на уровне L принимается по состоянию персонажа на этом уровне, а не на финальном
    const at = p.level >= 1 && p.level < b.levels.length ? compute({ ...b, levels: b.levels.slice(0, p.level) }, resolver, opts).sheet : r.sheet;
    const scores = Object.fromEntries(ABILITIES.map((a) => [a, at.abilities[a].value])) as Record<AbilityId, number>;
    const selected = choose(p, at.skills, scores, prio);
    if (p.choiceId === 'origin#species') { b.speciesUid = selected[0] as ContentUid; continue; }
    if (p.choiceId === 'origin#background') { b.backgroundUid = selected[0] as ContentUid; continue; }
    if (!selected.length) break;
    const target = p.level >= 1 ? b.levels[p.level - 1]!.choices : b.originChoices;
    target.push({ choiceId: p.choiceId, selected });
  }
  return b;
}

function choose(p: PendingChoice, skills: Record<string, { proficiency: number }>, scores: Record<AbilityId, number>, prio: AbilityId[]): string[] {
  const opts = p.options as string[];
  if (p.choiceId.includes('#asi@')) {
    // +2 к главной характеристике, пока она ниже 20; иначе к следующей
    const open = prio.filter((x) => scores[x] < 20);
    const a = open[0];
    if (!a) return opts.slice(0, 2);
    if (scores[a] <= 18) return [a, a];
    return [a, open[1] ?? a];
  }
  if (p.choiceId.endsWith('#ability-scores')) {
    const ranked = [...opts].sort((x, y) => prio.indexOf(x as AbilityId) - prio.indexOf(y as AbilityId));
    return [ranked[0]!, ranked[0]!, ranked[1]!];
  }
  const allAbilities = opts.length && opts.every((o) => (ABILITIES as readonly string[]).includes(o));
  if (allAbilities) {
    const ranked = [...opts].sort((x, y) => prio.indexOf(x as AbilityId) - prio.indexOf(y as AbilityId));
    return ranked.slice(0, p.pick);
  }
  // навыки: сначала те, которыми ещё не владеет; для компетентности — наоборот, только те, которыми владеет
  const isExpertise = /expertise/.test(p.choiceId);
  const fresh = opts.filter((o) => (skills[o] ? (isExpertise ? skills[o].proficiency === 1 : skills[o].proficiency < 1) : true));
  const pool = fresh.length >= p.pick ? fresh : opts;
  return pool.slice(0, p.pick);
}
