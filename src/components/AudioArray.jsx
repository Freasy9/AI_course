/**
 * 频率监听阵列（模块二）- 与模块一相同四步：创建类别 → 收集样本 → 训练模型 → 测试 AI
 * 实时频谱、按住录制、置信度>85% 指示灯+大标签、声控模式、识别结果供游戏模块使用
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import { useAudioRecognitionOptional } from '../contexts/AudioRecognitionContext'

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
const CONFIDENCE_THRESHOLD = 0.85
const FFT_SIZE = 256
const SAMPLE_RATE = 44100
const BARS = 64
const RECORD_INTERVAL_MS = 100
/** 与训练一致：每条样本 = 连续多帧频谱的时间平均（约 1.2s），降低瞬时噪声 */
const RECORD_FRAME_COUNT = 12
/** 测试时环形缓冲：同样按 ~100ms 采样，预测时用多帧平均，避免「训练看 1s 平均、推理看单帧」的分布错位 */
const PREDICT_RING_MAX = 12
const PREDICT_MIN_FRAMES = 6
const FEATURE_LEN = 128
const CLASS_COLORS = ['#00f5ff', '#39ff14', '#a855f7', '#f97316']

// FFT 为 dB，可能含 -Infinity/NaN，需归一化到 [0,1] 供模型使用；训练与推理必须一致
function sanitizeAndNormalizeFFT(float32Arr, length = FEATURE_LEN) {
  const out = []
  const clampLo = -100
  const clampHi = 0
  for (let i = 0; i < length; i++) {
    let v = float32Arr[i]
    if (!Number.isFinite(v)) v = clampLo
    if (v < clampLo) v = clampLo
    if (v > clampHi) v = clampHi
    out.push((v - clampLo) / (clampHi - clampLo))
  }
  return out
}

function averageFFTFrames(frames) {
  if (!frames?.length) return null
  const len = frames[0].length
  const avg = new Float32Array(len)
  for (const f of frames) {
    for (let i = 0; i < len; i++) avg[i] += f[i]
  }
  for (let i = 0; i < len; i++) avg[i] /= frames.length
  return avg
}

