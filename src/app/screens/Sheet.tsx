/** Лист персонажа: обзор, навыки, бой, заклинания, инвентарь, особенности, решения, история, биография. */
import { useMemo, useState } from 'react';
import { ArrowUpCircle, MoreHorizontal, Shield, Heart, Footprints, Zap, Eye, Award, AlertTriangle, Moon, Coffee, Trash2, Plus, Minus, Download, Copy, FileText, RotateCcw, History as HistoryIcon, Check } from 'lucide-react';
import type { AbilityId, CharacterBuild, EngineResult, Stat } from '../../core/types';
import type { CharacterBundle, InventoryRow } from '../../data/repo';
import { useApp } from '../store';
import { nameOf } from '../content';
import { ABILITY_KEYS, CONDITIONS, signed, term, useTr } from '../i18n';
import { Badge, Button, Card, Drawer, Empty, Field, Header, Input, Section, Select, StatBox, Tabs, TextArea, cx } from '../ui';
import { persistRevision, summaryOf, ENGINE_VERSION, useCharacter } from '../engine';
import { compute } from '../../core/engine/compute';
import { ChoiceList, ItemText } from '../parts/Choices';
import { SpellCard, SpellPicker } from '../parts/Spells';
import { exportCharacter, saveFile } from '../transfer';
import { buildPdf } from '../pdf';
import type { MemoryResolver } from '../../content/resolver';

type Tab = 'main' | 'skills' | 'combat' | 'spells' | 'inventory' | 'features' | 'choices' | 'history' | 'bio';

export function CharacterSheet({ id, tab: initial }: { id: string; tab?: string }) {
  const t = useTr();
  const { navigate, lib, contentLang } = useApp();
  const ch = useCharacter(id);
  const [tab, setTab] = useState<Tab>((initial as Tab) || 'main');
  const [menu, setMenu] = useState(false);
  if (ch.bundle === undefined) return <div className="p-8 text-muted">…</div>;
  if (ch.bundle === null || !ch.result) return <Empty title={t('Персонаж не найден', 'Character not found')} action={<Button onClick={() => navigate('/')}>{t('К списку', 'Back')}</Button>} />;
  const { bundle, result, resolver, reload } = ch;
  const s = result.sheet;
  const pendingCount = result.pending.filter((p) => p.required).length;
  const errors = result.issues.filter((i) => i.severity === 'error');
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'main', label: t('Обзор', 'Overview') }, { id: 'skills', label: t('Навыки', 'Skills') }, { id: 'combat', label: t('Бой', 'Combat') },
    ...(s.spellcasting.length || s.grantedSpells.length ? [{ id: 'spells' as Tab, label: t('Заклинания', 'Spells') }] : []),
    { id: 'inventory', label: t('Инвентарь', 'Inventory') }, { id: 'features', label: t('Особенности', 'Features') },
    { id: 'choices', label: t('Решения', 'Choices'), badge: pendingCount || undefined }, { id: 'history', label: t('История', 'History') }, { id: 'bio', label: t('Биография', 'Bio') },
  ];
  return (
    <div>
      <Header back="/" title={bundle.character.name} subtitle={`${Object.entries(s.classLevels).map(([u, l]) => `${nameOf(lib!, u, contentLang)} ${l}`).join(' / ') || '—'} · ${s.edition}`}
        actions={<button aria-label="menu" onClick={() => setMenu(true)} className="h-11 w-11 grid place-items-center rounded-full text-gold active:bg-slate"><MoreHorizontal size={24} /></button>} />
      <div className="px-4">
        {(pendingCount > 0 || errors.length > 0) && (
          <button onClick={() => setTab('choices')} className="w-full mb-3 card p-3 flex items-center gap-2 text-left text-sm border-gold-soft/60">
            <AlertTriangle size={18} className="text-gold-bright shrink-0" />
            <span className="flex-1">{pendingCount > 0 && t(`Незакрытых выборов: ${pendingCount}. `, `Open choices: ${pendingCount}. `)}{errors.length > 0 && t(`Ошибок: ${errors.length}.`, `Errors: ${errors.length}.`)}</span>
          </button>
        )}
        <Tabs value={tab} onChange={setTab} items={tabs} />
        <div className="mt-4">
          {tab === 'main' && <Main bundle={bundle} result={result} reload={reload} />}
          {tab === 'skills' && <Skills result={result} />}
          {tab === 'combat' && <Combat bundle={bundle} result={result} reload={reload} />}
          {tab === 'spells' && <SpellsTab bundle={bundle} result={result} reload={reload} />}
          {tab === 'inventory' && <Inventory bundle={bundle} result={result} reload={reload} />}
          {tab === 'features' && <Features result={result} />}
          {tab === 'choices' && <Choices bundle={bundle} result={result} resolver={resolver!} reload={reload} />}
          {tab === 'history' && <HistoryTab bundle={bundle} resolver={resolver!} reload={reload} />}
          {tab === 'bio' && <Bio bundle={bundle} reload={reload} />}
        </div>
      </div>
      <SheetMenu open={menu} onClose={() => setMenu(false)} bundle={bundle} result={result} />
      {s.totalLevel < 20 && (
        <button onClick={() => navigate(`/c/${id}/levelup`)} className="fixed right-4 bottom-24 z-20 h-14 pl-4 pr-5 rounded-full bg-gradient-to-b from-gold-bright to-gold text-ink font-semibold shadow-[0_10px_30px_-10px_rgba(196,160,98,.9)] flex items-center gap-2">
          <ArrowUpCircle size={22} />{t('Уровень', 'Level up')}
        </button>
      )}
    </div>
  );
}

