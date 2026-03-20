/**
 * 使用 MNIST 子集 + MobileNet 特征训练手写数字分类头，输出与「视觉探测器」一致的 JSON。
 * 运行：node scripts/train-digit-model.js
 * 需联网下载 MNIST（约 10MB gzip），首次较慢。
 */

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MODELS_DIR = path.join(ROOT, 'public', 'samples', 'models')
const OUTPUT_FILE = path.join(MODELS_DIR, 'digit-model.json')

const IMAGES_URL = 'https://storage.googleapis.com/cvdf-datasets/mnist/train-images-idx3-ubyte.gz'
const LABELS_URL = 'https://storage.googleapis.com/cvdf-datasets/mnist/train-labels-idx1-ubyte.gz'

/** 每类样本数：Node 纯 CPU 跑 MobileNet 很慢，宜小；需更高精度可改为 80～200 并耐心等待 */
const MAX_PER_CLASS = 48
/** 批量推理，显著快于逐张 */
const INFER_BATCH = 8

async function fetchGzip(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`)
  const ab = await res.arrayBuffer()
  return zlib.gunzipSync(Buffer.from(ab))
}

function parseImages(buf) {
  const num = buf.readUInt32BE(4)
  const rows = buf.readUInt32BE(8)
  const cols = buf.readUInt32BE(12)
  const offset = 16
  const out = []
  for (let i = 0; i < num; i++) {
    const start = offset + i * rows * cols
    const pixels = new Float32Array(rows * cols)
    for (let j = 0; j < rows * cols; j++) pixels[j] = buf[start + j] / 255
    out.push({ pixels, rows, cols })
  }
  return out
}

function parseLabels(buf) {
  const num = buf.readUInt32BE(4)
  const labels = []
  for (let i = 0; i < num; i++) labels.push(buf[8 + i])
  return labels
}

async function main() {
  console.log('下载 MNIST 训练集…')
  const [imgBuf, labBuf] = await Promise.all([fetchGzip(IMAGES_URL), fetchGzip(LABELS_URL)])
  const images = parseImages(imgBuf)
  const labels = parseLabels(labBuf)
  if (images.length !== labels.length) throw new Error('图像与标签数量不一致')

  const byDigit = Array.from({ length: 10 }, () => [])
  for (let i = 0; i < labels.length; i++) {
    const d = labels[i]
    if (d >= 0 && d <= 9) byDigit[d].push(images[i])
  }

  const tf = await import('@tensorflow/tfjs')
  const mobilenet = await import('@tensorflow-models/mobilenet')

  console.log('加载 MobileNet…')
  const net = await mobilenet.default.load({ version: 2, alpha: 1.0 })
  const dummy = tf.default.zeros([1, 224, 224, 3])
  const embOut = net.infer(dummy, true)
  const dim = embOut.shape[embOut.shape.length - 1] ?? 0
  dummy.dispose()
  embOut.dispose()
  console.log('Embedding 维度:', dim)

  const allEmbeddings = []
  const allLabels = []
  const classNames = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  for (let d = 0; d < 10; d++) {
    const list = byDigit[d].slice(0, MAX_PER_CLASS)
    console.log(`  提取数字 ${d}: ${list.length} 张（批量 ${INFER_BATCH}）`)
    for (let start = 0; start < list.length; start += INFER_BATCH) {
      const chunk = list.slice(start, start + INFER_BATCH)
      const expanded = []
      for (const im of chunk) {
        const { pixels, rows, cols } = im
        const t = tf.default.tensor3d(pixels, [rows, cols, 1])
        const resized = tf.default.image.resizeBilinear(t, [224, 224])
        const rgb = tf.default.concat([resized, resized, resized], 2)
        expanded.push(rgb.expandDims(0))
      }
      const batched = tf.default.concat(expanded, 0)
      expanded.forEach((x) => x.dispose())

      const emb = net.infer(batched, true)
      const b = emb.shape[0]
      const embData = await emb.data()
      batched.dispose()
      emb.dispose()

      for (let i = 0; i < b; i++) {
        const off = i * dim
        const row = new Array(dim)
        for (let j = 0; j < dim; j++) row[j] = embData[off + j]
        allEmbeddings.push(row)
        allLabels.push(d)
      }
    }
  }

  const numClasses = 10
  console.log(`\n训练分类头（${allEmbeddings.length} 条特征, ${numClasses} 类）…`)
  const xs = tf.default.tensor2d(allEmbeddings)
  const ys = tf.default.oneHot(tf.default.tensor1d(allLabels, 'int32'), numClasses)

  const headModel = tf.default.sequential({
    layers: [
      tf.default.layers.dense({
        inputShape: [dim],
        units: numClasses,
        activation: 'softmax',
      }),
    ],
  })
  headModel.compile({
    optimizer: tf.default.train.adam(0.001),
    loss: 'categoricalCrossentropy',
  })
  await headModel.fit(xs, ys, {
    epochs: 18,
    batchSize: 32,
    verbose: 0,
  })
  xs.dispose()
  ys.dispose()

  const denseLayer = headModel.layers[0]
  const [kernel, bias] = denseLayer.getWeights()
  const weightsData = await kernel.data()
  const biasData = await bias.data()
  const rowsW = kernel.shape[0]
  const colsW = kernel.shape[1]
  const weightsArray = []
  for (let i = 0; i < rowsW; i++) {
    weightsArray.push(Array.from(weightsData.slice(i * colsW, (i + 1) * colsW)))
  }
  headModel.dispose()

  const headWeights = {
    weights: weightsArray,
    biases: Array.from(biasData),
    numClasses,
    embeddingDim: dim,
    classNames,
  }

  fs.mkdirSync(MODELS_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(headWeights), 'utf8')
  console.log(`\n已保存: ${OUTPUT_FILE}`)
  console.log('在「视觉探测器」中点击「导入手写数字识别（内置）」即可使用摄像头识别。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