/** 训练/推理统一：dB→[0,1] 后再 L2 归一化，减弱「整体音量」、突出频谱形状 */
function extractAudioFeatures(float32Freq, featureLen = FEATURE_LEN) {
  const raw = sanitizeAndNormalizeFFT(float32Freq, featureLen)
  let s = 0
  for (const v of raw) s += v * v
  const n = Math.sqrt(s) || 1
  return raw.map((v) => v / n)
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export default function AudioArray() {
  const ctx = useAudioRecognitionOptional()
  const setResult = ctx?.setResult ?? (() => {})
  const setListening = ctx?.setListening ?? (() => {})
  const setLabels = ctx?.setLabels ?? (() => {})
  const setAudioModel = ctx?.setAudioModel ?? (() => {})
  const setAudioLabels = ctx?.setAudioLabels ?? (() => {})

  const [step, setStep] = useState(1)
  const [categories, setCategories] = useState([])
  const [samples, setSamples] = useState({})
  const [selfModel, setSelfModel] = useState(null)
  const [trainStatus, setTrainStatus] = useState('idle')
  const [trainProgress, setTrainProgress] = useState(0)
  const [trainMessage, setTrainMessage] = useState('')
  const [trainError, setTrainError] = useState('')
  const [recognitionOn, setRecognitionOn] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [predictError, setPredictError] = useState('')
  const [soundReactive, setSoundReactive] = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [audioReady, setAudioReady] = useState(false)
  const [audioResumed, setAudioResumed] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordClassId, setRecordClassId] = useState(null)

  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const predictIntervalRef = useRef(null)
  const recordBufferRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordClassIdRef = useRef(null)
  const predictRingRef = useRef([])
  const importInputRef = useRef(null)
  const setResultRef = useRef(setResult)
  const setPredictionsRef = useRef(setPredictions)
  const setPredictErrorRef = useRef(setPredictError)
  const categoriesRef = useRef(categories)
  setResultRef.current = setResult
  setPredictionsRef.current = setPredictions
  setPredictErrorRef.current = setPredictError
  categoriesRef.current = categories

  const classNames = categories.map((c) => c.name)
  const needAudio = true

  // 麦克风初始化（进入模块即请求麦克风，便于实时频谱与步骤 2/4 使用）
  useEffect(() => {
    if (!needAudio) return
    let cancelled = false
    let stream = null
    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE })
        audioContextRef.current = actx
        const src = actx.createMediaStreamSource(stream)
        const analyser = actx.createAnalyser()
        analyser.fftSize = FFT_SIZE
        analyser.smoothingTimeConstant = 0.8
        src.connect(analyser)
        analyserRef.current = analyser
        if (!cancelled) {
          setAudioReady(true)
          setAudioResumed(false)
        }
      } catch (e) {
        if (!cancelled) setTrainError('无法访问麦克风：' + (e?.message || ''))
      }
    }
    init()
    return () => {
      cancelled = true
      setAudioReady(false)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [needAudio])

  // 步骤 4 开启识别时：每 100ms 写入环形缓冲，供预测时做多帧平均（与训练样本一致）
  useEffect(() => {
    if (step !== 4 || !recognitionOn || !audioResumed || !analyserRef.current) {
      predictRingRef.current = []
      return
    }
    const analyser = analyserRef.current
    const binCount = analyser.frequencyBinCount
    const id = window.setInterval(() => {
      const d = new Float32Array(binCount)
      analyser.getFloatFrequencyData(d)
      const ring = predictRingRef.current
      ring.push(new Float32Array(d))
      if (ring.length > PREDICT_RING_MAX) ring.shift()
    }, RECORD_INTERVAL_MS)
    return () => {
      window.clearInterval(id)
      predictRingRef.current = []
    }
  }, [step, recognitionOn, audioResumed, audioReady])

  const handleResumeAudio = useCallback(async () => {
    const actx = audioContextRef.current
    if (!actx) return
    try {
      if (actx.state === 'suspended') await actx.resume()
      setAudioResumed(true)
      setTrainError('')
    } catch (e) {
      setTrainError('启动音频失败：' + (e?.message || ''))
    }
  }, [])

  // 进入模块后麦克风就绪时尝试自动启动音频（部分浏览器需用户先与页面交互）
  useEffect(() => {
    if (!audioReady || audioResumed) return
    handleResumeAudio()
  }, [audioReady, audioResumed, handleResumeAudio])

  // 频谱绘制
  useEffect(() => {
    if (!audioReady || !canvasRef.current || !analyserRef.current) return
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    let lastVol = 0
    const draw = () => {
      if (!analyserRef.current) return
      analyser.getByteFrequencyData(data)
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = 'rgba(10, 14, 20, 0.4)'
      ctx.fillRect(0, 0, w, h)
      const step = Math.floor(data.length / BARS)
      let sum = 0
      for (let i = 0; i < BARS; i++) {
        const v = data[i * step]
        sum += v
        const barH = (v / 255) * h * 0.9
        const x = (i / BARS) * w
        ctx.fillStyle = '#39ff14'
        ctx.shadowColor = 'rgba(57, 255, 20, 0.8)'
        ctx.shadowBlur = 8
        ctx.fillRect(x + 1, h - barH, w / BARS - 2, barH)
      }
      ctx.shadowBlur = 0
      const vol = data.length ? sum / data.length / 255 : 0
      lastVol = lastVol * 0.7 + vol * 0.3
      setVolumeLevel(lastVol)
      animationRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [audioReady])

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

  // 按住录制
  const startRecording = useCallback((classId) => {
    if (!analyserRef.current || !audioResumed) return
    recordClassIdRef.current = classId
    setRecordClassId(classId)
    setIsRecording(true)
    recordBufferRef.current = []
    const analyser = analyserRef.current
    const binCount = analyser.frequencyBinCount
    recordTimerRef.current = setInterval(() => {
      const data = new Float32Array(binCount)
      analyser.getFloatFrequencyData(data)
      recordBufferRef.current.push(new Float32Array(data))
      if (recordBufferRef.current.length >= RECORD_FRAME_COUNT) {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        recordTimerRef.current = null
        const frames = recordBufferRef.current
        const avg = new Float32Array(binCount)
        for (let i = 0; i < binCount; i++) {
          let s = 0
          for (let j = 0; j < frames.length; j++) s += frames[j][i]
          avg[i] = s / frames.length
        }
        const cid = recordClassIdRef.current
        setSamples((prev) => ({ ...prev, [cid]: [...(prev[cid] || []), avg] }))
        setIsRecording(false)
        setRecordClassId(null)
      }
    }, RECORD_INTERVAL_MS)
  }, [audioResumed])

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
      const cid = recordClassIdRef.current
      const frames = recordBufferRef.current
      const analyser = analyserRef.current
      if (analyser && frames.length > 0 && cid) {
        const binCount = analyser.frequencyBinCount
        const avg = new Float32Array(binCount)
        for (let i = 0; i < binCount; i++) {
          let s = 0
          for (let j = 0; j < frames.length; j++) s += frames[j][i]
          avg[i] = s / frames.length
        }
        setSamples((prev) => ({ ...prev, [cid]: [...(prev[cid] || []), avg] }))
      }
      setIsRecording(false)
      setRecordClassId(null)
    }
  }, [])

  // 训练
  const handleTrain = useCallback(async () => {
    setTrainStatus('loading')
    setTrainProgress(0)
    setTrainMessage('准备数据…')
    setTrainError('')
    await new Promise((r) => setTimeout(r, 0))
    let model = null
    try {
      const names = categories.map((c) => c.name)
      const numClasses = names.length
      const featureLen = FEATURE_LEN
      const xsList = []
      const ysList = []
      categories.forEach((c, idx) => {
        const arr = samples[c.id] || []
        arr.forEach((vec) => {
          if (!(vec instanceof Float32Array)) return
          const feat = extractAudioFeatures(vec, featureLen)
          xsList.push(feat)
          ysList.push(idx)
          // 轻量增强：每样本加一条小幅噪声副本，缓解过拟合、类间混淆
          const noisy = feat.map((v) =>
            Math.min(1, Math.max(0, v + (Math.random() - 0.5) * 0.06)),
          )
          let s = 0
          for (const v of noisy) s += v * v
          const n = Math.sqrt(s) || 1
          xsList.push(noisy.map((v) => v / n))
          ysList.push(idx)
        })
      })
      if (xsList.length < numClasses * 2) {
        setTrainStatus('error')
        setTrainError('有效样本过少')
        return
      }
      setTrainMessage('训练中…')
      setTrainStatus('training')
      const counts = names.map((_, i) => ysList.filter((y) => y === i).length)
      const classWeight = {}
      for (let i = 0; i < numClasses; i++) {
        classWeight[i] = xsList.length / (numClasses * Math.max(1, counts[i]))
      }
      model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [featureLen], units: 96, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: numClasses, activation: 'softmax' }),
        ],
      })
      model.compile({
        optimizer: tf.train.adam(0.0008),
        loss: 'categoricalCrossentropy',
      })
      const xs = tf.tensor2d(xsList)
      const ys = tf.oneHot(tf.tensor1d(ysList, 'int32'), numClasses)
      const epochs = 48
      const batchSize = Math.min(16, Math.max(4, Math.floor(xsList.length / 3)))
      await model.fit(xs, ys, {
        epochs,
        batchSize,
        classWeight,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch) => {
            setTrainProgress(Math.round(((epoch + 1) / epochs) * 100))
            setTrainMessage(`训练中… ${epoch + 1}/${epochs}`)
          },
        },
      })
      xs.dispose()
      ys.dispose()
      setTrainProgress(100)
      setTrainMessage('训练完成！')
      setTrainStatus('done')
      setSelfModel(model)
      setLabels(names)
      setAudioModel(model)
      setAudioLabels(names)
      try {
        const warm = tf.tensor2d([extractAudioFeatures(new Float32Array(featureLen).fill(-100), featureLen)])
        const out = model.predict(warm)
        if (out && typeof out.dispose === 'function') out.dispose()
        warm.dispose()
      } catch (_) {}
    } catch (e) {
      if (model && typeof model.dispose === 'function') try { model.dispose() } catch (_) {}
      setTrainStatus('error')
      setTrainError(e?.message || String(e) || '训练失败')
      console.error('AudioArray train error:', e)
    }
  }, [categories, samples, setLabels, setAudioModel, setAudioLabels])

  const handleDownloadModel = useCallback(() => {
    if (!selfModel || !classNames.length) return
    const handler = {
      save: async (modelArtifacts) => {
        let weightData = modelArtifacts.weightData
        if (Array.isArray(weightData)) {
          const total = weightData.reduce((acc, b) => acc + (b.byteLength ?? 0), 0)
          const out = new Uint8Array(total)
          let offset = 0
          for (const b of weightData) {
            const len = b.byteLength ?? 0
            out.set(new Uint8Array(b), offset)
            offset += len
          }
          weightData = out.buffer
        }
        const buf = ArrayBuffer.isView(weightData) ? weightData.buffer : weightData
        const payload = {
          modelTopology: modelArtifacts.modelTopology,
          weightSpecs: modelArtifacts.weightSpecs,
          weightData: arrayBufferToBase64(buf),
          classNames,
        }
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'audio-array-model.json'
        a.click()
        URL.revokeObjectURL(url)
        return { modelArtifacts }
      },
    }
    selfModel.save(handler)
  }, [selfModel, classNames])

  const handleImportModel = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data.modelTopology || !data.weightSpecs || !data.weightData || !Array.isArray(data.classNames) || data.classNames.length < 2) {
          throw new Error('无效的模型文件（需含 modelTopology、weightSpecs、weightData、classNames）')
        }
        const weightData = base64ToArrayBuffer(data.weightData)
        const artifacts = {
          modelTopology: data.modelTopology,
          weightSpecs: data.weightSpecs,
          weightData,
        }
        const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts))
        const names = data.classNames
        setCategories(names.map((name) => ({ id: generateId(), name })))
        setLabels(names)
        setSelfModel(model)
        setAudioModel(model)
        setAudioLabels(names)
        setStep(4)
        setTrainError('')
      } catch (err) {
        setTrainError(err?.message || '无法加载模型，请确认是从本应用导出的 JSON 文件。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [setLabels, setAudioModel, setAudioLabels])

  // 步骤 4：预测循环（用 dataSync 同步读输出，并直接调 setPredictions 保证界面更新）
  useEffect(() => {
    if (step !== 4 || !recognitionOn || !selfModel || !audioReady || !audioResumed) return
    const analyser = analyserRef.current
    if (!analyser) return
    const binCount = analyser.frequencyBinCount
    let inputSize = FEATURE_LEN
    try {
      const shape = selfModel.inputShape
      if (shape && Array.isArray(shape)) {
        const prod = shape.slice(1).reduce((a, b) => (a ?? 1) * (b ?? 1), 1)
        if (Number.isFinite(prod) && prod > 0) inputSize = prod
      }
    } catch (_) {}
    const data = new Float32Array(binCount)
    let cancelled = false
    const run = () => {
      if (cancelled) return
      const names = (categoriesRef.current || []).map((c) => c.name)
      if (names.length === 0) {
        predictIntervalRef.current = setTimeout(run, 200)
        return
      }
      try {
        const ring = predictRingRef.current
        let spec = null
        if (ring.length >= PREDICT_MIN_FRAMES) {
          spec = averageFFTFrames(ring.slice(-PREDICT_RING_MAX))
        } else if (ring.length >= 1) {
          spec = averageFFTFrames(ring)
        }
        if (!spec) {
          analyser.getFloatFrequencyData(data)
          spec = data
        }
        const len = Math.min(spec.length, inputSize)
        const normalized = extractAudioFeatures(spec, len)
        const input = tf.tensor2d([normalized])
        const predictPromise = selfModel.predict(input)
        const timeoutMs = 5000
        const withTimeout = Promise.race([
          predictPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('predict 超时(' + timeoutMs + 'ms)，可能 WebGL 卡住')), timeoutMs)),
        ])
        withTimeout.then((out) => {
          if (cancelled) {
            input.dispose()
            out.dispose()
            return
          }
          const outFlat = out.shape && out.shape.length > 1 ? out.flatten() : out
          const raw = outFlat.dataSync ? outFlat.dataSync() : null
          if (outFlat !== out) outFlat.dispose()
          const applyResult = (rawData) => {
            if (cancelled) return
            input.dispose()
            out.dispose()
            const numClasses = names.length
            const rawArr = rawData && rawData.length >= numClasses
              ? Array.from(rawData).slice(0, numClasses)
              : []
            const arr = rawArr.map((v) => (Number.isFinite(v) ? Number(v) : 0))
            let sum = arr.reduce((a, b) => a + b, 0)
            const useEqual = sum <= 0 || !Number.isFinite(sum)
            const list = names.map((name, i) => ({
              label: name,
              probability: useEqual ? 1 / numClasses : arr[i] / sum,
            }))
            list.sort((a, b) => b.probability - a.probability)
            setPredictionsRef.current((prev) => [...list])
            setPredictErrorRef.current('')
            const top = list[0]
            if (top && top.probability >= CONFIDENCE_THRESHOLD) {
              setResultRef.current({ label: top.label, probability: top.probability, scores: arr })
            } else {
              setResultRef.current(null)
            }
          }
          try {
            if (raw != null) {
              applyResult(raw)
            } else if (out.data) {
              out.data().then((rawData) => {
                applyResult(rawData)
              }).catch((e) => {
                try { input.dispose(); out.dispose() } catch (_) {}
                setPredictErrorRef.current(e?.message || '预测失败')
              })
            } else {
              setPredictErrorRef.current('无法读取模型输出')
            }
          } catch (e) {
            input.dispose()
            out.dispose()
            setPredictErrorRef.current(e?.message || '解析结果失败')
          }
        }).catch((e) => {
          try { input.dispose() } catch (_) {}
          setPredictErrorRef.current(e?.message || '模型预测异常')
        })
      } catch (_) {}
      if (!cancelled) predictIntervalRef.current = setTimeout(run, 250)
    }
    const t = setTimeout(run, 200)
    return () => {
      cancelled = true
      setListening(false)
      clearTimeout(t)
      if (predictIntervalRef.current) clearTimeout(predictIntervalRef.current)
    }
  }, [step, recognitionOn, selfModel, audioReady, audioResumed])

  const totalSamples = Object.values(samples).flat().length
  const canStep2 = categories.length >= MIN_CATEGORIES
  const canStep3 =
    categories.length >= 2 &&
    totalSamples >= 10 &&
    categories.every((c) => (samples[c.id]?.length ?? 0) >= 2)
  const canTrain =
    categories.length >= 2 &&
    totalSamples >= 10 &&
    categories.every((c) => (samples[c.id]?.length ?? 0) >= MIN_SAMPLES_PER_CLASS)
  const topPred = predictions[0]
  const highConfidence = topPred && topPred.probability >= CONFIDENCE_THRESHOLD

  return (
    <div className="flex flex-col gap-6">
      {/* 步骤导航 */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const done = s.id < step || (s.id === 3 && selfModel) || (s.id === 4 && selfModel)
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

      {/* 导入 / 下载模型 */}
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
        {selfModel && (
          <button
            type="button"
            onClick={handleDownloadModel}
            className="rounded-xl border-2 border-[var(--lab-border)] px-4 py-2 text-sm text-gray-300 hover:border-[var(--lab-green)] hover:text-[var(--lab-green)] transition"
          >
            📤 下载模型
          </button>
        )}
      </div>

      {/* 声控模式 */}
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-sm">声控模式（频谱随音量震动）</span>
        <button
          type="button"
          role="switch"
          aria-checked={soundReactive}
          onClick={() => setSoundReactive((v) => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors ${soundReactive ? 'bg-[var(--lab-green)]' : 'bg-gray-600'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${soundReactive ? 'left-7' : 'left-1'}`} />
        </button>
      </div>

      {/* 启动音频（步骤 2 或 4 需要） */}
      {needAudio && audioReady && !audioResumed && (
        <div className="tech-border rounded-lg p-6 bg-[var(--lab-panel)]/80 border-[var(--lab-green)]/50">
          <p className="text-gray-300 text-sm mb-3">请点击下方按钮启动麦克风（浏览器安全策略要求）</p>
          <button type="button" onClick={handleResumeAudio} className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] px-6 py-4 font-bold text-lg">
            启动音频
          </button>
        </div>
      )}

      {/* 实时频谱 */}
      <div
        className="tech-border rounded-lg overflow-hidden bg-black"
        style={{
          transform: soundReactive ? `scale(${1 + volumeLevel * 0.15})` : undefined,
          transition: 'transform 0.08s ease-out',
        }}
      >
        <p className="text-[var(--lab-cyan)] text-sm font-bold px-4 py-2 border-b border-[var(--lab-border)]">
          实时频谱 {audioResumed ? '' : '（请先点击「启动音频」）'}
        </p>
        <canvas ref={canvasRef} width={640} height={200} className="w-full h-48 block" />
      </div>

      {/* Step 1: 创建类别 */}
      {step === 1 && (
        <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80 max-w-xl">
          <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2">🏷️ 创建类别</h3>
          <p className="text-gray-400 text-sm mb-4">至少 {MIN_CATEGORIES} 个，最多 {MAX_CATEGORIES} 个，如：背景噪音、拍手、口哨</p>
          <Step1ClassManager
            categories={categories}
            onAdd={addCategory}
            onRemove={removeCategory}
            onNext={() => setStep(2)}
            canNext={canStep2}
          />
        </section>
      )}

      {/* Step 2: 收集样本 */}
      {step === 2 && (
        <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80 max-w-2xl">
          <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2">📷 收集样本</h3>
          <p className="text-gray-400 text-sm mb-4">每类至少 {MIN_SAMPLES_PER_CLASS} 段，建议 {TARGET_SAMPLES_PER_CLASS}+ 段。选择类别后按住「按住录制」约 1 秒。</p>
          {!audioResumed && <p className="text-amber-400 text-sm mb-2">请先点击「启动音频」再录制。</p>}
          <Step2SampleCollector
            categories={categories}
            samples={samples}
            onNext={() => setStep(3)}
            canNext={categories.every((c) => (samples[c.id]?.length ?? 0) >= MIN_SAMPLES_PER_CLASS) && totalSamples >= 10}
            audioResumed={audioResumed}
            isRecording={isRecording}
            recordClassId={recordClassId}
            onStartRecord={startRecording}
            onStopRecord={stopRecording}
          />
        </section>
      )}

      {/* Step 3: 训练模型 */}
      {step === 3 && (
        <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80 max-w-xl">
          <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2">🧠 训练模型</h3>
          <p className="text-gray-400 text-sm mb-4">按下「开始训练」后，AI 会用你收集的声音学习</p>
          {(trainStatus === 'loading' || trainStatus === 'training') && (
            <div className="mb-4">
              <p className="text-[var(--lab-cyan)] text-sm mb-2">{trainMessage}</p>
              <div className="w-full h-3 rounded-full bg-[var(--lab-bg)] overflow-hidden">
                <div className="h-full bg-[var(--lab-green)] rounded-full transition-all duration-300" style={{ width: `${trainProgress}%` }} />
              </div>
              <p className="text-center text-[var(--lab-cyan)] text-sm mt-1">{trainProgress}%</p>
            </div>
          )}
          {trainStatus === 'error' && <p className="text-red-400 text-sm mb-4">{trainError}</p>}
          {trainStatus === 'done' && <p className="text-[var(--lab-green)] text-sm mb-4">✅ 训练完成！到下一步可测试。</p>}
          <button
            type="button"
            onClick={handleTrain}
            disabled={!canTrain || trainStatus === 'loading' || trainStatus === 'training'}
            className="w-full rounded-xl bg-[var(--lab-cyan)] text-[var(--lab-bg)] py-4 font-bold disabled:opacity-50"
          >
            {trainStatus === 'idle' || trainStatus === 'error' ? '🚀 开始训练' : '训练中…'}
          </button>
          {trainStatus === 'done' && (
            <button type="button" onClick={() => setStep(4)} className="w-full mt-3 rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] py-4 font-bold">
              下一步：测试 AI →
            </button>
          )}
        </section>
      )}

      {/* Step 4: 测试 AI */}
      {step === 4 && (
        <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80 max-w-xl">
          <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2">🔍 测试 AI</h3>
          <p className="text-gray-400 text-sm mb-4">
            点击「识别」开启监听。识别时会用近 1 秒内的频谱<strong className="text-[var(--lab-cyan)]">多帧平均</strong>
            （与录制样本一致），请发声后稍停半秒再观察结果。
          </p>
          {!selfModel && <p className="text-gray-500 text-sm">请先完成步骤 3 训练，或使用「导入已保存的模型」载入模型。</p>}
          {selfModel && !recognitionOn && (
            <button
              type="button"
              onClick={() => { setRecognitionOn(true); setListening(true) }}
              className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] px-6 py-4 font-bold"
            >
              识别
            </button>
          )}
          {selfModel && recognitionOn && (
            <>
              <button type="button" onClick={() => { setRecognitionOn(false); setListening(false) }} className="rounded-xl border-2 border-red-400/60 text-red-400 px-4 py-2 font-bold mb-4">
                关闭识别
              </button>
              {!audioReady && <p className="text-gray-400 text-sm mb-2">正在准备麦克风…</p>}
              {audioReady && !audioResumed && (
                <div className="mb-4 p-4 rounded-lg bg-[var(--lab-green)]/10 border-2 border-[var(--lab-green)]/50">
                  <p className="text-amber-400 text-sm mb-2">必须点击下方按钮后，识别结果才会出现（每次进入本步骤都需点击一次）：</p>
                  <button type="button" onClick={handleResumeAudio} className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] px-6 py-3 font-bold">
                    启动音频
                  </button>
                </div>
              )}
              {predictError && <p className="text-amber-400 text-sm mb-2">⚠️ {predictError}</p>}
              <div className="flex flex-wrap gap-4 items-center mb-4">
                {classNames.map((label, i) => {
                  const p = predictions.find((x) => x.label === label)?.probability ?? 0
                  const on = p >= CONFIDENCE_THRESHOLD
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border-2 transition-all ${on ? 'bg-[var(--lab-green)] border-[var(--lab-green)] shadow-[0_0_12px_var(--lab-glow)]' : 'bg-transparent border-[var(--lab-border)]'}`} />
                      <span className="text-sm text-gray-400">{label}</span>
                      <span className="text-xs font-mono text-[var(--lab-green)]">{Math.round(p * 100)}%</span>
                    </div>
                  )
                })}
              </div>
              {highConfidence && (
                <div className="rounded-xl bg-[var(--lab-green)]/20 border-2 border-[var(--lab-green)] p-6 text-center">
                  <p className="text-4xl font-bold text-[var(--lab-green)]">{topPred.label}</p>
                  <p className="text-xl font-mono text-[var(--lab-green)] mt-2">{Math.round(topPred.probability * 100)}%</p>
                </div>
              )}
              {predictions.length > 0 && !highConfidence && (
                <p className="text-gray-500 text-sm">当前最高：{topPred?.label} {topPred ? Math.round(topPred.probability * 100) + '%' : ''}</p>
              )}
              <div className="mt-4 rounded-lg border-2 border-[var(--lab-border)] p-4 bg-[var(--lab-panel)]">
                <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">📤 导出与分享</p>
                <button
                  type="button"
                  onClick={handleDownloadModel}
                  className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] py-3 px-5 font-bold hover:opacity-90 transition touch-manipulation"
                >
                  保存模型
                </button>
              </div>
            </>
          )}
          {selfModel && !recognitionOn && (
            <div className="mt-4 rounded-lg border-2 border-[var(--lab-border)] p-4 bg-[var(--lab-panel)]">
              <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">📤 导出与分享</p>
              <button
                type="button"
                onClick={handleDownloadModel}
                className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] py-3 px-5 font-bold hover:opacity-90 transition touch-manipulation"
              >
                保存模型
              </button>
            </div>
          )}
        </section>
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
    <>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="输入类别名称，如：拍手"
          className="flex-1 rounded-lg bg-[var(--lab-bg)] border-2 border-[var(--lab-border)] px-4 py-3 text-gray-200 placeholder-gray-500 focus:border-[var(--lab-cyan)]"
          maxLength={20}
        />
        <button type="button" onClick={handleAdd} disabled={categories.length >= MAX_CATEGORIES || !input.trim()} className="rounded-lg bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-5 py-3 font-bold disabled:opacity-50">
          新增
        </button>
      </div>
      <ul className="space-y-2 mb-6">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-[var(--lab-bg)] px-4 py-3">
            <span className="flex items-center gap-2 text-gray-200">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }} />
              {c.name}
            </span>
            <button type="button" onClick={() => onRemove(c.id)} className="text-red-400 hover:underline text-sm">删除</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onNext} disabled={!canNext} className="w-full rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] py-4 font-bold disabled:opacity-50">
        下一步：收集样本 →
      </button>
    </>
  )
}

