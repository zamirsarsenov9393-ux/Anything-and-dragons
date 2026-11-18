/**
 * Сборка пакетов SRD из открытых данных 5e-database (https://github.com/5e-bits/5e-database, MIT).
 * Тексты и механика — из SRD 5.1 и SRD 5.2 (Wizards of the Coast, CC-BY-4.0).
 *
 *   npx tsx tools/srd/convert.ts <путь к 5e-database/src> <папка вывода>
 *
 * Механические эффекты особенностей в исходных данных не описаны (там только текст),
 * поэтому они задаются вручную в overrides.ts. Особенности без эффектов попадают в пакет
 * с описанием и меткой `text-only`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { contentPackage } from '../../src/content/schema';
import { validatePackage } from '../../src/content/importer';
import { featureOverrides, traitOverrides, magicItemOverrides, setTable } from './overrides';

type Ed = '2014' | '2024';
type J = Record<string, any>;
const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) throw new Error('usage: convert.ts <5e-database/src> <out>');

const load = (ed: Ed, name: string): J[] => {
  try { return JSON.parse(readFileSync(join(srcDir, ed, 'en', `5e-SRD-${name}.json`), 'utf8')); } catch { return []; }
};
const slug = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const text = (x: J) => {
  const d = x.desc ?? x.description;
  const body = Array.isArray(d) ? d.join('\n\n') : typeof d === 'string' ? d : undefined;
  return body ? { body } : undefined;
};
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILL_IDS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'];

const FULL = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const HALF = new Set(['paladin', 'ranger']);
const PREPARED = new Set(['cleric', 'druid', 'paladin', 'wizard']);
const SUBCLASS_LEVEL_2014: Record<string, number> = { barbarian: 3, bard: 3, cleric: 1, druid: 2, fighter: 3, monk: 3, paladin: 3, ranger: 3, rogue: 3, sorcerer: 1, warlock: 1, wizard: 2 };
const PRIMARY: Record<string, string[]> = { barbarian: ['str'], bard: ['cha'], cleric: ['wis'], druid: ['wis'], fighter: ['str', 'dex'], monk: ['dex', 'wis'], paladin: ['str', 'cha'], ranger: ['dex', 'wis'], rogue: ['dex'], sorcerer: ['cha'], warlock: ['cha'], wizard: ['int'] };
const RITUAL: Record<string, 'prepared' | 'book' | 'any-known'> = { bard: 'any-known', cleric: 'prepared', druid: 'prepared', wizard: 'book' };

function build(ed: Ed) {
  const ns = ed === '2014' ? 'srd51' : 'srd52';
  const U = (type: string, idx: string) => `${ns}:${type}/${slug(idx)}`;
  const items: J[] = [];
  const stats = { textOnlyFeatures: 0, mechanicalFeatures: 0, unmatchedOverrides: [] as string[] };
  const P = load(ed, 'Proficiencies');
  const profByIdx = new Map(P.map((p) => [p.index, p]));
  const usedOverrides = new Set<string>();
  const LV = load(ed, 'Levels');
  setTable((cls, key) => {
    const vals = Array.from({ length: 20 }, (_, i) => {
      const v = LV.find((l) => l.class?.index === cls && !l.subclass && l.level === i + 1)?.class_specific?.[key];
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(n, 99) : 0;
    });
    return `table(level.class.${cls}, ${vals.join(', ')})`;
  });

  /** индекс владения из данных → эффект(ы) */
  const prof = (idx: string): J[] => {
    if (idx.startsWith('skill-')) return [{ type: 'proficiency', category: 'skill', id: idx.slice(6) }];
    if (idx.startsWith('saving-throw-')) return [{ type: 'proficiency', category: 'save', id: idx.slice(13) }];
    const armor: Record<string, string[]> = { 'light-armor': ['light'], 'medium-armor': ['medium'], 'heavy-armor': ['heavy'], 'all-armor': ['light', 'medium', 'heavy'], shields: ['shield'] };
    if (armor[idx]) return armor[idx]!.map((id) => ({ type: 'proficiency', category: 'armor', id }));
    if (idx === 'simple-weapons') return [{ type: 'proficiency', category: 'weapon', id: 'simple' }];
    if (idx === 'martial-weapons') return [{ type: 'proficiency', category: 'weapon', id: 'martial' }];
    const p = profByIdx.get(idx);
    const t = String(p?.type ?? '').toLowerCase();
    if (t.startsWith('weapon')) return [{ type: 'proficiency', category: 'weapon', id: p?.reference?.index ?? idx.replace(/s$/, '') }];
    if (t.includes('saving')) return [];
    return [{ type: 'proficiency', category: 'tool', id: idx.replace(/^tool-/, '') }];
  };
  const profChoice = (key: string, label: string, c: J) => {
    const opts: string[] = (c.from?.options ?? []).flatMap((o: J) => (o.item ? [o.item.index] : o.choice ? (o.choice.from?.options ?? []).map((x: J) => x.item?.index).filter(Boolean) : []));
    if (!opts.length) return undefined;
    const skills = opts.every((o) => o.startsWith('skill-'));
    return { key, label, pick: c.choose, from: { list: opts.map((o) => (skills ? o.slice(6) : o.replace(/^tool-/, ''))) }, grants: skills ? 'proficiency.skill' : 'proficiency.tool' };
  };
  const minScore = (pr: J) => ({ abilityMin: { ability: pr.ability_score.index, value: pr.minimum_score } });

  const featureItem = (uid: string, name: string, src: J | undefined, key: string, extraChoices: J[] = []) => {
    const ov = featureOverrides(ed, ns)[key];
    if (ov) usedOverrides.add(key);
    const effects = ov?.effects ?? [];
    const ovKeys = new Set((ov?.choices ?? []).map((c: J) => c.key));
    const choices = [...(ov?.choices ?? []), ...extraChoices.filter((c) => !ovKeys.has(c.key))].filter((c) => !('list' in c.from) || c.from.list.length);
    if (effects.length || choices.length) stats.mechanicalFeatures++; else stats.textOnlyFeatures++;
    items.push({ id: uid, name, edition: ed, type: 'feature', tags: effects.length || choices.length ? [] : ['text-only'], text: src ? text(src) : undefined, mechanics: { effects, choices } });
  };

  // --- особенности классов
  const F = load(ed, 'Features');
  const featureIds = new Set<string>();
  for (const f of F) {
    const extra: J[] = [];
    const fs = f.feature_specific ?? {};
    if (fs.subfeature_options) extra.push({ key: 'option', label: f.name, pick: fs.subfeature_options.choose, from: { list: fs.subfeature_options.from.options.map((o: J) => U('feature', o.item.index)) }, grants: 'feature' });
    if (fs.expertise_options) {
      const opts = fs.expertise_options.from.options.flatMap((o: J) => (o.item ? [o.item.index] : []));
      const list = opts.filter((o: string) => o.startsWith('skill-')).map((o: string) => o.slice(6));
      extra.push({ key: 'expertise', label: f.name, pick: fs.expertise_options.choose, from: { list: list.length ? list : SKILL_IDS }, grants: 'expertise' });
    }
    if (fs.invocations?.length) {
      const list = fs.invocations.map((x: J) => U('feature', x.index));
      extra.push({ key: 'invocations', label: 'Таинственные воззвания', pick: 2, from: { list }, grants: 'feature' });
      extra.push({ key: 'invocations-more', label: 'Ещё одно воззвание', pick: 1, atLevels: [5, 7, 9, 12, 15, 18], from: { list }, grants: 'feature' });
    }
    featureItem(U('feature', f.index), f.name, f, f.index, extra);
    featureIds.add(f.index);
  }
  // 2024: у способностей экспертности нет списка в данных — даём выбор из всех навыков
  // (движок предупредит, если навык без владения)

  // --- классы
  const C = load(ed, 'Classes');
  const L = load(ed, 'Levels');
  const SC = load(ed, 'Subclasses');
  for (const c of C) {
    const lv = L.filter((l) => l.class?.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const at = (n: number) => lv.find((l) => l.level === n);
    const table = (k: string) => Array.from({ length: 20 }, (_, i) => at(i + 1)?.spellcasting?.[k] ?? 0);
    const choiceEntries = (c.proficiency_choices ?? []).map((pc: J, i: number) => profChoice(i === 0 ? 'skills' : `proficiency-${i}`, i === 0 ? 'Навыки' : 'Владение', pc)).filter(Boolean);
    const [skillChoice, ...otherChoices] = choiceEntries;
    const progression: J[] = [];
    if (otherChoices.length) {
      const uid = U('feature', `${c.index}-proficiency-choices`);
      items.push({ id: uid, name: `${c.name}: владения на выбор`, edition: ed, type: 'feature', mechanics: { effects: [], choices: otherChoices } });
      progression.push({ level: 1, features: [uid] });
    }
    let asiPrev = 0; const asiLevels: number[] = [];
    for (let n = 1; n <= 20; n++) {
      const l = at(n);
      if (!l) continue;
      const feats = (l.features ?? []).map((x: J) => x.index).filter((x: string) => featureIds.has(x) && !/ability-score-improvement/.test(x));
      if (feats.length) progression.push({ level: n, features: feats.map((x: string) => U('feature', x)) });
      if (ed === '2014') { if ((l.ability_score_bonuses ?? 0) > asiPrev) asiLevels.push(n); asiPrev = l.ability_score_bonuses ?? asiPrev; }
      else if ((l.features ?? []).some((x: J) => /ability-score-improvement|epic-boon/.test(x.index))) asiLevels.push(n);
    }
    // 2024: эпический дар на 19 уровне — тоже выбор черты
    if (ed === '2024' && !asiLevels.includes(19)) asiLevels.push(19);
    const mc = c.multi_classing ?? {};
    const prereq = mc.prerequisites?.length ? (mc.prerequisites.length === 1 ? minScore(mc.prerequisites[0]) : { all: mc.prerequisites.map(minScore) })
      : mc.prerequisite_options ? { any: mc.prerequisite_options.from.options.map(minScore) } : { all: [] };
    const mcSkill = (mc.proficiency_choices ?? []).map((pc: J) => profChoice('skills', 'Навык', pc)).filter(Boolean)[0];
    const progType = FULL.has(c.index) ? 'full' : HALF.has(c.index) ? 'half' : c.index === 'warlock' ? 'pact' : undefined;
    const ability = c.spellcasting?.spellcasting_ability?.index;
    let spellcasting: J | undefined;
    if (progType && ability) {
      const cantrips = table('cantrips_known');
      const known = table('spells_known');
      const prepared = table('prepared_spells');
      spellcasting = {
        ability, progression: progType, preparation: ed === '2024' || PREPARED.has(c.index) ? 'prepared' : 'known',
        spellList: U('spell-list', c.index),
        ...(cantrips.some(Boolean) ? { cantripsKnown: cantrips } : {}),
        ...(ed === '2014' && known.some(Boolean) ? { spellsKnown: known } : {}),
        ...(ed === '2024' && prepared.some(Boolean) ? { preparedTable: prepared } : {}),
        ...(ed === '2014' && PREPARED.has(c.index) ? { preparedFormula: c.index === 'paladin' ? 'max(1, cha.mod + floor(level.class.paladin / 2))' : `max(1, ${ability}.mod + level.class.${c.index})` } : {}),
        ritualCasting: RITUAL[c.index] ?? 'none',
        ...(progType === 'pact' ? { pactSlots: Array.from({ length: 20 }, (_, i) => {
          const sc = at(i + 1)?.spellcasting ?? {};
          const lvls = [1, 2, 3, 4, 5].filter((s) => (sc[`spell_slots_level_${s}`] ?? 0) > 0);
          const top = lvls.at(-1) ?? 1;
          return { count: sc[`spell_slots_level_${top}`] ?? 0, slotLevel: top };
        }) } : {}),
      };
    }
    const savingThrows = (c.saving_throws ?? []).map((s: J) => s.index);
    const subFirst = Math.min(...L.filter((l) => l.class?.index === c.index && l.subclass).map((l) => l.level), ...SC.filter((s) => s.class.index === c.index).flatMap((s) => (s.features ?? []).map((f: J) => f.level)));
    items.push({
      id: U('class', c.index), name: c.name, edition: ed, type: 'class', text: text(c),
      mechanics: {
        hitDie: c.hit_die,
        primaryAbilities: PRIMARY[c.index] ?? (c.primary_ability?.ability_scores ?? []).map((a: J) => a.index).filter((a: string) => AB.includes(a)),
        savingThrows,
        startingProficiencies: (c.proficiencies ?? []).flatMap((p: J) => prof(p.index)).filter((e: J) => e.category !== 'save'),
        multiclass: { prerequisite: prereq, proficiencies: (mc.proficiencies ?? []).flatMap((p: J) => prof(p.index)), ...(mcSkill ? { skillChoice: mcSkill } : {}) },
        skillChoice,
        subclassLevel: ed === '2024' ? 3 : SUBCLASS_LEVEL_2014[c.index] ?? (Number.isFinite(subFirst) ? subFirst : 3),
        asiLevels, progression, resources: [],
        ...(spellcasting ? { spellcasting } : {}),
      },
    });
    // список заклинаний класса как отдельный элемент — для фильтров и зависимостей
    items.push({ id: U('spell-list', c.index), name: `${c.name} spells`, edition: ed, type: 'spell-list', mechanics: { class: U('class', c.index) } });
  }

  // --- подклассы
  for (const s of SC) {
    const progression: J[] = [];
    if (ed === '2014') {
      for (const l of L.filter((x) => x.subclass?.index === s.index)) {
        const feats = (l.features ?? []).map((x: J) => x.index).filter((x: string) => featureIds.has(x));
        if (feats.length) progression.push({ level: l.level, features: feats.map((x: string) => U('feature', x)) });
      }
    } else {
      const byLevel = new Map<number, string[]>();
      for (const f of s.features ?? []) {
        const key = `${s.index}-${slug(f.name)}`;
        const uid = U('feature', key);
        if (!items.some((i) => i.id === uid)) featureItem(uid, f.name, f, key);
        byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), uid]);
      }
      for (const [level, features] of [...byLevel].sort((a, b) => a[0] - b[0])) progression.push({ level, features });
    }
    // заклинания домена/клятвы/круга (2014): всегда подготовлены с нужного уровня
    if (s.spells?.length) {
      const uid = U('feature', `${s.index}-subclass-spells`);
      const effects = s.spells.map((sp: J) => {
        const lvl = Number(String(sp.prerequisites?.find((p: J) => p.type === 'level')?.index ?? '').split('-').pop()) || 1;
        return { type: 'spell.grant', spell: U('spell', sp.spell.index), alwaysPrepared: true, countsAgainstLimit: false, when: { classLevel: { class: U('class', s.class.index), min: lvl } } };
      });
      items.push({ id: uid, name: `${s.name}: заклинания`, edition: ed, type: 'feature', mechanics: { effects, choices: [] } });
      const first = Math.min(...progression.map((p) => p.level), SUBCLASS_LEVEL_2014[s.class.index] ?? 3);
      const entry = progression.find((p) => p.level === first);
      if (entry) entry.features.push(uid); else progression.unshift({ level: first, features: [uid] });
    }
    progression.sort((a, b) => a.level - b.level);
    items.push({ id: U('subclass', s.index), name: s.name, edition: ed, type: 'subclass', text: text(s), mechanics: { class: U('class', s.class.index), progression, expandedSpells: [] } });
  }

  // --- черты расы / вида
  const T = load(ed, 'Traits');
  for (const t of T) {
    const ov = traitOverrides(ed, ns)[t.index];
    if (ov) usedOverrides.add(`trait:${t.index}`);
    const effects = [...(t.proficiencies ?? []).flatMap((p: J) => prof(p.index)), ...(ov?.effects ?? [])];
    const choices = [...(ov?.choices ?? [])];
    for (const pc of t.proficiency_choices ? [t.proficiency_choices].flat() : []) { const ch = profChoice('proficiency', t.name, pc); if (ch) choices.push(ch); }
    if (t.speed) effects.push({ type: 'speed', mode: 'walk', op: 'set', value: t.speed });
    items.push({ id: U('feature', `trait-${t.index}`), name: t.name, edition: ed, type: 'feature', tags: effects.length || choices.length ? ['trait'] : ['trait', 'text-only'], text: text(t), mechanics: { effects, choices } });
  }
  const traitUid = (idx: string) => U('feature', `trait-${idx}`);
  const langEffects = (ls: J[] = []) => ls.map((l) => ({ type: 'proficiency', category: 'language', id: l.index }));
  const LANGS = load(ed, 'Languages').map((l) => l.index);
  const langChoice = (lo: J | undefined, key = 'languages') => (lo ? [{ key, label: 'Языки', pick: lo.choose, from: { list: lo.from?.options?.map((o: J) => o.item.index) ?? LANGS }, grants: 'proficiency.language' }] : []);

  const SIZE = (s: string) => [String(s ?? 'Medium').toLowerCase().split(/\s|,/)[0]].filter((x) => ['tiny', 'small', 'medium', 'large'].includes(x!)) as string[];
  if (ed === '2014') {
    for (const r of load(ed, 'Races')) {
      const choices: J[] = [...langChoice(r.language_options)];
      if (r.ability_bonus_options) choices.push({ key: 'abilities', label: 'Характеристики', pick: r.ability_bonus_options.choose, from: { list: r.ability_bonus_options.from.options.map((o: J) => o.ability_score.index) }, grants: 'ability.bonus' });
      for (const pc of r.starting_proficiency_options ? [r.starting_proficiency_options] : []) { const ch = profChoice('proficiency', 'Владение', pc); if (ch) choices.push(ch); }
      items.push({ id: U('species', r.index), name: r.name, edition: ed, type: 'species', text: { body: [r.alignment, r.age, r.size_description, r.language_desc].filter(Boolean).join('\n\n') },
        mechanics: { size: SIZE(r.size), speed: r.speed, effects: [...(r.ability_bonuses ?? []).map((b: J) => ({ type: 'ability.bonus', ability: b.ability_score.index, value: b.bonus })), ...langEffects(r.languages), ...(r.starting_proficiencies ?? []).flatMap((p: J) => prof(p.index))],
          choices, features: (r.traits ?? []).map((t: J) => traitUid(t.index)) } });
    }
    for (const s of load(ed, 'Subraces')) {
      const race = load(ed, 'Races').find((r) => r.index === s.race.index)!;
      items.push({ id: U('subspecies', s.index), name: s.name, edition: ed, type: 'subspecies', text: text(s),
        mechanics: { parent: U('species', s.race.index), size: SIZE(race.size), speed: race.speed, effects: [...(s.ability_bonuses ?? []).map((b: J) => ({ type: 'ability.bonus', ability: b.ability_score.index, value: b.bonus })), ...(s.starting_proficiencies ?? []).flatMap((p: J) => prof(p.index))], choices: langChoice(s.language_options), features: (s.racial_traits ?? []).map((t: J) => traitUid(t.index)) } });
    }
  } else {
    for (const r of load(ed, 'Species')) {
      const traits = T.filter((t) => (t.species ?? []).some((x: J) => x.index === r.index) && !(t.subspecies ?? []).length).map((t) => traitUid(t.index));
      items.push({ id: U('species', r.index), name: r.name, edition: ed, type: 'species', text: text(r), mechanics: { size: SIZE(r.size), speed: r.speed, effects: [{ type: 'proficiency', category: 'language', id: 'common' }], choices: [], features: traits } });
    }
    for (const s of load(ed, 'Subspecies')) {
      const parent = load(ed, 'Species').find((r) => r.index === s.species.index)!;
      items.push({ id: U('subspecies', s.index), name: s.name, edition: ed, type: 'subspecies', text: text(s), mechanics: { parent: U('species', s.species.index), size: SIZE(parent.size), speed: parent.speed, effects: [], choices: [], features: (s.traits ?? []).map((t: J) => traitUid(t.index)).filter((u: string) => items.some((i) => i.id === u)) } });
    }
  }

  // --- предыстории
  for (const b of load(ed, 'Backgrounds')) {
    const effects = [...(b.starting_proficiencies ?? b.proficiencies ?? []).flatMap((p: J) => prof(p.index))];
    const choices = [...langChoice(b.language_options)];
    for (const pc of b.proficiency_choices ?? []) { const ch = profChoice(`proficiency-${choices.length}`, 'Владение', pc); if (ch) choices.push(ch); }
    items.push({ id: U('background', b.index), name: b.name, edition: ed, type: 'background', text: text(b) ?? (b.feature ? { body: `${b.feature.name}\n\n${(b.feature.desc ?? []).join('\n\n')}` } : undefined),
      mechanics: { effects, choices, ...(b.ability_scores ? { abilityOptions: b.ability_scores.map((a: J) => a.index) } : {}), ...(b.feat ? { originFeat: U('feat', b.feat.index) } : {}) } });
  }

  // --- черты (feats)
  for (const f of load(ed, 'Feats')) {
    const ov = featureOverrides(ed, ns)[`feat:${f.index}`];
    if (ov) usedOverrides.add(`feat:${f.index}`);
    const pre: J[] = [];
    for (const p of Array.isArray(f.prerequisites) ? f.prerequisites : []) if (p.ability_score) pre.push(minScore(p));
    if (!Array.isArray(f.prerequisites) && f.prerequisites?.minimum_level) pre.push({ totalLevel: { min: f.prerequisites.minimum_level } });
    if (f.prerequisite_options) pre.push({ any: f.prerequisite_options.from.options.filter((o: J) => o.ability_score).map(minScore) });
    items.push({ id: U('feat', f.index), name: f.name, edition: ed, type: 'feat', text: text(f), ...(pre.length ? { prerequisite: pre.length === 1 ? pre[0] : { all: pre } } : {}),
      mechanics: { category: f.type ?? 'none', repeatable: !!f.repeatable, effects: ov?.effects ?? [], choices: ov?.choices ?? [] } });
  }

  // --- заклинания
  for (const s of load(ed, 'Spells')) {
    const r = String(s.range ?? '');
    const feet = /([\d,]+)\s*(feet|foot)/i.exec(r)?.[1];
    const miles = /([\d,]+)\s*mile/i.exec(r)?.[1];
    const kind = /^self/i.test(r) ? 'self' : /touch/i.test(r) ? 'touch' : /sight/i.test(r) ? 'sight' : /unlimited/i.test(r) ? 'unlimited' : feet || miles ? 'ranged' : 'special';
    items.push({ id: U('spell', s.index), name: s.name, edition: ed, type: 'spell', text: { body: [text(s)?.body, ...(s.higher_level ?? []), s.cantrip_upgrade ?? '', s.higher_levels ?? ''].filter(Boolean).join('\n\n') },
      mechanics: {
        level: s.level, school: s.school.index, castingTime: s.casting_time, range: { kind, ...(feet ? { feet: Number(feet.replace(/,/g, '')) } : miles ? { feet: Number(miles.replace(/,/g, '')) * 5280 } : {}) },
        components: { v: s.components.includes('V'), s: s.components.includes('S'), ...(s.components.includes('M') ? { m: s.material ?? 'material' } : {}), consumed: /consume/i.test(s.material ?? ''), ...( /(\d[\d,]*)\+?\s*gp/i.exec(s.material ?? '') ? { costGp: Number(/(\d[\d,]*)\+?\s*gp/i.exec(s.material)![1]!.replace(/,/g, '')) } : {}) },
        duration: s.duration, concentration: !!s.concentration, ritual: !!s.ritual,
        classes: (s.classes ?? []).map((c: J) => U('class', c.index)),
        ...(s.attack_type ? { attack: s.attack_type } : {}),
        ...(s.dc?.dc_type?.index ? { save: s.dc.dc_type.index } : {}),
      } });
  }

  // --- снаряжение
  const cp = (c: J | undefined) => (c ? Math.round(c.quantity * ({ cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as J)[c.unit] ?? 1) : undefined);
  for (const e of load(ed, 'Equipment')) {
    const cats = [e.equipment_category?.index, ...(e.equipment_categories ?? []).map((c: J) => c.index)].filter(Boolean);
    const phys = { weightLb: e.weight ?? 0, ...(cp(e.cost) !== undefined ? { costCp: cp(e.cost) } : {}) };
    const base = { name: e.name, edition: ed, text: text(e) };
    const isWeapon = cats.some((c: string) => /weapon/.test(c)) && (e.damage || e.weapon_category || cats.some((c: string) => /simple|martial/.test(c)));
    const isArmor = cats.some((c: string) => /armor|shield/.test(c)) && (e.armor_class || e.armor_category);
    if (isWeapon) {
      const category = /martial/i.test(e.weapon_category ?? '') || cats.some((c: string) => /martial/.test(c)) ? 'martial' : 'simple';
      const ranged = /ranged/i.test(e.weapon_range ?? '') || cats.some((c: string) => /ranged/.test(c));
      const props = (e.properties ?? []).map((p: J) => p.index);
      const range = e.range?.long ? { normal: e.range.normal, long: e.range.long } : e.throw_range ? { normal: e.throw_range.normal, long: e.throw_range.long } : undefined;
      items.push({ id: U('weapon', e.index), type: 'weapon', ...base, mechanics: { ...phys, category, kind: ranged ? 'ranged' : 'melee', damage: e.damage?.damage_dice ?? '0', damageType: e.damage?.damage_type?.index ?? 'none', properties: props, ...(e.two_handed_damage ? { versatile: e.two_handed_damage.damage_dice } : {}), ...(range ? { range } : {}), ...(e.mastery ? { mastery: e.mastery.index } : {}) } });
    } else if (isArmor) {
      const catName = String(e.armor_category ?? (cats.includes('shields') ? 'shield' : '')).toLowerCase();
      const category = catName.includes('shield') ? 'shield' : catName.includes('heavy') ? 'heavy' : catName.includes('medium') ? 'medium' : 'light';
      const ac = e.armor_class ?? {};
      items.push({ id: U('armor', e.index), type: 'armor', ...base, mechanics: { ...phys, category, baseAc: ac.base ?? 2, dexCap: category === 'shield' ? null : ac.dex_bonus === false ? 0 : ac.max_bonus ?? null, ...(e.str_minimum ? { strengthReq: e.str_minimum } : {}), stealthDisadvantage: !!e.stealth_disadvantage } });
    } else {
      const type = cats.some((c: string) => /pack/.test(c)) || e.gear_category?.index === 'equipment-packs' ? 'pack' : cats.some((c: string) => /tool|instrument|kit|gaming/.test(c)) ? 'tool' : /potion|ammunition|consum/.test(cats.join()) ? 'consumable' : 'gear';
      items.push({ id: U(type === 'pack' ? 'pack' : type, e.index), type, ...base, mechanics: { ...phys, ...(e.contents ? { contents: e.contents.map((x: J) => ({ item: x.item.index, qty: x.quantity })) } : {}) } });
    }
  }
  // содержимое наборов — ссылки на uid
  const byIdx = new Map(items.filter((i) => ['weapon', 'armor', 'gear', 'tool', 'consumable', 'pack'].includes(i.type)).map((i) => [i.id.split('/')[1], i.id]));
  for (const i of items) if (i.mechanics?.contents) i.mechanics.contents = i.mechanics.contents.map((c: J) => ({ item: byIdx.get(slug(c.item)) ?? U('gear', c.item), qty: c.qty })).filter((c: J) => items.some((x) => x.id === c.item));

  // --- магические предметы
  const RAR: Record<string, string> = { common: 'common', uncommon: 'uncommon', rare: 'rare', 'very rare': 'very-rare', legendary: 'legendary', artifact: 'artifact', varies: 'uncommon' };
  for (const m of load(ed, 'Magic-Items')) {
    const first = (Array.isArray(m.desc) ? m.desc[0] : String(m.description ?? m.desc ?? '').split('\n')[0]) ?? '';
    const ov = magicItemOverrides(ed, ns)[m.index];
    if (ov) usedOverrides.add(`mi:${m.index}`);
    items.push({ id: U('magic-item', m.index), name: m.name, edition: ed, type: 'magic-item', tags: m.variant ? ['variant'] : [], text: text(m),
      mechanics: { rarity: RAR[String(m.rarity?.name ?? 'uncommon').toLowerCase()] ?? 'uncommon', attunement: m.attunement ?? /requires attunement/i.test(first), effects: ov?.effects ?? [], ...(ov?.baseItem ? { baseItem: ov.baseItem } : {}) } });
  }

  // --- проверка: все переопределения нашли свою цель
  const all = [...Object.keys(featureOverrides(ed, ns)), ...Object.keys(traitOverrides(ed, ns)).map((k) => `trait:${k}`), ...Object.keys(magicItemOverrides(ed, ns)).map((k) => `mi:${k}`)];
  stats.unmatchedOverrides = all.filter((k) => !usedOverrides.has(k));

  const pkg = {
    formatVersion: 1, kind: 'content', id: ed === '2014' ? 'srd-5-1' : 'srd-5-2', name: ed === '2014' ? 'SRD 5.1' : 'SRD 5.2', version: '1.0.0', language: 'en',
    edition: ed, namespace: ns, origin: 'builtin',
    source: {
      id: ed === '2014' ? 'srd-5-1' : 'srd-5-2', title: ed === '2014' ? 'System Reference Document 5.1' : 'System Reference Document 5.2', publisher: 'Wizards of the Coast LLC', edition: ed,
      documentVersion: ed === '2014' ? '5.1' : '5.2',
      url: 'https://www.dndbeyond.com/srd',
      license: {
        code: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        attribution: ed === '2014'
          ? 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.'
          : 'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
        modifications: 'Данные преобразованы в формат пакетов A&D; механика особенностей размечена вручную. Структура исходных данных — 5e-database (MIT, © Adrian Padua, Christopher Ward).',
      },
      allowedUse: { storeMechanics: true, storeText: true, displayText: true, exportText: true, share: true },
    },
    items,
  };
  const parsed = contentPackage.parse(pkg);
  const report = validatePackage(parsed, []);
  return { parsed, stats, report };
}

mkdirSync(outDir, { recursive: true });
for (const ed of ['2014', '2024'] as const) {
  const { parsed, stats, report } = build(ed);
  const file = join(outDir, `${parsed.id}.json`);
  writeFileSync(file, JSON.stringify(parsed));
  const counts: Record<string, number> = {};
  if (parsed.kind === 'content') for (const i of parsed.items) counts[i.type] = (counts[i.type] ?? 0) + 1;
  console.log(`\n${parsed.id}: ${JSON.stringify(counts)}`);
  console.log(`  особенности с механикой: ${stats.mechanicalFeatures}, только текст: ${stats.textOnlyFeatures}`);
  console.log(`  проверка: ошибок ${report.errors.length}, предупреждений ${report.warnings.length}`);
  for (const e of report.errors.slice(0, 15)) console.log(`   ✗ ${e.code}: ${e.message}`);
  for (const w of report.warnings.slice(0, 8)) console.log(`   ! ${w.code}: ${w.message}`);
  if (stats.unmatchedOverrides.length) console.log(`  переопределения без цели: ${stats.unmatchedOverrides.join(', ')}`);
  if (report.errors.length) process.exitCode = 1;
}
