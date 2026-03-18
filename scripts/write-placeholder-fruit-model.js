/**
 * 写入一份符合格式的 fruit-model.json（占位权重），供导入流程跑通。
 * 实际识别效果有限，建议在应用内用真实样本重新训练后再导出。
 * 运行：node scripts/write-placeholder-fruit-model.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.join(__dirname, '..', 'public', 'samples', 'models')
const OUTPUT_FILE = path.join(MODELS_DIR, 'fruit-model.json')

const EMBEDDING_DIM = 1280
const CLASS_NAMES = ['苹果', '香蕉', '橙子', '葡萄', '草莓', '西瓜', '桃子', '梨']
const NUM_CLASSES = CLASS_NAMES.length

function randomSmall() {
  return (Math.random() - 0.5) * 0.02
}

const weights = []
for (let i = 0; i < EMBEDDING_DIM; i++) {
  const row = []
  for (let j = 0; j < NUM_CLASSES; j++) row.push(randomSmall())
  weights.push(row)
}
const biases = Array.from({ length: NUM_CLASSES }, () => randomSmall())

const headWeights = {
  weights,
  biases,
  numClasses: NUM_CLASSES,
  embeddingDim: EMBEDDING_DIM,
  classNames: CLASS_NAMES,
}

fs.mkdirSync(MODELS_DIR, { recursive: true })
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(headWeights), 'utf8')
console.log('已写入:', OUTPUT_FILE)
console.log('可在视觉探测器或百科解码器中「导入已保存的模型」选择该文件。')