function Step2SampleCollector({
  categories,
  samples,
  onNext,
  canNext,
  audioResumed,
  isRecording,
  recordClassId,
  onStartRecord,
  onStopRecord,
}) {
  const [activeClassId, setActiveClassId] = useState(categories[0]?.id ?? null)

  if (categories.length === 0) {
    return <p className="text-gray-400">请先回上一步建立类别</p>
  }

  return (
    <>
      <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">选择要录制的类别：</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((c, i) => {
          const count = samples[c.id]?.length ?? 0
          const isActive = activeClassId === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveClassId(c.id)}
              className={`rounded-xl px-4 py-2 font-medium flex items-center gap-2 ${isActive ? 'bg-[var(--lab-cyan)] text-[var(--lab-bg)]' : 'bg-[var(--lab-bg)] border border-[var(--lab-border)] text-gray-400'}`}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }} />
              {c.name} ({count}/{TARGET_SAMPLES_PER_CLASS})
              {count >= MIN_SAMPLES_PER_CLASS && ' ✓'}
            </button>
          )
        })}
      </div>
      <div className="flex gap-3 mb-4">
        <button
          type="button"
          disabled={!audioResumed}
          onPointerDown={() => activeClassId && onStartRecord(activeClassId)}
          onPointerUp={onStopRecord}
          onPointerLeave={onStopRecord}
          onContextMenu={(e) => e.preventDefault()}
          className={`rounded-xl py-3 px-6 font-bold touch-manipulation select-none disabled:opacity-50 ${isRecording && recordClassId === activeClassId ? 'bg-[var(--lab-green)] text-[var(--lab-bg)]' : 'border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)]'}`}
        >
          {isRecording && recordClassId === activeClassId ? '录制中…' : '按住录制'}
        </button>
      </div>
      <div className="mb-6">
        <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">已收集：</p>
        {categories.map((c, i) => (
          <p key={c.id} className="text-gray-400 text-sm flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }} />
            {c.name}：{(samples[c.id] || []).length} 段
          </p>
        ))}
      </div>
      <button type="button" onClick={onNext} disabled={!canNext} className="w-full rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] py-4 font-bold disabled:opacity-50">
        下一步：训练模型 →
      </button>
    </>
  )
}
