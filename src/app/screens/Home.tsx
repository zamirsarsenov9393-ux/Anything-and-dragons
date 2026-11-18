import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Shield, Heart, Upload, Zap, ScrollText } from 'lucide-react';
import { useApp } from '../store';
import { useTr } from '../i18n';
import { Badge, Button, Card, Drawer, Empty, Header } from '../ui';
import { importCharacterFile } from '../transfer';

type Row = Awaited<ReturnType<NonNullable<ReturnType<typeof useApp.getState>['repo']>['listCharacters']>>[number];

export function Home() {
  const { repo, navigate, version } = useApp();
  const t = useTr();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { void repo!.listCharacters().then(setRows); }, [repo, version]);

  const statusLabel: Record<string, string> = { draft: t('Черновик', 'Draft'), active: t('В игре', 'Active'), retired: t('На покое', 'Retired'), dead: t('Погиб', 'Dead'), missing: t('Пропал', 'Missing') };
  return (
    <div>
      <Header title={t('Персонажи', 'Characters')} subtitle="A&D · D&D 5e 2014 / 2024"
        actions={<Button variant="gold" size="sm" icon={<Plus size={18} />} onClick={() => setOpen(true)}>{t('Создать', 'New')}</Button>} />
      <div className="px-4">
        {rows && rows.length === 0 && (
          <Empty icon={<ScrollText size={28} />} title={t('Пока никого', 'No characters yet')}
            text={t('Соберите первого героя: быстро для ваншота или по шагам для кампании.', 'Build your first hero: quickly for a one-shot or step by step for a campaign.')}
            action={<Button variant="gold" size="lg" icon={<Plus size={20} />} onClick={() => setOpen(true)}>{t('Создать персонажа', 'Create character')}</Button>} />
        )}
        <div className="grid gap-3">
          {rows?.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <Card onClick={() => navigate(`/c/${c.id}`)} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 shrink-0 rounded-2xl grid place-items-center border border-gold-soft/50 bg-gradient-to-b from-brown/70 to-coal font-display text-2xl text-gold-bright">
                    {c.summary?.level ?? '·'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-2xl leading-tight truncate">{c.name}</div>
                    <div className="text-sm text-parchment-dim truncate">{c.summary?.classes ?? '—'}</div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge tone="gold">{c.edition}</Badge>
                      <Badge>{statusLabel[c.status] ?? c.status}</Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-parchment-dim space-y-1">
                    <div className="flex items-center gap-1 justify-end"><Shield size={14} className="text-gold" />{c.summary?.ac ?? '—'}</div>
                    <div className="flex items-center gap-1 justify-end"><Heart size={14} className="text-blood" />{c.summary?.hp ?? '—'}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title={t('Новый персонаж', 'New character')}>
        <div className="grid gap-3 pb-2">
          <Card className="p-4" gold onClick={() => { setOpen(false); navigate('/new/quick'); }}>
            <div className="flex gap-3 items-center"><Zap className="text-gold" /><div><div className="font-display text-xl">{t('Быстрое создание', 'Quick build')}</div><div className="text-sm text-muted">{t('Для ваншота: редакция, уровень, класс — и персонаж готов. Всё можно поправить потом.', 'For one-shots: edition, level, class — done. Everything can be tweaked later.')}</div></div></div>
          </Card>
          <Card className="p-4" onClick={() => { setOpen(false); navigate('/new/wizard'); }}>
            <div className="flex gap-3 items-center"><ScrollText className="text-gold" /><div><div className="font-display text-xl">{t('Подробное создание', 'Step-by-step')}</div><div className="text-sm text-muted">{t('14 шагов: от редакции и уровня до снаряжения и биографии.', '14 steps: from edition and level to gear and biography.')}</div></div></div>
          </Card>
          <label className="card p-4 flex gap-3 items-center cursor-pointer">
            <Upload className="text-gold" />
            <div className="flex-1"><div className="font-display text-xl">{t('Импорт из файла', 'Import from file')}</div><div className="text-sm text-muted">{t('Персонаж в формате JSON, выгруженный из A&D.', 'A character JSON exported from A&D.')}</div></div>
            <input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const id = await importCharacterFile(f);
              setOpen(false);
              if (id) navigate(`/c/${id}`);
            }} />
          </label>
        </div>
      </Drawer>
    </div>
  );
}
