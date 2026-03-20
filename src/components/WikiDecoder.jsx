/**
 * 百科解码器（模块三）
 * 1. 选择模型类型（视觉 / 音频）并加载对应模型
 * 2. 加载百科全书（RAG：水果百科或鸟类百科等）
 * 3. 识别并显示结果 → 4. 查看百科全书 / 生成结果配图
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import { predict } from '../ml/transferLearning'
import {
  SAMPLE_FRUIT_ENCYCLOPEDIA,
  SAMPLE_BIRD_ENCYCLOPEDIA,
  ENCYCLOPEDIA_FORMAT_HINT,
} from '../data/sampleEncyclopedia'
import { generateSpellStageOutput } from '../services/magicSpellService'

/** 与魔法咒语工坊图片分支相同：走 generateSpellStageOutput({ branch: 'image' }) */
function buildWikiDecoderImagePrompt(predictions, ragText, modelType) {
  const top = predictions[0]
  const domain = modelType === 'vision' ? '水果或物体' : '鸟类'
  const name = (top?.className && String(top.className).trim()) || domain
  const rag = String(ragText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480)
  const conf = top && Number.isFinite(top.probability) ? `（识别置信约 ${Math.round(top.probability * 100)}%）` : ''
  return [
    `百科解码器配图：主题是「${name}」${conf}，类别领域：${domain}。`,
    rag
      ? `请根据以下百科说明构思画面（转化为视觉元素，图中不要出现任何文字）：${rag}`
      : `请绘制与「${name}」相关的自然、科普风格场景。`,
    '要求：高清、色彩明快、适合课堂展示；画面中禁止出现文字、字母、水印。',
  ].join('\n')
}

function inferWikiImageExt(url) {
  const u = String(url)
  if (u.startsWith('data:image/png')) return 'png'
  if (u.startsWith('data:image/jpeg') || u.startsWith('data:image/jpg')) return 'jpg'
  if (u.startsWith('data:image/webp')) return 'webp'
  return 'png'
}

function downloadWikiGeneratedImage(url, baseName) {
  const ext = inferWikiImageExt(url)
  const safe = String(baseName || 'wiki').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40)
  const name = `${safe}-${Date.now()}.${ext}`
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
    .catch(() => trigger(url))
}

const FEATURE_LEN = 128

/** 示例水果图片列表（与 public/samples/fruits/ 目录结构对应） */
const SAMPLE_FRUIT_IMAGES = [
  { category: '苹果', filename: 'apple_1.jpg', label: '苹果 #1' },
  { category: '苹果', filename: 'apple_2.jpg', label: '苹果 #2' },
  { category: '香蕉', filename: 'banana_1.jpg', label: '香蕉 #1' },
  { category: '香蕉', filename: 'banana_2.jpg', label: '香蕉 #2' },
  { category: '橙子', filename: 'orange_1.jpg', label: '橙子 #1' },
  { category: '橙子', filename: 'orange_2.jpg', label: '橙子 #2' },
  { category: '葡萄', filename: 'grape_1.jpg', label: '葡萄 #1' },
  { category: '葡萄', filename: 'grape_2.jpg', label: '葡萄 #2' },
  { category: '草莓', filename: 'strawberry_1.jpg', label: '草莓 #1' },
  { category: '草莓', filename: 'strawberry_2.jpg', label: '草莓 #2' },
  { category: '西瓜', filename: 'watermelon_1.jpg', label: '西瓜 #1' },
  { category: '西瓜', filename: 'watermelon_2.jpg', label: '西瓜 #2' },
  { category: '桃子', filename: 'peach_1.jpg', label: '桃子 #1' },
  { category: '桃子', filename: 'peach_2.jpg', label: '桃子 #2' },
  { category: '梨', filename: 'pear_1.jpg', label: '梨 #1' },
  { category: '梨', filename: 'pear_2.jpg', label: '梨 #2' },
]

/** 示例鸟类音频列表（与 public/samples/built-in-bird-calls/ 目录结构对应，每个类别选第一个文件） */
const SAMPLE_BIRD_AUDIOS = [
  { category: '喜鹊', filename: 'XC42388 - Eurasian Magpie - Pica pica.mp3', label: '喜鹊 #1' },
  { category: '乌鸦', filename: 'XC166338 - Northern Raven - Corvus corax subcorax.mp3', label: '乌鸦 #1' },
  { category: '麻雀', filename: 'XC455407 - Eurasian Tree Sparrow - Passer montanus montanus.mp3', label: '麻雀 #1' },
  { category: '布谷鸟', filename: 'XC317900 - Common Cuckoo - Cuculus canorus.mp3', label: '布谷鸟 #1' },
]
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

/** 与内置鸟类模型 / 频率阵列训练一致：多帧平均后再 L2，突出频谱形状 */
function l2NormalizeFeature(row) {
  let s = 0
  for (const v of row) s += v * v
  const n = Math.sqrt(s) || 1
  return row.map((v) => v / n)
}

const FFT_SIZE = 256
const FRAMES_AUDIO = 12
const TARGET_SR = 44100
const HOP_SAMPLES = Math.round(TARGET_SR * 0.1)

function hammingWin(n, N) {
  return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1))
}

function rfftMag128(real256) {
  const n = 256
  const out = new Float32Array(128)
  for (let k = 0; k < 128; k++) {
    let re = 0
    let im = 0
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n
      re += real256[t] * Math.cos(ang)
      im += real256[t] * Math.sin(ang)
    }
    out[k] = Math.sqrt(re * re + im * im) / n
  }
  return out
}