function Explain({ stat, title, onClose }: { stat: Stat | null; title: string; onClose: () => void }) {
  const t = useTr();
  return (
    <Drawer open={!!stat} onClose={onClose} title={title}>
      {stat && (
        <div className="grid gap-2 pb-2">
          {stat.components.map((c, i) => (
            <div key={i} className={cx('flex items-center gap-3 p-3 rounded-xl border', c.kind === 'ignored' ? 'border-edge opacity-50' : 'border-edge bg-coal')}>
              <div className="flex-1"><div className={cx(c.kind === 'ignored' && 'line-through')}>{c.label}</div>{c.note && <div className="text-xs text-muted">{c.note}</div>}</div>
              <div className="font-display text-xl text-gold">{c.kind === 'base' || c.kind === 'formula' ? c.value : signed(c.value)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 pt-2 font-display text-2xl"><span>{t('Итого', 'Total')}</span><span className="text-gold-bright">{stat.value}</span></div>
        </div>
      )}
    </Drawer>
  );
}

function Main({ bundle, result, reload }: { bundle: CharacterBundle; result: EngineResult; reload: () => void }) {
  const t = useTr();
  const repo = useApp((x) => x.repo)!;
  const s = result.sheet;
  const [ex, setEx] = useState<{ stat: Stat; title: string } | null>(null);
  const hp = bundle.state.hpCurrent ?? s.hitPointsMax.value;
  const setHp = async (v: number, temp = bundle.state.hpTemp) => { await repo.saveState(bundle.character.id, { hpCurrent: Math.max(0, Math.min(s.hitPointsMax.value, v)), hpTemp: Math.max(0, temp) }); reload(); };
  const [delta, setDelta] = useState('');
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {ABILITY_KEYS.map((a) => (
          <StatBox key={a} label={term(a, true)} value={signed(s.modifiers[a])} sub={s.abilities[a].value} onClick={() => setEx({ stat: s.abilities[a], title: term(a) })} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <StatBox accent label={t('КЗ', 'AC')} value={<span className="flex items-center gap-1"><Shield size={18} className="text-gold" />{s.armorClass.value}</span>} onClick={() => setEx({ stat: s.armorClass, title: t('Класс доспеха', 'Armor Class') })} />
        <StatBox label={t('Инициатива', 'Initiative')} value={signed(s.initiative.value)} onClick={() => setEx({ stat: s.initiative, title: t('Инициатива', 'Initiative') })} />
        <StatBox label={t('Скорость', 'Speed')} value={<span className="flex items-center gap-1"><Footprints size={16} className="text-gold" />{s.speed.walk?.value ?? 0}</span>} sub={Object.entries(s.speed).filter(([k]) => k !== 'walk').map(([k, v]) => `${term(k)} ${v.value}`).join(' · ') || t('футов', 'ft')} onClick={() => s.speed.walk && setEx({ stat: s.speed.walk, title: t('Скорость', 'Speed') })} />
        <StatBox label={t('Мастерство', 'Proficiency')} value={signed(s.proficiencyBonus)} />
        <StatBox label={t('Пасс. внимат.', 'Passive Perc.')} value={<span className="flex items-center gap-1"><Eye size={16} className="text-gold" />{s.passivePerception.value}</span>} onClick={() => setEx({ stat: s.passivePerception, title: t('Пассивная внимательность', 'Passive Perception') })} />
        <StatBox label={t('Хиты макс.', 'Max HP')} value={s.hitPointsMax.value} onClick={() => setEx({ stat: s.hitPointsMax, title: t('Максимум хитов', 'Hit point maximum') })} />
      </div>

      <Section title={t('Хиты', 'Hit points')}>
        <Card className="p-4">
          <div className="flex items-end gap-3">
            <Heart className="text-blood mb-1" />
            <div className="font-display text-5xl leading-none">{hp}</div>
            <div className="text-muted mb-1">/ {s.hitPointsMax.value}{bundle.state.hpTemp ? <span className="text-gold-bright"> +{bundle.state.hpTemp} {t('врем.', 'temp')}</span> : null}</div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-coal overflow-hidden"><div className="h-full bg-gradient-to-r from-blood to-gold transition-all" style={{ width: `${Math.round((hp / Math.max(1, s.hitPointsMax.value)) * 100)}%` }} /></div>
          <div className="flex gap-2 mt-3">
            <Input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/\D/g, ''))} placeholder="0" className="w-24 text-center" />
            <Button variant="danger" className="flex-1" onClick={() => { const d = +delta || 0; const temp = bundle.state.hpTemp; const absorbed = Math.min(temp, d); void setHp(hp - (d - absorbed), temp - absorbed); setDelta(''); }} icon={<Minus size={16} />}>{t('Урон', 'Damage')}</Button>
            <Button variant="soft" className="flex-1" onClick={() => { void setHp(hp + (+delta || 0)); setDelta(''); }} icon={<Plus size={16} />}>{t('Лечение', 'Heal')}</Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => { void setHp(hp, +delta || 0); setDelta(''); }}>{t('Задать временные хиты', 'Set temporary HP')}</Button>
        </Card>
      </Section>

      <Section title={t('Спасброски', 'Saving throws')}>
        <div className="grid grid-cols-2 gap-2">
          {ABILITY_KEYS.map((a) => (
            <button key={a} onClick={() => setEx({ stat: s.savingThrows[a], title: `${t('Спасбросок', 'Save')}: ${term(a)}` })} className="card px-3 py-2.5 flex items-center gap-2">
              <span className={cx('w-2.5 h-2.5 rounded-full', s.savingThrows[a].proficient ? 'bg-gold' : 'border border-edge')} />
              <span className="flex-1 text-left">{term(a)}</span><span className="font-display text-xl">{signed(s.savingThrows[a].value)}</span>
            </button>
          ))}
        </div>
      </Section>
      {(Object.keys(s.senses).length > 0 || s.damageModifiers.length > 0) && (
        <Section title={t('Чувства и сопротивления', 'Senses & resistances')}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.senses).map(([k, v]) => <Badge key={k} tone="gold">{term(k)} {v} {t('фт', 'ft')}</Badge>)}
            {s.damageModifiers.map((d, i) => <Badge key={i}>{t({ resistance: 'сопр.', immunity: 'иммун.', vulnerability: 'уязв.' }[d.level], d.level)} {term(d.damageType)}</Badge>)}
          </div>
        </Section>
      )}
      <Explain stat={ex?.stat ?? null} title={ex?.title ?? ''} onClose={() => setEx(null)} />
    </div>
  );
}

