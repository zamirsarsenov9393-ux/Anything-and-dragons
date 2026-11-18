/**
 * Конвейер расчёта листа персонажа.
 * compute(build) → лист + незакрытые выборы + ошибки валидации + использованный контент.
 * Функция чистая: тот же журнал решений и тот же контент всегда дают тот же лист.
 */
import type { ContentItem, Effect, Predicate } from '../../content/schema';
import { evaluateFormula, type FormulaScope } from '../formula';
import { evaluatePredicate, describePredicate, type PredicateScope } from '../predicate';
import { getRuleSet, SKILLS } from '../editions';
import {
  ABILITIES, type AbilityId, type CharacterBuild, type ComputeOptions, type ContentResolver, type ContentUid,
  type EngineResult, type EquippedItem, type MulticlassCasterInput, type PendingChoice, type PinnedRef,
  type ResolvedItem, type RuleSet, type Sheet, type Stat, type StatComponent, type ValidationIssue,
} from '../types';

export const ENGINE_VERSION = '0.2.0';

type ItemOf<T extends string> = ContentItem extends infer I ? (I extends { type: infer U } ? (T extends U ? I : never) : never) : never;
type M<T extends ContentItem['type']> = ItemOf<T>['mechanics'];
type Choice = M<'feature'>['choices'][number];

interface Source {
  uid: ContentUid;
  name: string;
  level: number;
  effects: Effect[];
}

interface HpEntry { level: number; hitDie: number; first: boolean; roll?: number }

const slugOf = (uid: string) => uid.slice(uid.lastIndexOf('/') + 1);
const isUid = (s: string) => /^[a-z0-9-]+:[a-z-]+\/[a-z0-9-]+$/.test(s);
const isAbility = (s: string): s is AbilityId => (ABILITIES as readonly string[]).includes(s);

function stat(components: StatComponent[]): Stat {
  return { value: components.filter((c) => c.kind !== 'ignored').reduce((s, c) => s + c.value, 0), components };
}

/** Эффекты с одинаковым stackKey не складываются: остаётся лучший. */
function dedupeByStack<T extends { e: Effect }>(list: T[], valueOf: (x: T) => number): { kept: T[]; dropped: T[] } {
  const best = new Map<string, T>();
  const kept: T[] = [], dropped: T[] = [];
  for (const x of list) {
    const key = x.e.stackKey;
    if (!key) { kept.push(x); continue; }
    const cur = best.get(key);
    if (!cur) best.set(key, x);
    else if (valueOf(x) > valueOf(cur)) { dropped.push(cur); best.set(key, x); } else dropped.push(x);
  }
  return { kept: [...kept, ...best.values()], dropped };
}

class Collector {
  readonly issues: ValidationIssue[] = [];
  readonly pending: PendingChoice[] = [];
  /** все точки выбора, включая уже сделанные — чтобы их можно было поменять */
  readonly points: PendingChoice[] = [];
  readonly sources: Source[] = [];
  readonly used = new Map<string, PinnedRef>();
  readonly classLevels: Record<string, number> = {};
  readonly classOrder: ContentUid[] = [];
  readonly subclassOf: Record<string, ContentUid> = {};
  readonly hp: HpEntry[] = [];
  readonly feats: Array<{ uid: ContentUid; prerequisite?: Predicate; repeatable: boolean }> = [];
  readonly features: Array<{ uid: ContentUid; level: number; name: string }> = [];
  readonly choiceMap = new Map<string, string[]>();
  readonly finalClassLevels: Record<string, number> = {};
  speciesSpeed = 30;
  size = 'medium';
  private missing = new Set<string>();
  private occurrences = new Map<string, number>();

  constructor(readonly build: CharacterBuild, readonly rs: RuleSet, readonly resolver: ContentResolver, readonly upto: number) {
    for (const c of build.originChoices) this.choiceMap.set(c.choiceId, c.selected);
    build.levels.slice(0, upto).forEach((l) => {
      for (const c of l.choices) this.choiceMap.set(c.choiceId, c.selected);
      this.finalClassLevels[l.classUid] = (this.finalClassLevels[l.classUid] ?? 0) + 1;
    });
  }

  issue(code: string, severity: ValidationIssue['severity'], message: string, extra: Partial<ValidationIssue> = {}) {
    this.issues.push({ code, severity, message, ...extra });
  }