function resampleTo44100(input, fromRate) {
  if (fromRate === TARGET_SR) return Float32Array.from(input)
  const ratio = fromRate / TARGET_SR
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const j = Math.floor(src)
    const f = src - j
    const a = input[j] ?? 0
    const b = input[j + 1] ?? a
    out[i] = a * (1 - f) + b * f
  }
  return out
}

/** 与训练脚本一致：从 PCM 提取 128 维特征（上传文件用） */
function extractBirdFeaturesFromPcm(samples441) {
  const need = FFT_SIZE + (FRAMES_AUDIO - 1) * HOP_SAMPLES
  if (samples441.length < need) return null
  const maxStart = samples441.length - need
  const start = Math.floor(maxStart / 2)
  const accum = new Array(FEATURE_LEN).fill(0)
  const clampLo = -100
  const clampHi = 0
  for (let f = 0; f < FRAMES_AUDIO; f++) {
    const off = start + f * HOP_SAMPLES
    const win = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i++) {
      win[i] = samples441[off + i] * hammingWin(i, FFT_SIZE)
    }
    const mags = rfftMag128(win)
    for (let i = 0; i < FEATURE_LEN; i++) {
      let v = 20 * Math.log10(Math.max(mags[i], 1e-12))
      if (!Number.isFinite(v)) v = clampLo
      if (v < clampLo) v = clampLo
      if (v > clampHi) v = clampHi
      accum[i] += (v - clampLo) / (clampHi - clampLo)
    }
  }
  for (let i = 0; i < FEATURE_LEN; i++) accum[i] /= FRAMES_AUDIO
  return l2NormalizeFeature(accum)
}
function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function isValidHeadWeights(obj) {
  return (
    obj &&
    Array.isArray(obj.weights) &&
    Array.isArray(obj.biases) &&
    Array.isArray(obj.classNames) &&
    typeof obj.numClasses === 'number'
  )
}

const MODEL_TYPES = [
  {
    id: 'vision',
    label: '视觉模型',
    icon: '📷',
    sub: '可选内置水果分类头（samples/models/fruit-model.json），或导入模块一导出的 JSON',
  },
  {
    id: 'audio',
    label: '音频模型',
    icon: '🎤',
    sub: '可选内置喜鹊·乌鸦·麻雀·布谷鸟模型，或导入模块二导出的 JSON',
  },
]

