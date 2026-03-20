/**
 * 视觉探测器 - 参考 little-ai-detective 四步流程：创建类别 → 收集样本 → 训练模型 → 测试 AI
 * 使用 MobileNet + 自定义头（transferLearning），实验室深色风格
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { trainHead, predict, disposeModels } from '../ml/transferLearning'
import { useVisionModelOptional } from '../contexts/VisionModelContext'

const STEPS = [
  { id: 1, title: '创建类别', emoji: '🏷️' },
  { id: 2, title: '收集样本', emoji: '📷' },
  { id: 3, title: '训练模型', emoji: '🧠' },
  { id: 4, title: '测试 AI', emoji: '🔍' },
]

const MIN_CATEGORIES = 2
const MAX_CATEGORIES = 4
const MIN_SAMPLES_PER_CLASS = 5
const TARGET_SAMPLES_PER_CLASS = 20
const MAX_SAMPLES_PER_CLASS = 50
const CLASS_COLORS = ['#00f5ff', '#39ff14', '#a855f7', '#f97316']

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

export default function VisionExplorer() {
  const visionCtx = useVisionModelOptional()
  const setGestureHeadWeights = visionCtx?.setGestureHeadWeights ?? (() => {})

  const [step, setStep] = useState(1)
  const [categories, setCategories] = useState([])
  const [samples, setSamples] = useState({})
  const [headWeights, setHeadWeights] = useState(null)

  useEffect(() => {
    setGestureHeadWeights(headWeights)
  }, [headWeights, setGestureHeadWeights])
  const [recognitionOn, setRecognitionOn] = useState(false)
  const [trainStatus, setTrainStatus] = useState('idle')
  const [trainProgress, setTrainProgress] = useState(0)
  const [trainMessage, setTrainMessage] = useState('')
  const [trainError, setTrainError] = useState('')
  const [predictions, setPredictions] = useState([])
  const [recognizing, setRecognizing] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [loadingBuiltInDigit, setLoadingBuiltInDigit] = useState(false)
  const [builtInDigitError, setBuiltInDigitError] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const predictIntervalRef = useRef(null)
  const importInputRef = useRef(null)

  const needCamera = step === 2 || (step === 4 && recognitionOn)

  useEffect(() => {
    if (!needCamera) return
    let cancelled = false
    const video = videoRef.current
    if (!video) return
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 224, height: 224 },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
        setCameraError(null)
      } catch (err) {
        if (!cancelled) setCameraError(err?.message || '无法访问摄像头')
      }
    }
    startCamera()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (video?.srcObject) video.srcObject = null
    }
  }, [needCamera])

  const addCategory = useCallback((name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    setCategories((prev) => {
      if (prev.length >= MAX_CATEGORIES) return prev
      return [...prev, { id: generateId(), name: trimmed }]
    })
  }, [])

  const removeCategory = useCallback((id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setSamples((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const setSamplesForClass = useCallback((classId, urls) => {
    setSamples((prev) => ({ ...prev, [classId]: urls }))
  }, [])

  const handleTrain = useCallback(async () => {
    setTrainStatus('loading')
    setTrainProgress(0)
    setTrainMessage('正在载入 AI 模型…')
    setTrainError('')
    try {
      const classNames = categories.map((c) => c.name)
      const samplesByClass = {}
      categories.forEach((c) => {
        samplesByClass[c.name] = samples[c.id] ?? []
      })
      setTrainStatus('training')
      const weights = await trainHead(samplesByClass, classNames, (p, msg) => {
        setTrainProgress(Math.round(p * 100))
        setTrainMessage(msg)
      })
      setTrainProgress(100)
      setTrainMessage('训练完成！')
      setTrainStatus('done')
      setHeadWeights(weights)
    } catch (e) {
      setTrainStatus('error')
      setTrainError(e?.message || '训练失败')
    }
  }, [categories, samples])

  const loadBuiltInDigitModel = useCallback(async () => {
    setBuiltInDigitError('')
    setTrainError('')
    setLoadingBuiltInDigit(true)
    try {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      const url = `${base}/samples/models/digit-model.json`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(
          `无法加载内置数字模型 (${res.status})，请运行 npm run train-digit-model 生成 digit-model.json`
        )
      }
      const data = await res.json()
      if (!data.weights || !data.biases || !data.classNames || data.numClasses === undefined) {
        throw new Error('内置数字模型格式无效')
      }
      setHeadWeights(data)
      setStep(4)
    } catch (err) {
      setBuiltInDigitError(err?.message || '加载失败')
    } finally {
      setLoadingBuiltInDigit(false)
    }
  }, [])

  const handleImportModel = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data.weights || !data.biases || !data.classNames || data.numClasses === undefined) {
          throw new Error('无效的模型文件')
        }
        setHeadWeights(data)
        setStep(4)
      } catch {
        setTrainError('无法读取模型，请确认是从本应用下载的 JSON 文件。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleDownloadModel = useCallback(() => {
    if (!headWeights) return
    const json = JSON.stringify(headWeights)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vision-explorer-model.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [headWeights])

  const handleImageUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file || !headWeights) return
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(file)
      })
      setRecognizing(true)
      try {
        const result = await predict(dataUrl, headWeights)
        setPredictions(result.predictions)
      } catch (_) {
        setPredictions([])
      } finally {
        setRecognizing(false)
      }
      e.target.value = ''
    },
    [headWeights]
  )

  // 步骤 4：预测循环（仅当 recognitionOn 时）
  useEffect(() => {
    if (step !== 4 || !recognitionOn || !headWeights || !videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = 224
    canvas.height = 224
    const ctx = canvas.getContext('2d')
    let cancelled = false
    const run = async () => {
      if (cancelled || !video) {
        if (!cancelled) predictIntervalRef.current = setTimeout(run, 200)
        return
      }
      // 摄像头尚未有画面时继续轮询，不要停止循环
      if (video.readyState < 2) {
        if (!cancelled) predictIntervalRef.current = setTimeout(run, 200)
        return
      }
      try {
        if (!cancelled) setRecognizing(true)
        ctx.drawImage(video, 0, 0, 224, 224)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const result = await predict(dataUrl, headWeights)
        if (!cancelled) setPredictions(result.predictions)
      } catch (_) {}
      finally {
        if (!cancelled) setRecognizing(false)
      }
      if (!cancelled) predictIntervalRef.current = setTimeout(run, 300)
    }
    run()
    return () => {
      cancelled = true
      if (predictIntervalRef.current) clearTimeout(predictIntervalRef.current)
    }
  }, [step, recognitionOn, headWeights])

  const totalSamples = Object.values(samples).flat().length
  const canStep2 = categories.length >= MIN_CATEGORIES
  const canStep3 =
    categories.length >= 2 &&
    totalSamples >= 10 &&
    categories.every((c) => (samples[c.id]?.length ?? 0) >= 2)
  const canTrain =
    categories.length >= 2 &&
    totalSamples >= 10 &&
    categories.every((c) => (samples[c.id]?.length ?? 0) >= 2)

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* 步骤导航 */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const done =
            s.id < step || (s.id === 3 && headWeights) || (s.id === 4 && headWeights)
          const active = step === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition touch-manipulation flex items-center gap-1 ${
                active
                  ? 'bg-[var(--lab-cyan)] text-[var(--lab-bg)]'
                  : done
                    ? 'tech-border text-[var(--lab-green)]'
                    : 'border border-[var(--lab-border)] text-gray-400 hover:text-[var(--lab-cyan)]'
              }`}
            >
              {done && !active ? '✓' : s.emoji} {s.id}. {s.title}
            </button>
          )
        })}
      </div>

      {/* 导入模型 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportModel}
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="rounded-xl border-2 border-[var(--lab-border)] px-4 py-2 text-sm text-gray-300 hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)] transition"
        >
          📥 导入已保存的模型
        </button>
        <button
          type="button"
          disabled={loadingBuiltInDigit}
          onClick={loadBuiltInDigitModel}
          className="rounded-xl border-2 border-[var(--lab-cyan)] px-4 py-2 text-sm text-[var(--lab-cyan)] hover:bg-[rgba(0,245,255,0.1)] transition disabled:opacity-50"
        >
          {loadingBuiltInDigit ? '加载中…' : '🔢 导入手写数字识别（内置）'}
        </button>
        {builtInDigitError && (
          <p className="text-red-400 text-sm">{builtInDigitError}</p>
        )}
      </div>

      {/* Step 1: 创建类别 */}
      {step === 1 && (
        <Step1ClassManager
          categories={categories}
          onAdd={addCategory}
          onRemove={removeCategory}
          onNext={() => setStep(2)}
          canNext={canStep2}
        />
      )}

      {/* Step 2: 收集样本 */}
      {step === 2 && (
        <Step2SampleCollector
          categories={categories}
          samples={samples}
          onSamplesChange={setSamplesForClass}
          onNext={() => setStep(3)}
          canNext={
            categories.every((c) => (samples[c.id]?.length ?? 0) >= MIN_SAMPLES_PER_CLASS) &&
            totalSamples >= 10
          }
          videoRef={videoRef}
          captureCanvasRef={captureCanvasRef}
          cameraError={cameraError}
        />
      )}

      {/* Step 3: 训练模型 */}
      {step === 3 && (
        <Step3Trainer
          categories={categories}
          samples={samples}
          trainStatus={trainStatus}
          trainProgress={trainProgress}
          trainMessage={trainMessage}
          trainError={trainError}
          canTrain={canTrain}
          onTrain={handleTrain}
          onNext={() => setStep(4)}
        />
      )}

      {/* Step 4: 测试 AI */}
      {step === 4 && (
        <Step4Predictor
          headWeights={headWeights}
          videoRef={videoRef}
          recognitionOn={recognitionOn}
          setRecognitionOn={setRecognitionOn}
          predictions={predictions}
          recognizing={recognizing}
          cameraError={cameraError}
          onDownload={handleDownloadModel}
          onImportClick={() => importInputRef.current?.click()}
          onImageUpload={handleImageUpload}
        />
      )}
    </div>
  )
}

function Step1ClassManager({ categories, onAdd, onRemove, onNext, canNext }) {
  const [input, setInput] = useState('')
  const handleAdd = () => {
    onAdd(input)
    setInput('')
  }
  return (
    <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 max-w-xl">
      <h2 className="text-[var(--lab-cyan)] font-bold text-xl mb-2">🏷️ 创建类别</h2>
      <p className="text-gray-400 text-sm mb-4">
        至少 {MIN_CATEGORIES} 个，最多 {MAX_CATEGORIES} 个，例如：苹果、香蕉
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="输入类别名称，例如：苹果"
          className="flex-1 rounded-lg bg-[var(--lab-bg)] border-2 border-[var(--lab-border)] px-4 py-3 text-gray-200 placeholder-gray-500 focus:border-[var(--lab-cyan)] focus:outline-none"
          maxLength={20}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={categories.length >= MAX_CATEGORIES || !input.trim()}
          className="rounded-lg bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-5 py-3 font-bold disabled:opacity-50 hover:opacity-90 transition touch-manipulation"
        >
          新增
        </button>
      </div>
      <ul className="space-y-2 mb-6">
        {categories.map((c, i) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg bg-[var(--lab-bg)] px-4 py-3"
          >
            <span className="flex items-center gap-2 text-gray-200">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }}
              />
              {c.name}
            </span>
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="text-red-400 hover:underline text-sm font-medium"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="w-full rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.1)] text-[var(--lab-green)] py-4 font-bold disabled:opacity-50 hover:bg-[rgba(57,255,20,0.2)] transition touch-manipulation"
      >
        下一步：收集样本 →
      </button>
    </div>
  )
}

function Step2SampleCollector({
  categories,
  samples,
  onSamplesChange,
  onNext,
  canNext,
  videoRef,
  captureCanvasRef,
  cameraError,
}) {
  const [activeClassId, setActiveClassId] = useState(categories[0]?.id ?? '')
  const [uploadError, setUploadError] = useState('')

  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || video.readyState < 2 || !activeClassId) return
    const list = samples[activeClassId] ?? []
    if (list.length >= MAX_SAMPLES_PER_CLASS) return
    const ctx = canvas.getContext('2d')
    canvas.width = 224
    canvas.height = 224
    ctx.drawImage(video, 0, 0, 224, 224)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    onSamplesChange(activeClassId, [...list, dataUrl])
  }, [activeClassId, samples, onSamplesChange, videoRef, captureCanvasRef])

  const handleFileUpload = (e, classId) => {
    setUploadError('')
    const files = e.target.files
    if (!files?.length) return
    const list = samples[classId] ?? []
    const urls = []
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith('image/')) continue
      urls.push(URL.createObjectURL(files[i]))
    }
    if (urls.length + list.length > MAX_SAMPLES_PER_CLASS) {
      setUploadError(`每个类别最多 ${MAX_SAMPLES_PER_CLASS} 张`)
      urls.splice(MAX_SAMPLES_PER_CLASS - list.length)
    }
    onSamplesChange(classId, [...list, ...urls])
    e.target.value = ''
  }

  const removeSample = (classId, index) => {
    const list = (samples[classId] ?? []).filter((_, i) => i !== index)
    onSamplesChange(classId, list)
  }

  if (categories.length === 0) {
    return (
      <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 text-center text-gray-400">
        请先回上一步建立类别
      </div>
    )
  }

  return (
    <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 max-w-2xl space-y-6">
      <h2 className="text-[var(--lab-cyan)] font-bold text-xl">📷 收集样本</h2>
      <p className="text-gray-400 text-sm">
        每类至少 {MIN_SAMPLES_PER_CLASS} 张、建议 {TARGET_SAMPLES_PER_CLASS}+ 张，可拍照或上传
      </p>

      <div>
        <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">选择要拍照的类别：</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => {
            const count = samples[c.id]?.length ?? 0
            const isActive = activeClassId === c.id
            const color = CLASS_COLORS[i % CLASS_COLORS.length]
            const ok = count >= MIN_SAMPLES_PER_CLASS
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveClassId(c.id)}
                className={`rounded-xl px-4 py-2 font-medium transition flex items-center gap-2 touch-manipulation ${
                  isActive
                    ? 'bg-[var(--lab-cyan)] text-[var(--lab-bg)]'
                    : 'bg-[var(--lab-bg)] text-gray-400 border border-[var(--lab-border)] hover:border-[var(--lab-cyan)]'
                }`}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {c.name} ({count}/{TARGET_SAMPLES_PER_CLASS})
                {ok && <span className="text-[var(--lab-green)]">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-h-64 border-2 border-[var(--lab-cyan)]">
        <video
          ref={videoRef}
          width={224}
          height={224}
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <canvas ref={captureCanvasRef} className="hidden" width={224} height={224} />
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-sm p-2 text-center">
            {cameraError}
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={capture}
          disabled={!activeClassId || cameraError}
          className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] px-6 py-3 font-bold disabled:opacity-50 hover:opacity-90 transition touch-manipulation"
        >
          📸 捕捉
        </button>
        <label className="rounded-xl border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)] px-6 py-3 font-bold cursor-pointer hover:bg-[rgba(0,245,255,0.1)] transition touch-manipulation">
          📁 上传图片
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e, activeClassId)}
          />
        </label>
      </div>
      {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}

      <div>
        <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">已收集（点击可删除）：</p>
        {categories.map((c, classIndex) => {
          const list = samples[c.id] ?? []
          const color = CLASS_COLORS[classIndex % CLASS_COLORS.length]
          return (
            <div key={c.id} className="mb-4">
              <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {c.name}：{list.length} / {TARGET_SAMPLES_PER_CLASS} 张
                {list.length >= MIN_SAMPLES_PER_CLASS && (
                  <span className="text-[var(--lab-green)] text-xs">✓</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1">
                {list.slice(-30).map((url, i) => {
                  const idx = Math.max(0, list.length - 30) + i
                  return (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt=""
                        className="w-12 h-12 object-cover rounded thumb-neon"
                      />
                      <button
                        type="button"
                        onClick={() => removeSample(c.id, idx)}
                        className="absolute inset-0 flex items-center justify-center rounded bg-black/50 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition"
                        title="删除"
                      >
                        删
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="w-full rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.1)] text-[var(--lab-green)] py-4 font-bold disabled:opacity-50 hover:bg-[rgba(57,255,20,0.2)] transition touch-manipulation"
      >
        下一步：训练模型 →
      </button>
    </div>
  )
}

function Step3Trainer({
  categories,
  samples,
  trainStatus,
  trainProgress,
  trainMessage,
  trainError,
  canTrain,
  onTrain,
  onNext,
}) {
  return (
    <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 max-w-xl">
      <h2 className="text-[var(--lab-cyan)] font-bold text-xl mb-2">🧠 训练模型</h2>
      <p className="text-gray-400 text-sm mb-4">按下「训练」后，AI 会用你收集的图片学习</p>

      {(trainStatus === 'loading' || trainStatus === 'training') && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[var(--lab-cyan)] text-sm mb-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {trainMessage}
          </div>
          <div className="w-full h-3 rounded-full bg-[var(--lab-bg)] overflow-hidden train-progress-track">
            <div
              className="h-full train-progress-fill rounded-full transition-all duration-300"
              style={{ width: `${trainProgress}%` }}
            />
          </div>
          <p className="text-center text-[var(--lab-cyan)] font-bold text-sm mt-1">{trainProgress}%</p>
        </div>
      )}

      {trainStatus === 'error' && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-400/50 text-red-300 text-sm">
          ❌ {trainError}
        </div>
      )}

      {trainStatus === 'done' && (
        <div className="mb-4 p-4 rounded-lg bg-[var(--lab-green)]/10 border border-[var(--lab-green)]/50 text-[var(--lab-green)] text-sm">
          ✅ 训练完成！到下一步可测试，并可下载模型 JSON 之后导入使用。
        </div>
      )}

      <button
        type="button"
        onClick={onTrain}
        disabled={!canTrain || trainStatus === 'loading' || trainStatus === 'training'}
        className="w-full rounded-xl bg-[var(--lab-cyan)] text-[var(--lab-bg)] py-4 font-bold disabled:opacity-50 hover:opacity-90 transition touch-manipulation"
      >
        {trainStatus === 'idle' || trainStatus === 'error' ? '🚀 开始训练' : '训练中…'}
      </button>

      {trainStatus === 'done' && (
        <button
          type="button"
          onClick={onNext}
          className="w-full mt-3 rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.1)] text-[var(--lab-green)] py-4 font-bold hover:bg-[rgba(57,255,20,0.2)] transition touch-manipulation"
        >
          下一步：测试 AI →
        </button>
      )}
    </div>
  )
}

function Step4Predictor({
  headWeights,
  videoRef,
  recognitionOn,
  setRecognitionOn,
  predictions,
  recognizing,
  cameraError,
  onDownload,
  onImportClick,
  onImageUpload,
}) {
  const top = predictions[0]

  if (!headWeights) {
    return (
      <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 text-center text-gray-400">
        请先完成训练，再来测试 AI；或使用「导入已保存的模型」载入模型。
      </div>
    )
  }

  const isDigitModel = headWeights?.classNames?.length === 10 && headWeights.classNames.every((n, i) => n === String(i))

  return (
    <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 max-w-xl space-y-6">
      <h2 className="text-[var(--lab-cyan)] font-bold text-xl">🔍 测试 AI</h2>
      <p className="text-gray-400 text-sm">点击「识别」开启摄像头，或上传图片进行识别</p>
      {isDigitModel && (
        <p className="text-[var(--lab-green)] text-xs bg-[var(--lab-green)]/10 border border-[var(--lab-green)]/30 rounded px-3 py-2">
          💡 手写数字识别提示：将手写数字（0-9）置于摄像头画面中央，确保光线均匀、对比清晰，数字尽量大一些效果更好。
        </p>
      )}

      {!recognitionOn ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setRecognitionOn(true)}
              className="min-h-[52px] px-8 rounded-xl border-2 border-[var(--lab-cyan)] bg-[rgba(0,245,255,0.1)] text-[var(--lab-cyan)] font-bold hover:bg-[rgba(0,245,255,0.2)] touch-manipulation"
            >
              识别
            </button>
            <label className="min-h-[52px] px-8 rounded-xl border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)] font-bold cursor-pointer hover:bg-[rgba(0,245,255,0.1)] transition touch-manipulation flex items-center justify-center">
              📁 上传图片识别
              <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
            </label>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setRecognitionOn(false)}
              className="rounded-xl border-2 border-red-400/60 text-red-400 px-4 py-2 font-bold hover:bg-red-400/10 transition touch-manipulation"
            >
              关闭识别
            </button>
          </div>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-h-72 border-2 border-[var(--lab-cyan)]">
            <video
              ref={videoRef}
              width={224}
              height={224}
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-sm p-2 text-center">
                {cameraError}
              </div>
            )}
          </div>

          {recognizing && (
            <div className="rounded-lg bg-[var(--lab-bg)] p-3 tech-border">
              <p className="text-[var(--lab-cyan)] text-sm font-medium mb-2">识别中…</p>
              <div className="h-2 bg-[var(--lab-panel)] rounded-full overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-[var(--lab-cyan)] animate-recognize-progress" />
              </div>
            </div>
          )}

          <div className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border">
            {top ? (
              top.probability >= 0.9 ? (
                <div className="text-center p-3 rounded-lg bg-[var(--lab-green)]/15 border-2 border-[var(--lab-green)]/60">
                  <span className="text-xs font-bold text-[var(--lab-green)] uppercase tracking-wider">高置信度</span>
                  <p className="text-2xl font-bold text-[var(--lab-green)] mt-1 drop-shadow-[0_0_8px_var(--lab-glow)]">
                    🎯 {top.className}
                  </p>
                  <p className="text-sm font-mono text-[var(--lab-green)] mt-1">
                    信心度：{Math.round(top.probability * 100)}%
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xl font-bold text-[var(--lab-cyan)]">
                    🎯 {top.className}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    信心度：{Math.round(top.probability * 100)}%
                  </p>
                </div>
              )
            ) : !recognizing ? (
              <p className="text-gray-500 text-center text-sm">等待预测…</p>
            ) : null}
          </div>
        </>
      )}

      <div className="rounded-lg border-2 border-[var(--lab-border)] p-4 bg-[var(--lab-panel)]">
        <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">📤 导出与分享</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] py-3 px-5 font-bold hover:opacity-90 transition touch-manipulation"
          >
            保存模型
          </button>
          <button
            type="button"
            onClick={onImportClick}
            className="rounded-xl border-2 border-[var(--lab-border)] text-gray-300 py-3 px-5 font-bold hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)] transition touch-manipulation"
          >
            📥 导入其他模型
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">全部在设备上完成，影像不会上传</p>
      </div>
    </div>
  )
}
