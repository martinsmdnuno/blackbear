import { Skull } from 'lucide-react';

export default function Sidebar({ tabs, active, onChange }) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-night-700/60 md:bg-night-900">
      <div className="flex items-center gap-3 px-5 py-6">
        <Skull size={30} className="text-gold" />
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-100">BlackBeard</h1>
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Media Helm</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition
                          ${
                            isActive
                              ? 'bg-gold/15 text-gold'
                              : 'text-slate-400 hover:bg-night-800 hover:text-slate-200'
                          }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
