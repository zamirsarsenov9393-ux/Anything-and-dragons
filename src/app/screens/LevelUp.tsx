/** Повышение уровня: выбор класса, выборы нового уровня, просмотр изменений, подтверждение. */
import { useMemo, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { CharacterBuild, ContentUid, EngineResult } from '../../core/types';
import { compute } from '../../core/engine/compute';
import { useApp } from '../store';
import { byType, nameOf } from '../content';
import { ABILITY_KEYS, signed, term, useTr } from '../i18n';
import { Badge, Button, Card, Empty, Header, Section, Stepper, cx } from '../ui';
import { equipmentOf, persistRevision, useCharacter } from '../engine';
import { ChoiceList } from '../parts/Choices';

function addLevels(b: CharacterBuild, classUid: string, n: number): CharacterBuild {
  const next = structuredClone(b);
  for (let i = 0; i < n; i++) {
    const cl = next.levels.filter((l) => l.classUid === classUid).length + 1;
    next.levels.push({ characterLevel: next.levels.length + 1, classUid: classUid as ContentUid, classLevel: cl, choices: [] });
  }
  return next;
}

export function LevelUp({ id }: { id: string }) {
  const t = useTr();
  const { lib, contentLang, navigate } = useApp();
  const ch = useCharacter(id);
  const [classUid, setClassUid] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [draft, setDraft] = useState<CharacterBuild | null>(null);
  const [busy, setBusy] = useState(false);

  const base = ch.bundle?.revision.build;
  const equipment = ch.bundle ? equipmentOf(ch.bundle.inventory) : [];
  const before = ch.result;
  const current = base?.levels.length ?? 0;
  const owned = useMemo(() => (base ? [...new Set(base.levels.map((l) => l.classUid))] : []), [base]);

  const prepared = useMemo(() => {
    if (!base || !classUid || !ch.resolver) return null;
    const b = draft ?? addLevels(base, classUid, count);
    return { build: b, result: compute(b, ch.resolver, { equipment }) };
  }, [base, classUid, count, draft, ch.resolver, equipment]);

  if (!ch.bundle || !before || !base || !ch.resolver) return <Empty title="…" />;
  if (current >= 20) return <Empty title={t('Достигнут 20 уровень', 'Level 20 reached')} action={<Button onClick={() => navigate(`/c/${id}`)}>{t('Назад', 'Back')}</Button>} />;

  // какие классы можно взять: свои — всегда, новые — если включён мультикласс и выполнены требования
  const options = byType(lib!, 'class', base.edition).map((c) => {
    const test = compute(addLevels(base, c.id, 1), ch.resolver!, { equipment });
    const blocked = test.issues.find((i) => (i.code === 'multiclass-prerequisite' && i.level === current + 1) || i.code === 'multiclass-disabled');
    return { uid: c.id, owned: (owned as string[]).includes(c.id), blocked: blocked?.message };
  }).sort((a, b) => Number(b.owned) - Number(a.owned));

  const newLevels = prepared ? prepared.build.levels.slice(current).map((l) => l.characterLevel) : [];
  const newChoices = prepared ? prepared.result.choices.filter((p) => newLevels.includes(p.level)) : [];
  const openRequired = prepared ? prepared.result.pending.filter((p) => p.required && newLevels.includes(p.level)).length : 0;

  return (
    <div className="pb-28">
      <Header back={`/c/${id}`} title={t('Повышение уровня', 'Level up')} subtitle={`${ch.bundle.character.name} · ${current} → ${current + count}`} />
      <div className="px-4">
        <Section title={t('Класс', 'Class')} className="mt-0">
          <div className="grid gap-2">
            {options.map((o) => (
              <button key={o.uid} disabled={!!o.blocked} onClick={() => { setClassUid(o.uid); setDraft(null); }}
                className={cx('card p-3 text-left flex items-center gap-3', classUid === o.uid && 'card-gold', o.blocked && 'opacity-45')}>
                <div className={cx('w-5 h-5 rounded-full border-2', classUid === o.uid ? 'border-gold bg-gold' : 'border-edge')} />
                <div className="flex-1">
                  <div>{nameOf(lib!, o.uid, contentLang)} {o.owned && <span className="text-xs text-muted">· {t('уровень', 'level')} {before.sheet.classLevels[o.uid]} → {(before.sheet.classLevels[o.uid] ?? 0) + 1}</span>}</div>
                  {o.blocked && <div className="text-xs text-blood">{o.blocked}</div>}
                  {!o.owned && !o.blocked && <div className="text-xs text-gold">{t('мультикласс', 'multiclass')}</div>}
                </div>
              </button>
            ))}
          </div>
        </Section>
        {classUid && (
          <Section title={t('Сколько уровней', 'How many levels')}>
            <div className="flex items-center gap-3"><Stepper value={count} min={1} max={20 - current} onChange={(v) => { setCount(v); setDraft(null); }} /><span className="text-sm text-muted">{t('Можно поднять сразу несколько уровней', 'You can add several levels at once')}</span></div>
          </Section>
        )}
        {prepared && (
          <>
            <Section title={t('Выборы новых уровней', 'New level choices')}>
              <ChoiceList choices={newChoices} build={prepared.build} onChange={setDraft} empty={t('На этих уровнях выбирать ничего не нужно.', 'Nothing to choose at these levels.')} />
            </Section>
            <Section title={t('Что изменится', 'What changes')}>
              <Diff before={before} after={prepared.result} />
            </Section>
          </>
        )}
      </div>
      {prepared && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-ink/95 border-t border-edge safe-bottom">
          <div className="max-w-xl mx-auto px-4 pt-3">
            {openRequired > 0 && <div className="text-xs text-gold-bright mb-2 text-center">{t(`Не сделано выборов: ${openRequired}. Можно подтвердить и закрыть их позже на вкладке «Решения».`, `${openRequired} choices left — you can finish them later in Choices.`)}</div>}
            <Button variant="gold" className="w-full" disabled={busy} icon={<Check size={18} />} onClick={async () => {
              setBusy(true);
              try {
                await persistRevision(id, 'level-up', prepared.build, ch.resolver!, ch.bundle!.inventory, `${current} → ${prepared.build.levels.length}`);
                const st = ch.bundle!.state;
                const gain = prepared.result.sheet.hitPointsMax.value - before.sheet.hitPointsMax.value;
                await useApp.getState().repo!.saveState(id, { hpCurrent: (st.hpCurrent ?? before.sheet.hitPointsMax.value) + gain });
                useApp.getState().toast(t('Уровень повышен. Отменить можно на вкладке «История».', 'Level gained. Undo it in the History tab.'));
                navigate(`/c/${id}`);
              } finally { setBusy(false); }
            }}>{t('Подтвердить', 'Confirm')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Diff({ before, after }: { before: EngineResult; after: EngineResult }) {
  const t = useTr();
  const { lib, contentLang } = useApp();
  const a = before.sheet, b = after.sheet;
  const rows: [string, string | number, string | number][] = [
    [t('Уровень', 'Level'), a.totalLevel, b.totalLevel],
    [t('Хиты', 'Hit points'), a.hitPointsMax.value, b.hitPointsMax.value],
    [t('Бонус мастерства', 'Proficiency bonus'), signed(a.proficiencyBonus), signed(b.proficiencyBonus)],
    [t('КЗ', 'AC'), a.armorClass.value, b.armorClass.value],
    [t('Атак за действие', 'Attacks per action'), a.attacksPerAction, b.attacksPerAction],
    [t('Ячейки', 'Spell slots'), a.spellSlots.standard.join('/') || '—', b.spellSlots.standard.join('/') || '—'],
    ...(a.spellSlots.pact || b.spellSlots.pact ? [[t('Договор', 'Pact'), a.spellSlots.pact ? `${a.spellSlots.pact.count}×${a.spellSlots.pact.slotLevel}` : '—', b.spellSlots.pact ? `${b.spellSlots.pact.count}×${b.spellSlots.pact.slotLevel}` : '—'] as [string, string, string]] : []),
    ...ABILITY_KEYS.filter((k) => a.abilities[k].value !== b.abilities[k].value).map((k) => [term(k), a.abilities[k].value, b.abilities[k].value] as [string, number, number]),
  ];
  const oldF = new Set(a.features.map((f) => `${f.uid}@${f.level}`));
  const newF = b.features.filter((f) => !oldF.has(`${f.uid}@${f.level}`));
  const oldR = new Map(a.resources.map((r) => [r.id, r.max]));
  return (
    <div className="grid gap-2">
      <Card className="p-3 grid gap-1.5">
        {rows.map(([k, x, y]) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-muted">{k}</span><span>{x}</span><ArrowRight size={14} className="text-muted" /><span className={cx(String(x) !== String(y) && 'text-gold-bright font-semibold')}>{y}</span>
          </div>
        ))}
      </Card>
      {newF.length > 0 && <Card className="p-3"><div className="text-sm text-muted mb-2">{t('Новые способности', 'New features')}</div><div className="flex flex-wrap gap-2">{newF.map((f) => <Badge key={f.uid + f.level} tone="gold">{nameOf(lib!, f.uid, contentLang)}</Badge>)}</div></Card>}
      {b.resources.filter((r) => oldR.get(r.id) !== r.max).length > 0 && (
        <Card className="p-3 text-sm">{b.resources.filter((r) => oldR.get(r.id) !== r.max).map((r) => <div key={r.id}>{r.label}: {oldR.get(r.id) ?? 0} → <b className="text-gold-bright">{r.max >= 99 ? '∞' : r.max}</b></div>)}</Card>
      )}
    </div>
  );
}
