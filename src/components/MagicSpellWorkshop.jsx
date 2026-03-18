import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  COSTAR_FIELDS,
  buildMagicSpellPrompt,
  generateImageSpellComparison,
  generateTextSpellComparison,
} from '../services/magicSpellService'

function createCostarState() {
  return {
    context: '',
    objective: '',
    style: '',
    tone: '',
    audience: '',
    response: '',
  }
}

function createEmptyEntry(prompt = '') {
  return {
    state: 'idle',
    prompt,
    text: '',
    imageUrl: '',
    source: '',
    error: '',
  }
}

function createIdleComparison(commonPrompt = '', magicPrompt = '') {
  return {
    common: createEmptyEntry(commonPrompt),
    magic: createEmptyEntry(magicPrompt),
  }
}

function createLoadingComparison(commonPrompt = '', magicPrompt = '') {
  return {
    common: { ...createEmptyEntry(commonPrompt), state: 'loading' },
    magic: { ...createEmptyEntry(magicPrompt), state: 'loading' },
  }
}

function toEntry(result, prompt) {
  return {
    state: 'ready',
    prompt,
    text: result?.text || '',
    imageUrl: result?.imageUrl || '',
    source: result?.source || 'api',
    error: result?.error || '',
  }
}

const BRANCHES = [
  {
    id: 'text',
    label: '文本生成',
    icon: '✍️',
    sub: 'Story / Text',
    resultTitle: '文本生成',
    resultIcon: '📜',
    description: '将普通咒语与魔法咒语转成故事/文本结果，并对比展示。',
    kind: 'story',
  },
  {
    id: 'image',
    label: '图片生成',
    icon: '🖼️',
    sub: 'Image / Vision',
    resultTitle: '图片生成',
    resultIcon: '🎨',
    description: '将普通咒语与魔法咒语转成幻境图像结果，并对比展示。',
    kind: 'image',
  },
]

function FieldCard({ field, value, onChange }) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-[var(--lab-bg)]"
          style={{ backgroundColor: field.accent }}
          aria-hidden
        >
          {field.letter}
        </span>
        <span className="text-sm font-bold" style={{ color: field.accent }}>
          {field.label}
        </span>
      </div>
      <textarea
        rows={field.key === 'response' ? 3 : 2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded-lg bg-[var(--lab-bg)] px-3 py-2 text-sm text-gray-100 outline-none resize-none transition-all duration-200 focus:-translate-y-[1px]"
        style={{
          border: `1px solid ${field.accent}`,
          boxShadow: `0 0 0 1px ${field.glow}, 0 0 16px ${field.glow}`,
        }}
      />
    </label>
  )
}

function ResultWindow({ title, icon, entry, kind }) {
  const isLoading = entry.state === 'loading'
  const isReady = entry.state === 'ready'
  const hasImage = Boolean(entry.imageUrl)

  return (
    <div className="tech-border rounded-xl bg-[var(--lab-bg)]/85 p-4 h-full flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[var(--lab-cyan)] font-bold text-sm sm:text-base">{icon} {title}</h4>
          <p className="text-[11px] text-gray-500 mt-1">
            {entry.source === 'local'
              ? '本地回退结果'
              : entry.source === 'xai'
                ? 'xAI 返回结果'
                : isLoading
                  ? '等待接口响应'
                  : isReady
                    ? '接口返回结果'
                    : '等待施放'}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.3em] px-2 py-1 rounded-full border border-[var(--lab-border)] text-gray-400">
          {kind}
        </span>
      </div>

      {kind !== 'image' && (
        <div className="rounded-lg border border-[var(--lab-border)] bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--lab-green)] mb-2">Prompt</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-6 min-h-[72px]">
            {entry.prompt || '等待施法后填充'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 rounded-lg border border-[var(--lab-border)] bg-black/30 p-4 flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-green)] border-t-transparent animate-spin" />
          <p className="text-[var(--lab-green)] text-sm font-mono spell-typewriter-cursor">
            正在解析咒语...
          </p>
        </div>
      ) : kind === 'image' ? (
        <div className="flex-1 flex flex-col">
          {hasImage ? (
            <div className="rounded-lg overflow-hidden border border-[var(--lab-border)] bg-black/40 h-full">
              <img
                src={entry.imageUrl}
                alt={title}
                className="block w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="flex-1 rounded-lg border border-[var(--lab-border)] bg-black/30 p-4 flex items-center justify-center text-gray-500 text-sm">
              暂无图像结果
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 rounded-lg border border-[var(--lab-border)] bg-black/30 p-4">
          <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--lab-green)] mb-2">生成文本</p>
          <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-100 font-mono">
            {entry.text || '暂未生成内容'}
          </pre>
        </div>
      )}

      {entry.error ? (
        <p className="text-xs text-rose-400">提示：{entry.error}</p>
      ) : null}
    </div>
  )
}

