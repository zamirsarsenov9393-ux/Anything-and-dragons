/** Создание персонажа: быстрый режим для ваншотов и подробный мастер из 14 шагов. */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, Shield, Heart, Zap, Plus, Trash2, Wand2, AlertTriangle } from 'lucide-react';
import type { AbilityId, CharacterBuild, ContentUid, Edition } from '../../core/types';
import { compute } from '../../core/engine/compute';
import { autoResolve } from '../../core/engine/auto';
import { getRuleSet } from '../../core/editions';
import { useApp } from '../store';
import { byType, nameOf } from '../content';
import { ABILITY_KEYS, signed, term, useTr } from '../i18n';
import { Badge, Button, Card, Field, Header, Input, Section, Segmented, Select, Stepper, TextArea, cx } from '../ui';
import { ChoiceList, setChoice } from '../parts/Choices';
import { SpellPicker } from '../parts/Spells';
import { applyPlan, assign, planOf, POINT_BUY_DEFAULT, priorityFor, randomName, roll4d6, speciesOptions, starterKit, type ClassPlan } from '../parts/builder';
import { emptyBuild, ENGINE_VERSION, equipmentOf, summaryOf } from '../engine';

export function Create({ mode }: { mode?: 'quick' | 'wizard' }) {
  return mode === 'wizard' ? <Wizard /> : <Quick />;
}

type Kit = ReturnType<typeof starterKit>;

async function saveNew(build: CharacterBuild, name: string, kit: Kit, extras: { biography?: Record<string, string>; prepared?: Record<string, string[]> } = {}) {
  const { repo, lib, contentLang, navigate, toast } = useApp.getState();
  const inv = kit.map((k, i) => ({ id: String(i), characterId: '', contentUid: k.contentUid, customName: null, customMechanics: null, qty: k.qty, slot: k.slot, attuned: false, containerId: null, magicBonus: 0, chargesUsed: 0, notes: null, sortOrder: i }));
  const r = compute(build, lib!.resolver, { equipment: equipmentOf(inv as never) });
  const hasErrors = r.issues.some((i) => i.severity === 'error') || r.pending.some((p) => p.required);
  const id = await repo!.createCharacter({ name: name.trim() || randomName(), edition: build.edition, build, summary: summaryOf(r, lib!, contentLang), snapshots: lib!.resolver.snapshotOf(r.usedContent), engineVersion: ENGINE_VERSION, biography: extras.biography, inventory: kit, status: hasErrors ? 'draft' : 'active' });
  if (extras.prepared) await repo!.saveState(id, { preparedSpells: extras.prepared });
  toast(hasErrors ? 'Персонаж сохранён как черновик: остались незакрытые выборы' : 'Персонаж создан', hasErrors ? 'warn' : 'ok');
  navigate(`/c/${id}`);
}

// ============================================================================ Быстрое создание

