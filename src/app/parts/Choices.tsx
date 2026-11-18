/** Универсальный редактор незакрытых выборов движка: навыки, черты, подклассы, увеличение характеристик… */
import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import type { CharacterBuild, PendingChoice } from '../../core/types';
import { useApp } from '../store';
import { nameOf, textOf } from '../content';
import { ABILITY_KEYS, term, useTr } from '../i18n';
import { Badge, Card, Drawer, Segmented, cx } from '../ui';

/** Записать ответ на выбор в журнал решений. */
export function setChoice(b: CharacterBuild, p: Pick<PendingChoice, 'choiceId' | 'level'>, selected: string[]): CharacterBuild {
  const next = structuredClone(b);
  if (p.choiceId === 'origin#species') { next.speciesUid = selected[0] as never; return next; }
  if (p.choiceId === 'origin#background') { next.backgroundUid = selected[0] as never; return next; }
  const list = p.level >= 1 ? next.levels[p.level - 1]!.choices : next.originChoices;
  const i = list.findIndex((c) => c.choiceId === p.choiceId);
  if (selected.length === 0) { if (i >= 0) list.splice(i, 1); }
  else if (i >= 0) list[i] = { choiceId: p.choiceId, selected };
  else list.push({ choiceId: p.choiceId, selected });
  return next;
}
export function getChoice(b: CharacterBuild, p: Pick<PendingChoice, 'choiceId' | 'level'>): string[] {
  const list = p.level >= 1 ? b.levels[p.level - 1]?.choices ?? [] : b.originChoices;
  return list.find((c) => c.choiceId === p.choiceId)?.selected ?? [];
}

const isUid = (s: string) => s.includes(':') && s.includes('/');

export function optionLabel(o: string): string {
  const { lib, contentLang } = useApp.getState();
  if (isUid(o)) return nameOf(lib!, o, contentLang);
  return term(o);
}

/** Один выбор: чипы с множественным выбором до `pick`. */
export function ChoiceCard({ p, build, onChange, kindLabel }: { p: PendingChoice; build: CharacterBuild; onChange: (b: CharacterBuild) => void; kindLabel?: string }) {
  const t = useTr();
  const sel = getChoice(build, p);
  const [info, setInfo] = useState<string | null>(null);
  const { lib, contentLang } = useApp();
  if (p.kind === 'asi') return <AsiCard p={p} build={build} onChange={onChange} />;
  if (p.kind === 'ability-scores') return <OriginAbilities p={p} build={build} onChange={onChange} />;
  const toggle = (o: string) => {
    let next = sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o];
    if (p.pick === 1) next = sel.includes(o) ? [] : [o];
    else if (next.length > p.pick) next = next.slice(next.length - p.pick);
    onChange(setChoice(build, p, next));
  };
  const opts = p.options as string[];
  const long = opts.length > 14;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1">
          <div className="font-semibold text-parchment">{p.label.split(': ').slice(-1)[0]}</div>
          <div className="text-xs text-muted">{kindLabel ?? (p.level ? t(`${p.level} уровень`, `Level ${p.level}`) : t('Происхождение', 'Origin'))} · {p.label.split(': ')[0]}</div>
        </div>
        <Badge tone={sel.length === p.pick ? 'ok' : 'warn'}>{sel.length}/{p.pick}</Badge>
      </div>
      <div className={cx('flex flex-wrap gap-2', long && 'max-h-72 overflow-y-auto pr-1')}>
        {opts.map((o) => (
          <span key={o} className="inline-flex">
            <button onClick={() => toggle(o)} className={cx('min-h-10 px-3 rounded-l-xl border text-sm text-left', sel.includes(o) ? 'bg-gold/15 border-gold text-gold-bright' : 'border-edge text-parchment-dim', !isUid(o) && 'rounded-r-xl')}>
              {sel.includes(o) && <Check size={14} className="inline mr-1 -mt-0.5" />}{optionLabel(o)}
            </button>
            {isUid(o) && <button aria-label="info" onClick={() => setInfo(o)} className={cx('min-h-10 px-2 rounded-r-xl border border-l-0 text-muted', sel.includes(o) ? 'border-gold' : 'border-edge')}><Info size={14} /></button>}
          </span>
        ))}
      </div>
      <Drawer open={!!info} onClose={() => setInfo(null)} title={info ? nameOf(lib!, info, contentLang) : ''}>
        {info && <ItemText uid={info} />}
      </Drawer>
    </Card>
  );
}

export function ItemText({ uid }: { uid: string }) {
  const { lib, contentLang } = useApp();
  const t = useTr();
  const x = textOf(lib!, uid, contentLang);
  const meta = lib!.items.get(uid);
  return (
    <div className="text-[15px] leading-relaxed text-parchment-dim prose-srd">
      {meta && <div className="flex gap-2 mb-3 flex-wrap"><Badge tone="gold">{meta.pkg.name}</Badge>{meta.item.tags.includes('text-only') && <Badge tone="warn">{t('без автоматики', 'text only')}</Badge>}{contentLang === 'ru' && x.body && !x.translated && <Badge>{t('текст на английском', 'English text')}</Badge>}</div>}
      {x.body ? x.body.split(/\n{2,}/).map((para, i) => <p key={i} dangerouslySetInnerHTML={{ __html: md(para) }} />) : <p className="text-muted">{t('Описание недоступно: лицензия источника не разрешает хранить текст или его нет в пакете.', 'No description: the source licence does not allow storing text, or the package has none.')}</p>}
    </div>
  );
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
export const md = (s: string) => esc(s).replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/\n/g, '<br/>');