export default function MagicSpellWorkshop() {
  const [activeBranch, setActiveBranch] = useState('text')
  const [commonPrompt, setCommonPrompt] = useState('')
  const [costar, setCostar] = useState(createCostarState)
  const [textComparison, setTextComparison] = useState(() => createIdleComparison())
  const [imageComparison, setImageComparison] = useState(() => createIdleComparison())
  const [isCasting, setIsCasting] = useState(false)
  const [parseBanner, setParseBanner] = useState(false)
  const [typedStatus, setTypedStatus] = useState('')
  const [particles, setParticles] = useState([])

  const particleTimerRef = useRef(null)
  const parseTimerRef = useRef(null)
  const typingTimerRef = useRef(null)

  const activeBranchConfig = useMemo(
    () => BRANCHES.find((branch) => branch.id === activeBranch) || BRANCHES[0],
    [activeBranch],
  )

  const finalMagicSpell = useMemo(
    () => buildMagicSpellPrompt(commonPrompt, costar),
    [
      commonPrompt,
      costar.context,
      costar.objective,
      costar.style,
      costar.tone,
      costar.audience,
      costar.response,
    ],
  )

  const activeComparison = activeBranch === 'text' ? textComparison : imageComparison

  useEffect(() => {
    if (!parseBanner) {
      setTypedStatus('')
      return undefined
    }

    const target = '正在解析咒语...'
    let index = 0
    setTypedStatus('')
    if (typingTimerRef.current) window.clearInterval(typingTimerRef.current)
    typingTimerRef.current = window.setInterval(() => {
      index += 1
      setTypedStatus(target.slice(0, index))
      if (index >= target.length && typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }, 70)

    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [parseBanner])

  useEffect(() => {
    return () => {
      if (particleTimerRef.current) window.clearTimeout(particleTimerRef.current)
      if (parseTimerRef.current) window.clearTimeout(parseTimerRef.current)
      if (typingTimerRef.current) window.clearInterval(typingTimerRef.current)
    }
  }, [])

  const triggerParticles = useCallback(() => {
    const now = Date.now()
    const count = 24
    const next = Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.18
      const distance = 90 + Math.random() * 80
      const color = COSTAR_FIELDS[index % COSTAR_FIELDS.length].accent
      return {
        id: `${now}-${index}`,
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        color,
        delay: `${Math.random() * 80}ms`,
      }
    })

    setParticles(next)
    if (particleTimerRef.current) window.clearTimeout(particleTimerRef.current)
    particleTimerRef.current = window.setTimeout(() => setParticles([]), 900)
  }, [])

  const updateCostar = useCallback((key, value) => {
    setCostar((prev) => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const handleBranchSelect = useCallback((branchId) => {
    if (isCasting) return
    setActiveBranch(branchId)
    setParseBanner(false)
  }, [isCasting])

  const handleCastMagic = useCallback(async () => {
    const trimmedCommon = commonPrompt.trim()
    const trimmedMagic = finalMagicSpell.trim()
    if (!trimmedCommon && !trimmedMagic) return

    const branchId = activeBranch
    const setComparison = branchId === 'text' ? setTextComparison : setImageComparison
    const generator = branchId === 'text' ? generateTextSpellComparison : generateImageSpellComparison

    triggerParticles()
    setIsCasting(true)
    setParseBanner(true)
    setComparison(createLoadingComparison(trimmedCommon, trimmedMagic))

    try {
      const comparison = await generator({
        commonPrompt: trimmedCommon,
        finalSpell: trimmedMagic,
        costar,
      })

      setComparison({
        common: toEntry(comparison.common, trimmedCommon),
        magic: toEntry(comparison.magic, trimmedMagic),
      })
    } catch (error) {
      const message = error?.message || '咒语解析失败'
      setComparison({
        common: { ...createEmptyEntry(trimmedCommon), state: 'ready', text: message, source: 'local', error: message },
        magic: { ...createEmptyEntry(trimmedMagic), state: 'ready', text: message, source: 'local', error: message },
      })
    } finally {
      setIsCasting(false)
      if (parseTimerRef.current) window.clearTimeout(parseTimerRef.current)
      parseTimerRef.current = window.setTimeout(() => {
        setParseBanner(false)
      }, 900)
    }
  }, [activeBranch, commonPrompt, costar, finalMagicSpell, triggerParticles])

  const hasSpell = Boolean(commonPrompt.trim() || finalMagicSpell.trim())
  const branchKindLabel = activeBranchConfig.kind === 'story' ? 'story' : 'image'
  const castLabel = activeBranch === 'text' ? '施放文本魔法' : '施放图像魔法'
  const parserLabel = activeBranch === 'text' ? '文本解析器' : '图像解析器'

  return (
    <div className="space-y-6">
      <section className="tech-border rounded-xl p-4 sm:p-5 bg-[var(--lab-panel)]/60 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[var(--lab-cyan)] font-bold text-lg sm:text-xl">魔法核心输入</h3>
            <p className="text-gray-400 text-sm mt-1">{activeBranchConfig.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">{parserLabel}</p>
              <p className={`text-sm font-mono ${parseBanner ? 'text-[var(--lab-green)]' : 'text-gray-400'}`}>
                {parseBanner ? typedStatus || '正在解析咒语...' : '等待施放'}
              </p>
            </div>
            <div className="relative inline-flex">
              <button
                type="button"
                onClick={handleCastMagic}
                disabled={!hasSpell || isCasting}
                className="relative overflow-hidden rounded-xl px-6 py-3 font-bold text-[var(--lab-bg)] bg-[var(--lab-green)] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_18px_rgba(57,255,20,0.24)]"
              >
                {isCasting ? '施法中...' : castLabel}
              </button>

              <div className="pointer-events-none absolute inset-0">
                {particles.map((particle) => (
                  <span
                    key={particle.id}
                    className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full animate-spell-burst"
                    style={{
                      ['--spell-dx']: particle.dx,
                      ['--spell-dy']: particle.dy,
                      backgroundColor: particle.color,
                      animationDelay: particle.delay,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {BRANCHES.map((branch) => {
            const selected = activeBranch === branch.id
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => handleBranchSelect(branch.id)}
                disabled={isCasting}
                className={`
                  min-w-[180px] rounded-xl border-2 px-4 py-3 text-left transition-all duration-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${selected
                    ? 'bg-[rgba(0,245,255,0.14)] border-[var(--lab-cyan)] text-[var(--lab-cyan)] shadow-[0_0_20px_rgba(0,245,255,0.18)]'
                    : 'bg-[var(--lab-bg)]/70 border-[var(--lab-border)] text-gray-300 hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)]'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>{branch.icon}</span>
                  <div>
                    <div className="font-bold text-base">{branch.label}</div>
                    <div className="text-[11px] opacity-70">{branch.sub}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="tech-border rounded-xl p-4 bg-[var(--lab-bg)]/70 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[var(--lab-cyan)] font-bold text-sm">普通咒语 (Common Prompt)</h4>
              <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Base</span>
            </div>
            <textarea
              value={commonPrompt}
              onChange={(event) => setCommonPrompt(event.target.value)}
              placeholder="输入最原始、最直白的需求。"
              className="flex-1 min-h-[220px] rounded-lg bg-[var(--lab-bg)] px-4 py-3 text-sm text-gray-100 outline-none resize-none transition-all duration-200"
              style={{
                border: '1px solid rgba(0, 245, 255, 0.45)',
                boxShadow: '0 0 0 1px rgba(0, 245, 255, 0.18), 0 0 18px rgba(0, 245, 255, 0.12)',
              }}
            />
          </div>

          <div className="tech-border rounded-xl p-4 bg-[var(--lab-bg)]/70 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-[var(--lab-cyan)] font-bold text-sm">COSTAR 魔法器</h4>
                <p className="text-[11px] text-gray-500 mt-1">六维提示实时拼装 Final Magic Spell</p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">COSTAR</span>
            </div>
            <div className="space-y-3">
              {COSTAR_FIELDS.map((field) => (
                <FieldCard
                  key={field.key}
                  field={field}
                  value={costar[field.key]}
                  onChange={(value) => updateCostar(field.key, value)}
                />
              ))}
            </div>
          </div>

        </div>
      </section>

      <section className="tech-border rounded-xl p-4 sm:p-5 bg-[var(--lab-panel)]/55">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[var(--lab-cyan)] font-bold text-base sm:text-lg">
              {activeBranchConfig.resultIcon} {activeBranchConfig.resultTitle}
            </h3>
            <p className="text-gray-500 text-sm mt-1">
              当前只展示 {activeBranchConfig.label} 分支，仍然对比普通咒语和魔法咒语的结果。
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">{branchKindLabel}</span>
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          <ResultWindow
            title="普通咒语"
            icon={activeBranchConfig.resultIcon}
            entry={activeComparison.common}
            kind={activeBranchConfig.kind}
          />
          <ResultWindow
            title="魔法咒语"
            icon="✨"
            entry={activeComparison.magic}
            kind={activeBranchConfig.kind}
          />
        </div>
      </section>
    </div>
  )
}

