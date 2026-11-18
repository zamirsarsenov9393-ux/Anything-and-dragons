import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Users, Swords, BookOpen, Settings as Cog } from 'lucide-react';
import './styles.css';
import { useApp } from './store';
import { Toasts, cx } from './ui';
import { Home } from './screens/Home';
import { Create } from './screens/Create';
import { CharacterSheet } from './screens/Sheet';
import { LevelUp } from './screens/LevelUp';
import { Campaigns, CampaignDetail } from './screens/Campaigns';
import { Library, ItemDetail, Packages } from './screens/Library';
import { Settings } from './screens/Settings';

function Splash({ error }: { error?: string }) {
  return (
    <div className="h-full grid place-items-center px-8 text-center">
      <div>
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="w-24 h-24 mx-auto mb-6 opacity-90" />
        <div className="font-display text-3xl text-gold-bright">A&amp;D</div>
        {error ? (
          <p className="text-blood mt-4 text-sm">Не удалось запустить: {error}</p>
        ) : (
          <p className="text-muted mt-3 text-sm animate-pulse">Открываю библиотеку…</p>
        )}
      </div>
    </div>
  );
}

function Router() {
  const route = useApp((s) => s.route);
  const parts = route.split('/').filter(Boolean);
  const [a, b, c] = parts;
  if (!a) return <Home />;
  if (a === 'new') return <Create mode={b === 'quick' ? 'quick' : b === 'wizard' ? 'wizard' : undefined} />;
  if (a === 'c' && b && c === 'levelup') return <LevelUp id={b} />;
  if (a === 'c' && b) return <CharacterSheet id={b} tab={c} />;
  if (a === 'campaigns') return <Campaigns />;
  if (a === 'campaign' && b) return <CampaignDetail id={b} />;
  if (a === 'library' && b) return <ItemDetail uid={decodeURIComponent(b)} />;
  if (a === 'library') return <Library />;
  if (a === 'packages') return <Packages />;
  if (a === 'settings') return <Settings />;
  return <Home />;
}

function TabBar() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const lang = useApp((s) => s.lang);
  const tabs = [
    { path: '/', match: (r: string) => r === '/' || r.startsWith('/c/') || r.startsWith('/new'), icon: <Users size={22} />, label: lang === 'en' ? 'Characters' : 'Персонажи' },
    { path: '/campaigns', match: (r: string) => r.startsWith('/campaign'), icon: <Swords size={22} />, label: lang === 'en' ? 'Campaigns' : 'Кампании' },
    { path: '/library', match: (r: string) => r.startsWith('/library') || r.startsWith('/packages'), icon: <BookOpen size={22} />, label: lang === 'en' ? 'Library' : 'Библиотека' },
    { path: '/settings', match: (r: string) => r.startsWith('/settings'), icon: <Cog size={22} />, label: lang === 'en' ? 'Settings' : 'Настройки' },
  ];
  if (/^\/(new|c\/[^/]+\/levelup)/.test(route)) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-ink/95 border-t border-edge backdrop-blur safe-bottom">
      <div className="max-w-xl mx-auto grid grid-cols-4">
        {tabs.map((t) => (
          <button key={t.path} onClick={() => navigate(t.path)} className={cx('flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px]', t.match(route) ? 'text-gold-bright' : 'text-muted')}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function App() {
  const { ready, bootError, boot } = useApp();
  useEffect(() => { void boot(); }, [boot]);
  if (!ready) return <Splash error={bootError} />;
  return (
    <div className="max-w-xl mx-auto min-h-full pb-28">
      <Router />
      <TabBar />
      <Toasts />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