function Quick() {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const [edition, setEdition] = useState<Edition>('2014');
  const [level, setLevel] = useState(1);
  const classes = byType(lib!, 'class', edition);
  const [classUid, setClassUid] = useState('');
  const cls = classUid && classUid.startsWith(edition === '2014' ? 'srd51' : 'srd52') ? classUid : classes[0]?.id ?? '';
  const subclasses = byType(lib!, 'subclass', edition).filter((s) => (s.mechanics as { class: string }).class === cls);
  const [subUid, setSubUid] = useState('');
  const species = speciesOptions(lib!, edition, contentLang);
  const [spUid, setSpUid] = useState('');
  const backgrounds = byType(lib!, 'background', edition);
  const [bgUid, setBgUid] = useState('');
  const [method, setMethod] = useState<'standard-array' | 'point-buy' | 'roll-4d6'>('standard-array');
  const [name, setName] = useState(randomName());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const prio = priorityFor(lib!, cls);
      const rolled = method === 'roll-4d6' ? roll4d6() : undefined;
      const values = method === 'standard-array' ? getRuleSet(edition).standardArray : method === 'point-buy' ? POINT_BUY_DEFAULT : rolled!;
      let b: CharacterBuild = { ...emptyBuild(edition), baseAbilities: assign(values, prio), rolledPool: rolled, speciesUid: (spUid || species[0]?.uid) as ContentUid, backgroundUid: (bgUid || backgrounds[0]?.id) as ContentUid };
      b.options.abilityMethod = method;
      b = applyPlan(b, [{ classUid: cls, levels: level }]);
      const subLevel = (lib!.items.get(cls)?.item.mechanics as { subclassLevel: number }).subclassLevel;
      if (subUid && level >= subLevel) b = setChoice(b, { choiceId: `${cls}#subclass`, level: b.levels.findIndex((l) => l.classLevel === subLevel) + 1 }, [subUid]);
      b = autoResolve(b, lib!.resolver, {}, { abilityPriority: prio });
      await saveNew(b, name, starterKit(lib!, cls));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title={t('Быстрое создание', 'Quick build')} subtitle={t('Персонаж для ваншота за минуту', 'A one-shot hero in a minute')} back="/" />
      <div className="px-4 grid gap-4">
        <Field label={t('Редакция правил', 'Rules edition')}><Segmented value={edition} onChange={(v) => { setEdition(v); setClassUid(''); setSubUid(''); setSpUid(''); setBgUid(''); }} items={[{ id: '2014', label: 'D&D 5e 2014' }, { id: '2024', label: 'D&D 5e 2024' }]} /></Field>
        <Field label={t('Уровень', 'Level')}><div className="flex items-center gap-3"><Stepper value={level} onChange={setLevel} min={1} max={20} /><input type="range" min={1} max={20} value={level} onChange={(e) => setLevel(+e.target.value)} className="flex-1 accent-[#c4a062]" /></div></Field>
        <Field label={t('Класс', 'Class')}><Select value={cls} onChange={(e) => { setClassUid(e.target.value); setSubUid(''); }}>{classes.map((c) => <option key={c.id} value={c.id}>{nameOf(lib!, c.id, contentLang)}</option>)}</Select></Field>
        <Field label={t('Подкласс', 'Subclass')} hint={t('Если уровень ниже нужного, подкласс выберется позже при повышении.', 'If the level is too low, the subclass is picked later on level-up.')}>
          <Select value={subUid} onChange={(e) => setSubUid(e.target.value)}><option value="">{t('Автоматически', 'Automatic')}</option>{subclasses.map((s) => <option key={s.id} value={s.id}>{nameOf(lib!, s.id, contentLang)}</option>)}</Select>
        </Field>
        <Field label={t('Вид', 'Species')}><Select value={spUid} onChange={(e) => setSpUid(e.target.value)}>{species.map((s) => <option key={s.uid} value={s.uid}>{s.group !== s.label ? `${s.group} · ${s.label}` : s.label}</option>)}</Select></Field>
        <Field label={t('Предыстория', 'Background')}><Select value={bgUid} onChange={(e) => setBgUid(e.target.value)}>{backgrounds.map((s) => <option key={s.id} value={s.id}>{nameOf(lib!, s.id, contentLang)}</option>)}</Select></Field>
        <Field label={t('Характеристики', 'Ability scores')}>
          <Segmented value={method} onChange={setMethod} items={[{ id: 'standard-array', label: t('Набор', 'Array') }, { id: 'point-buy', label: t('Очки', 'Points') }, { id: 'roll-4d6', label: t('Броски', 'Roll') }]} />
        </Field>
        <Field label={t('Имя', 'Name')}><div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} /><Button variant="soft" onClick={() => setName(randomName())} aria-label="random"><Dices size={20} /></Button></div></Field>
        <p className="text-sm text-muted px-1">{t('Навыки, черты, увеличения характеристик и стартовое снаряжение подберутся сами под класс. Любое решение потом можно поменять на листе персонажа.', 'Skills, feats, ability increases and starting gear are picked for the class. Every decision can be changed on the sheet later.')}</p>
        <Button variant="gold" size="lg" icon={<Zap size={20} />} disabled={busy || !cls} onClick={create}>{busy ? t('Собираю…', 'Building…') : t('Создать персонажа', 'Create character')}</Button>
      </div>
    </div>
  );
}

// ============================================================================ Подробный мастер

