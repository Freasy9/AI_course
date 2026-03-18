/**
 * 下载水果图片与鸟类音频到 public/samples，供视觉/音频模块与百科解码器使用。
 * 运行：node scripts/download-samples.js
 * 需要 Node 18+（内置 fetch）或安装 node-fetch。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = path.join(__dirname, '..', 'public', 'samples')
const FRUITS_DIR = path.join(SAMPLES_DIR, 'fruits')
const BIRDS_DIR = path.join(SAMPLES_DIR, 'birds')

// 水果图片：Wikimedia Commons，可免费使用（多种许可）
const FRUIT_IMAGES = [
  { name: '苹果', file: 'apple_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/320px-Red_Apple.jpg' },
  { name: '苹果', file: 'apple_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Honeycrisp.jpg/320px-Honeycrisp.jpg' },
  { name: '香蕉', file: 'banana_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/320px-Banana-Single.jpg' },
  { name: '香蕉', file: 'banana_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Cavendish_banana.jpg/320px-Cavendish_banana.jpg' },
  { name: '橙子', file: 'orange_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Ambersweet_oranges.jpg/320px-Ambersweet_oranges.jpg' },
  { name: '橙子', file: 'orange_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Orange-Whole-2.jpg/320px-Orange-Whole-2.jpg' },
  { name: '葡萄', file: 'grape_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Table_grapes_on_white.jpg/320px-Table_grapes_on_white.jpg' },
  { name: '葡萄', file: 'grape_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Weintrauben_white_bg.jpg/320px-Weintrauben_white_bg.jpg' },
  { name: '草莓', file: 'strawberry_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/PerfectStrawberry.jpg/320px-PerfectStrawberry.jpg' },
  { name: '草莓', file: 'strawberry_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Strawberry_BNC.jpg/320px-Strawberry_BNC.jpg' },
  { name: '西瓜', file: 'watermelon_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Watermelon.jpg/320px-Watermelon.jpg' },
  { name: '西瓜', file: 'watermelon_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Watermelon_seedless.jpg/320px-Watermelon_seedless.jpg' },
  { name: '桃子', file: 'peach_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Autumn_Red_peaches.jpg/320px-Autumn_Red_peaches.jpg' },
  { name: '桃子', file: 'peach_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Peach_flowers.jpg/320px-Peach_flowers.jpg' },
  { name: '梨', file: 'pear_1.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Comice_pear_2008-09-15.jpg/320px-Comice_pear_2008-09-15.jpg' },
  { name: '梨', file: 'pear_2.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Concorde_pear_2008-09-15.jpg/320px-Concorde_pear_2008-09-15.jpg' },
]

// 鸟类音频：使用可公开访问的样本（CC0/CC-BY 等）。若链接失效可自行替换或从 Freesound / 鸟鸣库 下载后放入 birds 文件夹。
const BIRD_AUDIO = [
  { name: '麻雀', file: 'sparrow.mp3', url: 'https://cdn.freesound.org/previews/411/411409_1661760-lq.mp3' },
  { name: '乌鸦', file: 'crow.mp3', url: 'https://cdn.freesound.org/previews/388/388661_821214-lq.mp3' },
  { name: '喜鹊', file: 'magpie.mp3', url: 'https://cdn.freesound.org/previews/515/515379_1597491-lq.mp3' },
  { name: '布谷鸟', file: 'cuckoo.mp3', url: 'https://cdn.freesound.org/previews/175/175654_2398473-lq.mp3' },
  { name: '燕子', file: 'swallow.mp3', url: 'https://cdn.freesound.org/previews/411/411406_1661760-lq.mp3' },
]

const USER_AGENT = 'Mozilla/5.0 (compatible; AIGameSampleDownload/1.0; +https://github.com)'

async function download(url, filePath) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    if (bytes.length < 100) throw new Error('内容过短')
    if (bytes[0] === 0x3c) throw new Error('返回为 HTML 非图片，请检查网络或稍后重试')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, Buffer.from(buf))
    return true
  } catch (e) {
    console.warn(`  跳过 ${path.basename(filePath)}: ${e.message}`)
    return false
  }
}

async function main() {
  console.log('创建目录: public/samples/fruits, public/samples/birds')
  fs.mkdirSync(FRUITS_DIR, { recursive: true })
  fs.mkdirSync(BIRDS_DIR, { recursive: true })

  console.log('\n下载水果图片 (Wikimedia Commons)...')
  for (const { name, file, url } of FRUIT_IMAGES) {
    const subDir = path.join(FRUITS_DIR, name)
    fs.mkdirSync(subDir, { recursive: true })
    const filePath = path.join(subDir, file)
    const ok = await download(url, filePath)
    if (ok) console.log(`  OK ${name}/${file}`)
  }

  console.log('\n下载鸟类音频 (Freesound 等)...')
  for (const { name, file, url } of BIRD_AUDIO) {
    const filePath = path.join(BIRDS_DIR, file)
    const ok = await download(url, filePath)
    if (ok) console.log(`  OK ${file}`)
  }

  const readme = `# 样本资源说明

## 水果图片 (fruits/)
- 按类别名分文件夹（苹果、香蕉、橙子、葡萄、草莓、西瓜、桃子、梨），可与视觉探测器/百科解码器中的类别名对应。
- 来源：Wikimedia Commons，仅供学习与演示。

## 鸟类音频 (birds/)
- 若干鸟叫样本（如 麻雀、乌鸦、喜鹊、布谷鸟、燕子 等），可与频率监听阵列/百科解码器中的鸟类百科对应。
- 若脚本下载失败，可到 Freesound.org、xeno-canto.org 等下载后放入本文件夹，文件名可自定义。

## 使用方式
- 视觉探测器：在「收集样本」时可从本目录选择图片或拖入（需先通过本地服务器打开项目，如 npm run dev）。
- 百科解码器：上传图片/使用音频时，可引用 public/samples 下的文件路径。
`
  fs.writeFileSync(path.join(SAMPLES_DIR, 'README.md'), readme, 'utf8')
  console.log('\n已写入 public/samples/README.md')
  console.log('完成。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