function Skills({ result }: { result: EngineResult }) {
  const t = useTr();
  const s = result.sheet;
  const [ex, setEx] = useState<{ stat: Stat; title: string } | null>(null);
  const { lib, contentLang } = useApp();
  return (
    <div>
      <div className="grid gap-1.5">
        {Object.entries(s.skills).sort((a, b) => term(a[0]).localeCompare(term(b[0]))).map(([id, sk]) => (
          <button key={id} onClick={() => setEx({ stat: sk, title: term(id) })} className="card px-3 py-2.5 flex items-center gap-3">
            <span className={cx('w-3 h-3 rounded-full shrink-0', sk.proficiency === 2 ? 'bg-gold-bright ring-2 ring-gold/40' : sk.proficiency === 1 ? 'bg-gold' : sk.proficiency === 0.5 ? 'bg-gold/40' : 'border border-edge')} />
            <span className="flex-1 text-left">{term(id)} <span className="text-xs text-muted">{term(sk.ability, true)}</span></span>
            <span className="font-display text-xl">{signed(sk.value)}</span>
          </button>
        ))}
      </div>
      <Section title={t('Владения', 'Proficiencies')}>
        <Card className="p-4 grid gap-2 text-sm">
          {(['armor', 'weapon', 'tool', 'language'] as const).map((k) => (
            <div key={k}><span className="text-muted">{t({ armor: 'Доспехи', weapon: 'Оружие', tool: 'Инструменты', language: 'Языки' }[k], k)}: </span>
              {s.proficiencies[k].map((x) => (x.includes(':') ? nameOf(lib!, x, contentLang) : term(x))).join(', ') || '—'}</div>
          ))}
        </Card>
      </Section>
      <Explain stat={ex?.stat ?? null} title={ex?.title ?? ''} onClose={() => setEx(null)} />
    </div>
  );
}

