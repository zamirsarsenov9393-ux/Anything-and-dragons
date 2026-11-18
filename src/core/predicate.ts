/** Условия эффектов («без доспехов», «без щита», «монах 2+»). */
import type { Predicate } from '../content/schema';

export interface PredicateScope {
  armor: 'none' | 'light' | 'medium' | 'heavy';
  shield: boolean;
  /** уровень по полному uid класса */
  classLevels: Record<string, number>;
  totalLevel: number;
  abilities: Record<string, number>;
  features: Set<string>;
  proficiencies: Set<string>;
  equipped: Set<string>;
  attuned: Set<string>;
}

export function evaluatePredicate(p: Predicate | undefined, s: PredicateScope): boolean {
  if (!p) return true;
  if ('all' in p) return p.all.every((x) => evaluatePredicate(x, s));
  if ('any' in p) return p.any.some((x) => evaluatePredicate(x, s));
  if ('not' in p) return !evaluatePredicate(p.not, s);
  if ('armor' in p) return p.armor === 'any' ? s.armor !== 'none' : s.armor === p.armor;
  if ('shield' in p) return s.shield === p.shield;
  if ('classLevel' in p) return (s.classLevels[p.classLevel.class] ?? 0) >= p.classLevel.min;
  if ('totalLevel' in p) return s.totalLevel >= p.totalLevel.min;
  if ('abilityMin' in p) return (s.abilities[p.abilityMin.ability] ?? 0) >= p.abilityMin.value;
  if ('hasFeature' in p) return s.features.has(p.hasFeature);
  if ('proficient' in p) return s.proficiencies.has(p.proficient);
  if ('equipped' in p) return s.equipped.has(p.equipped);
  if ('attuned' in p) return s.attuned.has(p.attuned);
  return false;
}

/** Человеческое описание условия — для сообщений валидации. */
export function describePredicate(p: Predicate): string {
  if ('all' in p) return p.all.map(describePredicate).join(' и ');
  if ('any' in p) return p.any.map(describePredicate).join(' или ');
  if ('not' in p) return `не (${describePredicate(p.not)})`;
  if ('abilityMin' in p) return `${p.abilityMin.ability.toUpperCase()} ${p.abilityMin.value}+`;
  if ('classLevel' in p) return `${p.classLevel.class} ${p.classLevel.min}+`;
  if ('totalLevel' in p) return `уровень ${p.totalLevel.min}+`;
  return JSON.stringify(p);
}