  get(uid: string, type?: string | string[]): ResolvedItem | undefined {
    const it = this.resolver.get(uid as ContentUid);
    if (!it) {
      if (!this.missing.has(uid)) {
        this.missing.add(uid);
        this.issue('content-missing', 'error', `Контент не установлен: ${uid}`, { sourceUid: uid as ContentUid });
      }
      return undefined;
    }
    if (type && !(Array.isArray(type) ? type : [type]).includes(it.type)) {
      this.issue('content-type', 'error', `${uid}: ожидался тип ${type}, получен ${it.type}`, { sourceUid: it.uid });
      return undefined;
    }
    if (it.edition !== 'any' && it.edition !== this.build.edition) {
      if (!this.build.options.allowCrossEdition) {
        this.issue('edition-mismatch', 'error', `«${it.name}» из редакции ${it.edition}, персонаж — ${this.build.edition}`, { sourceUid: it.uid });
        return undefined;
      }
      this.issue('cross-edition', 'warning', `«${it.name}» взят из редакции ${it.edition}`, { sourceUid: it.uid });
    }
    if (it.fromSnapshot) this.issue('content-snapshot', 'info', `«${it.name}»: источник отключён, расчёт по сохранённому снимку`, { sourceUid: it.uid });
    this.used.set(it.uid, it.pinned);
    return it;
  }

  addSource(uid: ContentUid, name: string, level: number, effects: Effect[]) {
    if (effects.length) this.sources.push({ uid, name, level, effects });
  }

  /** Особенность или черта со всеми её эффектами и выборами. */
  addFeatureLike(uid: string, level: number, ownerClass?: ContentUid) {
    const it = this.get(uid, ['feature', 'feat']);
    if (!it) return;
    const m = it.mechanics as M<'feature'> & Partial<M<'feat'>>;
    if (it.type === 'feat') {
      const prev = this.feats.find((f) => f.uid === it.uid);
      if (prev && !m.repeatable) this.issue('feat-duplicate', 'error', `Черту «${it.name}» нельзя взять дважды`, { level, sourceUid: it.uid });
      this.feats.push({ uid: it.uid, prerequisite: it.prerequisite as Predicate | undefined, repeatable: !!m.repeatable });
    }
    // одна и та же особенность может прийти дважды (компетентность плута на 1 и 6 уровне):
    // эффекты складываются по stackKey, а выборы получают свой номер
    const n = (this.occurrences.get(it.uid) ?? 0) + 1;
    this.occurrences.set(it.uid, n);
    const occ = n > 1 ? `#${n}` : '';
    this.features.push({ uid: it.uid, level, name: it.name });
    this.addSource(it.uid, it.name, level, m.effects ?? []);
    for (const ch of m.choices ?? []) {
      if (ch.atLevels && ownerClass) {
        if (n > 1) continue;
        for (const L of ch.atLevels) if (L <= (this.finalClassLevels[ownerClass] ?? 0)) this.choice(ch, it.uid, it.name, level, ownerClass, `@${L}`);
      } else this.choice(ch, it.uid, it.name, level, ownerClass, occ);
    }
  }

  optionsFor(ch: Choice): string[] {
    if ('list' in ch.from) return ch.from.list;
    return this.resolver.query({ type: ch.from.query.type, edition: this.build.edition, where: ch.from.query.where }).map((i) => i.uid);
  }

  choice(ch: Choice, ownerUid: ContentUid, ownerName: string, level: number, ownerClass?: ContentUid, suffix = '') {
    const choiceId = `${ownerUid}#${ch.key}${suffix}`;
    const options = this.optionsFor(ch);
    const selected = this.choiceMap.get(choiceId);
    const pc: PendingChoice = { choiceId, level, sourceUid: ownerUid, pick: ch.pick, options, required: ch.required, kind: ch.grants, label: `${ownerName}: ${ch.label}` };
    this.points.push(pc);
    if (!selected || selected.length === 0) {
      this.pending.push(pc);
      return;
    }
    if (selected.length !== ch.pick) {
      this.issue('choice-count', 'error', `«${ownerName}: ${ch.label}» — нужно выбрать ${ch.pick}, выбрано ${selected.length}`, { level, sourceUid: ownerUid });
    }
    const valid = selected.filter((s) => {
      if (options.includes(s)) return true;
      this.issue('choice-invalid', 'error', `«${ownerName}: ${ch.label}» — недопустимый вариант «${s}»`, { level, sourceUid: ownerUid });
      return false;
    });
    const effects: Effect[] = [];
    for (const s of valid) {
      switch (ch.grants) {
        case 'proficiency.skill': effects.push({ type: 'proficiency', category: 'skill', id: s }); break;
        case 'proficiency.tool': effects.push({ type: 'proficiency', category: 'tool', id: s }); break;
        case 'proficiency.language': effects.push({ type: 'proficiency', category: 'language', id: s }); break;
        case 'expertise': effects.push({ type: 'expertise', skill: s }); break;
        case 'ability.bonus': if (isAbility(s)) effects.push({ type: 'ability.bonus', ability: s, value: 1 }); break;
        case 'spell': effects.push({ type: 'spell.grant', spell: s, alwaysPrepared: true, countsAgainstLimit: false }); break;
        case 'feat': case 'feature': this.addFeatureLike(s, level, ownerClass); break;
        case 'item': break; // снаряжение уходит в инвентарь, не в расчёт
      }
    }
    this.addSource(ownerUid, `${ownerName}: ${ch.label}`, level, effects);
  }

