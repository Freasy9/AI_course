/**
 * 迁移学习：以 MobileNet 为特征提取器，训练顶层分类器
 * 参考 Google Codelab：载入 MobileNet → 提取特征 → 训练顶层
 */

import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import type { HeadModelWeights } from '../types'

let mobilenetModel: mobilenet.MobileNet | null = null
let headModel: tf.LayersModel | null = null
let embeddingDim = 0

/** 载入 MobileNet（只做特征提取，embedding=true） */
export async function loadMobileNet(): Promise<mobilenet.MobileNet> {
  if (mobilenetModel) return mobilenetModel
  mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 })
  return mobilenetModel
}

/** 将图片 URL（base64 或 blob）转成可推理的来源 */
function loadImageAsElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片载入失败'))
    img.src = src
  })
}

/** 用 MobileNet 取得单张图片的特征向量（embedding） */
export async function getEmbedding(imageSrc: string): Promise<tf.Tensor1D> {
  const net = await loadMobileNet()
  const img = await loadImageAsElement(imageSrc)
  const embedding = net.infer(img, true) as tf.Tensor
  const squeezed = embedding.squeeze()
  const rank = squeezed.rank
  if (rank === 2) {
    return squeezed as tf.Tensor1D
  }
  return squeezed.reshape([-1]) as tf.Tensor1D
}

/** 取得 embedding 维度（用第一张图推一次） */
export async function getEmbeddingDim(): Promise<number> {
  if (embeddingDim > 0) return embeddingDim
  // 用一个小假数据取得维度（实际训练时会用真实图）
  const net = await loadMobileNet()
  const dummy = tf.zeros([1, 224, 224, 3])
  const out = net.infer(dummy, true) as tf.Tensor
  const shape = out.shape
  dummy.dispose()
  out.dispose()
  embeddingDim = shape[shape.length - 1] ?? 0
  return embeddingDim
}

/** 收集所有样本的特征与标签，训练顶层模型 */
export async function trainHead(
  samplesByClass: Record<string, string[]>,
  classNames: string[],
  onProgress?: (progress: number, message: string) => void
): Promise<HeadModelWeights> {
  const net = await loadMobileNet()
  const dim = await getEmbeddingDim()
  embeddingDim = dim

  const allEmbeddings: number[][] = []
  const allLabels: number[] = []
  const total = Object.values(samplesByClass).flat().length
  let processed = 0

  for (let c = 0; c < classNames.length; c++) {
    const name = classNames[c]
    const urls = samplesByClass[name] ?? []
    for (const src of urls) {
      try {
        const img = await loadImageAsElement(src)
        const emb = net.infer(img, true) as tf.Tensor
        const arr = await emb.data()
        allEmbeddings.push(Array.from(arr))
        allLabels.push(c)
        emb.dispose()
      } catch {
        // 略过载入失败的图
      }
      processed++
      onProgress?.(processed / total, `正在提取特征 ${processed}/${total}…`)
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
        const epoch = (logs as { epoch?: number }).epoch ?? 0
        onProgress?.(0.5 + (epoch / epochs) * 0.5, `训练中… ${epoch + 1}/${epochs}`)
      },
    },
  })

  xs.dispose()
  ys.dispose()

  // 导出权重供预测与分享
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

  const weightsArray: number[][] = []
  for (let i = 0; i < rows; i++) {
    weightsArray.push(Array.from(weightsData.slice(i * cols, (i + 1) * cols)))
  }

  const result: HeadModelWeights = {
    weights: weightsArray,
    biases: Array.from(biasData),
    numClasses,
    embeddingDim: dim,
    classNames,
  }
  return result
}

/** 用当前 head 模型 + MobileNet 对单张图片做预测 */
export async function predict(
  imageSrc: string,
  headWeights: HeadModelWeights
): Promise<{ className: string; probability: number }[]> {
  const net = await loadMobileNet()
  const img = await loadImageAsElement(imageSrc)
  const emb = net.infer(img, true) as tf.Tensor
  const embedding = emb.reshape([1, -1])

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
  return results
}

/** 释放模型占用内存 */
export function disposeModels(): void {
  headModel?.dispose()
  headModel = null
  mobilenetModel = null
  embeddingDim = 0
}
