export default function BottomNav({ tabs, active, onChange }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/20 bg-night-850/95
                 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition
                          ${isActive ? 'text-gold' : 'text-silver'}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
