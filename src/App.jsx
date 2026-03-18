import { useState, useCallback } from 'react'
import StatusBar from './components/StatusBar'
import TabNav from './components/TabNav'
import MainContent from './components/MainContent'
import { TabSwitchProvider } from './contexts/TabSwitchContext'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('magic')

  const handleTabSelect = useCallback((id) => {
    if (id === activeTab) return
    setActiveTab(id)
  }, [activeTab])

  return (
    <div className="grid-bg min-h-screen flex flex-col">
      <div className="scanlines" aria-hidden />
      <StatusBar />
      <TabSwitchProvider switchToTab={setActiveTab}>
        <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
          <aside className="w-52 sm:w-64 md:w-72 flex-shrink-0 border-r-2 border-[var(--lab-border)] bg-[var(--lab-panel)] flex flex-col overflow-hidden shadow-[2px_0_12px_rgba(0,245,255,0.08)]">
            <TabNav activeId={activeTab} onSelect={handleTabSelect} />
          </aside>
          <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-auto">
            <MainContent activeId={activeTab} />
          </div>
        </div>
      </TabSwitchProvider>
    </div>
  )
}
