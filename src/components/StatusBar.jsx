import { useState, useEffect } from 'react'

export default function StatusBar() {
  const [time, setTime] = useState('--:--:--')
  const [load, setLoad] = useState(0)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('zh-CN', { hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setLoad((prev) => (prev >= 100 ? 0 : prev + Math.random() * 8 + 2))
    }, 800)
    return () => clearInterval(interval)
  }, [])

  const loadPercent = Math.min(100, Math.round(load))

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 tech-border tech-border-green bg-[var(--lab-panel)] border-b-2 border-[rgba(57,255,20,0.5)]">
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="inline-block w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[var(--lab-green)] animate-pulse-glow shadow-[0_0_8px_var(--lab-green)]" />
        <span className="text-[var(--lab-green)] font-bold text-sm sm:text-base tracking-wider">
          实验室在线
        </span>
      </div>
      <div className="flex items-center gap-4 sm:gap-8 text-xs sm:text-sm text-[var(--lab-cyan)]">
        <span className="tabular-nums">{time}</span>
        <span className="hidden sm:inline">|</span>
        <span className="flex items-center gap-2">
          <span className="text-gray-400">AI 核心负载</span>
          <span className="tabular-nums font-mono text-[var(--lab-green)]">{loadPercent}%</span>
        </span>
      </div>
    </header>
  )
}
