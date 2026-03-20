/**
 * 从 xeno-canto.org 直链下载鸟类录音（各条录音页 /{id}/download），
 * 训练与「频率监听阵列 / 百科解码器」一致的频谱特征模型 → public/models/wiki-bird-model.json
 *
 * 四类：喜鹊、乌鸦、麻雀、布谷鸟（与 SAMPLE_BIRD_ENCYCLOPEDIA 键名一致；画眉需自训）
 * 运行：node scripts/build-bird-audio-model.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import decode from 'audio-decode'
import * as tf from '@tensorflow/tfjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'models', 'wiki-bird-model.json')
const ATTRIB_FILE = path.join(ROOT, 'public', 'models', 'BIRD_AUDIO_ATTRIBUTION.md')

const FFT_SIZE = 256
const FEATURE_LEN = 128
const TARGET_SR = 44100
const HOP_MS = 100
const FRAMES_PER_SAMPLE = 12
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; EduBirdModel/1.0)'

/** 
 * 经 Content-Disposition 校验的 XC 编号（种名与中文类对应）
 * 注意：此处的类别需与 download-bird-training-audio.mjs 中的 SOURCES 保持一致
 * 添加新鸟类后需重新运行此脚本训练模型
 */
const SOURCES = {
  喜鹊: [42388, 87689, 712688, 732048],
  麻雀: [455407, 455408, 455409, 455410, 455411, 455412],
  布谷鸟: [655226, 53403, 317900, 565207, 913187],
  // 扩展鸟类（需与 download-bird-training-audio.mjs 保持一致）
  黄鹂: [150005, 694854],
  燕子: [385612, 205735, 318261, 83449],
  啄木鸟: [573226, 672087, 79043, 688153],
}

function hamming(n, N) {
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

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return Float32Array.from(input)
  const ratio = fromRate / toRate
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

function frameToNormalizedDb(mags128) {
  const clampLo = -100
  const clampHi = 0
  const row = []
  for (let i = 0; i < FEATURE_LEN; i++) {
    let v = 20 * Math.log10(Math.max(mags128[i], 1e-12))
    if (!Number.isFinite(v)) v = clampLo
    if (v < clampLo) v = clampLo
    if (v > clampHi) v = clampHi
    row.push((v - clampLo) / (clampHi - clampLo))
  }
  return row
}

function extractSample(samples441, startIdx) {
  const hop = Math.round(TARGET_SR * (HOP_MS / 1000))
  const need = FFT_SIZE + (FRAMES_PER_SAMPLE - 1) * hop
  if (startIdx + need > samples441.length) return null
  const accum = new Array(FEATURE_LEN).fill(0)
  for (let f = 0; f < FRAMES_PER_SAMPLE; f++) {
    const off = startIdx + f * hop
    const win = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i++) {
      win[i] = samples441[off + i] * hamming(i, FFT_SIZE)
    }
    const mags = rfftMag128(win)
    const norm = frameToNormalizedDb(mags)
    for (let i = 0; i < FEATURE_LEN; i++) accum[i] += norm[i]
  }
  for (let i = 0; i < FEATURE_LEN; i++) accum[i] /= FRAMES_PER_SAMPLE
  let s = 0
  for (const v of accum) s += v * v
  const n = Math.sqrt(s) || 1
  return accum.map((v) => v / n)
}

function augment(feat) {
  return feat.map((v) => Math.min(1, Math.max(0, v + (Math.random() - 0.5) * 0.06)))
}

function l2row(row) {
  let s = 0
  for (const v of row) s += v * v
  const n = Math.sqrt(s) || 1
  return row.map((v) => v / n)
}

function arrayBufferToBase64(buffer) {
  return Buffer.from(new Uint8Array(buffer)).toString('base64')
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })

  const classNames = Object.keys(SOURCES)
  const xsList = []
  const ysList = []
  const lines = [
    '# 鸟类录音来源',
    '',
    '录音来自 [xeno-canto.org](https://xeno-canto.org)，版权归原作者所有，许可以各条页面为准（多为 CC BY-NC）。仅供教学演示，勿用于商业。',
    '',
  ]

  for (let ci = 0; ci < classNames.length; ci++) {
    const label = classNames[ci]
    const ids = SOURCES[label]
    for (const id of ids) {
      const url = `https://xeno-canto.org/${id}/download`
      let fn = `XC${id}`
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } })
        if (!res.ok) throw new Error(String(res.status))
        const cd = res.headers.get('content-disposition') || ''
        const m = cd.match(/filename="([^"]+)"/)
        if (m) fn = m[1]
        lines.push(`- **${label}** — ${fn}`)

        const buf = Buffer.from(await res.arrayBuffer())
        const audioBuf = await decode(buf)
        const ch0 = audioBuf.channelData[0]
        const sr = audioBuf.sampleRate
        const samples441 = resampleLinear(ch0, sr, TARGET_SR)
        const hop = Math.round(TARGET_SR * (HOP_MS / 1000))
        const need = FFT_SIZE + (FRAMES_PER_SAMPLE - 1) * hop
        if (samples441.length < need + 200) continue

        const maxStart = samples441.length - need
        const windows = 10
        for (let w = 0; w < windows; w++) {
          const start = Math.floor((maxStart * (w + 0.2 * Math.random())) / Math.max(1, windows))
          const feat = extractSample(samples441, Math.max(0, start))
          if (!feat) continue
          xsList.push(feat)
          ysList.push(ci)
          xsList.push(l2row(augment(feat)))
          ysList.push(ci)
        }
      } catch (e) {
        console.warn(`解码失败 XC${id}:`, e.message)
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  fs.writeFileSync(ATTRIB_FILE, lines.join('\n'), 'utf8')

  if (xsList.length < 32) {
    throw new Error(`样本过少: ${xsList.length}，请检查网络。`)
  }

  const numClasses = classNames.length
  console.log(`训练 ${numClasses} 类，${xsList.length} 条向量`)

  const counts = classNames.map((_, i) => ysList.filter((y) => y === i).length)
  const classWeight = {}
  for (let i = 0; i < numClasses; i++) {
    classWeight[i] = xsList.length / (numClasses * Math.max(1, counts[i]))
  }

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [FEATURE_LEN], units: 96, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: numClasses, activation: 'softmax' }),
    ],
  })
  model.compile({ optimizer: tf.train.adam(0.0008), loss: 'categoricalCrossentropy' })

  const xs = tf.tensor2d(xsList)
  const ys = tf.oneHot(tf.tensor1d(ysList, 'int32'), numClasses)
  const epochs = 52
  const batchSize = Math.min(16, Math.max(4, Math.floor(xsList.length / 4)))

  await model.fit(xs, ys, { epochs, batchSize, classWeight, verbose: 1 })
  xs.dispose()
  ys.dispose()

  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      let weightData = artifacts.weightData
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
        modelTopology: artifacts.modelTopology,
        weightSpecs: artifacts.weightSpecs,
        weightData: arrayBufferToBase64(buf),
        classNames,
      }
      fs.writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8')
      console.log('已写入', OUT_FILE)
      return { modelArtifactsInfo: { dateSaved: new Date().toISOString() } }
    }),
  )
  model.dispose()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