  collect() {
    const b = this.build;
    // --- вид
    if (b.speciesUid) {
      const sp = this.get(b.speciesUid, ['species', 'subspecies']);
      if (sp) {
        const chain: ResolvedItem[] = [sp];
        const parentUid = (sp.mechanics as M<'species'>).parent;
        if (parentUid) { const p = this.get(parentUid, 'species'); if (p) chain.unshift(p); }
        for (const it of chain) {
          const m = it.mechanics as M<'species'>;
          this.speciesSpeed = m.speed;
          this.size = m.size[0]!;
          this.addSource(it.uid, it.name, 0, m.effects);
          for (const f of m.features) this.addFeatureLike(f, 0);
          for (const ch of m.choices) this.choice(ch, it.uid, it.name, 0);
        }
      }
    } else this.pending.push({ choiceId: 'origin#species', level: 0, sourceUid: 'core:rule/origin', pick: 1, options: this.resolver.query({ type: 'species', edition: b.edition }).map((i) => i.uid), required: true, kind: 'species', label: 'Вид' });

    // --- предыстория
    if (b.backgroundUid) {
      const bg = this.get(b.backgroundUid, 'background');
      if (bg) {
        const m = bg.mechanics as M<'background'>;
        this.addSource(bg.uid, bg.name, 0, m.effects);
        for (const ch of m.choices) this.choice(ch, bg.uid, bg.name, 0);
        if (this.rs.originAbilitySource === 'background' && m.abilityOptions) this.backgroundAbilities(bg, m.abilityOptions);
        if (m.originFeat) this.addFeatureLike(m.originFeat, 0);
      }
    } else this.pending.push({ choiceId: 'origin#background', level: 0, sourceUid: 'core:rule/origin', pick: 1, options: this.resolver.query({ type: 'background', edition: b.edition }).map((i) => i.uid), required: true, kind: 'background', label: 'Предыстория' });

    // --- уровни: создание на N-м уровне и повышение — один и тот же проход
    const seen: Record<string, number> = {};
    b.levels.slice(0, this.upto).forEach((entry, i) => {
      const level = i + 1;
      if (entry.characterLevel !== level) this.issue('level-sequence', 'error', `Запись ${i + 1}: уровень персонажа ${entry.characterLevel}, ожидался ${level}`, { level });
      const cls = this.get(entry.classUid, 'class');
      if (!cls) return;
      const m = cls.mechanics as M<'class'>;
      const classLevel = (seen[cls.uid] = (seen[cls.uid] ?? 0) + 1);
      this.classLevels[cls.uid] = classLevel;
      if (entry.classLevel !== classLevel) this.issue('level-sequence', 'error', `Запись ${level}: «${cls.name}» уровня ${entry.classLevel}, ожидался ${classLevel}`, { level });
      if (classLevel === 1) {
        this.classOrder.push(cls.uid);
        if (i === 0) {
          this.addSource(cls.uid, `${cls.name}: стартовые владения`, level, [
            ...m.startingProficiencies,
            ...m.savingThrows.map((ab): Effect => ({ type: 'proficiency', category: 'save', id: ab })),
          ]);
          this.choice(m.skillChoice, cls.uid, cls.name, level, cls.uid);
        } else {
          if (!b.options.allowMulticlass) this.issue('multiclass-disabled', 'error', 'Мультиклассирование выключено в настройках', { level });
          this.addSource(cls.uid, `${cls.name}: владения мультикласса`, level, m.multiclass.proficiencies);
          if (m.multiclass.skillChoice) this.choice(m.multiclass.skillChoice, cls.uid, cls.name, level, cls.uid, '@mc');
        }
      }
      this.hp.push({ level, hitDie: m.hitDie, first: i === 0, roll: entry.hpRoll });

      for (const g of m.progression) if (g.level === classLevel) for (const f of g.features) this.addFeatureLike(f, level, cls.uid);

      if (classLevel === m.subclassLevel) {
        const choiceId = `${cls.uid}#subclass`;
        const options = this.resolver.query({ type: 'subclass', edition: b.edition, where: { class: cls.uid } }).map((x): string => x.uid);
        const sel = this.choiceMap.get(choiceId)?.[0];
        const pc: PendingChoice = { choiceId, level, sourceUid: cls.uid, pick: 1, options, required: true, kind: 'subclass', label: `${cls.name}: подкласс` };
        this.points.push(pc);
        if (!sel) this.pending.push(pc);
        else if (!options.includes(sel) && !this.resolver.get(sel as ContentUid)?.fromSnapshot) this.issue('choice-invalid', 'error', `«${cls.name}»: подкласс «${sel}» не подходит`, { level });
        else this.subclassOf[cls.uid] = sel as ContentUid;
      }
      const subUid = this.subclassOf[cls.uid];
      if (subUid) {
        const sub = this.get(subUid, 'subclass');
        if (sub) {
          if (classLevel === m.subclassLevel) this.features.push({ uid: sub.uid, level, name: sub.name });
          for (const g of (sub.mechanics as M<'subclass'>).progression) if (g.level === classLevel) for (const f of g.features) this.addFeatureLike(f, level, cls.uid);
        }
      }

      if (m.asiLevels.includes(classLevel)) this.asi(cls, classLevel, level);
    });
  }

