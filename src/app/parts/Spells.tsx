/** Выбор и просмотр заклинаний: поиск, фильтры, лимиты подготовленных и известных. */
import { useMemo, useState } from 'react';
import { Search, Sparkles, Info, Check } from 'lucide-react';
import type { EngineResult } from '../../core/types';
import type { ContentItem } from '../../content/schema';
import { useApp } from '../store';
import { nameOf } from '../content';
import { term, useTr } from '../i18n';
import { Badge, Card, Drawer, Input, cx } from '../ui';
import { ItemText } from './Choices';

type Spell = Extract<ContentItem, { type: 'spell' }>;
const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];

export function maxSpellLevel(r: EngineResult) {
  return Math.max(r.sheet.spellSlots.standard.length, r.sheet.spellSlots.pact?.slotLevel ?? 0);
}

export function SpellFilters({ q, setQ, lvl, setLvl, school, setSchool, flags, setFlags, maxLevel = 9 }: {
  q: string; setQ: (s: string) => void; lvl: number | null; setLvl: (n: number | null) => void; school: string; setSchool: (s: string) => void;
  flags: { conc: boolean; ritual: boolean }; setFlags: (f: { conc: boolean; ritual: boolean }) => void; maxLevel?: number;
}) {
  const t = useTr();
  return (
    <div className="grid gap-2 mb-3">
      <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Поиск заклинания', 'Search spells')} className="pl-10" /></div>
      <div className="scroll-x"><div className="flex gap-1.5 w-max">
        <Chip on={lvl === null} onClick={() => setLvl(null)}>{t('Все', 'All')}</Chip>
        {Array.from({ length: maxLevel + 1 }, (_, i) => <Chip key={i} on={lvl === i} onClick={() => setLvl(lvl === i ? null : i)}>{i === 0 ? t('Заговоры', 'Cantrips') : `${i}`}</Chip>)}
      </div></div>
      <div className="flex gap-1.5 flex-wrap">
        <select value={school} onChange={(e) => setSchool(e.target.value)} className="h-9 px-2 rounded-lg bg-coal border border-edge text-sm text-parchment-dim">
          <option value="">{t('Любая школа', 'Any school')}</option>{SCHOOLS.map((s) => <option key={s} value={s}>{term(s)}</option>)}
        </select>
        <Chip on={flags.conc} onClick={() => setFlags({ ...flags, conc: !flags.conc })}>{t('Концентрация', 'Concentration')}</Chip>
        <Chip on={flags.ritual} onClick={() => setFlags({ ...flags, ritual: !flags.ritual })}>{t('Ритуал', 'Ritual')}</Chip>
      </div>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cx('h-9 px-3 rounded-full border text-sm whitespace-nowrap', on ? 'bg-gold text-ink border-gold font-semibold' : 'border-edge text-parchment-dim')}>{children}</button>;
}

export function useSpellFilter(spells: Spell[]) {
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState<number | null>(null);
  const [school, setSchool] = useState('');
  const [flags, setFlags] = useState({ conc: false, ritual: false });
  const { lib, contentLang } = useApp();
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return spells.filter((s) => (lvl === null || s.mechanics.level === lvl) && (!school || s.mechanics.school === school) && (!flags.conc || s.mechanics.concentration) && (!flags.ritual || s.mechanics.ritual)
      && (!needle || s.name.toLowerCase().includes(needle) || nameOf(lib!, s.id, contentLang).toLowerCase().includes(needle)))
      .sort((a, b) => a.mechanics.level - b.mechanics.level || nameOf(lib!, a.id, contentLang).localeCompare(nameOf(lib!, b.id, contentLang)));
  }, [spells, q, lvl, school, flags, lib, contentLang]);
  return { list, props: { q, setQ, lvl, setLvl, school, setSchool, flags, setFlags } };
}

export function SpellRow({ s, selected, onToggle, locked, onInfo }: { s: Spell; selected?: boolean; onToggle?: () => void; locked?: string; onInfo: () => void }) {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const m = s.mechanics;
  return (
    <div className={cx('flex items-center gap-2 py-2.5 px-3 rounded-xl border', selected ? 'border-gold/70 bg-gold/10' : 'border-edge bg-coal/40')}>
      {onToggle && (
        <button onClick={onToggle} disabled={!!locked} className={cx('w-7 h-7 shrink-0 rounded-lg border grid place-items-center', selected ? 'bg-gold border-gold text-ink' : 'border-edge text-transparent')}><Check size={16} /></button>
      )}
      <button onClick={onInfo} className="flex-1 min-w-0 text-left">
        <div className="text-[15px] truncate">{nameOf(lib!, s.id, contentLang)}</div>
        <div className="text-xs text-muted truncate">{m.level === 0 ? t('заговор', 'cantrip') : t(`${m.level} круг`, `level ${m.level}`)} · {term(m.school)} · {m.castingTime}{m.concentration ? ' · К' : ''}{m.ritual ? ' · Р' : ''}</div>
      </button>
      {locked ? <Badge tone="gold">{locked}</Badge> : <Info size={16} className="text-muted shrink-0" />}
    </div>
  );
}

