/**
 * 用 Jimp 生成每类 2 张占位图，供 train-fruit-model 跑通（无网络时使用）。
 * 运行：node scripts/create-placeholder-fruits.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Jimp } from 'jimp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRUITS_DIR = path.join(__dirname, '..', 'public', 'samples', 'fruits')
const CLASSES = ['苹果', '香蕉', '橙子', '葡萄', '草莓', '西瓜', '桃子', '梨']
const COLORS = [0xff6b6bff, 0xffe066ff, 0xff9f43ff, 0xa29bfeff, 0xfd79a8ff, 0x00b894ff, 0xfdcb6eff, 0xe17055ff]

function makeRgbaBuffer(w, h, hex) {
  const r = (hex >> 24) & 0xff
  const g = (hex >> 16) & 0xff
  const b = (hex >> 8) & 0xff
  const a = hex & 0xff
  const buf = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h * 4; i += 4) {
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  return buf
}

async function main() {
  const w = 224
  const h = 224
  for (let i = 0; i < CLASSES.length; i++) {
    const name = CLASSES[i]
    const dir = path.join(FRUITS_DIR, name)
    fs.mkdirSync(dir, { recursive: true })
    const color = COLORS[i % COLORS.length]
    const data = makeRgbaBuffer(w, h, color)
    const img = await Jimp.fromBitmap({ data, width: w, height: h })
    for (let j = 1; j <= 2; j++) {
      await new Promise((res, rej) => {
        img.write(path.join(dir, `placeholder_${j}.jpg`), (err) => (err ? rej(err) : res()))
      })
    }
    console.log(`  ${name}: 2 张占位图`)
  }
  console.log('完成。可运行 npm run train-fruit-model 生成模型。')
}

main().catch((e) => { console.error(e); process.exit(1) })