  private backgroundAbilities(bg: ResolvedItem, opts: AbilityId[]) {
    const choiceId = `${bg.uid}#ability-scores`;
    const sel = this.choiceMap.get(choiceId);
    const pc: PendingChoice = { choiceId, level: 0, sourceUid: bg.uid, pick: 3, options: opts, required: true, kind: 'ability-scores', label: `${bg.name}: характеристики` };
    this.points.push(pc);
    if (!sel?.length) { this.pending.push(pc); return; }
    const okShape = sel.length === 3 && sel.every((a) => opts.includes(a as AbilityId)) &&
      (new Set(sel).size === 3 || (new Set(sel).size === 2));
    if (!okShape) { this.issue('background-abilities', 'error', `«${bg.name}»: распределите +2/+1 или +1/+1/+1 между ${opts.join(', ')}`, { sourceUid: bg.uid }); return; }
    this.addSource(bg.uid, `${bg.name}: характеристики`, 0, sel.map((a): Effect => ({ type: 'ability.bonus', ability: a as AbilityId, value: 1 })));
  }

  private asi(cls: ResolvedItem, classLevel: number, level: number) {
    const choiceId = `${cls.uid}#asi@${classLevel}`;
    const sel = this.choiceMap.get(choiceId);
    const featsAllowed = this.build.options.allowFeats || this.build.edition === '2024';
    const feats = featsAllowed ? this.resolver.query({ type: 'feat', edition: this.build.edition }).filter((f) => {
      const cat = (f.mechanics as M<'feat'>).category;
      return this.build.edition === '2014' || cat === 'general' || cat === 'epic-boon';
    }).map((f) => f.uid) : [];
    const pc: PendingChoice = { choiceId, level, sourceUid: cls.uid, pick: 2, options: [...ABILITIES, ...feats], required: true, kind: 'asi', label: `${cls.name}: увеличение характеристик или черта` };
    this.points.push(pc);
    if (!sel?.length) { this.pending.push(pc); return; }
    if (sel.length === 1 && isUid(sel[0]!)) {
      if (!featsAllowed) { this.issue('feats-disabled', 'error', 'Черты выключены в настройках (опциональное правило 2014)', { level }); return; }
      this.addFeatureLike(sel[0]!, level, cls.uid);
      return;
    }
    if (sel.length !== 2 || !sel.every(isAbility)) { this.issue('asi-invalid', 'error', `Увеличение характеристик (${level} ур.): выберите две характеристики или черту`, { level }); return; }
    this.addSource(cls.uid, 'Увеличение характеристик', level, sel.map((a): Effect => ({ type: 'ability.bonus', ability: a as AbilityId, value: 1 })));
  }
}

// ===========================================================================

interface Tagged { e: Effect; src: Source }

export function compute(build: CharacterBuild, resolver: ContentResolver, opts: ComputeOptions = {}): EngineResult {
  return computeInternal(build, resolver, opts, build.levels.length, true);
}