const STEPS = [
  ['Редакция', 'Edition'], ['Уровень', 'Level'], ['Вид', 'Species'], ['Класс', 'Class'], ['Подкласс', 'Subclass'], ['Предыстория', 'Background'], ['Характеристики', 'Abilities'],
  ['Навыки', 'Skills'], ['Владения', 'Proficiencies'], ['Черты', 'Feats'], ['Способности', 'Features'], ['Заклинания', 'Spells'], ['Снаряжение', 'Equipment'], ['Имя и биография', 'Name & story'],
] as const;

function Wizard() {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const [step, setStep] = useState(0);
  const [build, setBuild] = useState<CharacterBuild>(() => emptyBuild('2014'));
  const [level, setLevel] = useState(1);
  const [plan, setPlan] = useState<ClassPlan>([]);
  const [kit, setKit] = useState<Kit>([]);
  const [prepared, setPrepared] = useState<Record<string, string[]>>({});
  const [bio, setBio] = useState<Record<string, string>>({ name: randomName() });
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => {
    const inv = kit.map((k, i) => ({ contentUid: k.contentUid, slot: k.slot, attuned: false, magicBonus: 0, id: String(i) }));
    return compute(build, lib!.resolver, { equipment: equipmentOf(inv as never) });
  }, [build, kit, lib]);

  const setEdition = (e: Edition) => { setBuild({ ...emptyBuild(e), options: { ...build.options } }); setPlan([]); setKit([]); setPrepared({}); };
  const updatePlan = (p: ClassPlan) => { setPlan(p); setBuild((b) => applyPlan(b, p)); };
  const primary = plan[0]?.classUid;
  const totalPlanned = plan.reduce((s, p) => s + p.levels, 0);
  const errors = result.issues.filter((i) => i.severity === 'error');
  const s = result.sheet;

  const canNext = [true, true, !!build.speciesUid, totalPlanned === level && !errors.some((e) => e.code === 'multiclass-prerequisite'), true, !!build.backgroundUid, !errors.some((e) => /point-buy|standard-array|roll|ability-range/.test(e.code)), true, true, true, true, true, true, true][step];

  const finish = async () => {
    setBusy(true);
    try { await saveNew(build, bio.name ?? '', kit, { biography: bio, prepared }); } finally { setBusy(false); }
  };

  return (
    <div className="pb-24">
      <Header title={t(STEPS[step]![0], STEPS[step]![1])} subtitle={t(`Шаг ${step + 1} из ${STEPS.length}`, `Step ${step + 1} of ${STEPS.length}`)} back={step === 0 ? '/' : () => setStep(step - 1)} />
      <div className="px-4">
        <div className="flex gap-1 mb-3">{STEPS.map((_, i) => <button key={i} onClick={() => i < step && setStep(i)} className={cx('h-1.5 flex-1 rounded-full', i < step ? 'bg-gold' : i === step ? 'bg-gold-bright' : 'bg-edge')} />)}</div>
        {step >= 3 && (
          <Card className="p-3 mb-4 flex items-center gap-4 text-sm">
            <div className="font-display text-xl flex-1 truncate">{Object.entries(s.classLevels).map(([u, l]) => `${nameOf(lib!, u, contentLang)} ${l}`).join(' / ') || '—'}</div>
            <span className="flex items-center gap-1"><Shield size={15} className="text-gold" />{s.armorClass.value}</span>
            <span className="flex items-center gap-1"><Heart size={15} className="text-blood" />{s.hitPointsMax.value}</span>
          </Card>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            {step === 0 && (
              <div className="grid gap-4">
                <Segmented value={build.edition} onChange={setEdition} items={[{ id: '2014', label: 'D&D 5e 2014' }, { id: '2024', label: 'D&D 5e 2024' }]} />
                <Card className="p-4 text-sm text-parchment-dim leading-relaxed">{build.edition === '2014' ? t('Правила 2014 года (SRD 5.1). Бонусы характеристик даёт вид, черты — опциональное правило.', '2014 rules (SRD 5.1). Species grant ability bonuses, feats are optional.') : t('Правила 2024 года (SRD 5.2). Бонусы характеристик и черту происхождения даёт предыстория, подкласс у всех с 3 уровня.', '2024 rules (SRD 5.2). Background grants ability bonuses and an origin feat; every subclass starts at level 3.')}</Card>
                <Toggle label={t('Мультиклассирование', 'Multiclassing')} value={build.options.allowMulticlass} onChange={(v) => setBuild({ ...build, options: { ...build.options, allowMulticlass: v } })} />
                {build.edition === '2014' && <Toggle label={t('Черты вместо увеличения характеристик', 'Feats instead of ability increases')} value={build.options.allowFeats} onChange={(v) => setBuild({ ...build, options: { ...build.options, allowFeats: v } })} />}
                <Field label={t('Хиты на уровнях после первого', 'Hit points after 1st level')}><Segmented value={build.options.hpMethod} onChange={(v) => setBuild({ ...build, options: { ...build.options, hpMethod: v } })} items={[{ id: 'average', label: t('Среднее', 'Average') }, { id: 'rolled', label: t('Бросок', 'Rolled') }, { id: 'max', label: t('Максимум', 'Max') }]} /></Field>
              </div>
            )}
            {step === 1 && (
              <div className="text-center py-6">
                <div className="font-display text-[88px] leading-none text-gold-bright">{level}</div>
                <input type="range" min={1} max={20} value={level} onChange={(e) => { const v = +e.target.value; setLevel(v); if (plan.length === 1) updatePlan([{ ...plan[0]!, levels: v }]); }} className="w-full mt-6 accent-[#c4a062]" />
                <p className="text-sm text-muted mt-4">{t('Все уровни от 1 до выбранного будут пройдены по очереди: способности, подклассы, увеличения характеристик и выборы на каждом уровне.', 'Every level from 1 to the chosen one is processed in order, with all features and choices.')}</p>
              </div>
            )}
            {step === 2 && (
              <PickList items={speciesOptions(lib!, build.edition, contentLang).map((x) => ({ uid: x.uid, label: x.label, sub: x.group !== x.label ? x.group : undefined }))} value={build.speciesUid} onPick={(u) => setBuild({ ...build, speciesUid: u as ContentUid, originChoices: build.originChoices.filter((c) => !c.choiceId.startsWith(build.speciesUid ?? '#')) })} />
            )}
            {step === 3 && <ClassStep level={level} plan={plan} edition={build.edition} allowMulticlass={build.options.allowMulticlass} onChange={updatePlan} issues={errors.filter((e) => e.code === 'multiclass-prerequisite').map((e) => e.message)} />}
            {step === 4 && <ChoiceList choices={result.choices} kinds={['subclass']} build={build} onChange={setBuild} empty={t('На этом уровне подкласс ещё не выбирается.', 'No subclass at this level yet.')} />}
            {step === 5 && (
              <div className="grid gap-4">
                <PickList items={byType(lib!, 'background', build.edition).map((b) => ({ uid: b.id, label: nameOf(lib!, b.id, contentLang) }))} value={build.backgroundUid} onPick={(u) => setBuild({ ...build, backgroundUid: u as ContentUid })} />
                <ChoiceList choices={result.choices} kinds={['ability-scores']} build={build} onChange={setBuild} empty=" " />
              </div>
            )}
            {step === 6 && <AbilityStep build={build} onChange={setBuild} prio={priorityFor(lib!, primary)} finals={Object.fromEntries(ABILITY_KEYS.map((a) => [a, s.abilities[a].value])) as Record<AbilityId, number>} />}
            {step === 7 && <ChoiceList choices={result.choices} kinds={['proficiency.skill', 'expertise']} build={build} onChange={setBuild} />}
            {step === 8 && <ChoiceList choices={result.choices} kinds={['proficiency.tool', 'proficiency.language']} build={build} onChange={setBuild} />}
            {step === 9 && <ChoiceList choices={result.choices} kinds={['asi', 'feat']} build={build} onChange={setBuild} empty={t('Черт и увеличений характеристик на этих уровнях нет.', 'No feats or ability increases at these levels.')} />}
            {step === 10 && <ChoiceList choices={result.choices} kinds={['feature', 'ability.bonus', 'spell', 'item']} build={build} onChange={setBuild} />}
            {step === 11 && (s.spellcasting.length ? (
              <div className="grid gap-6">{s.spellcasting.map((sc) => <SpellPicker key={sc.classUid} result={result} classUid={sc.classUid} selected={prepared[sc.classUid] ?? []} onChange={(u) => setPrepared({ ...prepared, [sc.classUid]: u })} />)}</div>
            ) : <div className="text-center text-muted py-10">{t('Этот персонаж не использует заклинания.', 'This character does not cast spells.')}</div>)}
            {step === 12 && <KitStep kit={kit} setKit={setKit} primary={primary} edition={build.edition} />}
            {step === 13 && (
              <div className="grid gap-3">
                <Field label={t('Имя', 'Name')}><div className="flex gap-2"><Input value={bio.name ?? ''} onChange={(e) => setBio({ ...bio, name: e.target.value })} /><Button variant="soft" onClick={() => setBio({ ...bio, name: randomName() })}><Dices size={20} /></Button></div></Field>
                <Field label={t('Мировоззрение', 'Alignment')}><Input value={bio.alignment ?? ''} onChange={(e) => setBio({ ...bio, alignment: e.target.value })} placeholder={t('например, нейтрально-добрый', 'e.g. neutral good')} /></Field>
                <Field label={t('Внешность', 'Appearance')}><TextArea value={bio.appearance ?? ''} onChange={(e) => setBio({ ...bio, appearance: e.target.value })} /></Field>
                <Field label={t('Характер, идеалы, привязанности, слабости', 'Personality, ideals, bonds, flaws')}><TextArea value={bio.personality ?? ''} onChange={(e) => setBio({ ...bio, personality: e.target.value })} /></Field>
                <Field label={t('Предыстория персонажа', 'Backstory')}><TextArea value={bio.backstory ?? ''} onChange={(e) => setBio({ ...bio, backstory: e.target.value })} /></Field>
                <Summary pendingCount={result.pending.filter((p) => p.required).length} errors={errors.map((e) => e.message)} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="fixed bottom-0 inset-x-0 z-30 bg-ink/95 border-t border-edge safe-bottom">
        <div className="max-w-xl mx-auto px-4 pt-3 flex gap-3">
          <Button className="flex-1" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('Назад', 'Back')}</Button>
          {step < STEPS.length - 1
            ? <Button className="flex-[2]" variant="gold" disabled={!canNext} onClick={() => { if (step === 3 && !kit.length && primary) setKit(starterKit(lib!, primary)); setStep(step + 1); }}>{t('Далее', 'Next')}</Button>
            : <Button className="flex-[2]" variant="gold" disabled={busy} onClick={finish} icon={<Wand2 size={18} />}>{t('Создать', 'Create')}</Button>}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="card flex items-center justify-between p-4 text-left">
      <span>{label}</span>
      <span className={cx('w-12 h-7 rounded-full p-0.5 transition', value ? 'bg-gold' : 'bg-edge')}><span className={cx('block w-6 h-6 rounded-full bg-parchment transition', value && 'translate-x-5')} /></span>
    </button>
  );
}

function PickList({ items, value, onPick }: { items: { uid: string; label: string; sub?: string }[]; value?: string; onPick: (uid: string) => void }) {
  return (
    <div className="grid gap-2">
      {items.map((it) => (
        <button key={it.uid} onClick={() => onPick(it.uid)} className={cx('card text-left p-4 flex items-center gap-3', value === it.uid && 'card-gold')}>
          <div className={cx('w-5 h-5 rounded-full border-2', value === it.uid ? 'border-gold bg-gold' : 'border-edge')} />
          <div><div className="text-[16px]">{it.label}</div>{it.sub && <div className="text-xs text-muted">{it.sub}</div>}</div>
        </button>
      ))}
    </div>
  );
}

function ClassStep({ level, plan, edition, allowMulticlass, onChange, issues }: { level: number; plan: ClassPlan; edition: Edition; allowMulticlass: boolean; onChange: (p: ClassPlan) => void; issues: string[] }) {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const classes = byType(lib!, 'class', edition);
  const total = plan.reduce((s, p) => s + p.levels, 0);
  const setPrimary = (uid: string) => onChange([{ classUid: uid, levels: level - plan.slice(1).reduce((s, p) => s + p.levels, 0) }, ...plan.slice(1).filter((p) => p.classUid !== uid)]);
  return (
    <div className="grid gap-4">
      <Section title={t('Основной класс', 'Primary class')} className="mt-0">
        <div className="grid grid-cols-2 gap-2">
          {classes.map((c) => {
            const m = c.mechanics as { hitDie: number };
            return (
              <button key={c.id} onClick={() => setPrimary(c.id)} className={cx('card p-3 text-left', plan[0]?.classUid === c.id && 'card-gold')}>
                <div className="font-display text-xl">{nameOf(lib!, c.id, contentLang)}</div>
                <div className="text-xs text-muted">d{m.hitDie}</div>
              </button>
            );
          })}
        </div>
      </Section>
      {allowMulticlass && plan.length > 0 && level > 1 && (
        <Section title={t('Мультикласс', 'Multiclass')}>
          <div className="grid gap-2">
            {plan.map((p, i) => (
              <Card key={p.classUid} className="p-3 flex items-center gap-3">
                <div className="flex-1">{nameOf(lib!, p.classUid, contentLang)}{i === 0 && <span className="text-xs text-muted ml-2">{t('основной', 'primary')}</span>}</div>
                <Stepper value={p.levels} min={1} max={20} onChange={(v) => {
                  const next = plan.map((x, j) => (j === i ? { ...x, levels: v } : x));
                  const diff = next.reduce((s, x) => s + x.levels, 0) - level;
                  if (i !== 0 && diff !== 0) next[0] = { ...next[0]!, levels: Math.max(1, next[0]!.levels - diff) };
                  onChange(next);
                }} />
                {i > 0 && <button onClick={() => onChange([{ ...plan[0]!, levels: plan[0]!.levels + p.levels }, ...plan.slice(1).filter((x) => x.classUid !== p.classUid)])} className="text-blood p-2"><Trash2 size={18} /></button>}
              </Card>
            ))}
            {plan[0]!.levels > 1 && (
              <Select value="" onChange={(e) => { if (!e.target.value) return; onChange([{ ...plan[0]!, levels: plan[0]!.levels - 1 }, ...plan.slice(1), { classUid: e.target.value, levels: 1 }]); }}>
                <option value="">{t('+ Добавить класс', '+ Add class')}</option>
                {classes.filter((c) => !plan.some((p) => p.classUid === c.id)).map((c) => <option key={c.id} value={c.id}>{nameOf(lib!, c.id, contentLang)}</option>)}
              </Select>
            )}
          </div>
        </Section>
      )}
      {total !== level && plan.length > 0 && <div className="text-sm text-gold-bright">{t(`Распределено уровней: ${total} из ${level}`, `Levels assigned: ${total} of ${level}`)}</div>}
      {issues.map((m) => <div key={m} className="text-sm text-blood flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{m}</div>)}
    </div>
  );
}

function AbilityStep({ build, onChange, prio, finals }: { build: CharacterBuild; onChange: (b: CharacterBuild) => void; prio: AbilityId[]; finals: Record<AbilityId, number> }) {
  const t = useTr();
  const rs = getRuleSet(build.edition);
  const method = build.options.abilityMethod;
  const set = (a: AbilityId, v: number) => onChange({ ...build, baseAbilities: { ...build.baseAbilities, [a]: v } });
  const spent = ABILITY_KEYS.reduce((s, a) => s + (rs.pointBuy.cost[build.baseAbilities[a]] ?? 99), 0);
  const pool = method === 'standard-array' ? rs.standardArray : method === 'roll-4d6' ? build.rolledPool ?? [] : [];
  const setMethod = (m: CharacterBuild['options']['abilityMethod']) => {
    const vals = m === 'standard-array' ? rs.standardArray : m === 'point-buy' ? POINT_BUY_DEFAULT : m === 'roll-4d6' ? roll4d6() : ABILITY_KEYS.map((a) => build.baseAbilities[a]);
    onChange({ ...build, options: { ...build.options, abilityMethod: m }, rolledPool: m === 'roll-4d6' ? vals : undefined, baseAbilities: m === 'manual' ? build.baseAbilities : assign(vals, prio) });
  };
  return (
    <div className="grid gap-4">
      <Segmented value={method} onChange={setMethod} items={[{ id: 'standard-array', label: t('Набор', 'Array') }, { id: 'point-buy', label: t('Очки', 'Points') }, { id: 'roll-4d6', label: t('Броски', 'Roll') }, { id: 'manual', label: t('Вручную', 'Manual') }]} />
      {method === 'point-buy' && <div className={cx('text-sm text-center', spent > rs.pointBuy.budget ? 'text-blood' : 'text-parchment-dim')}>{t('Потрачено очков', 'Points spent')}: {spent} / {rs.pointBuy.budget}</div>}
      {method === 'roll-4d6' && <Button onClick={() => setMethod('roll-4d6')} icon={<Dices size={18} />}>{t('Перебросить', 'Reroll')} · {pool.join(', ')}</Button>}
      <div className="grid gap-2">
        {ABILITY_KEYS.map((a) => {
          const base = build.baseAbilities[a];
          const fin = finals[a];
          return (
            <Card key={a} className="p-3 flex items-center gap-3">
              <div className="flex-1"><div>{term(a)}</div><div className="text-xs text-muted">{fin !== base ? t(`итого ${fin}`, `total ${fin}`) : ''}</div></div>
              {method === 'point-buy' || method === 'manual' ? (
                <Stepper value={base} min={method === 'manual' ? 1 : rs.pointBuy.min} max={method === 'manual' ? 30 : rs.pointBuy.max} onChange={(v) => set(a, v)} />
              ) : (
                <select value={base} onChange={(e) => {
                  const v = +e.target.value;
                  const other = ABILITY_KEYS.find((x) => x !== a && build.baseAbilities[x] === v);
                  const next = { ...build.baseAbilities, [a]: v };
                  if (other) next[other] = base;
                  onChange({ ...build, baseAbilities: next });
                }} className="h-11 px-3 rounded-xl bg-coal border border-edge">
                  {[...new Set(pool)].sort((x, y) => y - x).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              <div className="w-12 text-center font-display text-2xl text-gold">{signed(Math.floor((fin - 10) / 2))}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function KitStep({ kit, setKit, primary, edition }: { kit: Kit; setKit: (k: Kit) => void; primary?: string; edition: Edition }) {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const [q, setQ] = useState('');
  const pool = useMemo(() => ['weapon', 'armor', 'gear', 'tool', 'pack', 'consumable'].flatMap((ty) => byType(lib!, ty, edition)), [lib, edition]);
  const found = q.length >= 2 ? pool.filter((i) => nameOf(lib!, i.id, contentLang).toLowerCase().includes(q.toLowerCase()) || i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20) : [];
  return (
    <div className="grid gap-3">
      {primary && <Button onClick={() => setKit(starterKit(lib!, primary))}>{t('Стартовый набор класса', 'Class starting kit')}</Button>}
      {kit.map((k, i) => (
        <Card key={i} className="p-3 flex items-center gap-2">
          <div className="flex-1 min-w-0"><div className="truncate">{nameOf(lib!, k.contentUid, contentLang)}{k.qty > 1 ? ` ×${k.qty}` : ''}</div><div className="text-xs text-muted">{k.slot ? t('надето / в руке', 'equipped') : t('в рюкзаке', 'in pack')}</div></div>
          <button onClick={() => setKit(kit.filter((_, j) => j !== i))} className="text-blood p-2"><Trash2 size={18} /></button>
        </Card>
      ))}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Найти предмет…', 'Find an item…')} />
      {found.map((i) => (
        <button key={i.id} onClick={() => { setKit([...kit, { contentUid: i.id, qty: 1, slot: null }]); setQ(''); }} className="card p-3 text-left flex items-center gap-2"><Plus size={16} className="text-gold" />{nameOf(lib!, i.id, contentLang)} <span className="text-xs text-muted ml-auto">{i.type}</span></button>
      ))}
    </div>
  );
}

function Summary({ pendingCount, errors }: { pendingCount: number; errors: string[] }) {
  const t = useTr();
  if (!pendingCount && !errors.length) return <Card className="p-4 text-moss text-sm">{t('Все выборы сделаны, ошибок нет.', 'All choices made, no errors.')}</Card>;
  return (
    <Card className="p-4 text-sm grid gap-1">
      {pendingCount > 0 && <div className="text-gold-bright">{t(`Незакрытых выборов: ${pendingCount}. Персонаж сохранится черновиком, их можно закрыть на листе.`, `Open choices: ${pendingCount}. The character is saved as a draft.`)}</div>}
      {errors.map((e) => <div key={e} className="text-blood">• {e}</div>)}
      <div className="mt-1"><Badge tone="warn">{t('черновик', 'draft')}</Badge></div>
    </Card>
  );
}