export default function WikiDecoder() {
  const [modelType, setModelType] = useState('vision')
  const [headWeights, setHeadWeights] = useState(null)
  const [audioModel, setAudioModel] = useState(null)
  const [audioClassNames, setAudioClassNames] = useState([])
  const [encyclopedia, setEncyclopedia] = useState(null)
  const [recognitionOn, setRecognitionOn] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [recognizing, setRecognizing] = useState(false)
  const [ragText, setRagText] = useState('')
  const [modelError, setModelError] = useState('')
  const [wikiError, setWikiError] = useState('')
  const [cameraError, setCameraError] = useState(null)
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [loadingBuiltInBird, setLoadingBuiltInBird] = useState(false)
  const [loadingBuiltInFruit, setLoadingBuiltInFruit] = useState(false)
  const [audioUploading, setAudioUploading] = useState(false)
  const [wikiGenImageLoading, setWikiGenImageLoading] = useState(false)
  const [wikiGenImageUrl, setWikiGenImageUrl] = useState('')
  const [wikiGenImageError, setWikiGenImageError] = useState('')
  const [wikiGenImageLabel, setWikiGenImageLabel] = useState('')
  /** 第 4 步：是否展开百科正文（点击「查看百科全书」） */
  const [showWikiEncyclopedia, setShowWikiEncyclopedia] = useState(false)
  /** 第 4 步：是否展示配图区域（点击「生成结果图片」后） */
  const [showWikiImagePanel, setShowWikiImagePanel] = useState(false)
  /** 是否显示示例图片选择器 */
  const [showSampleImagePicker, setShowSampleImagePicker] = useState(false)
  /** 是否显示示例音频选择器 */
  const [showSampleAudioPicker, setShowSampleAudioPicker] = useState(false)
  /** 当前播放的示例音频 URL（用于预览） */
  const [playingSampleAudio, setPlayingSampleAudio] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const predictIntervalRef = useRef(null)
  const modelInputRef = useRef(null)
  const wikiInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const audioFileInputRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const audioStreamRef = useRef(null)
  const sampleAudioRefs = useRef({})
  const needCamera = modelType === 'vision' && recognitionOn

  const topClassKey = predictions[0]?.className ?? ''
  useEffect(() => {
    setShowWikiEncyclopedia(false)
    setShowWikiImagePanel(false)
    setWikiGenImageUrl('')
    setWikiGenImageError('')
  }, [topClassKey])

  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop())
        audioStreamRef.current = null
      }
    }
  }, [])

  // 摄像头
  useEffect(() => {
    if (!needCamera) return
    let cancelled = false
    const video = videoRef.current
    if (!video) return
    const start = async () => {
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
    start()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (video?.srcObject) video.srcObject = null
    }
  }, [needCamera])

  // 预测循环
  useEffect(() => {
    if (!recognitionOn || !headWeights || !videoRef.current) return
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
      if (video.readyState < 2) {
        if (!cancelled) predictIntervalRef.current = setTimeout(run, 200)
        return
      }
      try {
        if (!cancelled) setRecognizing(true)
        ctx.drawImage(video, 0, 0, 224, 224)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const pred = await predict(dataUrl, headWeights)
        if (!cancelled) {
          setPredictions(pred)
          const top = pred[0]
          if (top && encyclopedia && encyclopedia[top.className]) {
            setRagText(encyclopedia[top.className])
          } else if (top && encyclopedia) {
            setRagText(`百科中暂无「${top.className}」的条目，请在上方加载包含该类的百科全书。`)
          } else {
            setRagText('')
          }
        }
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
  }, [recognitionOn, headWeights, encyclopedia])

  const handleLoadModel = useCallback((e) => {
    setModelError('')
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!isValidHeadWeights(data)) {
          throw new Error('无效的模型文件，需包含 weights、biases、classNames')
        }
        setHeadWeights(data)
      } catch (err) {
        setModelError(err?.message || '无法解析模型文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleLoadAudioModel = useCallback((e) => {
    setModelError('')
    setAudioError('')
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data.modelTopology || !data.weightSpecs || !data.weightData || !Array.isArray(data.classNames) || data.classNames.length < 2) {
          throw new Error('无效的音频模型文件，需含 modelTopology、weightSpecs、weightData、classNames')
        }
        const weightData = base64ToArrayBuffer(data.weightData)
        const artifacts = { modelTopology: data.modelTopology, weightSpecs: data.weightSpecs, weightData }
        const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts))
        setAudioModel(model)
        setAudioClassNames(data.classNames)
      } catch (err) {
        setModelError(err?.message || '无法加载音频模型')
        setAudioError(err?.message || '')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const loadBuiltInBirdModel = useCallback(async () => {
    setModelError('')
    setAudioError('')
    setLoadingBuiltInBird(true)
    try {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      const url = `${base}/models/wiki-bird-model.json`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`无法加载内置模型 (${res.status})，请确认已构建并包含 public/models/wiki-bird-model.json`)
      const data = await res.json()
      if (!data.modelTopology || !data.weightSpecs || !data.weightData || !Array.isArray(data.classNames) || data.classNames.length < 2) {
        throw new Error('内置模型文件格式无效')
      }
      const weightData = base64ToArrayBuffer(data.weightData)
      const artifacts = { modelTopology: data.modelTopology, weightSpecs: data.weightSpecs, weightData }
      const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts))
      setAudioModel(model)
      setAudioClassNames(data.classNames)
    } catch (err) {
      setModelError(err?.message || '加载内置鸟类模型失败')
      setAudioError(err?.message || '')
    } finally {
      setLoadingBuiltInBird(false)
    }
  }, [])

  const loadBuiltInFruitModel = useCallback(async () => {
    setModelError('')
    setLoadingBuiltInFruit(true)
    try {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      const url = `${base}/samples/models/fruit-model.json`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(
          `无法加载内置水果模型 (${res.status})。请运行 npm run train-fruit-model 生成权重，或 npm run placeholders:fruit-model 生成占位文件（需存在 public/samples/models/fruit-model.json）`
        )
      }
      const data = await res.json()
      if (!isValidHeadWeights(data)) {
        throw new Error('内置水果模型格式无效，需含 weights、biases、classNames、numClasses')
      }
      setHeadWeights(data)
    } catch (err) {
      setModelError(err?.message || '加载内置水果模型失败')
    } finally {
      setLoadingBuiltInFruit(false)
    }
  }, [])

  const handleLoadEncyclopedia = useCallback((e) => {
    setWikiError('')
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (typeof data !== 'object' || data === null) {
          throw new Error('百科全书应为 JSON 对象，键为类别名，值为说明文字')
        }
        setEncyclopedia(data)
      } catch (err) {
        setWikiError(err?.message || '无法解析百科全书文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const useSampleEncyclopedia = useCallback(() => {
    setWikiError('')
    setEncyclopedia(SAMPLE_FRUIT_ENCYCLOPEDIA)
  }, [])

  const useSampleBirdEncyclopedia = useCallback(() => {
    setWikiError('')
    setEncyclopedia(SAMPLE_BIRD_ENCYCLOPEDIA)
  }, [])

  const downloadSampleEncyclopedia = useCallback(() => {
    const json = JSON.stringify(SAMPLE_FRUIT_ENCYCLOPEDIA, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '水果百科全书示例.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const downloadSampleBirdEncyclopedia = useCallback(() => {
    const json = JSON.stringify(SAMPLE_BIRD_ENCYCLOPEDIA, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '鸟类百科全书示例.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const SAMPLE_RATE = 44100
  const recordDurationMs = 1200
  const recordIntervalMs = 100

  const applyBirdPrediction = useCallback(
    (feat) => {
      if (!audioModel || !feat || audioClassNames.length === 0) return
      const input = tf.tensor2d([feat])
      const out = audioModel.predict(input)
      const outFlat = out.shape && out.shape.length > 1 ? out.flatten() : out
      const raw = outFlat.dataSync ? outFlat.dataSync() : null
      if (outFlat !== out) outFlat.dispose()
      input.dispose()
      out.dispose()
      const numClasses = audioClassNames.length
      const rawArr = raw && raw.length >= numClasses ? Array.from(raw).slice(0, numClasses) : []
      const arr = rawArr.map((v) => (Number.isFinite(v) ? Number(v) : 0))
      let sum = arr.reduce((a, b) => a + b, 0)
      const useEqual = sum <= 0 || !Number.isFinite(sum)
      const list = audioClassNames.map((name, i) => ({
        className: name,
        probability: useEqual ? 1 / numClasses : arr[i] / sum,
      }))
      list.sort((a, b) => b.probability - a.probability)
      setPredictions(list)
      const top = list[0]
      if (top && encyclopedia?.[top.className]) {
        setRagText(encyclopedia[top.className])
      } else if (top && encyclopedia) {
        setRagText(`百科中暂无「${top.className}」的条目，可上传包含该类的鸟类百科 JSON。`)
      } else {
        setRagText('')
      }
    },
    [audioModel, audioClassNames, encyclopedia],
  )

  const handleRecordAndRecognizeBird = useCallback(async () => {
    if (!audioModel || audioClassNames.length === 0 || !encyclopedia) {
      setAudioError('请先加载音频模型和百科全书（可点「使用示例鸟类百科」）')
      return
    }
    setAudioError('')
    setAudioRecording(true)
    try {
      let stream = audioStreamRef.current
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioStreamRef.current = stream
      }
      const actx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE })
      if (!audioContextRef.current) {
        audioContextRef.current = actx
        const src = actx.createMediaStreamSource(stream)
        const analyser = actx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        src.connect(analyser)
        analyserRef.current = analyser
      }
      if (actx.state === 'suspended') await actx.resume()
      const analyser = analyserRef.current
      const binCount = analyser.frequencyBinCount
      const inputSize = Math.min(binCount, FEATURE_LEN)
      const frames = []
      const data = new Float32Array(binCount)
      await new Promise((resolve) => {
        let elapsed = 0
        const tick = () => {
          analyser.getFloatFrequencyData(data)
          const len = Math.min(binCount, inputSize)
          frames.push(sanitizeAndNormalizeFFT(data, len))
          elapsed += recordIntervalMs
          if (elapsed < recordDurationMs) setTimeout(tick, recordIntervalMs)
          else resolve()
        }
        setTimeout(tick, recordIntervalMs)
      })
      if (frames.length === 0) throw new Error('未采集到音频')
      const dim = frames[0].length
      const avg = new Array(dim).fill(0)
      for (const f of frames) {
        for (let i = 0; i < dim; i++) avg[i] += f[i]
      }
      for (let i = 0; i < dim; i++) avg[i] /= frames.length
      const feat = l2NormalizeFeature(avg)
      applyBirdPrediction(feat)
    } catch (err) {
      setAudioError(err?.message || '录制或识别失败')
      setPredictions([])
      setRagText('')
    } finally {
      setAudioRecording(false)
    }
  }, [audioModel, audioClassNames, encyclopedia, applyBirdPrediction])

  const recognizeAudio = useCallback(
    async (audioBuffer) => {
      if (!audioModel || audioClassNames.length === 0 || !encyclopedia) {
        setAudioError('请先加载音频模型和百科全书（可点「使用示例鸟类百科」）')
        return
      }
      setAudioError('')
      setAudioUploading(true)
      try {
        const n = audioBuffer.length
        const ch = audioBuffer.numberOfChannels
        const mono = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          let s = 0
          for (let c = 0; c < ch; c++) s += audioBuffer.getChannelData(c)[i]
          mono[i] = s / ch
        }
        const s441 = resampleTo44100(mono, audioBuffer.sampleRate)
        const need = FFT_SIZE + (FRAMES_AUDIO - 1) * HOP_SAMPLES
        let feat = extractBirdFeaturesFromPcm(s441)
        if (!feat && s441.length > 0) {
          const padded = new Float32Array(Math.max(need, s441.length))
          padded.set(s441.length <= padded.length ? s441 : s441.slice(0, padded.length))
          feat = extractBirdFeaturesFromPcm(padded)
        }
        if (!feat) {
          throw new Error(
            `音频有效长度不足（建议 ≥ ${Math.ceil(need / TARGET_SR)} 秒），请换较长片段或录制识别`,
          )
        }
        applyBirdPrediction(feat)
      } catch (err) {
        setAudioError(err?.message || '无法解码或识别该音频（支持常见 mp3/wav/ogg/m4a 等）')
        setPredictions([])
        setRagText('')
      } finally {
        setAudioUploading(false)
      }
    },
    [audioModel, audioClassNames, encyclopedia, applyBirdPrediction],
  )

  const handleUploadAudioRecognize = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const arr = await file.arrayBuffer()
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const buf = await ctx.decodeAudioData(arr.slice(0))
        await recognizeAudio(buf)
      } catch (err) {
        setAudioError(err?.message || '无法读取音频文件')
        setPredictions([])
        setRagText('')
      } finally {
        e.target.value = ''
      }
    },
    [recognizeAudio],
  )

  const handleUseSampleAudio = useCallback(
    async (sample) => {
      if (!audioModel || audioClassNames.length === 0) {
        setAudioError('请先加载音频模型')
        return
      }
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      const audioUrl = `${base}/samples/built-in-bird-calls/${sample.category}/${sample.filename}`
      try {
        const response = await fetch(audioUrl)
        if (!response.ok) {
          throw new Error(`无法加载示例音频 (${response.status})`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
        await recognizeAudio(audioBuffer)
      } catch (err) {
        setAudioError(err?.message || '加载示例音频失败')
        setPredictions([])
        setRagText('')
      }
    },
    [audioModel, audioClassNames, recognizeAudio],
  )

  const recognizeImage = useCallback(
    async (dataUrl) => {
      if (!headWeights) return
      setRecognizing(true)
      try {
        const pred = await predict(dataUrl, headWeights)
        setPredictions(pred)
        const top = pred[0]
        if (top && encyclopedia?.[top.className]) {
          setRagText(encyclopedia[top.className])
        } else if (top && encyclopedia) {
          setRagText(`百科中暂无「${top.className}」的条目。`)
        } else if (top) {
          setRagText('请先加载百科全书以查看详细说明。')
        } else {
          setRagText('')
        }
      } catch (err) {
        setPredictions([])
        setRagText('识别失败：' + (err?.message || '未知错误'))
      } finally {
        setRecognizing(false)
      }
    },
    [headWeights, encyclopedia],
  )

  const handleImageUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(file)
      })
      await recognizeImage(dataUrl)
      e.target.value = ''
    },
    [recognizeImage],
  )

  const handleUseSampleImage = useCallback(
    async (sample) => {
      if (!headWeights) {
        setModelError('请先加载视觉模型')
        return
      }
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      const imgUrl = `${base}/samples/fruits/${sample.category}/${sample.filename}`
      try {
        const response = await fetch(imgUrl)
        if (!response.ok) {
          throw new Error(`无法加载示例图片 (${response.status})`)
        }
        const blob = await response.blob()
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(r.result)
          r.onerror = reject
          r.readAsDataURL(blob)
        })
        await recognizeImage(dataUrl)
      } catch (err) {
        setModelError(err?.message || '加载示例图片失败')
        setPredictions([])
        setRagText('')
      }
    },
    [headWeights, recognizeImage],
  )

  const canRecognizeVision = headWeights && encyclopedia
  const canRecognizeAudio = audioModel && audioClassNames.length > 0 && encyclopedia
  const canRecognize = modelType === 'vision' ? canRecognizeVision : canRecognizeAudio

  const hasWikiResultForImage =
    predictions.length > 0 || (typeof ragText === 'string' && ragText.trim().length > 0)

  const handleGenerateWikiImage = useCallback(async () => {
    if (!hasWikiResultForImage || predictions.length === 0) return
    setWikiGenImageError('')
    setWikiGenImageLoading(true)
    const label = predictions[0]?.className || (modelType === 'vision' ? '视觉识别' : '鸟类识别')
    try {
      const prompt = buildWikiDecoderImagePrompt(predictions, ragText, modelType)
      const out = await generateSpellStageOutput({ branch: 'image', prompt })
      setWikiGenImageUrl(out.imageUrl || '')
      setWikiGenImageLabel(label)
      if (out.error) setWikiGenImageError(out.error)
    } catch (err) {
      setWikiGenImageUrl('')
      setWikiGenImageError(err?.message || '生成失败')
    } finally {
      setWikiGenImageLoading(false)
    }
  }, [predictions, ragText, modelType, hasWikiResultForImage])

  const handleClickGenerateWikiImage = useCallback(async () => {
    setShowWikiImagePanel(true)
    await handleGenerateWikiImage()
  }, [handleGenerateWikiImage])

  const handleSaveWikiImage = useCallback(() => {
    if (!wikiGenImageUrl) return
    downloadWikiGeneratedImage(wikiGenImageUrl, `百科配图-${wikiGenImageLabel || 'result'}`)
  }, [wikiGenImageUrl, wikiGenImageLabel])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* 1. 选择模型类型并加载识别模型 */}
      <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80">
        <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2 flex items-center gap-2">
          <span>1.</span> 加载识别模型
        </h3>
        <p className="text-gray-400 text-sm mb-3">先选择模型类型，再选择对应模型文件。</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {MODEL_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setModelType(t.id)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition touch-manipulation flex items-center gap-2 ${
                modelType === t.id
                  ? 'border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)]'
                  : 'border-[var(--lab-border)] text-gray-400 hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)]'
              }`}
            >
              <span className="text-2xl">{t.icon}</span>
              <div>
                <span className="font-bold block">{t.label}</span>
                <span className="text-xs opacity-80">{t.sub}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {modelType === 'vision' && (
            <>
              <input
                ref={modelInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleLoadModel}
              />
              <button
                type="button"
                onClick={() => modelInputRef.current?.click()}
                className="rounded-xl border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)] px-4 py-2 font-bold hover:bg-[var(--lab-cyan)]/10 transition touch-manipulation"
              >
                选择视觉模型文件
              </button>
              <button
                type="button"
                onClick={loadBuiltInFruitModel}
                disabled={loadingBuiltInFruit}
                className="rounded-xl border-2 border-[var(--lab-green)] text-[var(--lab-green)] px-4 py-2 font-bold hover:bg-[var(--lab-green)]/10 transition touch-manipulation disabled:opacity-50"
              >
                {loadingBuiltInFruit ? '加载中…' : '🍎 加载内置水果模型'}
              </button>
              {headWeights && (
                <span className="text-[var(--lab-green)] text-sm font-mono">
                  已加载：{headWeights.classNames.join('、')}
                </span>
              )}
            </>
          )}
          {modelType === 'audio' && (
            <>
              <input
                ref={audioInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleLoadAudioModel}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="rounded-xl border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)] px-4 py-2 font-bold hover:bg-[var(--lab-cyan)]/10 transition touch-manipulation"
              >
                选择音频模型文件
              </button>
              <button
                type="button"
                onClick={loadBuiltInBirdModel}
                disabled={loadingBuiltInBird}
                className="rounded-xl border-2 border-[var(--lab-green)] text-[var(--lab-green)] px-4 py-2 font-bold hover:bg-[var(--lab-green)]/10 transition touch-manipulation disabled:opacity-50"
              >
                {loadingBuiltInBird ? '加载中…' : '🐦 加载内置鸟类模型'}
              </button>
              {audioClassNames.length > 0 && (
                <span className="text-[var(--lab-green)] text-sm font-mono">
                  已加载：{audioClassNames.join('、')}
                </span>
              )}
            </>
          )}
        </div>
        {(modelError || audioError) && (
          <p className="mt-2 text-red-400 text-sm">{modelError || audioError}</p>
        )}
        {modelType === 'vision' && (
          <p className="mt-3 text-gray-500 text-xs leading-relaxed">
            内置水果模型为模块一同架构的<strong className="text-gray-400">分类头权重</strong>（与
            <code className="text-gray-400 mx-0.5">public/samples/models/fruit-model.json</code>
            一致）。若 404，请执行 <code className="text-gray-400">npm run placeholders:fruit-model</code> 或{' '}
            <code className="text-gray-400">npm run train-fruit-model</code> 后刷新。
          </p>
        )}
        {modelType === 'audio' && (
          <p className="mt-3 text-gray-500 text-xs leading-relaxed">
            内置模型识别四类：<strong className="text-gray-400">喜鹊、乌鸦、麻雀、布谷鸟</strong>
            （基于 xeno-canto 公开录音训练）。请配合下方「使用示例鸟类百科」。需要「画眉」等请在频率监听阵列自训后导出 JSON。
          </p>
        )}
      </section>

      {/* 2. 加载百科全书（RAG） */}
      <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80">
        <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2 flex items-center gap-2">
          <span>2.</span> 加载百科全书（RAG 知识库）
        </h3>
        <p className="text-gray-400 text-sm mb-3">
          {modelType === 'vision'
            ? '上传 JSON 格式百科全书（键为类别名，值为说明文字），或使用示例水果百科。'
            : '上传鸟类百科 JSON，或使用示例鸟类百科，用于根据识别出的鸟叫种类展示详细说明。'}
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <input
            ref={wikiInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleLoadEncyclopedia}
          />
          <button
            type="button"
            onClick={() => wikiInputRef.current?.click()}
            className="rounded-xl border-2 border-[var(--lab-cyan)] text-[var(--lab-cyan)] px-4 py-2 font-bold hover:bg-[var(--lab-cyan)]/10 transition touch-manipulation"
          >
            上传百科全书 JSON
          </button>
          {modelType === 'vision' && (
            <button
              type="button"
              onClick={useSampleEncyclopedia}
              className="rounded-xl border-2 border-[var(--lab-green)]/70 text-[var(--lab-green)] px-4 py-2 font-bold hover:bg-[var(--lab-green)]/10 transition touch-manipulation"
            >
              使用示例水果百科
            </button>
          )}
          {modelType === 'audio' && (
            <button
              type="button"
              onClick={useSampleBirdEncyclopedia}
              className="rounded-xl border-2 border-[var(--lab-green)]/70 text-[var(--lab-green)] px-4 py-2 font-bold hover:bg-[var(--lab-green)]/10 transition touch-manipulation"
            >
              使用示例鸟类百科
            </button>
          )}
          <button
            type="button"
            onClick={modelType === 'audio' ? downloadSampleBirdEncyclopedia : downloadSampleEncyclopedia}
            className="rounded-xl border border-[var(--lab-border)] text-gray-400 px-4 py-2 text-sm hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)] transition touch-manipulation"
          >
            {modelType === 'audio' ? '下载鸟类百科模板' : '下载示例百科模板'}
          </button>
        </div>
        {encyclopedia && (
          <p className="text-[var(--lab-green)] text-sm">
            已加载 {Object.keys(encyclopedia).length} 个百科条目
          </p>
        )}
        {wikiError && <p className="mt-2 text-red-400 text-sm">{wikiError}</p>}
        <p className="text-gray-500 text-xs mt-2 font-mono whitespace-pre-line">
          {ENCYCLOPEDIA_FORMAT_HINT}
        </p>
      </section>

      {/* 3. 识别结果 */}
      <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80">
        <h3 className="text-[var(--lab-cyan)] font-bold text-lg mb-2 flex items-center gap-2">
          <span>3.</span> 识别结果
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          {modelType === 'vision'
            ? '加载模型与百科全书后，上传图片或开启摄像头；本步仅展示识别出的类别与置信度。百科与配图请在下一步操作。'
            : '加载音频模型与鸟类百科后，上传声音或录制识别；本步展示识别种类。百科正文与结果配图请在步骤 4 查看或生成。'}
        </p>

        {!canRecognize && (
          <p className="text-amber-400/90 text-sm mb-4">
            请先完成步骤 1 和 2：加载模型与百科全书{modelType === 'audio' ? '（音频模式建议使用「使用示例鸟类百科」）' : ''}。
          </p>
        )}

        {modelType === 'vision' && (
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap gap-3">
              <label className="rounded-xl border-2 border-[var(--lab-border)] px-4 py-2 text-gray-300 text-sm font-medium cursor-pointer hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)] transition touch-manipulation">
                上传图片识别
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={!canRecognize}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowSampleImagePicker(!showSampleImagePicker)}
                disabled={!canRecognize}
                className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] px-4 py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--lab-cyan)]/20 transition touch-manipulation"
              >
                {showSampleImagePicker ? '收起示例' : '📷 使用示例图片'}
              </button>
              {!recognitionOn ? (
                <button
                  type="button"
                  onClick={() => setRecognitionOn(true)}
                  disabled={!canRecognize}
                  className="rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] px-4 py-2 font-bold disabled:opacity-50 hover:bg-[var(--lab-green)]/20 transition touch-manipulation"
                >
                  开启摄像头识别
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecognitionOn(false)}
                  className="rounded-xl border-2 border-red-400/60 text-red-400 px-4 py-2 font-bold hover:bg-red-400/10 transition touch-manipulation"
                >
                  关闭摄像头
                </button>
              )}
            </div>
            {showSampleImagePicker && canRecognize && (
              <div className="rounded-lg border-2 border-[var(--lab-cyan)]/40 bg-[var(--lab-bg)]/60 p-4">
                <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">选择示例图片（来自 samples/fruits/）</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-3">
                  {SAMPLE_FRUIT_IMAGES.map((sample, idx) => {
                    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
                    const imgUrl = `${base}/samples/fruits/${sample.category}/${sample.filename}`
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleUseSampleImage(sample)}
                        disabled={recognizing}
                        className="relative rounded-lg border-2 border-[var(--lab-border)] bg-[var(--lab-panel)]/50 overflow-hidden hover:border-[var(--lab-cyan)] hover:bg-[var(--lab-cyan)]/10 transition-all touch-manipulation disabled:opacity-50 group"
                      >
                        <img
                          src={imgUrl}
                          alt={sample.label}
                          className="w-full h-20 object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="absolute bottom-1 left-1 right-1 text-[10px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-center">
                          {sample.category}
                        </span>
                        {recognizing && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <span className="text-[var(--lab-cyan)] text-xs">识别中…</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-gray-500 text-[10px] mt-2">
                  点击任意缩略图将自动加载并识别（需先加载模型与百科全书）
                </p>
              </div>
            )}
          </div>
        )}

        {modelType === 'audio' && (
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex flex-col gap-1">
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac"
                  className="hidden"
                  onChange={handleUploadAudioRecognize}
                  disabled={!canRecognizeAudio || audioUploading || audioRecording}
                />
                <button
                  type="button"
                  onClick={() => audioFileInputRef.current?.click()}
                  disabled={!canRecognizeAudio || audioUploading || audioRecording}
                  className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] px-5 py-4 font-bold disabled:opacity-50 hover:bg-[var(--lab-cyan)]/20 transition touch-manipulation min-h-[56px]"
                >
                  {audioUploading ? '识别中…' : '📂 上传声音识别'}
                </button>
                <span className="text-gray-500 text-[11px] max-w-[200px]">mp3 / wav / ogg 等，建议 ≥1.3 秒鸟叫片段</span>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setShowSampleAudioPicker(!showSampleAudioPicker)}
                  disabled={!canRecognizeAudio || audioUploading || audioRecording}
                  className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] px-5 py-4 font-bold disabled:opacity-50 hover:bg-[var(--lab-cyan)]/20 transition touch-manipulation min-h-[56px]"
                >
                  {showSampleAudioPicker ? '收起示例' : '🎵 使用示例音频'}
                </button>
                <span className="text-gray-500 text-[11px] max-w-[200px]">从 samples/built-in-bird-calls/ 选择</span>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleRecordAndRecognizeBird}
                  disabled={!canRecognizeAudio || audioRecording || audioUploading}
                  className="rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] px-6 py-4 font-bold disabled:opacity-50 hover:bg-[var(--lab-green)]/20 transition touch-manipulation min-h-[56px]"
                >
                  {audioRecording ? '正在录制并识别…' : '🎤 录制并识别鸟叫'}
                </button>
                <span className="text-gray-500 text-[11px] max-w-[200px]">约 1 秒对着麦克风播放</span>
              </div>
            </div>
            {showSampleAudioPicker && canRecognizeAudio && (
              <div className="rounded-lg border-2 border-[var(--lab-cyan)]/40 bg-[var(--lab-bg)]/60 p-4">
                <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">选择示例音频（来自 samples/built-in-bird-calls/）</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SAMPLE_BIRD_AUDIOS.map((sample, idx) => {
                    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
                    const audioUrl = `${base}/samples/built-in-bird-calls/${sample.category}/${sample.filename}`
                    const audioKey = `${sample.category}-${idx}`
                    const isPlaying = playingSampleAudio === audioKey
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-lg border border-[var(--lab-border)] bg-[var(--lab-panel)]/50 p-3 hover:border-[var(--lab-cyan)] transition"
                      >
                        <audio
                          ref={(el) => {
                            if (el) sampleAudioRefs.current[audioKey] = el
                            else delete sampleAudioRefs.current[audioKey]
                          }}
                          src={audioUrl}
                          preload="metadata"
                          onPlay={() => {
                            Object.keys(sampleAudioRefs.current).forEach((k) => {
                              if (k !== audioKey && !sampleAudioRefs.current[k].paused) {
                                sampleAudioRefs.current[k].pause()
                              }
                            })
                            setPlayingSampleAudio(audioKey)
                          }}
                          onEnded={() => setPlayingSampleAudio(null)}
                          onPause={() => {
                            if (playingSampleAudio === audioKey) setPlayingSampleAudio(null)
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const audio = sampleAudioRefs.current[audioKey]
                            if (!audio) return
                            if (isPlaying) {
                              audio.pause()
                            } else {
                              audio.play().catch(() => {})
                            }
                          }}
                          disabled={audioUploading || audioRecording}
                          className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] flex items-center justify-center hover:bg-[var(--lab-cyan)]/20 transition disabled:opacity-50 text-lg"
                        >
                          {isPlaying ? '⏸️' : '▶️'}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{sample.category}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {sample.filename.replace(/^XC\d+ - /, '').replace(/\.mp3$/, '')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUseSampleAudio(sample)}
                          disabled={audioUploading || audioRecording}
                          className="flex-shrink-0 rounded-lg border border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--lab-green)]/20 transition disabled:opacity-50"
                        >
                          {audioUploading ? '识别中…' : '识别'}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <p className="text-gray-500 text-[10px] mt-2">
                  点击 ▶️ 预览音频，点击「识别」按钮进行识别（需先加载模型与百科全书）
                </p>
              </div>
            )}
          </div>
        )}

        {modelType === 'vision' && recognitionOn && (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-64 border-2 border-[var(--lab-cyan)] mb-4">
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
        )}

        {/* 识别进度 */}
        {modelType === 'vision' && recognizing && (
          <div className="rounded-lg bg-[var(--lab-bg)] p-3 tech-border mb-4">
            <p className="text-[var(--lab-cyan)] text-sm font-medium mb-2">识别中…</p>
            <div className="h-2 bg-[var(--lab-panel)] rounded-full overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[var(--lab-cyan)] animate-recognize-progress" />
            </div>
          </div>
        )}

        {/* 步骤 3：仅展示识别 Top1 */}
        {predictions.length > 0 && (
          <div className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border">
            <p className="text-[var(--lab-cyan)] font-bold mb-2">当前识别结果</p>
            {(() => {
              const top = predictions[0]
              if (!top) return null
              const pct = Math.round(top.probability * 100)
              const isHigh = top.probability >= 0.9
              return (
                <div
                  className={`flex justify-between items-center gap-2 rounded px-3 py-2 ${isHigh ? 'bg-[var(--lab-green)]/15 border border-[var(--lab-green)]/50' : ''}`}
                >
                  <span className={isHigh ? 'font-bold text-[var(--lab-green)]' : 'text-gray-300'}>
                    🎯 {top.className}
                  </span>
                  <span
                    className={`font-mono ${isHigh ? 'font-bold text-[var(--lab-green)]' : 'text-[var(--lab-green)]'}`}
                  >
                    {pct}%
                  </span>
                </div>
              )
            })()}
          </div>
        )}
      </section>

      {/* 4. 查看百科全书 · 生成结果图片 */}
      {predictions.length > 0 && (
        <section className="tech-border rounded-lg p-5 bg-[var(--lab-panel)]/80 border-[var(--lab-green)]/20">
          <h3 className="text-[var(--lab-green)] font-bold text-lg mb-2 flex items-center gap-2">
            <span>4.</span> 查看百科与配图
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            识别已完成，请选择：<strong className="text-gray-300">查看百科全书</strong>展开对应条目，或
            <strong className="text-gray-300"> 生成结果图片</strong>
            （与魔法咒语工坊图片接口一致，需配置 API）。
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              type="button"
              onClick={() => setShowWikiEncyclopedia(true)}
              className="rounded-xl border-2 border-[var(--lab-green)] bg-[var(--lab-green)]/10 text-[var(--lab-green)] px-5 py-3 font-bold hover:bg-[var(--lab-green)]/20 transition touch-manipulation"
            >
              📖 查看百科全书
            </button>
            <button
              type="button"
              onClick={handleClickGenerateWikiImage}
              disabled={wikiGenImageLoading}
              className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10 text-[var(--lab-cyan)] px-5 py-3 font-bold hover:bg-[var(--lab-cyan)]/20 transition touch-manipulation disabled:opacity-50"
            >
              {wikiGenImageLoading ? '正在生成图片…' : '🖼️ 生成结果图片'}
            </button>
          </div>

          {showWikiEncyclopedia && (
            <div className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-green)]/30 mb-4">
              <p className="text-[var(--lab-green)] font-bold mb-2">百科全书（RAG）</p>
              {ragText ? (
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{ragText}</p>
              ) : (
                <p className="text-gray-500 text-sm">暂无百科正文，请确认已加载百科全书且类别匹配。</p>
              )}
            </div>
          )}

          {showWikiImagePanel && (
            <div className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-cyan)]/35">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <p className="text-[var(--lab-cyan)] font-bold text-sm w-full sm:w-auto">结果配图</p>
                {wikiGenImageUrl && !wikiGenImageLoading && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveWikiImage}
                      className="rounded-xl border-2 border-[var(--lab-green)] text-[var(--lab-green)] px-4 py-2 font-bold hover:bg-[var(--lab-green)]/10 transition touch-manipulation"
                    >
                      💾 保存图片
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateWikiImage}
                      className="rounded-xl border border-[var(--lab-border)] text-gray-400 px-4 py-2 text-sm hover:border-[var(--lab-cyan)] hover:text-[var(--lab-cyan)] transition touch-manipulation"
                    >
                      重新生成
                    </button>
                  </>
                )}
              </div>
              {wikiGenImageLoading && (
                <p className="text-gray-400 text-sm mb-2">正在根据识别结果与百科内容生成配图…</p>
              )}
              {wikiGenImageError && (
                <p className="text-amber-400/90 text-xs mb-2">{wikiGenImageError}</p>
              )}
              {wikiGenImageUrl && !wikiGenImageLoading && (
                <div className="rounded-lg overflow-hidden border border-[var(--lab-border)] bg-black/30">
                  <img
                    src={wikiGenImageUrl}
                    alt="根据识别结果生成的配图"
                    className="w-full max-h-80 object-contain mx-auto"
                  />
                </div>
              )}
              {!wikiGenImageUrl && !wikiGenImageLoading && !wikiGenImageError && (
                <p className="text-gray-500 text-xs">若生成失败，请检查网络与 VITE_XAI_API_KEY / 后端图片接口。</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