/** Выбор заклинаний одного класса персонажа с учётом лимитов. */
export function SpellPicker({ result, classUid, selected, onChange }: { result: EngineResult; classUid: string; selected: string[]; onChange: (uids: string[]) => void }) {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const sc = result.sheet.spellcasting.find((x) => x.classUid === classUid)!;
  const maxLevel = maxSpellLevel(result);
  const granted = new Set(result.sheet.grantedSpells.filter((g) => g.alwaysPrepared && !g.countsAgainstLimit).map((g) => g.uid));
  const pool = useMemo(() => [...lib!.items.values()].map((x) => x.item).filter((i): i is Spell => i.type === 'spell' && (i.edition === result.sheet.edition || i.edition === 'any') && i.mechanics.classes.includes(classUid) && i.mechanics.level <= maxLevel), [lib, classUid, maxLevel, result.sheet.edition]);
  const { list, props } = useSpellFilter(pool);
  const [info, setInfo] = useState<string | null>(null);
  const byUid = new Map(pool.map((s) => [s.id, s]));
  const cantrips = selected.filter((u) => byUid.get(u)?.mechanics.level === 0).length;
  const spells = selected.filter((u) => (byUid.get(u)?.mechanics.level ?? 0) > 0).length;
  const spellLimit = sc.preparedMax ?? sc.knownMax;
  const toggle = (s: Spell) => {
    if (selected.includes(s.id)) return onChange(selected.filter((x) => x !== s.id));
    if (s.mechanics.level === 0 && sc.cantripsMax !== undefined && cantrips >= sc.cantripsMax) return useApp.getState().toast(t('Достигнут лимит заговоров', 'Cantrip limit reached'), 'warn');
    if (s.mechanics.level > 0 && spellLimit !== undefined && spells >= spellLimit) return useApp.getState().toast(t('Достигнут лимит заклинаний', 'Spell limit reached'), 'warn');
    onChange([...selected, s.id]);
  };
  return (
    <div>
      <Card className="p-3 mb-3 flex gap-3 text-sm">
        <Sparkles size={18} className="text-gold shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold">{nameOf(lib!, classUid, contentLang)}</div>
          <div className="text-muted">
            {sc.cantripsMax !== undefined && <>{t('Заговоры', 'Cantrips')}: <b className={cantrips > sc.cantripsMax ? 'text-blood' : 'text-parchment'}>{cantrips}/{sc.cantripsMax}</b> · </>}
            {spellLimit !== undefined && <>{sc.preparedMax !== undefined ? t('Подготовлено', 'Prepared') : t('Известно', 'Known')}: <b className={spells > spellLimit ? 'text-blood' : 'text-parchment'}>{spells}/{spellLimit}</b> · </>}
            {t('СЛ', 'DC')} {sc.saveDc.value}
          </div>
        </div>
      </Card>
      <SpellFilters {...props} maxLevel={maxLevel} />
      <div className="grid gap-1.5">
        {list.map((s) => <SpellRow key={s.id} s={s} selected={selected.includes(s.id) || granted.has(s.id as never)} locked={granted.has(s.id as never) ? t('всегда', 'always') : undefined} onToggle={() => toggle(s)} onInfo={() => setInfo(s.id)} />)}
        {!list.length && <div className="text-center text-muted py-8 text-sm">{t('Ничего не найдено', 'Nothing found')}</div>}
      </div>
      <Drawer open={!!info} onClose={() => setInfo(null)} title={info ? nameOf(lib!, info, contentLang) : ''}>{info && <SpellCard uid={info} />}</Drawer>
    </div>
  );
}

export function SpellCard({ uid }: { uid: string }) {
  const { lib } = useApp();
  const t = useTr();
  const s = lib!.items.get(uid)?.item as Spell | undefined;
  if (!s) return <ItemText uid={uid} />;
  const m = s.mechanics;
  const range = m.range.kind === 'ranged' ? `${m.range.feet} ${t('фт', 'ft')}` : t({ self: 'на себя', touch: 'касание', sight: 'в пределах видимости', unlimited: 'без ограничений', special: 'особая', ranged: '' }[m.range.kind], m.range.kind);
  const comps = [m.components.v && 'В', m.components.s && 'С', m.components.m && `М (${m.components.m})`].filter(Boolean).join(', ');
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        {[[t('Круг', 'Level'), m.level === 0 ? t('заговор', 'cantrip') : m.level], [t('Школа', 'School'), term(m.school)], [t('Время', 'Time'), m.castingTime], [t('Дистанция', 'Range'), range], [t('Длительность', 'Duration'), m.duration + (m.concentration ? t(' · концентрация', ' · concentration') : '')], [t('Компоненты', 'Components'), comps]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl bg-coal border border-edge p-2.5"><div className="text-[11px] uppercase tracking-wide text-muted">{k}</div><div className="text-parchment">{v}</div></div>
        ))}
      </div>
      {m.ritual && <div className="mb-3"><Badge tone="gold">{t('ритуал', 'ritual')}</Badge></div>}
      <ItemText uid={uid} />
    </div>
  );
}
