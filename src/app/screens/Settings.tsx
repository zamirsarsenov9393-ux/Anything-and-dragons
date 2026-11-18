/** Настройки: язык, резервная копия базы, сведения о хранилище и проекте. */
import { Database, Download, Upload, Globe, Info, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store';
import { useTr } from '../i18n';
import { Button, Card, Field, Header, Section, Segmented } from '../ui';
import { saveFile } from '../transfer';
import { ENGINE_VERSION } from '../engine';

export function Settings() {
  const t = useTr();
  const { lang, setLang, contentLang, setContentLang, repo, dbInfo, toast, reloadLibrary, bump } = useApp();
  const [confirmImport, setConfirmImport] = useState<Uint8Array | null>(null);
  const storage = { opfs: t('файл базы на устройстве (OPFS)', 'database file on device (OPFS)'), indexeddb: t('снимок базы в IndexedDB', 'database snapshot in IndexedDB'), memory: t('только в памяти — данные пропадут после закрытия!', 'memory only — data is lost on close!') }[dbInfo?.mode ?? 'memory'];
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    <div>
      <Header title={t('Настройки', 'Settings')} />
      <div className="px-4">
        <Section title={<span className="flex items-center gap-2"><Globe size={18} />{t('Язык', 'Language')}</span>} className="mt-0">
          <div className="grid gap-3">
            <Field label={t('Интерфейс', 'Interface')}><Segmented value={lang} onChange={setLang} items={[{ id: 'ru', label: 'Русский' }, { id: 'en', label: 'English' }]} /></Field>
            <Field label={t('Названия классов, заклинаний, предметов', 'Names of classes, spells, items')} hint={t('Описания SRD пока на английском — это оригинальный текст.', 'SRD descriptions are in English — the original text.')}>
              <Segmented value={contentLang} onChange={setContentLang} items={[{ id: 'ru', label: 'Русский' }, { id: 'en', label: 'English' }]} />
            </Field>
          </div>
        </Section>

        {!standalone && (
          <Section title={<span className="flex items-center gap-2"><Smartphone size={18} />{t('Установка на iPhone', 'Install on iPhone')}</span>}>
            <Card className="p-4 text-sm text-parchment-dim leading-relaxed">
              {t('В Safari нажмите «Поделиться» → «На экран «Домой»». Так приложение работает без интернета, открывается без адресной строки, а Safari не удалит ваши данные через 7 дней без посещений.', 'In Safari tap Share → Add to Home Screen. The app then works offline, opens full-screen, and Safari will not clear your data after 7 days of inactivity.')}
            </Card>
          </Section>
        )}

        <Section title={<span className="flex items-center gap-2"><Database size={18} />{t('Данные', 'Data')}</span>}>
          <Card className="p-4 text-sm grid gap-1 mb-3">
            <div>{t('Хранилище', 'Storage')}: <span className={dbInfo?.mode === 'memory' ? 'text-blood' : 'text-parchment'}>{storage}</span></div>
            <div className="text-muted">SQLite {dbInfo?.sqlite} · {t('схема', 'schema')} v{dbInfo?.schemaVersion} · {t('движок', 'engine')} {ENGINE_VERSION}</div>
          </Card>
          <div className="grid gap-2">
            <Button icon={<Download size={18} />} onClick={async () => {
              const bytes = await repo!.exportDatabase();
              await saveFile(`aandd-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, new Blob([bytes as BlobPart], { type: 'application/x-sqlite3' }));
            }}>{t('Резервная копия базы', 'Back up database')}</Button>
            <label className="h-11 rounded-xl border border-edge bg-coal/60 grid place-items-center cursor-pointer"><span className="flex items-center gap-2"><Upload size={18} />{t('Восстановить из копии', 'Restore from backup')}</span>
              <input type="file" accept=".sqlite,.db,application/octet-stream,application/x-sqlite3" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setConfirmImport(new Uint8Array(await f.arrayBuffer())); e.target.value = ''; }} />
            </label>
            {confirmImport && (
              <Button variant="danger" onClick={async () => {
                try {
                  const current = await repo!.exportDatabase();
                  await saveFile(`aandd-before-restore-${Date.now()}.sqlite`, new Blob([current as BlobPart]));
                  await repo!.importDatabase(confirmImport);
                  setConfirmImport(null);
                  await reloadLibrary(); bump();
                  toast(t('База восстановлена', 'Database restored'));
                } catch (err) { toast((err as Error).message, 'error'); }
              }}>{t('Заменить текущие данные? Сначала сохранится копия текущей базы', 'Replace current data? A copy of the current database is saved first')}</Button>
            )}
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><Info size={18} />{t('О приложении', 'About')}</span>}>
          <Card className="p-4 text-sm text-parchment-dim leading-relaxed grid gap-2">
            <p>{t('A&D (Anything and Dragons) — конструктор персонажей для D&D 5e. Работает на устройстве, без регистрации и без сервера.', 'A&D (Anything and Dragons) is a character builder for D&D 5e. Runs on your device, no sign-up, no server.')}</p>
            <p>{t('Неофициальный проект, не связан с Wizards of the Coast. Игровые правила — из SRD 5.1 и SRD 5.2 (CC-BY-4.0). Подробная атрибуция — в разделе «Библиотека → Пакеты».', 'Unofficial project, not affiliated with Wizards of the Coast. Rules from SRD 5.1 and SRD 5.2 (CC-BY-4.0). Full attribution under Library → Packages.')}</p>
          </Card>
        </Section>
      </div>
    </div>
  );
}