function Combat({ bundle, result, reload }: { bundle: CharacterBundle; result: EngineResult; reload: () => void }) {
  const t = useTr();
  const repo = useApp((x) => x.repo)!;
  const s = result.sheet;
  const st = bundle.state;
  const save = async (patch: Parameters<typeof repo.saveState>[1]) => { await repo.saveState(bundle.character.id, patch); reload(); };
  const rest = async (kind: 'short' | 'long') => {
    const used = { ...st.resourcesUsed };
    for (const r of s.resources) if (r.recharge === 'short' || (kind === 'long' && r.recharge !== 'none')) delete used[r.id];
    const patch: Parameters<typeof repo.saveState>[1] = { resourcesUsed: used, slotsUsed: { standard: kind === 'long' ? [] : st.slotsUsed.standard, pact: 0 } };
    if (kind === 'long') { patch.hpCurrent = s.hitPointsMax.value; patch.hpTemp = 0; patch.hitDiceUsed = {}; patch.exhaustion = Math.max(0, st.exhaustion - 1); }
    await save(patch);
    useApp.getState().toast(kind === 'long' ? t('Долгий отдых: всё восстановлено', 'Long rest: everything restored') : t('Короткий отдых', 'Short rest'));
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Button icon={<Coffee size={18} />} onClick={() => rest('short')}>{t('Короткий отдых', 'Short rest')}</Button>
        <Button icon={<Moon size={18} />} onClick={() => rest('long')}>{t('Долгий отдых', 'Long rest')}</Button>
      </div>
      <Section title={t('Атаки', 'Attacks')} right={<Badge tone="gold">{t(`атак за действие: ${s.attacksPerAction}`, `attacks per action: ${s.attacksPerAction}`)}</Badge>}>
        {s.attacks.length ? <div className="grid gap-2">{s.attacks.map((a, i) => (
          <Card key={i} className="p-3 flex items-center gap-3">
            <div className="flex-1"><div>{useApp.getState().lib ? nameOf(useApp.getState().lib!, a.sourceUid ?? '', useApp.getState().contentLang) : a.name}</div><div className="text-xs text-muted">{a.damage} {term(a.damageType)}</div></div>
            <div className="font-display text-2xl text-gold-bright">{signed(a.toHit.value)}</div>
          </Card>
        ))}</div> : <div className="text-sm text-muted px-1">{t('Возьмите оружие в руки на вкладке «Инвентарь».', 'Equip a weapon in the Inventory tab.')}</div>}
        {s.weaponMasteryCount > 0 && <div className="text-sm text-muted mt-2 px-1">{t(`Мастерство оружия: ${s.weaponMasteryCount} вида`, `Weapon mastery: ${s.weaponMasteryCount} kinds`)}</div>}
      </Section>
      {s.resources.length > 0 && (
        <Section title={t('Ресурсы', 'Resources')}>
          <div className="grid gap-2">{s.resources.map((r) => {
            const used = st.resourcesUsed[r.id] ?? 0;
            const left = Math.max(0, r.max - used);
            return (
              <Card key={r.id} className="p-3 flex items-center gap-3">
                <div className="flex-1"><div>{r.label}</div><div className="text-xs text-muted">{t('восстановление', 'recharge')}: {term(r.recharge)}</div></div>
                <button className="w-10 h-10 rounded-xl border border-edge text-gold" onClick={() => save({ resourcesUsed: { ...st.resourcesUsed, [r.id]: Math.min(r.max, used + 1) } })}><Minus size={16} className="mx-auto" /></button>
                <div className="w-16 text-center font-display text-2xl">{r.max >= 99 ? '∞' : `${left}/${r.max}`}</div>
                <button className="w-10 h-10 rounded-xl border border-edge text-gold" onClick={() => save({ resourcesUsed: { ...st.resourcesUsed, [r.id]: Math.max(0, used - 1) } })}><Plus size={16} className="mx-auto" /></button>
              </Card>
            );
          })}</div>
        </Section>
      )}
      <Section title={t('Состояния', 'Conditions')}>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => {
            const on = st.conditions.includes(c);
            return <button key={c} onClick={() => save({ conditions: on ? st.conditions.filter((x) => x !== c) : [...st.conditions, c] })} className={cx('h-9 px-3 rounded-full border text-sm', on ? 'bg-blood/20 border-blood text-parchment' : 'border-edge text-parchment-dim')}>{term(c)}</button>;
          })}
        </div>
        <Card className="p-3 mt-3 flex items-center gap-3">
          <div className="flex-1">{t('Истощение', 'Exhaustion')}</div>
          <button className="w-10 h-10 rounded-xl border border-edge text-gold" onClick={() => save({ exhaustion: Math.max(0, st.exhaustion - 1) })}><Minus size={16} className="mx-auto" /></button>
          <div className="w-10 text-center font-display text-2xl">{st.exhaustion}</div>
          <button className="w-10 h-10 rounded-xl border border-edge text-gold" onClick={() => save({ exhaustion: Math.min(6, st.exhaustion + 1) })}><Plus size={16} className="mx-auto" /></button>
        </Card>
        {st.exhaustion > 0 && <div className="text-xs text-muted mt-2 px-1">{s.edition === '2024' ? t(`−${2 * st.exhaustion} к проверкам d20, скорость −${5 * st.exhaustion} фт`, `−${2 * st.exhaustion} to d20 tests, speed −${5 * st.exhaustion} ft`) : t('Эффекты истощения по таблице правил 2014', 'Exhaustion effects per the 2014 table')}</div>}
      </Section>
    </div>
  );
}

