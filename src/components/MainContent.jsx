import { useState, useEffect } from 'react'
import { TABS } from './TabNav'
import VisionExplorer from './VisionExplorer'
import WikiDecoder from './WikiDecoder'
import AudioArray from './AudioArray'
import GameLab from './GameLab'
import MagicSpellWorkshopSequential from './MagicSpellWorkshopSequential'
import ErrorBoundary from './ErrorBoundary'

function LoadingOverlay({ show }) {
  if (!show) return null
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--lab-bg)]/90 z-10 rounded-lg animate-fade-in-up">
      <div className="w-10 h-10 border-2 border-[var(--lab-cyan)] border-t-transparent rounded-full animate-spin" />
      <p className="mt-3 text-[var(--lab-cyan)] text-sm font-mono">
        系统加载中<span className="inline-block w-4 text-left animate-pulse">...</span>
      </p>
    </div>
  )
}

function Panel({ id, label, icon, sub, children }) {
  return (
    <div className="p-4 sm:p-6 md:p-8 h-full flex flex-col">
      <div className="mb-4 sm:mb-6">
        <span className="text-3xl sm:text-4xl mr-2" aria-hidden>{icon}</span>
        <h2 className="inline-block text-xl sm:text-2xl font-bold text-[var(--lab-cyan)]">{label}</h2>
        <p className="text-sm text-gray-400 mt-1">{sub}</p>
      </div>
      <div className="flex-1 tech-border rounded-lg p-4 sm:p-6 bg-[var(--lab-panel)]/50 corner-tl corner-br relative overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default function MainContent({ activeId }) {
  const [showLoading, setShowLoading] = useState(false)
  const [displayId, setDisplayId] = useState(activeId)

  useEffect(() => {
    if (activeId !== displayId) {
      setShowLoading(true)
      const t = setTimeout(() => {
        setDisplayId(activeId)
        setShowLoading(false)
      }, 600)
      return () => clearTimeout(t)
    }
  }, [activeId, displayId])

  const tab = TABS.find((t) => t.id === displayId) || TABS[0]

  return (
    <main className="flex-1 min-h-0 relative tech-border rounded-lg overflow-hidden bg-[var(--lab-panel)]">
      <LoadingOverlay show={showLoading} />
      <Panel id={tab.id} label={tab.label} icon={tab.icon} sub={tab.sub}>
        {tab.id === 'magic' && (
          <ErrorBoundary>
            <MagicSpellWorkshopSequential />
          </ErrorBoundary>
        )}
        {tab.id === 'vision' && (
          <VisionExplorer />
        )}
        {tab.id === 'wiki' && (
          <WikiDecoder />
        )}
        {tab.id === 'audio' && (
          <ErrorBoundary>
            <AudioArray />
          </ErrorBoundary>
        )}
        {tab.id === 'game' && (
          <ErrorBoundary>
            <GameLab />
          </ErrorBoundary>
        )}
      </Panel>
    </main>
  )
}