function computeInternal(build: CharacterBuild, resolver: ContentResolver, opts: ComputeOptions, upto: number, validate: boolean): EngineResult {
  const rs = getRuleSet(build.edition);
  const c = new Collector(build, rs, resolver, upto);
  c.collect();

  // --- экипировка
  const equipment = opts.equipment ?? [];
  const equippedUids = new Set<string>(), attunedUids = new Set<string>();
  let armor: { item: ResolvedItem; m: M<'armor'>; bonus: number } | undefined;
  let shield: { item: ResolvedItem; m: M<'armor'>; bonus: number } | undefined;
  const weapons: Array<{ item: ResolvedItem; m: M<'weapon'>; bonus: number; slot: EquippedItem['slot'] }> = [];
  let attunedCount = 0;
  for (const eq of equipment) {
    if (!eq.uid || !eq.slot) continue;
    const it = c.get(eq.uid);
    if (!it) continue;
    equippedUids.add(it.uid);
    let base = it, bonus = eq.magicBonus ?? 0;
    if (it.type === 'magic-item') {
      const mm = it.mechanics as M<'magic-item'>;
      const needsAttune = mm.attunement !== false;
      if (needsAttune && !eq.attuned) continue;
      if (eq.attuned) { attunedCount++; attunedUids.add(it.uid); }
      c.addSource(it.uid, it.name, 0, mm.effects);
      if (!mm.baseItem) continue;
      const b = c.get(mm.baseItem);
      if (!b) continue;
      base = b;
    }
    if (base.type === 'armor') {
      const am = base.mechanics as M<'armor'>;
      if (am.category === 'shield') shield = { item: it, m: am, bonus };
      else armor = { item: it, m: am, bonus };
    } else if (base.type === 'weapon') weapons.push({ item: it, m: base.mechanics as M<'weapon'>, bonus, slot: eq.slot });
  }

  const all: Tagged[] = c.sources.flatMap((src) => src.effects.map((e) => ({ e, src })));
  const featureSet = new Set(c.features.map((f) => f.uid));

  // --- характеристики
  const base = build.baseAbilities;
  const abComp: Record<AbilityId, StatComponent[]> = Object.fromEntries(ABILITIES.map((a) => [a, [{ label: 'Базовое значение', value: base[a], kind: 'base', sourceUid: 'user' }]])) as never;
  const score = (a: AbilityId) => abComp[a].filter((x) => x.kind !== 'ignored').reduce((s, x) => s + x.value, 0);
  const proficiencySet = new Set<string>();
  const scope = (): PredicateScope => ({
    armor: armor ? (armor.m.category as 'light' | 'medium' | 'heavy') : 'none',
    shield: !!shield,
    classLevels: c.classLevels,
    totalLevel: Math.min(upto, build.levels.length),
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, score(a)])),
    features: featureSet, proficiencies: proficiencySet, equipped: equippedUids, attuned: attunedUids,
  });
  let ps = scope();
  const active = (t: Tagged) => evaluatePredicate(t.e.when, ps);
  const of = <T extends Effect['type']>(type: T) => all.filter((t): t is Tagged & { e: Extract<Effect, { type: T }> } => t.e.type === type && active(t));

  const caps: Record<string, number> = Object.fromEntries(ABILITIES.map((a) => [a, 20]));
  for (const t of of('ability.maxIncrease')) caps[t.e.ability]! += t.e.value;
  const bonuses = dedupeByStack(of('ability.bonus'), (t) => t.e.value);
  for (const t of bonuses.kept) {
    const cur = score(t.e.ability), max = t.e.max ?? caps[t.e.ability]!;
    const applied = Math.max(0, Math.min(t.e.value, max - cur));
    abComp[t.e.ability].push({ label: t.src.name, sourceUid: t.src.uid, value: applied, kind: applied ? 'bonus' : 'ignored', note: applied < t.e.value ? `предел ${max}` : undefined });
  }
  for (const t of bonuses.dropped) abComp[t.e.ability].push({ label: t.src.name, sourceUid: t.src.uid, value: t.e.value, kind: 'ignored', note: 'не складывается' });
  for (const t of of('ability.set')) {
    const cur = score(t.e.ability);
    if (t.e.value > cur || !t.e.onlyIfHigher) abComp[t.e.ability].push({ label: t.src.name, sourceUid: t.src.uid, value: t.e.value - cur, kind: 'set', note: `значение ${t.e.value}` });
    else abComp[t.e.ability].push({ label: t.src.name, sourceUid: t.src.uid, value: 0, kind: 'ignored', note: `${t.e.value} не выше текущего` });
  }
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, stat(abComp[a])])) as Record<AbilityId, Stat>;
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, rs.abilityModifier(abilities[a].value)])) as Record<AbilityId, number>;
  const totalLevel = Math.min(upto, build.levels.length);
  const prof = rs.proficiencyBonus(Math.max(1, totalLevel));
  ps = scope();

  const fscope: FormulaScope = {
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].value])),
    modifiers: mods, prof, totalLevel,
    classLevels: Object.fromEntries(Object.entries(c.classLevels).map(([u, l]) => [slugOf(u), l])),
  };
  const f = (src: string) => evaluateFormula(src, fscope);

  // --- владения
  const profs = { save: new Set<string>(), skill: new Set<string>(), armor: new Set<string>(), weapon: new Set<string>(), tool: new Set<string>(), language: new Set<string>() };
  for (const t of of('proficiency')) { profs[t.e.category].add(t.e.id); proficiencySet.add(`${t.e.category}:${t.e.id}`); }
  const expertise = new Set(of('expertise').map((t) => t.e.skill));
  const jack = of('halfProficiency').some((t) => t.e.scope === 'ability-checks');
  ps = scope();

  // --- спасброски и навыки
  const savingThrows = Object.fromEntries(ABILITIES.map((a) => {
    const p = profs.save.has(a);
    return [a, { ...stat([{ label: `Модификатор ${a.toUpperCase()}`, value: mods[a], kind: 'base' }, ...(p ? [{ label: 'Бонус мастерства', value: prof, kind: 'bonus' as const, sourceUid: 'rule' as const }] : [])]), proficient: p }];
  })) as Sheet['savingThrows'];
  const skills = Object.fromEntries(Object.entries(SKILLS).map(([id, ab]) => {
    const level: 0 | 0.5 | 1 | 2 = expertise.has(id) && profs.skill.has(id) ? 2 : profs.skill.has(id) ? 1 : jack ? 0.5 : 0;
    if (expertise.has(id) && !profs.skill.has(id)) c.issue('expertise-without-proficiency', 'warning', `Компетентность в «${id}» без владения навыком`);
    const pv = Math.floor(prof * level);
    return [id, { ...stat([{ label: `Модификатор ${ab.toUpperCase()}`, value: mods[ab], kind: 'base' }, ...(pv ? [{ label: level === 2 ? 'Компетентность' : level === 0.5 ? 'Мастер на все руки' : 'Бонус мастерства', value: pv, kind: 'bonus' as const, sourceUid: 'rule' as const }] : [])]), proficiency: level, ability: ab }];
  })) as Sheet['skills'];
  const passivePerception = stat([{ label: 'База', value: 10, kind: 'base' }, { label: 'Внимательность', value: skills.perception!.value, kind: 'bonus' }]);

  // --- класс доспеха
  const acCandidates: StatComponent[] = [];
  if (armor) {
    const dex = armor.m.dexCap === null ? mods.dex : Math.min(mods.dex, armor.m.dexCap);
    acCandidates.push({ label: `${armor.item.name}: ${armor.m.baseAc}${armor.bonus ? ` +${armor.bonus}` : ''}${armor.m.dexCap !== 0 ? ` + ЛВК ${dex}` : ''}`, value: armor.m.baseAc + armor.bonus + dex, kind: 'formula', sourceUid: armor.item.uid });
    if (!profs.armor.has(armor.m.category)) c.issue('armor-not-proficient', 'warning', `Нет владения доспехом «${armor.item.name}»: помеха на проверки, спасброски и атаки по СИЛ и ЛВК, нельзя накладывать заклинания`);
  } else acCandidates.push({ label: `Без доспехов: 10 + ЛВК ${mods.dex}`, value: 10 + mods.dex, kind: 'formula', sourceUid: 'rule' });
  for (const t of of('ac.base')) acCandidates.push({ label: `${t.e.label}: ${t.e.formula}`, value: f(t.e.formula), kind: 'formula', sourceUid: t.src.uid });
  const bestAc = acCandidates.reduce((a, b) => (b.value > a.value ? b : a));
  const acComp: StatComponent[] = acCandidates.map((x) => (x === bestAc ? x : { ...x, kind: 'ignored', note: 'не складывается, взято лучшее' }));
  if (shield) {
    acComp.push({ label: shield.item.name, value: shield.m.baseAc + shield.bonus, kind: 'bonus', sourceUid: shield.item.uid });
    if (!profs.armor.has('shield')) c.issue('shield-not-proficient', 'warning', 'Нет владения щитами');
  }
  const acBonus = dedupeByStack(of('ac.bonus'), (t) => t.e.value);
  for (const t of acBonus.kept) acComp.push({ label: t.src.name, value: t.e.value, kind: 'bonus', sourceUid: t.src.uid });
  for (const t of acBonus.dropped) acComp.push({ label: t.src.name, value: t.e.value, kind: 'ignored', note: 'не складывается' });
  const armorClass = stat(acComp);

  // --- инициатива
  const initiative = stat([
    { label: 'Модификатор ЛВК', value: mods.dex, kind: 'base' },
    ...(jack ? [{ label: 'Мастер на все руки', value: Math.floor(prof / 2), kind: 'bonus' as const, sourceUid: 'rule' as const }] : []),
    ...of('initiative.bonus').map((t): StatComponent => ({ label: t.src.name, value: f(t.e.value), kind: 'bonus', sourceUid: t.src.uid })),
  ]);

  // --- хиты (модификатор Телосложения применяется ко всем уровням задним числом)
  const hpComp: StatComponent[] = [];
  for (const h of c.hp) {
    if (!h.first && build.options.hpMethod === 'rolled') {
      if (h.roll === undefined) c.issue('hp-roll-missing', 'warning', `Уровень ${h.level}: нет броска кости хитов, взято среднее`, { level: h.level });
      else if (h.roll < 1 || h.roll > h.hitDie) c.issue('hp-roll-invalid', 'error', `Уровень ${h.level}: бросок ${h.roll} вне d${h.hitDie}`, { level: h.level });
    }
    const v = rs.hpAtLevel({ hitDie: h.hitDie, conMod: mods.con, isFirstCharacterLevel: h.first, method: build.options.hpMethod, roll: h.roll });
    hpComp.push({ label: `Уровень ${h.level} (d${h.hitDie})`, value: v, kind: 'base' });
  }
  for (const t of of('hp.perLevel')) hpComp.push({ label: `${t.src.name} (×${totalLevel})`, value: t.e.value * totalLevel, kind: 'bonus', sourceUid: t.src.uid });
  for (const t of of('hp.flat')) hpComp.push({ label: t.src.name, value: f(t.e.value), kind: 'bonus', sourceUid: t.src.uid });
  const hitPointsMax = stat(hpComp);

  // --- скорость
  const speedComp: Record<string, StatComponent[]> = { walk: [{ label: 'Скорость вида', value: c.speciesSpeed, kind: 'base' }] };
  for (const t of of('speed').filter((t) => t.e.op === 'set')) {
    const cur = speedComp[t.e.mode];
    if (!cur || (t.e.value ?? 0) > stat(cur).value) speedComp[t.e.mode] = [{ label: t.src.name, value: t.e.value ?? 0, kind: 'base', sourceUid: t.src.uid }];
  }
  const sb = dedupeByStack(of('speed').filter((t) => t.e.op === 'bonus'), (t) => t.e.value ?? 0);
  for (const t of sb.kept) (speedComp[t.e.mode] ??= []).push({ label: t.src.name, value: t.e.value ?? 0, kind: 'bonus', sourceUid: t.src.uid });
  if (armor?.m.strengthReq && abilities.str.value < armor.m.strengthReq) {
    speedComp.walk!.push({ label: `${armor.item.name}: СИЛ ниже ${armor.m.strengthReq}`, value: -10, kind: 'bonus', sourceUid: armor.item.uid });
  }
  const walk = stat(speedComp.walk!).value;
  for (const t of of('speed').filter((t) => t.e.op === 'equalWalk')) speedComp[t.e.mode] = [{ label: `${t.src.name}: равна скорости ходьбы`, value: walk, kind: 'base', sourceUid: t.src.uid }];
  const speed = Object.fromEntries(Object.entries(speedComp).map(([k, v]) => [k, stat(v)]));

  // --- заклинательство
  const casterInputs: MulticlassCasterInput[] = [];
  const spellcasting: Sheet['spellcasting'] = [];
  let pact: { count: number; slotLevel: number } | undefined;
  for (const uid of c.classOrder) {
    const lvl = c.classLevels[uid]!;
    const cls = resolver.get(uid);
    if (!cls) continue;
    const sc = (cls.mechanics as M<'class'>).spellcasting;
    const subUid = c.subclassOf[uid];
    const subSc = subUid ? (resolver.get(subUid)?.mechanics as M<'subclass'> | undefined)?.spellcasting : undefined;
    const ability = sc?.ability ?? subSc?.ability;
    if (sc) {
      if (sc.progression === 'pact') { const p = sc.pactSlots?.[lvl - 1]; if (p && p.count) pact = p; }
      else casterInputs.push({ classUid: uid, classLevel: lvl, progression: sc.progression });
    } else if (subSc) casterInputs.push({ classUid: uid, classLevel: lvl, progression: 'third' });
    if (!ability) continue;
    const pick = (t?: number[]) => (t ? t[lvl - 1] : undefined);
    spellcasting.push({
      classUid: uid, ability,
      saveDc: stat([{ label: 'База', value: 8, kind: 'base' }, { label: 'Бонус мастерства', value: prof, kind: 'bonus' }, { label: `Модификатор ${ability.toUpperCase()}`, value: mods[ability], kind: 'bonus' }]),
      attackBonus: stat([{ label: 'Бонус мастерства', value: prof, kind: 'bonus' }, { label: `Модификатор ${ability.toUpperCase()}`, value: mods[ability], kind: 'bonus' }]),
      cantripsMax: pick(sc?.cantripsKnown),
      knownMax: pick(sc?.spellsKnown),
      preparedMax: sc?.preparedTable ? pick(sc.preparedTable) : sc?.preparedFormula ? Math.max(1, f(sc.preparedFormula)) : undefined,
    });
  }
  const spellSlots = { standard: rs.spellSlotsForCasterLevel(rs.multiclassCasterLevel(casterInputs)), ...(pact ? { pact } : {}) };

  // --- атаки
  const extra = of('attacks.perAction');
  const attacksPerAction = Math.max(1, ...extra.map((t) => t.e.count));
  const attacks: Sheet['attacks'] = weapons.map((w) => {
    const ranged = w.m.kind === 'ranged';
    const finesse = w.m.properties.includes('finesse');
    const ab: AbilityId = ranged ? 'dex' : finesse && mods.dex > mods.str ? 'dex' : 'str';
    const proficient = profs.weapon.has(w.m.category) || profs.weapon.has(w.item.uid) || profs.weapon.has(slugOf(w.item.uid));
    const die = w.slot === 'two-hands' && w.m.versatile ? w.m.versatile : w.m.damage;
    const dmgBonus = mods[ab] + w.bonus;
    return {
      name: w.item.name,
      toHit: stat([{ label: `Модификатор ${ab.toUpperCase()}`, value: mods[ab], kind: 'base' }, ...(proficient ? [{ label: 'Бонус мастерства', value: prof, kind: 'bonus' as const }] : []), ...(w.bonus ? [{ label: 'Магия', value: w.bonus, kind: 'bonus' as const }] : [])]),
      damage: dmgBonus === 0 ? die : `${die}${dmgBonus > 0 ? '+' : ''}${dmgBonus}`,
      damageType: w.m.damageType,
      sourceUid: w.item.uid,
    };
  });

  // --- прочее
  const resources = new Map<string, Sheet['resources'][number]>();
  for (const t of of('resource')) {
    const max = f(t.e.max);
    const cur = resources.get(t.e.id);
    if (!cur || max > cur.max) resources.set(t.e.id, { id: t.e.id, label: t.e.label, max, recharge: t.e.recharge });
  }
  const senses: Record<string, number> = {};
  for (const t of of('sense')) senses[t.e.sense] = Math.max(senses[t.e.sense] ?? 0, t.e.range);
  const damageModifiers = of('damage.resistance').map((t) => ({ damageType: t.e.damageType, level: t.e.level }));
  const grantedSpells = of('spell.grant').map((t) => ({ uid: t.e.spell as ContentUid, sourceUid: t.src.uid, alwaysPrepared: t.e.alwaysPrepared, countsAgainstLimit: t.e.countsAgainstLimit }));
  const weaponMasteryCount = Math.max(0, ...of('weaponMastery').map((t) => f(t.e.count)));

  // --- валидация
  if (validate) {
    validateAbilities(build, rs, c);
    if (build.levels.length > 20) c.issue('level-cap', 'error', 'Уровень персонажа не может быть выше 20');
    if (attunedCount > 3) c.issue('attunement-limit', 'error', `Настроено ${attunedCount} предмета, максимум 3`);
    // требования мультикласса проверяются по характеристикам на момент взятия уровня
    const taken: ContentUid[] = [];
    build.levels.forEach((entry, i) => {
      if (i === 0 || taken.includes(entry.classUid)) { if (!taken.includes(entry.classUid)) taken.push(entry.classUid); return; }
      const before = computeInternal(build, resolver, opts, i, false);
      const scores = Object.fromEntries(ABILITIES.map((a) => [a, before.sheet.abilities[a].value]));
      for (const uid of [...taken, entry.classUid]) {
        const cls = resolver.get(uid);
        if (!cls) continue;
        const pre = (cls.mechanics as M<'class'>).multiclass.prerequisite;
        if (!evaluatePredicate(pre, { ...ps, abilities: scores })) {
          c.issue('multiclass-prerequisite', 'error', `Уровень ${i + 1}: для мультикласса с «${cls.name}» нужно ${describePredicate(pre)}`, { level: i + 1, sourceUid: cls.uid });
        }
      }
      taken.push(entry.classUid);
    });
    for (const ft of c.feats) {
      if (ft.prerequisite && !evaluatePredicate(ft.prerequisite, ps)) {
        c.issue('feat-prerequisite', 'error', `Не выполнены требования черты: ${describePredicate(ft.prerequisite)}`, { sourceUid: ft.uid });
      }
    }
  }

  const sheet: Sheet = {
    edition: build.edition, totalLevel,
    classLevels: { ...c.classLevels },
    abilities, modifiers: mods, proficiencyBonus: prof,
    armorClass, initiative, hitPointsMax, speed, savingThrows, skills, passivePerception,
    proficiencies: { armor: [...profs.armor], weapon: [...profs.weapon], tool: [...profs.tool], language: [...profs.language] },
    spellcasting, spellSlots, attacks, attacksPerAction,
    features: c.features, resources: [...resources.values()],
    size: c.size, senses, damageModifiers, grantedSpells, weaponMasteryCount,
    carryingCapacity: rs.carryingCapacity(abilities.str.value, c.size), attunedCount,
  };
  return { sheet, pending: c.pending, choices: c.points, issues: c.issues, usedContent: [...c.used.values()], engineVersion: ENGINE_VERSION };
}