function SpellsTab({ bundle, result, reload }: { bundle: CharacterBundle; result: EngineResult; reload: () => void }) {
  const t = useTr();
  const { repo, lib, contentLang } = useApp();
  const s = result.sheet;
  const st = bundle.state;
  const [info, setInfo] = useState<string | null>(null);
  const useSlot = async (i: number, delta: number) => {
    const std = [...st.slotsUsed.standard];
    std[i] = Math.max(0, Math.min(s.spellSlots.standard[i] ?? 0, (std[i] ?? 0) + delta));
    await repo!.saveState(bundle.character.id, { slotsUsed: { ...st.slotsUsed, standard: std } });
    reload();
  };
  return (
    <div>
      {(s.spellSlots.standard.length > 0 || s.spellSlots.pact) && (
        <Section title={t('Ячейки заклинаний', 'Spell slots')} className="mt-0">
          <div className="grid gap-2">
            {s.spellSlots.standard.map((n, i) => {
              const used = st.slotsUsed.standard[i] ?? 0;
              return (
                <Card key={i} className="p-3 flex items-center gap-3">
                  <div className="w-16 text-sm text-muted">{t(`${i + 1} круг`, `Level ${i + 1}`)}</div>
                  <div className="flex-1 flex gap-1.5 flex-wrap">{Array.from({ length: n }, (_, k) => (
                    <button key={k} onClick={() => useSlot(i, k < used ? -1 : 1)} className={cx('w-7 h-7 rounded-full border-2', k < used ? 'border-edge bg-coal' : 'border-gold bg-gold/30')} />
                  ))}</div>
                </Card>
              );
            })}
            {s.spellSlots.pact && (
              <Card className="p-3 flex items-center gap-3">
                <div className="w-16 text-sm text-muted">{t('Договор', 'Pact')}<br />{t(`${s.spellSlots.pact.slotLevel} круг`, `lvl ${s.spellSlots.pact.slotLevel}`)}</div>
                <div className="flex-1 flex gap-1.5">{Array.from({ length: s.spellSlots.pact.count }, (_, k) => (
                  <button key={k} onClick={async () => { await repo!.saveState(bundle.character.id, { slotsUsed: { ...st.slotsUsed, pact: k < st.slotsUsed.pact ? st.slotsUsed.pact - 1 : st.slotsUsed.pact + 1 } }); reload(); }} className={cx('w-7 h-7 rounded-full border-2', k < st.slotsUsed.pact ? 'border-edge bg-coal' : 'border-gold-bright bg-gold/40')} />
                ))}</div>
              </Card>
            )}
          </div>
        </Section>
      )}
      {s.grantedSpells.length > 0 && (
        <Section title={t('Всегда подготовлены', 'Always prepared')}>
          <div className="flex flex-wrap gap-2">{s.grantedSpells.map((g) => <button key={g.uid} onClick={() => setInfo(g.uid)} className="h-9 px-3 rounded-full border border-gold-soft text-gold-bright text-sm">{nameOf(lib!, g.uid, contentLang)}</button>)}</div>
        </Section>
      )}
      {s.spellcasting.map((sc) => (
        <Section key={sc.classUid} title={nameOf(lib!, sc.classUid, contentLang)}>
          <SpellPicker result={result} classUid={sc.classUid} selected={st.preparedSpells[sc.classUid] ?? []} onChange={async (u) => { await repo!.saveState(bundle.character.id, { preparedSpells: { ...st.preparedSpells, [sc.classUid]: u } }); reload(); }} />
        </Section>
      ))}
      <Drawer open={!!info} onClose={() => setInfo(null)} title={info ? nameOf(lib!, info, contentLang) : ''}>{info && <SpellCard uid={info} />}</Drawer>
    </div>
  );
}

const SLOT_LABEL: Record<string, [string, string]> = { armor: ['Доспех', 'Armor'], shield: ['Щит', 'Shield'], 'main-hand': ['Основная рука', 'Main hand'], 'off-hand': ['Вторая рука', 'Off hand'], 'two-hands': ['Двумя руками', 'Two hands'], worn: ['Надето', 'Worn'] };

