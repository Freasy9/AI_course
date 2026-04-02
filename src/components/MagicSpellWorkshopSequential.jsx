import { useCallback, useEffect, useRef, useState } from 'react'
import {
  COSTAR_FIELDS,
  generateMagicImageCaptionSentence,
  generateMagicImageFromCaption,
  generateMagicTextCaptionSentence,
  generateMagicTextFromCaption,
  generateSpellStageOutput,
} from '../services/magicSpellService'
import { consumeMagicSpellSync } from '../utils/magicSpellSync'

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

function CostarFieldCard({ field, value, onChange, inputRef }) {
  return (
    <label className="block">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--lab-bg)]"
          style={{ backgroundColor: field.accent }}
          aria-hidden
        >
          {field.letter}
        </span>
        <span className="text-sm font-bold" style={{ color: field.accent }}>
          {field.label}
        </span>
        <span className="text-[11px] text-gray-500">（{field.placeholder}）</span>
      </div>
      <textarea
        ref={inputRef}
        rows={field.key === 'response' ? 3 : 2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded-lg bg-[#071019] px-3 py-2 text-sm text-gray-100 outline-none resize-none transition-all duration-200 focus:-translate-y-[1px]"
        style={{
          border: `1px solid ${field.accent}`,
          boxShadow: `0 0 0 1px ${field.glow}, 0 0 14px ${field.glow}`,
        }}
      />
    </label>
  )
}

const BRANCHES = [
  {
    id: 'text',
    label: '文本生成',
    icon: '✍️',
    sub: 'Story / Text',
    description: '先生成普通文本，再输入进阶咒语并生成。',
  },
  {
    id: 'image',
    label: '图片生成',
    icon: '🖼️',
    sub: 'Image / Vision',
    description: '先生成普通图片，再输入进阶咒语并生成。',
  },
]

function createResultState() {
  return {
    state: 'idle',
    kind: 'text',
    prompt: '',
    text: '',
    imageUrl: '',
    source: '',
    error: '',
    loadPhase: null,
    magicPreviewSentence: '',
  }
}

function inferImageExtension(url) {
  const u = String(url)
  if (u.startsWith('data:image/png')) return 'png'
  if (u.startsWith('data:image/jpeg') || u.startsWith('data:image/jpg')) return 'jpg'
  if (u.startsWith('data:image/svg')) return 'svg'
  if (u.startsWith('data:image/webp')) return 'webp'
  if (u.startsWith('data:image/gif')) return 'gif'
  return 'png'
}

