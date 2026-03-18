const TABS = [
  { id: 'magic', label: '魔法咒语工坊', icon: '🪄', sub: 'COSTAR Spell Forge' },
  { id: 'vision', label: '视觉探测器', icon: '📷', sub: 'Vision Explorer' },
  { id: 'audio', label: '频率监听阵列', icon: '🎤', sub: 'Audio Array' },
  { id: 'wiki', label: '百科解码器', icon: '📖', sub: 'Wiki Decoder (RAG)' },
  { id: 'game', label: '机甲模拟训练', icon: '🎮', sub: 'AI Game Lab' },
]

export default function TabNav({ activeId, onSelect }) {
  return (
    <nav className="flex flex-col gap-1 p-2 sm:p-3" aria-label="实验室模块">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`
            flex items-center gap-3 w-full min-h-[64px] sm:min-h-[72px] px-4 sm:px-5 py-3 sm:py-4
            rounded-lg border-2 text-left transition-all duration-200 touch-manipulation
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lab-bg)]
            active:scale-[0.98]
            ${activeId === tab.id
              ? 'bg-[rgba(0,245,255,0.12)] border-[var(--lab-cyan)] text-[var(--lab-cyan)] shadow-[0_0_20px_rgba(0,245,255,0.2)]'
              : 'bg-[var(--lab-panel)] border-[var(--lab-border)] text-gray-300 hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)]'
            }
          `}
        >
          <span className="text-2xl sm:text-3xl" aria-hidden>{tab.icon}</span>
          <div className="flex flex-col">
            <span className="font-bold text-base sm:text-lg">{tab.label}</span>
            <span className="text-xs sm:text-sm opacity-70">{tab.sub}</span>
          </div>
        </button>
      ))}
    </nav>
  )
}

export { TABS }
