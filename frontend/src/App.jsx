import { useState } from 'react';
import { Telescope, Sailboat, Anchor } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import SearchTab from './components/SearchTab.jsx';
import DownloadsTab from './components/DownloadsTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';

const TABS = [
  { id: 'add', label: 'Add', icon: Telescope },
  { id: 'downloads', label: 'Downloads', icon: Sailboat },
  { id: 'settings', label: 'Settings', icon: Anchor }
];

const TITLES = {
  add: 'Add Movies & Series',
  downloads: 'Downloads',
  settings: 'Settings & Diagnostics'
};

export default function App() {
  const [active, setActive] = useState('add');

  return (
    <div className="flex min-h-screen bg-night-900">
      <Sidebar tabs={TABS} active={active} onChange={setActive} />

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gold/20 bg-night-850/95 px-4 py-3 backdrop-blur md:hidden">
          <img
            src="/blackbear-logo.png"
            alt="Blackbear"
            className="h-9 w-9 rounded-md object-cover ring-1 ring-gold/30"
          />
          <span className="font-display text-2xl leading-none text-parchment">Blackbear</span>
          <span className="ml-auto text-xs text-silver">{TITLES[active]}</span>
        </header>

        {/* Desktop header */}
        <header className="hidden border-b border-gold/20 px-8 py-5 md:block">
          <h2 className="font-display text-2xl text-parchment">{TITLES[active]}</h2>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
          <div key={active} className="mx-auto max-w-3xl animate-fade-in">
            {active === 'add' && <SearchTab />}
            {active === 'downloads' && <DownloadsTab />}
            {active === 'settings' && <SettingsTab />}
          </div>
        </main>
      </div>

      <BottomNav tabs={TABS} active={active} onChange={setActive} />
    </div>
  );
}