function validateAbilities(build: CharacterBuild, rs: RuleSet, c: Collector) {
  const vals = ABILITIES.map((a) => build.baseAbilities[a]);
  const sorted = (x: number[]) => [...x].sort((p, q) => q - p).join(',');
  switch (build.options.abilityMethod) {
    case 'point-buy': {
      const { min, max, budget, cost } = rs.pointBuy;
      const bad = vals.filter((v) => v < min || v > max);
      if (bad.length) { c.issue('point-buy-range', 'error', `Покупка очков: значения должны быть от ${min} до ${max}`); break; }
      const spent = vals.reduce((s, v) => s + cost[v]!, 0);
      if (spent > budget) c.issue('point-buy-budget', 'error', `Покупка очков: потрачено ${spent} из ${budget}`);
      else if (spent < budget) c.issue('point-buy-unspent', 'info', `Покупка очков: не потрачено ${budget - spent}`);
      break;
    }
    case 'standard-array':
      if (sorted(vals) !== sorted(rs.standardArray)) c.issue('standard-array', 'error', `Стандартный набор: нужно распределить ${rs.standardArray.join(', ')}`);
      break;
    case 'roll-4d6':
      if (!build.rolledPool || build.rolledPool.length !== 6 || build.rolledPool.some((v) => v < 3 || v > 18)) c.issue('roll-pool', 'error', 'Броски: нужно 6 значений от 3 до 18');
      else if (sorted(vals) !== sorted(build.rolledPool)) c.issue('roll-mismatch', 'error', 'Броски: характеристики не совпадают с выброшенными значениями');
      break;
    case 'manual':
      if (vals.some((v) => v < 1 || v > 30)) c.issue('ability-range', 'error', 'Характеристика должна быть от 1 до 30');
  }
}
