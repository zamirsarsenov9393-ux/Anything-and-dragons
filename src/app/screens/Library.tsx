/** Библиотека: поиск по всему контенту, карточка элемента с источником и лицензией, управление пакетами. */
import { useMemo, useState } from 'react';
import { Search, Package, Upload, ShieldCheck, Trash2, ChevronRight } from 'lucide-react';
import { useApp } from '../store';
import { nameOf } from '../content';
import { term, useTr } from '../i18n';
import { Badge, Button, Card, Drawer, Header, Input, Section, Segmented, Tabs, cx } from '../ui';
import { ItemText } from '../parts/Choices';
import { SpellCard, SpellFilters, SpellRow, useSpellFilter } from '../parts/Spells';
import { importPackageJson } from '../../content/importer';
import type { ContentItem } from '../../content/schema';

type Kind = 'spell' | 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'weapon' | 'armor' | 'magic-item' | 'gear' | 'feature';

export function Library() {
  const t = useTr();
  const { lib, contentLang, navigate } = useApp();
  const [edition, setEdition] = useState<'2014' | '2024'>('2014');
  const [kind, setKind] = useState<Kind>('spell');
  const [q, setQ] = useState('');
  const all = useMemo(() => [...lib!.items.values()].map((x) => x.item).filter((i) => i.edition === edition || i.edition === 'any'), [lib, edition]);
  const spells = useMemo(() => all.filter((i): i is Extract<ContentItem, { type: 'spell' }> => i.type === 'spell'), [all]);
  const sf = useSpellFilter(spells);
  const [info, setInfo] = useState<string | null>(null);
  const kinds: { id: Kind; label: string }[] = [
    { id: 'spell', label: t('Заклинания', 'Spells') }, { id: 'class', label: t('Классы', 'Classes') }, { id: 'subclass', label: t('Подклассы', 'Subclasses') },
    { id: 'species', label: t('Виды', 'Species') }, { id: 'background', label: t('Предыстории', 'Backgrounds') }, { id: 'feat', label: t('Черты', 'Feats') },
    { id: 'weapon', label: t('Оружие', 'Weapons') }, { id: 'armor', label: t('Доспехи', 'Armor') }, { id: 'magic-item', label: t('Магические предметы', 'Magic items') }, { id: 'gear', label: t('Снаряжение', 'Gear') }, { id: 'feature', label: t('Особенности', 'Features') },
  ];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const types = kind === 'species' ? ['species', 'subspecies'] : kind === 'gear' ? ['gear', 'tool', 'pack', 'consumable'] : [kind];
    return all.filter((i) => types.includes(i.type) && (!needle || i.name.toLowerCase().includes(needle) || nameOf(lib!, i.id, contentLang).toLowerCase().includes(needle)))
      .sort((a, b) => nameOf(lib!, a.id, contentLang).localeCompare(nameOf(lib!, b.id, contentLang))).slice(0, 300);
  }, [all, kind, q, lib, contentLang]);
  return (
    <div>
      <Header title={t('Библиотека', 'Library')} actions={<Button size="sm" icon={<Package size={16} />} onClick={() => navigate('/packages')}>{t('Пакеты', 'Packages')}</Button>} />
      <div className="px-4">
        <Segmented value={edition} onChange={setEdition} items={[{ id: '2014', label: 'SRD 5.1 · 2014' }, { id: '2024', label: 'SRD 5.2 · 2024' }]} className="mb-3" />
        <Tabs value={kind} onChange={setKind} items={kinds} />
        <div className="mt-3">
          {kind === 'spell' ? (
            <>
              <SpellFilters {...sf.props} />
              <div className="text-xs text-muted mb-2 px-1">{t(`Найдено: ${sf.list.length}`, `Found: ${sf.list.length}`)}</div>
              <div className="grid gap-1.5">{sf.list.slice(0, 300).map((s) => <SpellRow key={s.id} s={s} onInfo={() => setInfo(s.id)} />)}</div>
            </>
          ) : (
            <>
              <div className="relative mb-3"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Поиск', 'Search')} className="pl-10" /></div>
              <div className="grid gap-1.5">{list.map((i) => (
                <button key={i.id} onClick={() => navigate(`/library/${encodeURIComponent(i.id)}`)} className="card px-3 py-3 text-left flex items-center gap-2">
                  <span className="flex-1 min-w-0"><span className="block truncate">{nameOf(lib!, i.id, contentLang)}</span>{contentLang === 'ru' && lib!.ru.has(i.id) && <span className="text-xs text-muted">{i.name}</span>}</span>
                  {i.tags.includes('text-only') && <Badge>{t('текст', 'text')}</Badge>}
                  <ChevronRight size={16} className="text-muted" />
                </button>
              ))}</div>
            </>
          )}
        </div>
      </div>
      <Drawer open={!!info} onClose={() => setInfo(null)} title={info ? nameOf(lib!, info, contentLang) : ''}>{info && <SpellCard uid={info} />}</Drawer>
    </div>
  );
}