function Inventory({ bundle, result, reload }: { bundle: CharacterBundle; result: EngineResult; reload: () => void }) {
  const t = useTr();
  const { repo, lib, contentLang } = useApp();
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState('');
  const [open, setOpen] = useState<InventoryRow | null>(null);
  const items = bundle.inventory;
  const weightOf = (i: InventoryRow) => ((i.contentUid && (lib!.items.get(i.contentUid)?.item.mechanics as { weightLb?: number })?.weightLb) || 0) * i.qty;
  const total = items.reduce((s, i) => s + weightOf(i), 0);
  const pool = useMemo(() => ['weapon', 'armor', 'gear', 'tool', 'pack', 'consumable', 'magic-item'].flatMap((ty) => [...lib!.items.values()].map((x) => x.item).filter((i) => i.type === ty && (i.edition === result.sheet.edition || i.edition === 'any'))), [lib, result.sheet.edition]);
  const found = q.length >= 2 ? pool.filter((i) => nameOf(lib!, i.id, contentLang).toLowerCase().includes(q.toLowerCase()) || i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 25) : [];
  const cur = bundle.state.currency;
  const setCur = async (k: keyof typeof cur, v: number) => { await repo!.saveState(bundle.character.id, { currency: { ...cur, [k]: Math.max(0, v) } }); reload(); };
  const slotsFor = (i: InventoryRow): string[] => {
    const it = i.contentUid ? lib!.items.get(i.contentUid)?.item : undefined;
    const base = it?.type === 'magic-item' && (it.mechanics as { baseItem?: string }).baseItem ? lib!.items.get((it.mechanics as { baseItem: string }).baseItem)?.item : it;
    if (base?.type === 'armor') return (base.mechanics as { category: string }).category === 'shield' ? ['shield'] : ['armor'];
    if (base?.type === 'weapon') return ['main-hand', 'off-hand', 'two-hands'];
    if (it?.type === 'magic-item') return ['worn'];
    return [];
  };
  return (
    <div>
      <Card className="p-3 flex items-center justify-between text-sm"><span>{t('Вес', 'Weight')}: <b>{Math.round(total * 10) / 10}</b> / {result.sheet.carryingCapacity} {t('фнт', 'lb')}</span><span>{t('Настроено', 'Attuned')}: <b className={result.sheet.attunedCount > 3 ? 'text-blood' : ''}>{result.sheet.attunedCount}/3</b></span></Card>
      <div className="grid gap-2 mt-3">
        {items.map((i) => (
          <Card key={i.id} className="p-3 flex items-center gap-2" onClick={() => setOpen(i)}>
            <div className="flex-1 min-w-0">
              <div className="truncate">{i.contentUid ? nameOf(lib!, i.contentUid, contentLang) : i.customName}{i.magicBonus ? ` +${i.magicBonus}` : ''}{i.qty > 1 ? ` ×${i.qty}` : ''}</div>
              <div className="text-xs text-muted">{i.slot ? t(...SLOT_LABEL[i.slot]!) : t('в рюкзаке', 'in pack')}{i.attuned ? ` · ${t('настроен', 'attuned')}` : ''}</div>
            </div>
            {i.slot && <Check size={16} className="text-gold" />}
          </Card>
        ))}
        {!items.length && <div className="text-muted text-sm text-center py-4">{t('Инвентарь пуст', 'Inventory is empty')}</div>}
      </div>
      <Section title={t('Добавить', 'Add')}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Найти в библиотеке…', 'Search the library…')} />
        <div className="grid gap-1.5 mt-2">{found.map((it) => (
          <button key={it.id} onClick={async () => { await repo!.addItem(bundle.character.id, { contentUid: it.id }); setQ(''); reload(); }} className="card p-3 text-left flex items-center gap-2"><Plus size={16} className="text-gold" />{nameOf(lib!, it.id, contentLang)}<span className="ml-auto text-xs text-muted">{it.type}</span></button>
        ))}</div>
        <div className="flex gap-2 mt-2"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('Свой предмет', 'Custom item')} /><Button variant="soft" disabled={!custom.trim()} onClick={async () => { await repo!.addItem(bundle.character.id, { customName: custom.trim() }); setCustom(''); reload(); }}><Plus size={18} /></Button></div>
      </Section>
      <Section title={t('Монеты', 'Coins')}>
        <div className="grid grid-cols-5 gap-2">{(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((k) => (
          <label key={k} className="card p-2 text-center"><div className="text-[11px] uppercase text-muted">{t({ pp: 'пм', gp: 'зм', ep: 'эм', sp: 'см', cp: 'мм' }[k], k)}</div>
            <input inputMode="numeric" value={cur[k]} onChange={(e) => setCur(k, +e.target.value.replace(/\D/g, '') || 0)} className="w-full bg-transparent text-center font-display text-xl outline-none" /></label>
        ))}</div>
      </Section>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? (open.contentUid ? nameOf(lib!, open.contentUid, contentLang) : open.customName ?? '') : ''}>
        {open && (
          <div className="grid gap-3 pb-2">
            {slotsFor(open).length > 0 && (
              <Field label={t('Где', 'Where')}>
                <Select value={open.slot ?? ''} onChange={async (e) => { const slot = (e.target.value || null) as InventoryRow['slot']; await repo!.updateItem(open.id, { slot }); setOpen({ ...open, slot }); reload(); }}>
                  <option value="">{t('В рюкзаке', 'In pack')}</option>
                  {slotsFor(open).map((sl) => <option key={sl} value={sl}>{t(...SLOT_LABEL[sl]!)}</option>)}
                </Select>
              </Field>
            )}
            {open.contentUid && lib!.items.get(open.contentUid)?.item.type === 'magic-item' && (
              <Button onClick={async () => { await repo!.updateItem(open.id, { attuned: !open.attuned }); setOpen({ ...open, attuned: !open.attuned }); reload(); }}>{open.attuned ? t('Снять настройку', 'End attunement') : t('Настроиться', 'Attune')}</Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Количество', 'Quantity')}><Input inputMode="numeric" value={open.qty} onChange={async (e) => { const qty = Math.max(1, +e.target.value.replace(/\D/g, '') || 1); await repo!.updateItem(open.id, { qty }); setOpen({ ...open, qty }); reload(); }} /></Field>
              <Field label={t('Магический бонус', 'Magic bonus')}><Select value={open.magicBonus} onChange={async (e) => { const magicBonus = +e.target.value; await repo!.updateItem(open.id, { magicBonus }); setOpen({ ...open, magicBonus }); reload(); }}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n ? `+${n}` : '—'}</option>)}</Select></Field>
            </div>
            {open.contentUid && <ItemText uid={open.contentUid} />}
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={async () => { await repo!.removeItem(open.id); setOpen(null); reload(); }}>{t('Убрать', 'Remove')}</Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Features({ result }: { result: EngineResult }) {
  const t = useTr();
  const { lib, contentLang } = useApp();
  const [info, setInfo] = useState<string | null>(null);
  const byLevel = new Map<number, typeof result.sheet.features>();
  for (const f of result.sheet.features) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f]);
  return (
    <div>
      {[...byLevel].sort((a, b) => a[0] - b[0]).map(([lvl, fs]) => (
        <Section key={lvl} title={lvl === 0 ? t('Происхождение', 'Origin') : t(`${lvl} уровень`, `Level ${lvl}`)} className="mt-3">
          <div className="grid gap-1.5">{fs.map((f, i) => {
            const textOnly = lib!.items.get(f.uid)?.item.tags.includes('text-only');
            return (
              <button key={f.uid + i} onClick={() => setInfo(f.uid)} className="card px-3 py-2.5 text-left flex items-center gap-2">
                <Award size={16} className="text-gold shrink-0" /><span className="flex-1">{nameOf(lib!, f.uid, contentLang)}</span>{!textOnly && <Badge tone="ok">{t('учтено', 'auto')}</Badge>}
              </button>
            );
          })}</div>
        </Section>
      ))}
      <p className="text-xs text-muted mt-4 px-1">{t('«Учтено» — особенность влияет на расчёт листа автоматически. Остальные пока работают как описание.', '"Auto" means the feature changes the sheet automatically. Others are descriptions for now.')}</p>
      <Drawer open={!!info} onClose={() => setInfo(null)} title={info ? nameOf(lib!, info, contentLang) : ''}>{info && <ItemText uid={info} />}</Drawer>
    </div>
  );
}

