/** Кампании и ваншоты: мастер, игроки, персонажи, журнал приключений, заметки. */
import { useEffect, useState } from 'react';
import { Plus, Swords, Trash2, Users, BookMarked, StickyNote } from 'lucide-react';
import { useApp } from '../store';
import { useTr } from '../i18n';
import { Badge, Button, Card, Drawer, Empty, Field, Header, Input, Section, Segmented, Select, Stepper, TextArea } from '../ui';
import type { CampaignRow } from '../../data/repo';

export function Campaigns() {
  const t = useTr();
  const { repo, navigate, version } = useApp();
  const [list, setList] = useState<CampaignRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mode: 'campaign' as 'campaign' | 'oneshot', edition: '2014' as '2014' | '2024', dmName: '', description: '' });
  useEffect(() => { void repo!.listCampaigns().then(setList); }, [repo, version]);
  const status: Record<string, string> = { planned: t('Планируется', 'Planned'), active: t('Идёт', 'Active'), paused: t('Пауза', 'Paused'), finished: t('Завершена', 'Finished') };
  return (
    <div>
      <Header title={t('Кампании', 'Campaigns')} actions={<Button variant="gold" size="sm" icon={<Plus size={18} />} onClick={() => setOpen(true)}>{t('Новая', 'New')}</Button>} />
      <div className="px-4 grid gap-3">
        {list?.length === 0 && <Empty icon={<Swords size={28} />} title={t('Кампаний пока нет', 'No campaigns yet')} text={t('Соберите группу: мастер, игроки, персонажи и журнал сессий в одном месте.', 'Keep the DM, players, characters and session log together.')} action={<Button variant="gold" onClick={() => setOpen(true)}>{t('Создать кампанию', 'Create campaign')}</Button>} />}
        {list?.map((c) => (
          <Card key={c.id} className="p-4" onClick={() => navigate(`/campaign/${c.id}`)}>
            <div className="font-display text-2xl">{c.name}</div>
            <div className="flex gap-2 mt-2 flex-wrap"><Badge tone="gold">{c.mode === 'oneshot' ? t('Ваншот', 'One-shot') : t('Кампания', 'Campaign')}</Badge><Badge>{c.edition}</Badge><Badge>{status[c.status]}</Badge>{c.currentLevel ? <Badge>{t(`уровень ${c.currentLevel}`, `level ${c.currentLevel}`)}</Badge> : null}</div>
            {c.dmName && <div className="text-sm text-muted mt-2">{t('Мастер', 'DM')}: {c.dmName}</div>}
          </Card>
        ))}
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={t('Новая кампания', 'New campaign')} footer={
        <Button variant="gold" className="w-full" disabled={!form.name.trim()} onClick={async () => { const id = await repo!.createCampaign({ ...form, name: form.name.trim() }); setOpen(false); navigate(`/campaign/${id}`); }}>{t('Создать', 'Create')}</Button>
      }>
        <div className="grid gap-3 pb-2">
          <Segmented value={form.mode} onChange={(mode) => setForm({ ...form, mode })} items={[{ id: 'campaign', label: t('Кампания', 'Campaign') }, { id: 'oneshot', label: t('Ваншот', 'One-shot') }]} />
          <Field label={t('Название', 'Name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('Редакция', 'Edition')}><Segmented value={form.edition} onChange={(edition) => setForm({ ...form, edition })} items={[{ id: '2014', label: '2014' }, { id: '2024', label: '2024' }]} /></Field>
          <Field label={t('Мастер', 'Dungeon Master')}><Input value={form.dmName} onChange={(e) => setForm({ ...form, dmName: e.target.value })} /></Field>
          <Field label={t('Описание', 'Description')}><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Drawer>
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof useApp.getState>['repo']>['getCampaign']>>>;

export function CampaignDetail({ id }: { id: string }) {
  const t = useTr();
  const { repo, navigate } = useApp();
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  const [player, setPlayer] = useState('');
  const [log, setLog] = useState({ title: '', body: '' });
  const [note, setNote] = useState('');
  const [chars, setChars] = useState<{ id: string; name: string; campaignId: string | null }[]>([]);
  const [confirm, setConfirm] = useState(false);
  const reload = async () => { setD((await repo!.getCampaign(id)) ?? null); setChars((await repo!.listCharacters()).map((c) => ({ id: c.id, name: c.name, campaignId: c.campaignId }))); };
  useEffect(() => { void reload(); }, [id]);
  if (d === undefined) return null;
  if (d === null) return <Empty title={t('Кампания не найдена', 'Campaign not found')} action={<Button onClick={() => navigate('/campaigns')}>{t('Назад', 'Back')}</Button>} />;
  const c = d.campaign;
  const upd = async (patch: Partial<CampaignRow>) => { await repo!.updateCampaign(id, patch); await reload(); };
  const charStatus: Record<string, string> = { draft: t('черновик', 'draft'), active: t('в игре', 'active'), retired: t('на покое', 'retired'), dead: t('погиб', 'dead'), missing: t('пропал', 'missing') };
  return (
    <div>
      <Header back="/campaigns" title={c.name} subtitle={`${c.mode === 'oneshot' ? t('Ваншот', 'One-shot') : t('Кампания', 'Campaign')} · ${c.edition}${c.dmName ? ` · ${t('мастер', 'DM')} ${c.dmName}` : ''}`} />
      <div className="px-4">
        {c.description && <Card className="p-4 text-sm text-parchment-dim whitespace-pre-wrap">{c.description}</Card>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Field label={t('Статус', 'Status')}><Select value={c.status} onChange={(e) => upd({ status: e.target.value as CampaignRow['status'] })}>
            {[['planned', 'Планируется', 'Planned'], ['active', 'Идёт', 'Active'], ['paused', 'Пауза', 'Paused'], ['finished', 'Завершена', 'Finished']].map(([v, r, e]) => <option key={v} value={v}>{t(r!, e!)}</option>)}
          </Select></Field>
          <Field label={t('Текущий уровень', 'Current level')}><Stepper value={c.currentLevel ?? 1} min={1} max={20} onChange={(v) => upd({ currentLevel: v })} /></Field>
        </div>

        <Section title={<span className="flex items-center gap-2"><Users size={18} />{t('Персонажи', 'Characters')}</span>}>
          <div className="grid gap-2">
            {d.characters.map((ch) => <Card key={ch.id} className="p-3 flex items-center" onClick={() => navigate(`/c/${ch.id}`)}><span className="flex-1">{ch.name}</span><Badge>{charStatus[ch.status]}</Badge></Card>)}
            <Select value="" onChange={async (e) => { if (!e.target.value) return; await repo!.updateCharacter(e.target.value, { campaignId: id }); await reload(); }}>
              <option value="">{t('+ Добавить персонажа', '+ Add character')}</option>
              {chars.filter((x) => x.campaignId !== id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </div>
        </Section>

        <Section title={t('Игроки', 'Players')}>
          <div className="flex flex-wrap gap-2 mb-2">{d.players.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-full border border-edge text-sm">{p.name}<button onClick={async () => { await repo!.removePlayer(id, p.id); await reload(); }} className="w-7 h-7 grid place-items-center text-muted">×</button></span>
          ))}</div>
          <div className="flex gap-2"><Input value={player} onChange={(e) => setPlayer(e.target.value)} placeholder={t('Имя игрока', 'Player name')} /><Button variant="soft" disabled={!player.trim()} onClick={async () => { await repo!.addPlayer(id, player.trim()); setPlayer(''); await reload(); }}><Plus size={18} /></Button></div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><BookMarked size={18} />{t('История приключений', 'Adventure log')}</span>}>
          <Card className="p-3 grid gap-2">
            <Input value={log.title} onChange={(e) => setLog({ ...log, title: e.target.value })} placeholder={t('Сессия: что произошло', 'Session title')} />
            <TextArea value={log.body} onChange={(e) => setLog({ ...log, body: e.target.value })} placeholder={t('Подробности, награды, НПС…', 'Details, loot, NPCs…')} />
            <Button variant="soft" disabled={!log.title.trim()} onClick={async () => { await repo!.addLog(id, { title: log.title.trim(), body: log.body, sessionNo: d.logs.length + 1, levelAfter: c.currentLevel ?? undefined }); setLog({ title: '', body: '' }); await reload(); }}>{t('Добавить запись', 'Add entry')}</Button>
          </Card>
          <div className="grid gap-2 mt-2">{d.logs.map((l) => (
            <Card key={l.id} className="p-3">
              <div className="flex items-start gap-2"><div className="flex-1"><div className="font-semibold">{l.sessionNo ? `#${l.sessionNo} · ` : ''}{l.title}</div><div className="text-xs text-muted">{l.playedAt ? new Date(l.playedAt).toLocaleDateString() : ''}</div></div><button onClick={async () => { await repo!.removeLog(l.id); await reload(); }} className="text-muted p-1"><Trash2 size={16} /></button></div>
              {l.body && <div className="text-sm text-parchment-dim mt-2 whitespace-pre-wrap">{l.body}</div>}
            </Card>
          ))}</div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><StickyNote size={18} />{t('Заметки', 'Notes')}</span>}>
          <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Заметка мастера', 'DM note')} /><Button variant="soft" disabled={!note.trim()} onClick={async () => { await repo!.addNote('campaign', id, note.trim()); setNote(''); await reload(); }}><Plus size={18} /></Button></div>
          <div className="grid gap-2 mt-2">{d.notes.map((n) => <Card key={n.id} className="p-3 flex gap-2 text-sm"><span className="flex-1 whitespace-pre-wrap">{n.body}</span><button onClick={async () => { await repo!.removeNote(n.id); await reload(); }} className="text-muted"><Trash2 size={16} /></button></Card>)}</div>
        </Section>

        <div className="mt-8">{!confirm ? <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}>{t('Удалить кампанию', 'Delete campaign')}</Button>
          : <Button variant="danger" className="w-full" onClick={async () => { await repo!.deleteCampaign(id); navigate('/campaigns'); }}>{t('Удалить? Персонажи останутся', 'Delete? Characters stay')}</Button>}</div>
      </div>
    </div>
  );
}