function downloadImageFromUrl(url, filenameBase) {
  const ext = inferImageExtension(url)
  const name = `${filenameBase}.${ext}`
  const trigger = (href) => {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  if (url.startsWith('data:')) {
    trigger(url)
    return
  }
  fetch(url, { mode: 'cors' })
    .then((r) => r.blob())
    .then((blob) => {
      const u = URL.createObjectURL(blob)
      trigger(u)
      URL.revokeObjectURL(u)
    })
    .catch(() => {
      trigger(url)
    })
}

function BranchButton({ branch, active, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onClick(branch.id)}
      disabled={disabled}
      className={`
        min-w-[180px] rounded-xl border-2 px-4 py-3 text-left transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed
        ${active
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
}

function StageCard({ step, title, hint, children, omitHeader }) {
  const heading = [step, title].filter(Boolean).join(' ')
  return (
    <section className="tech-border rounded-xl p-4 sm:p-5 bg-[var(--lab-panel)]/55">
      {!omitHeader && (heading || hint) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            {heading ? (
              <h3 className="text-[var(--lab-cyan)] font-bold text-base sm:text-lg">
                {heading}
              </h3>
            ) : null}
            {hint ? (
              <p className="text-gray-500 text-sm mt-1">{hint}</p>
            ) : null}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

function MagicCaptionBlock({ text, mode = 'image' }) {
  const label =
    mode === 'text'
      ? '进阶文本意图（大模型根据 COSTAR 与普通提示词生成）'
      : '进阶画面描述（大模型根据 COSTAR 与普通提示词生成）'
  return (
    <div className="rounded-xl border border-[var(--lab-cyan)]/45 bg-[rgba(0,245,255,0.06)] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--lab-cyan)] mb-2">{label}</p>
      <p className="text-gray-100 text-base leading-relaxed font-medium">{text}</p>
    </div>
  )
}

function OutputCard({
  branch,
  result,
  imageDownloadBase = 'output',
  magicSequentialOutput = false,
}) {
  if (result.state === 'idle') {
    return (
      <div className="rounded-xl border border-dashed border-[var(--lab-border)] bg-black/20 p-6 text-sm text-gray-500 min-h-[180px] flex items-center justify-center">
        等待生成结果
      </div>
    )
  }

  if (magicSequentialOutput && branch === 'image' && result.state === 'loading') {
    if (result.loadPhase === 'caption') {
      return (
        <div className="rounded-xl border border-[var(--lab-border)] bg-black/25 p-8 min-h-[200px] flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-cyan)] border-t-transparent animate-spin" />
          <p className="text-[var(--lab-cyan)] text-sm text-center max-w-md">
            正在根据 COSTAR 指令与普通提示词，组合生成一句完整的画面描述…
          </p>
        </div>
      )
    }
    if (result.loadPhase === 'image' && result.text) {
      return (
        <div className="grid gap-4">
          <MagicCaptionBlock text={result.text} mode="image" />
          <div className="rounded-xl border border-[var(--lab-border)] bg-black/20 min-h-[280px] flex flex-col items-center justify-center gap-3 py-8">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-green)] border-t-transparent animate-spin" />
            <p className="text-[var(--lab-green)] text-sm font-mono">正在根据上述描述生成图像…</p>
          </div>
        </div>
      )
    }
  }

  if (magicSequentialOutput && branch === 'text' && result.state === 'loading') {
    if (result.loadPhase === 'caption') {
      return (
        <div className="rounded-xl border border-[var(--lab-border)] bg-black/25 p-8 min-h-[200px] flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-cyan)] border-t-transparent animate-spin" />
          <p className="text-[var(--lab-cyan)] text-sm text-center max-w-md">
            正在根据 COSTAR 指令与普通提示词，组合生成一句完整的文本创作意图…
          </p>
        </div>
      )
    }
    if (result.loadPhase === 'body' && result.text) {
      return (
        <div className="grid gap-4">
          <MagicCaptionBlock text={result.text} mode="text" />
          <div className="rounded-xl border border-[var(--lab-border)] bg-black/20 min-h-[200px] flex flex-col items-center justify-center gap-3 py-8">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-green)] border-t-transparent animate-spin" />
            <p className="text-[var(--lab-green)] text-sm font-mono">正在根据上述意图生成故事正文…</p>
          </div>
        </div>
      )
    }
  }

  if (result.state === 'loading') {
    return (
      <div className="rounded-xl border border-[var(--lab-border)] bg-black/25 p-6 min-h-[180px] flex flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--lab-green)] border-t-transparent animate-spin" />
        <p className="text-[var(--lab-green)] text-sm font-mono spell-typewriter-cursor">正在解析咒语...</p>
      </div>
    )
  }

  if (branch === 'image' && magicSequentialOutput && result.state === 'ready') {
    const canDownload = Boolean(result.imageUrl)
    return (
      <div className="grid gap-4">
        {result.text ? <MagicCaptionBlock text={result.text} mode="image" /> : null}
        <div className="relative rounded-xl border border-[var(--lab-border)] bg-black/25 overflow-hidden min-h-[260px] group">
          {canDownload ? (
            <button
              type="button"
              onClick={() => downloadImageFromUrl(result.imageUrl, imageDownloadBase)}
              className="absolute top-2 right-2 z-10 rounded-lg bg-black/65 hover:bg-black/80 backdrop-blur-sm border border-white/20 text-white text-xs font-bold px-3 py-1.5 shadow-lg transition-colors"
            >
              下载图片
            </button>
          ) : null}
          {result.imageUrl ? (
            <img
              src={result.imageUrl}
              alt="进阶阶段生成图像"
              className="block w-full h-[320px] object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center gap-2 text-gray-500 text-sm px-4 text-center">
              <p>未能生成图片</p>
              {result.error ? <p className="text-xs text-red-400/90">{result.error}</p> : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (branch === 'text' && magicSequentialOutput && result.state === 'ready') {
    return (
      <div className="grid gap-4">
        {result.magicPreviewSentence ? (
          <MagicCaptionBlock text={result.magicPreviewSentence} mode="text" />
        ) : null}
        <div className="rounded-xl border border-[var(--lab-border)] bg-black/25 p-5 min-h-[180px]">
          <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-100 font-mono">
            {result.text || (result.error ? '' : '暂无文本结果')}
          </pre>
          {result.error && !result.text ? (
            <p className="text-sm text-red-400/90 mt-2">{result.error}</p>
          ) : null}
        </div>
      </div>
    )
  }

  if (branch === 'image') {
    const canDownload = Boolean(result.imageUrl)
    return (
      <div className="relative rounded-xl border border-[var(--lab-border)] bg-black/25 overflow-hidden min-h-[260px] group">
        {canDownload ? (
          <button
            type="button"
            onClick={() => downloadImageFromUrl(result.imageUrl, imageDownloadBase)}
            className="absolute top-2 right-2 z-10 rounded-lg bg-black/65 hover:bg-black/80 backdrop-blur-sm border border-white/20 text-white text-xs font-bold px-3 py-1.5 shadow-lg transition-colors"
          >
            下载图片
          </button>
        ) : null}
        {result.imageUrl ? (
          <img
            src={result.imageUrl}
            alt="生成结果"
            className="block w-full h-[320px] object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="min-h-[320px] flex items-center justify-center text-gray-500 text-sm">
            暂无图片结果
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--lab-border)] bg-black/25 p-5 min-h-[180px]">
      <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-100 font-mono">
        {result.text || '暂无文本结果'}
      </pre>
    </div>
  )
}

export default function MagicSpellWorkshopSequential() {
  const [activeBranch, setActiveBranch] = useState('text')
  const [commonPrompt, setCommonPrompt] = useState('')
  const [commonResult, setCommonResult] = useState(createResultState)
  const [costar, setCostar] = useState(createCostarState)
  const [magicResult, setMagicResult] = useState(createResultState)
  const [loadingPhase, setLoadingPhase] = useState('')
  const [typedStatus, setTypedStatus] = useState('')
  const [particles, setParticles] = useState([])
  const [syncBanner, setSyncBanner] = useState('')

  const particleTimerRef = useRef(null)
  const typingTimerRef = useRef(null)
  const firstCostarRef = useRef(null)

  const activeBranchConfig = BRANCHES.find((branch) => branch.id === activeBranch) || BRANCHES[0]
  const showMagicStage = commonResult.state === 'ready'

  const updateCostar = useCallback((key, value) => {
    setCostar((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    setCommonResult(createResultState())
    setMagicResult(createResultState())
    setCostar(createCostarState())
    setLoadingPhase('')
    setTypedStatus('')
  }, [activeBranch])

  /** 从 COSTAR 提示词实验室「同步并打开」一次性注入表单（须声明在 activeBranch 重置 effect 之后，避免先写入再被清空） */
  useEffect(() => {
    const sync = consumeMagicSpellSync()
    if (!sync) return
    const co = sync.costar && typeof sync.costar === 'object' ? sync.costar : {}
    setActiveBranch('text')
    setCommonPrompt(sync.commonPrompt || '')
    setCostar((prev) => ({
      ...prev,
      ...Object.fromEntries(
        COSTAR_FIELDS.map((f) => [f.key, String(co[f.key] ?? prev[f.key] ?? '')]),
      ),
    }))
    setCommonResult(createResultState())
    setMagicResult(createResultState())
    setSyncBanner('已从「COSTAR 提示词」同步普通提示词与六维，请先生成普通输出再执行进阶生成。')
    const t = window.setTimeout(() => setSyncBanner(''), 8000)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!showMagicStage) return
    const id = window.setTimeout(() => {
      firstCostarRef.current?.focus()
    }, 80)
    return () => window.clearTimeout(id)
  }, [showMagicStage])

  useEffect(() => {
    if (!loadingPhase) {
      setTypedStatus('')
      return undefined
    }

    const target = loadingPhase
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
    }, 60)

    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [loadingPhase])

  useEffect(() => {
    return () => {
      if (particleTimerRef.current) window.clearTimeout(particleTimerRef.current)
      if (typingTimerRef.current) window.clearInterval(typingTimerRef.current)
    }
  }, [])

  const triggerParticles = useCallback(() => {
    const now = Date.now()
    const next = Array.from({ length: 24 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 24 + Math.random() * 0.15
      const distance = 88 + Math.random() * 72
      const hue = (index * 37) % 360
      return {
        id: `${now}-${index}`,
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        color: `hsl(${hue}, 95%, 68%)`,
        delay: `${Math.random() * 80}ms`,
      }
    })

    setParticles(next)
    if (particleTimerRef.current) window.clearTimeout(particleTimerRef.current)
    particleTimerRef.current = window.setTimeout(() => setParticles([]), 900)
  }, [])

  const handleGenerateCommon = useCallback(async () => {
    const prompt = commonPrompt.trim()
    if (!prompt) return

    triggerParticles()
    setLoadingPhase(activeBranch === 'image' ? '普通图像生成中...' : '普通文本生成中...')
    setCommonResult({
      ...createResultState(),
      state: 'loading',
      kind: activeBranch,
      prompt,
    })
    setMagicResult(createResultState())
    setCostar(createCostarState())
    try {
      const result = await generateSpellStageOutput({ branch: activeBranch, prompt })
      setCommonResult({
        state: 'ready',
        kind: activeBranch,
        prompt: result.prompt || prompt,
        text: result.text || '',
        imageUrl: result.imageUrl || '',
        source: result.source || '',
        error: result.error || '',
      })
    } catch (error) {
      setCommonResult({
        state: 'ready',
        kind: activeBranch,
        prompt,
        text: activeBranch === 'text' ? prompt : '',
        imageUrl: activeBranch === 'image' ? '' : '',
        source: 'local',
        error: error?.message || '普通咒语生成失败',
      })
    } finally {
      setLoadingPhase('')
    }
  }, [activeBranch, commonPrompt, triggerParticles])

  const handleCastMagic = useCallback(async () => {
    triggerParticles()

    if (activeBranch === 'image') {
      let caption = ''
      setLoadingPhase('正在生成进阶画面描述...')
      setMagicResult({
        ...createResultState(),
        state: 'loading',
        kind: 'image',
        loadPhase: 'caption',
      })
      try {
        caption = await generateMagicImageCaptionSentence({ commonPrompt, costar })
        setMagicResult({
          ...createResultState(),
          state: 'loading',
          kind: 'image',
          loadPhase: 'image',
          text: caption,
        })
        setLoadingPhase('正在根据描述生成图像...')
        const { imageUrl, source, error } = await generateMagicImageFromCaption({
          caption,
          commonPrompt,
          costar,
        })
        setMagicResult({
          state: 'ready',
          kind: 'image',
          prompt: '',
          text: caption,
          imageUrl: imageUrl || '',
          source: source || 'local',
          error: error || '',
          loadPhase: null,
        })
      } catch (error) {
        setMagicResult({
          state: 'ready',
          kind: 'image',
          prompt: '',
          text: caption,
          imageUrl: '',
          source: 'local',
          error: error?.message || '进阶图像生成失败',
          loadPhase: null,
        })
      } finally {
        setLoadingPhase('')
      }
      return
    }

    let textCaption = ''
    setLoadingPhase('正在生成进阶文本意图...')
    setMagicResult({
      ...createResultState(),
      state: 'loading',
      kind: 'text',
      loadPhase: 'caption',
    })
    try {
      textCaption = await generateMagicTextCaptionSentence({ commonPrompt, costar })
      setMagicResult({
        ...createResultState(),
        state: 'loading',
        kind: 'text',
        loadPhase: 'body',
        text: textCaption,
      })
      setLoadingPhase('正在根据意图生成正文...')
      const { text, source, error } = await generateMagicTextFromCaption({
        caption: textCaption,
        commonPrompt,
        costar,
      })
      setMagicResult({
        state: 'ready',
        kind: 'text',
        prompt: '',
        text: text || '',
        imageUrl: '',
        source: source || 'local',
        error: error || '',
        loadPhase: null,
        magicPreviewSentence: textCaption,
      })
    } catch (error) {
      setMagicResult({
        state: 'ready',
        kind: 'text',
        prompt: '',
        text: '',
        imageUrl: '',
        source: 'local',
        error: error?.message || '进阶输出失败',
        loadPhase: null,
        magicPreviewSentence: textCaption,
      })
    } finally {
      setLoadingPhase('')
    }
  }, [activeBranch, commonPrompt, costar, triggerParticles])

  const topStatus = loadingPhase ? typedStatus || loadingPhase : '等待开始'
  const commonButtonLabel = activeBranch === 'image' ? '生成普通图像' : '生成普通文本'
  const magicButtonLabel = activeBranch === 'image' ? '生成进阶图像' : '生成进阶文本'

  return (
    <div className="space-y-5">
      {syncBanner && (
        <div className="rounded-xl border border-[var(--lab-green)]/50 bg-[rgba(57,255,20,0.08)] px-4 py-3 text-sm text-[var(--lab-green)]">
          {syncBanner}
        </div>
      )}
      <StageCard omitHeader>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <div>
            <h4 className="text-[var(--lab-cyan)] font-bold text-lg">COSTAR 创作工坊</h4>
            <p className="text-gray-400 text-sm mt-1">先选择文本或图片，再依次完成普通咒语与进阶咒语流程。</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Status</p>
            <p className="text-sm font-mono text-[var(--lab-green)]">{topStatus}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {BRANCHES.map((branch) => (
            <BranchButton
              key={branch.id}
              branch={branch}
              active={activeBranch === branch.id}
              onClick={(id) => setActiveBranch(id)}
              disabled={Boolean(loadingPhase)}
            />
          ))}
        </div>
      </StageCard>

      <StageCard
        title="普通提示词"
        hint="先输入普通咒语，生成普通输出后，下一步才会出现进阶咒语输入栏。"
      >
        <div className="grid gap-4">
          <textarea
            value={commonPrompt}
            onChange={(event) => setCommonPrompt(event.target.value)}
            placeholder={activeBranch === 'image' ? '输入普通图片咒语，例如：一只小狗在霓虹梦境中奔跑' : '输入普通文本咒语，例如：写一个关于勇气的小故事'}
            className="w-full min-h-[148px] rounded-lg bg-[var(--lab-bg)] px-4 py-3 text-sm text-gray-100 outline-none resize-none transition-all duration-200"
            style={{
              border: '1px solid rgba(0, 245, 255, 0.45)',
              boxShadow: '0 0 0 1px rgba(0, 245, 255, 0.18), 0 0 18px rgba(0, 245, 255, 0.12)',
            }}
          />

          <div className="relative inline-flex self-start">
            <button
              type="button"
              onClick={handleGenerateCommon}
              disabled={!commonPrompt.trim() || Boolean(loadingPhase)}
              className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] px-5 py-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_18px_rgba(57,255,20,0.24)]"
            >
              {commonButtonLabel}
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

          <OutputCard
            branch={activeBranch}
            result={commonResult}
            imageDownloadBase="创作工坊-普通输出"
          />
        </div>
      </StageCard>

      {showMagicStage && (
        <StageCard
          step="第三步"
          title="进阶咒语（COSTAR）"
          hint="按 COSTAR 六维填写（均可留空）；会与上方「普通提示词」一起拼装为最终咒语后用于进阶生成。"
        >
          <div className="grid gap-4">
            <div className="rounded-xl border border-[rgba(57,255,20,0.35)] bg-[#071019]/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-[var(--lab-green)] font-bold text-sm">COSTAR 六维</h4>
                <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500">
                  Context · Objective · Style · Tone · Audience · Response
                </span>
              </div>
              {COSTAR_FIELDS.map((field, index) => (
                <CostarFieldCard
                  key={field.key}
                  field={field}
                  value={costar[field.key]}
                  onChange={(v) => updateCostar(field.key, v)}
                  inputRef={index === 0 ? firstCostarRef : undefined}
                />
              ))}
            </div>

            <div className="relative inline-flex self-start">
              <button
                type="button"
                onClick={handleCastMagic}
                disabled={Boolean(loadingPhase)}
                className="rounded-xl bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-5 py-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_18px_rgba(0,245,255,0.24)]"
              >
                {magicButtonLabel}
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
        </StageCard>
      )}

      {showMagicStage && (
        <StageCard
          step="第四步"
          title="进阶输出"
          hint="进阶生成后：先展示大模型根据 COSTAR 与普通提示词生成的一句概括（画面描述或文本意图），再展示据此生成的图像或故事正文。"
        >
          <OutputCard
            branch={activeBranch}
            result={magicResult}
            imageDownloadBase="创作工坊-进阶输出"
            magicSequentialOutput
          />
        </StageCard>
      )}
    </div>
  )
}
