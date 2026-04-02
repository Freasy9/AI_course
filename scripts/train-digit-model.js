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

/** 每类样本数：更高准确率需要更多数据，建议 250-300（训练时间 60-90 分钟） */
const MAX_PER_CLASS = 250
/** 批量推理，显著快于逐张 */
const INFER_BATCH = 8
/** 数据增强：为每张原始图片生成 N 个变体（旋转、缩放、噪声等） */
const AUGMENT_FACTOR = 2

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

/** 数据增强：为原始图片生成变体（在预处理前应用） */
async function processImageWithAugmentation(im, tf, augment = false) {
  const { pixels, rows, cols } = im
  let t = tf.tensor3d(pixels, [rows, cols, 1])
  
  if (augment) {
    // 随机缩放 0.95-1.05
    const scale = 0.95 + Math.random() * 0.1
    const newH = Math.max(1, Math.round(rows * scale))
    const newW = Math.max(1, Math.round(cols * scale))
    const scaled = tf.image.resizeBilinear(t, [newH, newW])
    t.dispose() // 释放原始 tensor
    
    let processed = scaled
    if (newH < rows || newW < cols) {
      // 需要 padding
      const cropped = processed.slice([0, 0, 0], [newH, newW, 1])
      processed.dispose()
      const padded = tf.pad(cropped, [
        [0, Math.max(0, rows - newH)],
        [0, Math.max(0, cols - newW)],
        [0, 0],
      ])
      cropped.dispose()
      processed = padded
    } else if (newH > rows || newW > cols) {
      // 需要裁剪
      const cropped = processed.slice([0, 0, 0], [rows, cols, 1])
      processed.dispose()
      processed = cropped
    }
    
    // 添加轻微噪声
    const noise = tf.randomNormal(processed.shape, 0, 0.03)
    const noised = processed.add(noise).clipByValue(0, 1)
    processed.dispose()
    noise.dispose()
    t = noised
  }
  
  // 统一预处理：padding + resize + 对比度增强
  const padSize = 2
  const padded = tf.pad(t, [
    [padSize, padSize],
    [padSize, padSize],
    [0, 0],
  ])
  t.dispose() // 释放 t，后续不再使用
  
  const resized = tf.image.resizeBilinear(padded, [224, 224])
  padded.dispose()
  
  const enhanced = resized.mul(1.3).clipByValue(0, 1)
  resized.dispose()
  
  const rgb = tf.concat([enhanced, enhanced, enhanced], 2)
  enhanced.dispose()
  
  return rgb
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
    console.log(`  提取数字 ${d}: ${list.length} 张（批量 ${INFER_BATCH}，增强 ${AUGMENT_FACTOR}x）`)
    
    // 处理原始图片 + 增强变体
    const allVariants = []
    for (const im of list) {
      allVariants.push({ im, augment: false }) // 原始
      for (let a = 0; a < AUGMENT_FACTOR; a++) {
        allVariants.push({ im, augment: true }) // 增强变体
      }
    }
    
    for (let start = 0; start < allVariants.length; start += INFER_BATCH) {
      const chunk = allVariants.slice(start, start + INFER_BATCH)
      const expanded = []
      for (const { im, augment } of chunk) {
        const rgb = await processImageWithAugmentation(im, tf.default, augment)
        expanded.push(rgb.expandDims(0))
      }
      const batched = tf.default.concat(expanded, 0)
      expanded.forEach((x) => x.dispose())

      // MobileNet infer 期望与 fromPixels 一致：像素约 0–255（inputRange [0,1] 时内部会 /255）
      const scaled = batched.mul(255)
      batched.dispose()
      const emb = net.infer(scaled, true)
      scaled.dispose()
      const b = emb.shape[0]
      const embData = await emb.data()
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

  // 单层分类头（兼容现有格式），但使用更强的正则化和更多训练
  const headModel = tf.default.sequential({
    layers: [
      tf.default.layers.dense({
        inputShape: [dim],
        units: numClasses,
        activation: 'softmax',
        kernelRegularizer: tf.default.regularizers.l2({ l2: 0.01 }), // L2 正则化防止过拟合
      }),
    ],
  })
  headModel.compile({
    optimizer: tf.default.train.adam(0.0008), // 适中的学习率
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  })
  await headModel.fit(xs, ys, {
    epochs: 80, // 更多轮数
    batchSize: 64,
    verbose: 1,
    validationSplit: 0.15,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0 || epoch === 79) {
          console.log(
            `  Epoch ${epoch + 1}/80 - loss: ${logs.loss.toFixed(4)}, acc: ${(logs.acc * 100).toFixed(2)}%, val_loss: ${logs.val_loss?.toFixed(4)}, val_acc: ${(logs.val_acc * 100)?.toFixed(2)}%`
          )
        }
      },
    },
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