function Choices({ bundle, result, resolver, reload }: { bundle: CharacterBundle; result: EngineResult; resolver: MemoryResolver; reload: () => void }) {
  const t = useTr();
  const [draft, setDraft] = useState<CharacterBuild | null>(null);
  const build = draft ?? bundle.revision.build;
  const r = draft ? compute(draft, resolver, {}) : result;
  const errors = r.issues.filter((i) => i.severity !== 'info');
  return (
    <div>
      {errors.length > 0 && <Card className="p-3 mb-3 grid gap-1 text-sm">{errors.map((e, i) => <div key={i} className={e.severity === 'error' ? 'text-blood' : 'text-gold-bright'}>• {e.message}</div>)}</Card>}
      <ChoiceList choices={r.choices} build={build} onChange={setDraft} empty={t('У персонажа нет выборов.', 'No choices for this character.')} />
      {draft && (
        <div className="sticky bottom-24 mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setDraft(null)}>{t('Отмена', 'Cancel')}</Button>
          <Button className="flex-[2]" variant="gold" onClick={async () => {
            await persistRevision(bundle.character.id, 'edit', draft, resolver, bundle.inventory, t('Изменены решения', 'Choices edited'));
            const pend = compute(draft, resolver).pending.filter((p) => p.required).length;
            if (!pend && bundle.character.status === 'draft') await useApp.getState().repo!.updateCharacter(bundle.character.id, { status: 'active' });
            setDraft(null); reload(); useApp.getState().toast(t('Сохранено новой версией', 'Saved as a new version'));
          }}>{t('Сохранить', 'Save')}</Button>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ bundle, resolver, reload }: { bundle: CharacterBundle; resolver: MemoryResolver; reload: () => void }) {
  const t = useTr();
  const { repo, lib, contentLang } = useApp();
  const kinds: Record<string, string> = { create: t('Создание', 'Created'), 'level-up': t('Повышение уровня', 'Level up'), edit: t('Правка', 'Edit'), import: t('Импорт', 'Import'), restore: t('Восстановление', 'Restore'), 'content-migration': t('Обновление контента', 'Content update') };
  return (
    <div>
      <Button icon={<RotateCcw size={18} />} disabled={!bundle.revision.parentId} onClick={async () => { await repo!.undo(bundle.character.id); reload(); useApp.getState().toast(t('Последнее изменение отменено', 'Last change undone')); }} className="w-full mb-4">{t('Отменить последнее изменение', 'Undo last change')}</Button>
      <div className="grid gap-2">
        {[...bundle.revisions].reverse().map((rv) => {
          const current = rv.id === bundle.revision.id;
          return (
            <Card key={rv.id} gold={current} className="p-3">
              <div className="flex items-center gap-2">
                <HistoryIcon size={16} className="text-gold" />
                <div className="flex-1"><div>№{rv.seq} · {kinds[rv.kind] ?? rv.kind}</div><div className="text-xs text-muted">{new Date(rv.createdAt).toLocaleString()} · {rv.summary.classes} · {t('КЗ', 'AC')} {rv.summary.ac} · {t('хиты', 'HP')} {rv.summary.hp}</div>{rv.note && <div className="text-xs text-parchment-dim">{rv.note}</div>}</div>
                {current ? <Badge tone="gold">{t('текущая', 'current')}</Badge> : (
                  <Button size="sm" onClick={async () => {
                    const r = compute(rv.build, resolver, {});
                    await repo!.restore(bundle.character.id, rv.id, summaryOf(r, lib!, contentLang), resolver.snapshotOf(r.usedContent), ENGINE_VERSION);
                    reload(); useApp.getState().toast(t(`Восстановлена версия №${rv.seq}`, `Version #${rv.seq} restored`));
                  }}>{t('Вернуть', 'Restore')}</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-4 px-1">{t('Версии не удаляются: отмена и восстановление только переключают текущую.', 'Versions are never deleted: undo and restore just switch the current one.')}</p>
    </div>
  );
}

function Bio({ bundle, reload }: { bundle: CharacterBundle; reload: () => void }) {
  const t = useTr();
  const { repo } = useApp();
  const [bio, setBio] = useState<Record<string, string>>(bundle.character.biography);
  const [name, setName] = useState(bundle.character.name);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[] | null>(null);
  if (!campaigns) void repo!.listCampaigns().then((c) => setCampaigns(c.map((x) => ({ id: x.id, name: x.name }))));
  const save = async () => { await repo!.updateCharacter(bundle.character.id, { name: name.trim() || bundle.character.name, biography: bio }); reload(); useApp.getState().toast(t('Сохранено', 'Saved')); };
  return (
    <div className="grid gap-3">
      <Field label={t('Имя', 'Name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('Статус', 'Status')}><Select value={bundle.character.status} onChange={async (e) => { await repo!.updateCharacter(bundle.character.id, { status: e.target.value as never }); reload(); }}>
          {[['draft', 'Черновик', 'Draft'], ['active', 'В игре', 'Active'], ['retired', 'На покое', 'Retired'], ['dead', 'Погиб', 'Dead'], ['missing', 'Пропал', 'Missing']].map(([v, r, e]) => <option key={v} value={v}>{t(r!, e!)}</option>)}
        </Select></Field>
        <Field label={t('Кампания', 'Campaign')}><Select value={bundle.character.campaignId ?? ''} onChange={async (e) => { await repo!.updateCharacter(bundle.character.id, { campaignId: e.target.value || null }); reload(); }}>
          <option value="">—</option>{campaigns?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></Field>
      </div>
      {[['alignment', 'Мировоззрение', 'Alignment'], ['appearance', 'Внешность', 'Appearance'], ['personality', 'Характер', 'Personality'], ['backstory', 'Предыстория персонажа', 'Backstory'], ['notes', 'Заметки', 'Notes']].map(([k, r, e]) => (
        <Field key={k} label={t(r!, e!)}>{k === 'alignment' ? <Input value={bio[k!] ?? ''} onChange={(ev) => setBio({ ...bio, [k!]: ev.target.value })} /> : <TextArea value={bio[k!] ?? ''} onChange={(ev) => setBio({ ...bio, [k!]: ev.target.value })} />}</Field>
      ))}
      <Button variant="gold" onClick={save}>{t('Сохранить', 'Save')}</Button>
    </div>
  );
}

function SheetMenu({ open, onClose, bundle, result }: { open: boolean; onClose: () => void; bundle: CharacterBundle; result: EngineResult }) {
  const t = useTr();
  const { repo, navigate, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const file = bundle.character.name.replace(/[^\p{L}\p{N}]+/gu, '_');
  return (
    <Drawer open={open} onClose={() => { setConfirm(false); onClose(); }} title={t('Действия', 'Actions')}>
      <div className="grid gap-2 pb-2">
        <Button icon={<ArrowUpCircle size={18} />} onClick={() => navigate(`/c/${bundle.character.id}/levelup`)} disabled={result.sheet.totalLevel >= 20}>{t('Повысить уровень', 'Level up')}</Button>
        <Button icon={<FileText size={18} />} onClick={async () => { try { await saveFile(`${file}.pdf`, await buildPdf(bundle, result)); } catch (e) { toast(`PDF: ${(e as Error).message}`, 'error'); } }}>{t('Лист в PDF', 'Sheet as PDF')}</Button>
        <Button icon={<Download size={18} />} onClick={() => saveFile(`${file}.aandd.json`, exportCharacter(bundle))}>{t('Экспорт в JSON', 'Export JSON')}</Button>
        <Button icon={<Copy size={18} />} onClick={async () => { const id = await repo!.duplicateCharacter(bundle.character.id, ENGINE_VERSION); onClose(); navigate(`/c/${id}`); toast(t('Создана копия', 'Copy created')); }}>{t('Сделать копию', 'Duplicate')}</Button>
        {!confirm ? <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setConfirm(true)}>{t('Удалить персонажа', 'Delete character')}</Button>
          : <Button variant="danger" onClick={async () => { await repo!.deleteCharacter(bundle.character.id); navigate('/'); toast(t('Персонаж удалён', 'Character deleted')); }}>{t('Точно удалить? Нажмите ещё раз', 'Really delete? Tap again')}</Button>}
      </div>
    </Drawer>
  );
}

export type { AbilityId };
export { Zap };
