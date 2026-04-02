/**
 * 迁移学习：以 MobileNet 为特征提取器，训练顶层分类器
 * 参考 little-ai-detective / Google Codelab
 */

import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { canvasToDigitInputTensor, drawImageCover } from './digitPreprocess'

let mobilenetModel = null
let headModel = null
let embeddingDim = 0

export async function loadMobileNet() {
  if (mobilenetModel) return mobilenetModel
  mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 })
  return mobilenetModel
}

function loadImageAsElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片载入失败'))
    img.src = src
  })
}

export async function getEmbeddingDim() {
  if (embeddingDim > 0) return embeddingDim
  const net = await loadMobileNet()
  const dummy = tf.zeros([1, 224, 224, 3])
  const out = net.infer(dummy, true)
  const shape = out.shape
  dummy.dispose()
  out.dispose()
  embeddingDim = shape[shape.length - 1] ?? 0
  return embeddingDim
}

/**
 * 训练顶层分类器，返回可序列化的权重
 * @param {Record<string, string[]>} samplesByClass - 键为类别名，值为图片 dataURL 数组
 * @param {string[]} classNames - 类别名顺序
 * @param {(progress: number, message: string) => void} [onProgress]
 * @returns {Promise<HeadModelWeights>}
 */
export async function trainHead(samplesByClass, classNames, onProgress) {
  const net = await loadMobileNet()
  const dim = await getEmbeddingDim()
  embeddingDim = dim

  const allEmbeddings = []
  const allLabels = []
  const total = Object.values(samplesByClass).flat().length
  let processed = 0

  for (let c = 0; c < classNames.length; c++) {
    const name = classNames[c]
    const urls = samplesByClass[name] ?? []
    for (const src of urls) {
      try {
        const img = await loadImageAsElement(src)
        const emb = net.infer(img, true)
        const arr = await emb.data()
        allEmbeddings.push(Array.from(arr))
        allLabels.push(c)
        emb.dispose()
      } catch (_) {}
      processed++
      if (onProgress) onProgress(processed / total, `正在提取特征 ${processed}/${total}…`)
    }
  }

  if (allEmbeddings.length < 2) {
    throw new Error('样本太少，请每类至少收集几张图片再训练！')
  }

  const numClasses = classNames.length
  const xs = tf.tensor2d(allEmbeddings)
  const ys = tf.oneHot(tf.tensor1d(allLabels, 'int32'), numClasses)

  headModel = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [dim],
        units: numClasses,
        activation: 'softmax',
      }),
    ],
  })
  headModel.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  })

  const epochs = 20
  const batchSize = Math.min(32, Math.floor(allEmbeddings.length / 2))
  await headModel.fit(xs, ys, {
    epochs,
    batchSize,
    callbacks: {
      onEpochEnd: (_, logs) => {
        const epoch = logs?.epoch ?? 0
        if (onProgress) onProgress(0.5 + (epoch / epochs) * 0.5, `训练中… ${epoch + 1}/${epochs}`)
      },
    },
  })

  xs.dispose()
  ys.dispose()

  const denseLayer = headModel.layers[0]
  const weights = denseLayer.getWeights()
  const [kernel, bias] = weights
  const weightsData = await kernel.data()
  const biasData = await bias.data()
  const kernelShape = kernel.shape
  const rows = kernelShape[0] ?? 0
  const cols = kernelShape[1] ?? 0
  kernel.dispose()
  bias.dispose()

  const weightsArray = []
  for (let i = 0; i < rows; i++) {
    weightsArray.push(Array.from(weightsData.slice(i * cols, (i + 1) * cols)))
  }

  return {
    weights: weightsArray,
    biases: Array.from(biasData),
    numClasses,
    embeddingDim: dim,
    classNames,
  }
}

/**
 * 对单张图片（dataURL）做预测
 * @param {string} imageSrc - 图片的 dataURL
 * @param {HeadModelWeights} headWeights - 分类头权重
 * @returns {Promise<{ predictions: Array<{ className: string, probability: number }>, embedding: number[] }>}
 *   返回预测结果和特征向量（embedding）
 */
export async function predict(imageSrc, headWeights) {
  const net = await loadMobileNet()
  const img = await loadImageAsElement(imageSrc)
  const emb = net.infer(img, true)
  const embedding = emb.reshape([1, -1])

  // 提取特征向量数据
  const embeddingData = await emb.data()
  const embeddingArray = Array.from(embeddingData)

  const logits = tf.tensor2d(headWeights.weights)
  const bias = tf.tensor1d(headWeights.biases)
  const out = tf.softmax(tf.add(tf.matMul(embedding, logits), bias))
  const probs = await out.data()
  emb.dispose()
  embedding.dispose()
  logits.dispose()
  bias.dispose()
  out.dispose()

  const results = headWeights.classNames.map((name, i) => ({
    className: name,
    probability: probs[i],
  }))
  results.sort((a, b) => b.probability - a.probability)
  return { predictions: results, embedding: embeddingArray }
}

/**
 * 手写数字专用：与 train-digit-model 一致的 MNIST 风格预处理 + MobileNet 0–255 输入
 * @param {HTMLCanvasElement} canvas — 已绘好画面（建议 224×224，黑底 cover）
 */
export async function predictDigitFromCanvas(canvas, headWeights) {
  const net = await loadMobileNet()
  const pre = canvasToDigitInputTensor(canvas)
  const scaled = tf.mul(pre, 255)
  pre.dispose()
  const emb = net.infer(scaled, true)
  scaled.dispose()
  const embedding = emb.reshape([1, -1])
  const embeddingData = await emb.data()
  const embeddingArray = Array.from(embeddingData)

  const logits = tf.tensor2d(headWeights.weights)
  const bias = tf.tensor1d(headWeights.biases)
  const out = tf.softmax(tf.add(tf.matMul(embedding, logits), bias))
  const probs = await out.data()
  emb.dispose()
  embedding.dispose()
  logits.dispose()
  bias.dispose()
  out.dispose()

  const results = headWeights.classNames.map((name, i) => ({
    className: name,
    probability: probs[i],
  }))
  results.sort((a, b) => b.probability - a.probability)
  return { predictions: results, embedding: embeddingArray }
}

/** 从 dataURL / 路径 预测（内部先画到 canvas） */
export async function predictDigit(imageSrc, headWeights) {
  const img = await loadImageAsElement(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = 224
  canvas.height = 224
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 224, 224)
  drawImageCover(ctx, img, 224, 224)
  return predictDigitFromCanvas(canvas, headWeights)
}

export function disposeModels() {
  if (headModel) headModel.dispose()
  headModel = null
  mobilenetModel = null
  embeddingDim = 0
}