export function ItemDetail({ uid }: { uid: string }) {
  const t = useTr();
  const { lib, contentLang } = useApp();
  const x = lib!.items.get(uid);
  const it = x?.item;
  const m = (it?.mechanics ?? {}) as Record<string, unknown>;
  const facts: [string, string][] = [];
  if (it?.type === 'weapon') facts.push([t('Урон', 'Damage'), `${m.damage} ${term(String(m.damageType))}`], [t('Категория', 'Category'), term(String(m.category))], [t('Свойства', 'Properties'), (m.properties as string[]).join(', ') || '—']);
  if (it?.type === 'armor') facts.push([t('КЗ', 'AC'), String(m.baseAc)], [t('Тип', 'Type'), term(String(m.category))], [t('Макс. ЛВК', 'Max DEX'), m.dexCap === null ? '—' : String(m.dexCap)]);
  if (it?.type === 'class') facts.push([t('Кость хитов', 'Hit die'), `d${m.hitDie}`], [t('Спасброски', 'Saves'), (m.savingThrows as string[]).map((a) => term(a)).join(', ')], [t('Подкласс с уровня', 'Subclass at level'), String(m.subclassLevel)]);
  if (it?.type === 'magic-item') facts.push([t('Редкость', 'Rarity'), term(m.rarity === 'common' ? 'common_rarity' : String(m.rarity))], [t('Настройка', 'Attunement'), m.attunement ? t('нужна', 'required') : t('не нужна', 'no')]);
  if (typeof m.weightLb === 'number' && m.weightLb) facts.push([t('Вес', 'Weight'), `${m.weightLb} ${t('фнт', 'lb')}`]);
  if (typeof m.costCp === 'number') facts.push([t('Цена', 'Cost'), m.costCp >= 100 ? `${(m.costCp as number) / 100} ${t('зм', 'gp')}` : `${m.costCp} ${t('мм', 'cp')}`]);
  return (
    <div>
      <Header back="/library" title={it ? nameOf(lib!, uid, contentLang) : uid} subtitle={it && contentLang === 'ru' && lib!.ru.has(uid) ? it.name : undefined} />
      <div className="px-4">
        {!it ? <Card className="p-4 text-muted">{t('Элемент не установлен или источник отключён.', 'Not installed or its source is disabled.')}</Card> : (
          <>
            {it.type === 'spell' ? <SpellCard uid={uid} /> : (
              <>
                {facts.length > 0 && <div className="grid grid-cols-2 gap-2 mb-4">{facts.map(([k, v]) => <div key={k} className="rounded-xl bg-coal border border-edge p-2.5"><div className="text-[11px] uppercase tracking-wide text-muted">{k}</div><div>{v}</div></div>)}</div>}
                <ItemText uid={uid} />
              </>
            )}
            <Card className="p-4 mt-5 text-xs text-muted grid gap-1">
              <div><span className="text-parchment-dim">{t('Источник', 'Source')}:</span> {x!.pkg.source.title} · {t('версия', 'version')} {x!.pkg.version}</div>
              <div><span className="text-parchment-dim">{t('Лицензия', 'License')}:</span> {x!.pkg.source.license.code}</div>
              <div><span className="text-parchment-dim">ID:</span> {uid}</div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export function Packages() {
  const t = useTr();
  const { lib, repo, reloadLibrary, toast } = useApp();
  const [report, setReport] = useState<ReturnType<typeof importPackageJson> | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const installed = lib!.packages.map((p) => p.pkg);
  const LIC: Record<string, string> = { 'CC-BY-4.0': 'CC-BY 4.0', 'OGL-1.0a': 'OGL 1.0a', 'homebrew-own': t('свой хоумбрю', 'own homebrew'), 'permission-granted': t('есть разрешение', 'permission granted'), 'user-owned-private': t('личная копия', 'private copy'), unknown: t('права неизвестны', 'rights unknown') };
  const d = lib!.packages.find((p) => p.pkg.id === detail);
  return (
    <div>
      <Header back="/library" title={t('Пакеты контента', 'Content packages')} />
      <div className="px-4">
        <div className="grid gap-2">
          {lib!.packages.map(({ pkg, origin, enabled }) => (
            <Card key={pkg.id} className={cx('p-4', !enabled && 'opacity-60')} onClick={() => setDetail(pkg.id)}>
              <div className="flex items-start gap-3">
                <Package size={20} className="text-gold mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{pkg.name}</div>
                  <div className="text-xs text-muted">{pkg.source.title} · v{pkg.version}</div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <Badge tone="gold">{LIC[pkg.source.license.code]}</Badge>
                    <Badge>{pkg.kind === 'translation' ? t('перевод', 'translation') : pkg.edition}</Badge>
                    <Badge>{origin === 'builtin' ? t('встроенный', 'built-in') : origin === 'homebrew' ? 'homebrew' : t('импорт', 'imported')}</Badge>
                    {!enabled && <Badge tone="warn">{t('отключён', 'disabled')}</Badge>}
                  </div>
                </div>
                <div className="text-xs text-muted">{pkg.kind === 'content' ? pkg.items.length : pkg.entries.length}</div>
              </div>
            </Card>
          ))}
        </div>

        <Section title={t('Импорт пакета', 'Import package')}>
          <Card className="p-4 text-sm text-parchment-dim leading-relaxed">
            {t('Подключить можно JSON-пакет в формате A&D: свой хоумбрю или материал, на который у вас есть права. Тексты из чужих книг без разрешения правообладателя не загружайте. Защищённые PDF приложение не открывает.', 'Import an A&D JSON package: your homebrew or material you have rights to. Do not load text from others’ books without permission. Protected PDFs are not opened.')}
          </Card>
          <label className="mt-2 flex items-start gap-3 text-sm p-1">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 w-5 h-5 accent-[#c4a062]" />
            <span>{t('Подтверждаю, что имею право использовать этот материал так, как указано в его лицензии.', 'I confirm I have the right to use this material as its licence states.')}</span>
          </label>
          <label className={cx('mt-2 h-11 rounded-xl border border-edge bg-coal/60 grid place-items-center', rights ? 'cursor-pointer' : 'opacity-40 pointer-events-none')}>
            <span className="flex items-center gap-2"><Upload size={18} />{t('Выбрать файл JSON', 'Choose JSON file')}</span>
            <input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const text = await f.text();
              setPending(text); setReport(importPackageJson(text, installed)); e.target.value = '';
            }} />
          </label>
        </Section>

        <Section title={<span className="flex items-center gap-2"><ShieldCheck size={18} />{t('Атрибуция', 'Attribution')}</span>}>
          <Card className="p-4 text-xs text-muted leading-relaxed grid gap-3">
            {lib!.packages.filter((p) => p.pkg.kind === 'content' && p.pkg.source.license.attribution).map((p) => <p key={p.pkg.id}>{p.pkg.source.license.attribution}</p>)}
            <p>{t('Структура исходных данных SRD — проект 5e-database (MIT License, © Adrian Padua, Christopher Ward). Русские названия переведены для A&D.', 'SRD data structure from 5e-database (MIT License, © Adrian Padua, Christopher Ward). Russian names translated for A&D.')}</p>
            <p>{t('A&D — неофициальный проект, не связан с Wizards of the Coast.', 'A&D is unofficial and not affiliated with Wizards of the Coast.')}</p>
          </Card>
        </Section>
      </div>

      <Drawer open={!!report} onClose={() => { setReport(null); setPending(null); }} title={t('Проверка пакета', 'Package check')} footer={report?.ok && (
        <Button variant="gold" className="w-full" onClick={async () => {
          const pkg = report.sanitized!;
          await repo!.registerPackage(pkg, pkg.origin === 'builtin' ? 'imported' : pkg.origin, true);
          await reloadLibrary(); setReport(null); setPending(null);
          toast(t('Пакет подключён', 'Package installed'));
        }}>{t('Подключить', 'Install')}</Button>
      )}>
        {report && pending && (
          <div className="grid gap-2 text-sm pb-2">
            <div className={report.ok ? 'text-moss' : 'text-blood'}>{report.ok ? t('Ошибок нет.', 'No errors.') : t(`Ошибок: ${report.errors.length}. Пакет не может быть подключён.`, `${report.errors.length} errors. Cannot install.`)}</div>
            {Object.keys(report.summary).length > 0 && <div className="text-muted">{Object.entries(report.summary).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
            {report.errors.map((e, i) => <div key={i} className="text-blood">✗ {e.message}</div>)}
            {report.warnings.map((e, i) => <div key={i} className="text-gold-bright">! {e.message}</div>)}
          </div>
        )}
      </Drawer>

      <Drawer open={!!d} onClose={() => setDetail(null)} title={d?.pkg.name}>
        {d && (
          <div className="grid gap-3 text-sm pb-2">
            <div className="text-muted">{d.pkg.source.title}{d.pkg.source.publisher ? ` · ${d.pkg.source.publisher}` : ''}</div>
            <Card className="p-3 grid gap-1 text-xs">
              <div>{t('Лицензия', 'License')}: {d.pkg.source.license.code}</div>
              <div>{t('Хранить текст', 'Store text')}: {d.pkg.source.allowedUse.storeText ? '✓' : '✗'} · {t('Экспорт текста', 'Export text')}: {d.pkg.source.allowedUse.exportText ? '✓' : '✗'} · {t('Делиться', 'Share')}: {d.pkg.source.allowedUse.share ? '✓' : '✗'}</div>
              {d.pkg.source.license.modifications && <div className="text-muted">{d.pkg.source.license.modifications}</div>}
            </Card>
            <Button onClick={async () => { await repo!.setPackageEnabled(d.pkg.id, !d.enabled); await reloadLibrary(); setDetail(null); toast(d.enabled ? t('Пакет отключён. Персонажи считаются по сохранённым снимкам.', 'Package disabled. Characters use their saved snapshots.') : t('Пакет включён', 'Package enabled')); }}>
              {d.enabled ? t('Отключить', 'Disable') : t('Включить', 'Enable')}
            </Button>
            {d.origin !== 'builtin' && (
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={async () => { await repo!.deletePackage(d.pkg.id); await reloadLibrary(); setDetail(null); toast(t('Пакет удалён. Персонажи сохранили механику в снимках.', 'Package deleted. Characters keep mechanics in snapshots.')); }}>{t('Удалить пакет', 'Delete package')}</Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
