import type { AbilityId, CharacterBuild, ChoiceResolution, ContentUid, Edition, LevelEntry } from '../../src/core/types';

type Scores = [number, number, number, number, number, number];
const AB: AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function scores(s: Scores): Record<AbilityId, number> {
  return Object.fromEntries(AB.map((a, i) => [a, s[i]!])) as Record<AbilityId, number>;
}

/** План уровней: ['wizard', 'wizard', 'cleric'] + выборы по номеру уровня. */
export function levels(ns: string, plan: string[], choices: Record<number, Record<string, string[]>> = {}): LevelEntry[] {
  const seen: Record<string, number> = {};
  return plan.map((cls, i) => {
    const uid = `${ns}:class/${cls}` as ContentUid;
    seen[uid] = (seen[uid] ?? 0) + 1;
    const ch: ChoiceResolution[] = Object.entries(choices[i + 1] ?? {}).map(([choiceId, selected]) => ({ choiceId, selected }));
    return { characterLevel: i + 1, classUid: uid, classLevel: seen[uid]!, choices: ch };
  });
}

export function build(edition: Edition, p: Partial<CharacterBuild> & { base: Scores }): CharacterBuild {
  const { base, ...rest } = p;
  return {
    schemaVersion: 1, edition,
    options: { abilityMethod: 'manual', hpMethod: 'average', allowFeats: true, allowMulticlass: true, allowCrossEdition: false, variantRules: [] },
    baseAbilities: scores(base),
    originChoices: [],
    levels: [],
    ...rest,
  };
}
