export default function Sidebar({ tabs, active, onChange }) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-gold/20 md:bg-night-850">
      <div className="flex items-center gap-3 px-5 py-6">
        <img
          src="/blackbear-logo.png"
          alt="Blackbear"
          className="h-11 w-11 rounded-lg object-cover ring-1 ring-gold/30"
        />
        <div>
          <h1 className="font-display text-2xl leading-none text-parchment">Blackbear</h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-silver">
            Home Server Download Manager
          </p>
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
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition
                          ${
                            isActive
                              ? 'bg-gold/15 text-gold'
                              : 'text-silver hover:bg-night-800 hover:text-parchment'
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
