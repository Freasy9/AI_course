/**
 * 使用 public/samples/fruits 下的图片训练水果识别头，并保存为可导入的 JSON。
 * 格式与「视觉探测器」导出的模型一致，可直接在百科解码器/视觉探测器中导入。
 *
 * 前置：先运行 npm run download-samples 或手动在 fruits/类别名/ 下放入图片。
 * 运行：npm run train-fruit-model  或  node scripts/train-fruit-model.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const FRUITS_DIR = path.join(ROOT, 'public', 'samples', 'fruits')
const MODELS_DIR = path.join(ROOT, 'public', 'samples', 'models')
const OUTPUT_FILE = path.join(MODELS_DIR, 'fruit-model.json')

// 与 sampleEncyclopedia / 视觉探测器 常用类别一致
const FRUIT_CLASSES = ['苹果', '香蕉', '橙子', '葡萄', '草莓', '西瓜', '桃子', '梨']

async function loadImageAsTensor(imagePath) {
  const sharp = (await import('sharp')).default
  const tf = await import('@tensorflow/tfjs')
  const { data, info } = await sharp(imagePath)
    .resize(224, 224)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const float32 = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    float32[i * 3] = data[i * 4]
    float32[i * 3 + 1] = data[i * 4 + 1]
    float32[i * 3 + 2] = data[i * 4 + 2]
  }
  return tf.default.tensor3d(float32, [h, w, 3])
}

async function main() {
  const tf = await import('@tensorflow/tfjs')
  const mobilenet = await import('@tensorflow-models/mobilenet')

  console.log('加载 MobileNet...')
  const net = await mobilenet.default.load({ version: 2, alpha: 1.0 })
  const dummy = tf.default.zeros([1, 224, 224, 3])
  const embOut = net.infer(dummy, true)
  const dim = embOut.shape[embOut.shape.length - 1] ?? 0
  dummy.dispose()
  embOut.dispose()
  console.log('Embedding 维度:', dim)

  const allEmbeddings = []
  const allLabels = []
  const classNames = []

  for (let c = 0; c < FRUIT_CLASSES.length; c++) {
    const name = FRUIT_CLASSES[c]
    const dir = path.join(FRUITS_DIR, name)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      console.warn(`  跳过（目录不存在）: ${name}`)
      continue
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    if (files.length === 0) {
      console.warn(`  跳过（无图片）: ${name}`)
      continue
    }
    classNames.push(name)
    const label = classNames.length - 1
    for (const file of files) {
      const imagePath = path.join(dir, file)
      try {
        const tensor = await loadImageAsTensor(imagePath)
        const batch = tensor.reshape([1, 224, 224, 3])
        const emb = net.infer(batch, true)
        const arr = await emb.data()
        allEmbeddings.push(Array.from(arr))
        allLabels.push(label)
        tensor.dispose()
        batch.dispose()
        emb.dispose()
      } catch (e) {
        console.warn(`  跳过 ${name}/${file}:`, e?.message ?? String(e))
      }
    }
    console.log(`  ${name}: ${files.length} 张`)
  }

  if (classNames.length < 2 || allEmbeddings.length < 4) {
    console.error('样本不足。请在 public/samples/fruits/ 下按类别建文件夹并放入图片，或先运行 npm run download-samples')
    process.exit(1)
  }

  const numClasses = classNames.length
  console.log(`\n训练分类头（${allEmbeddings.length} 条特征, ${numClasses} 类）...`)
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
  await headModel.fit(xs, ys, { epochs: 20, batchSize: Math.min(16, Math.floor(allEmbeddings.length / 2)), verbose: 0 })
  xs.dispose()
  ys.dispose()

  const denseLayer = headModel.layers[0]
  const weights = denseLayer.getWeights()
  const [kernel, bias] = weights
  const weightsData = await kernel.data()
  const biasData = await bias.data()
  const rows = kernel.shape[0]
  const cols = kernel.shape[1]
  const weightsArray = []
  for (let i = 0; i < rows; i++) {
    weightsArray.push(Array.from(weightsData.slice(i * cols, (i + 1) * cols)))
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
  console.log('可在「视觉探测器」或「百科解码器」中通过「导入已保存的模型」选择该文件使用。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