function AsiCard({ p, build, onChange }: { p: PendingChoice; build: CharacterBuild; onChange: (b: CharacterBuild) => void }) {
  const t = useTr();
  const sel = getChoice(build, p);
  const feats = (p.options as string[]).filter(isUid);
  const mode: 'abilities' | 'feat' = sel.length === 1 && isUid(sel[0]!) ? 'feat' : 'abilities';
  const [m, setM] = useState(mode);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1"><div className="font-semibold">{t('Увеличение характеристик', 'Ability Score Improvement')}</div><div className="text-xs text-muted">{t(`${p.level} уровень`, `Level ${p.level}`)}</div></div>
        <Badge tone={sel.length ? 'ok' : 'warn'}>{sel.length ? '✓' : '!'}</Badge>
      </div>
      {feats.length > 0 && <Segmented className="mb-3" value={m} onChange={(v) => { setM(v); onChange(setChoice(build, p, [])); }} items={[{ id: 'abilities', label: t('+2 к характеристикам', '+2 to abilities') }, { id: 'feat', label: t('Черта', 'Feat') }]} />}
      {m === 'abilities' ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((slot) => (
            <select key={slot} value={sel[slot] && !isUid(sel[slot]!) ? sel[slot] : ''} onChange={(e) => {
              const next = [sel[0] && !isUid(sel[0]) ? sel[0] : '', sel[1] && !isUid(sel[1]) ? sel[1] : ''];
              next[slot] = e.target.value;
              onChange(setChoice(build, p, next.every(Boolean) ? next : next.filter(Boolean).length ? [next[0] || next[1]!] : []));
            }} className="h-12 px-3 rounded-xl bg-coal border border-edge text-parchment">
              <option value="">{t('+1 к…', '+1 to…')}</option>
              {ABILITY_KEYS.map((a) => <option key={a} value={a}>{term(a)}</option>)}
            </select>
          ))}
          <div className="col-span-2 text-xs text-muted">{t('Можно выбрать одну характеристику дважды (+2).', 'Pick the same ability twice for +2.')}</div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto">
          {feats.map((f) => (
            <button key={f} onClick={() => onChange(setChoice(build, p, [f]))} className={cx('min-h-10 px-3 rounded-xl border text-sm', sel[0] === f ? 'bg-gold/15 border-gold text-gold-bright' : 'border-edge text-parchment-dim')}>{optionLabel(f)}</button>
          ))}
        </div>
      )}
    </Card>
  );
}

function OriginAbilities({ p, build, onChange }: { p: PendingChoice; build: CharacterBuild; onChange: (b: CharacterBuild) => void }) {
  const t = useTr();
  const sel = getChoice(build, p);
  const opts = p.options as string[];
  const counts = Object.fromEntries(opts.map((o) => [o, sel.filter((x) => x === o).length]));
  const two = opts.find((o) => counts[o] === 2);
  const [mode, setMode] = useState<'21' | '111'>(sel.length === 3 && new Set(sel).size === 3 ? '111' : '21');
  return (
    <Card className="p-4">
      <div className="font-semibold mb-1">{t('Характеристики предыстории', 'Background ability scores')}</div>
      <div className="text-xs text-muted mb-3">{opts.map((o) => term(o)).join(', ')}</div>
      <Segmented className="mb-3" value={mode} onChange={(v) => { setMode(v); onChange(setChoice(build, p, v === '111' ? [...opts] : [])); }} items={[{ id: '21', label: '+2 / +1' }, { id: '111', label: '+1 / +1 / +1' }]} />
      {mode === '21' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={two ?? ''} onChange={(e) => { const one = sel.find((x) => x !== two && counts[x] === 1); const a = e.target.value; const b = one && one !== a ? one : opts.find((o) => o !== a)!; onChange(setChoice(build, p, a ? [a, a, b] : [])); }} className="h-12 px-3 rounded-xl bg-coal border border-edge">
            <option value="">+2 …</option>{opts.map((o) => <option key={o} value={o}>{term(o)}</option>)}
          </select>
          <select value={sel.find((x) => counts[x] === 1) ?? ''} onChange={(e) => { const a = two ?? opts.find((o) => o !== e.target.value)!; onChange(setChoice(build, p, [a, a, e.target.value])); }} className="h-12 px-3 rounded-xl bg-coal border border-edge">
            <option value="">+1 …</option>{opts.filter((o) => o !== two).map((o) => <option key={o} value={o}>{term(o)}</option>)}
          </select>
        </div>
      )}
    </Card>
  );
}

/** Список выборов определённых видов, сгруппированный по уровням. */
export function ChoiceList({ choices: pending, kinds, build, onChange, empty }: { choices: PendingChoice[]; kinds?: PendingChoice['kind'][]; build: CharacterBuild; onChange: (b: CharacterBuild) => void; empty?: string }) {
  const t = useTr();
  // показываем и уже закрытые выборы — их можно поменять
  const list = pending.filter((p) => !kinds || kinds.includes(p.kind));
  if (!list.length) return <div className="text-muted text-sm px-1 py-6 text-center">{empty ?? t('Здесь выбирать нечего.', 'Nothing to choose here.')}</div>;
  return <div className="grid gap-3">{list.map((p) => <ChoiceCard key={p.choiceId} p={p} build={build} onChange={onChange} />)}</div>;
}
