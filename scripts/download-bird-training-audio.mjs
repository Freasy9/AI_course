/**
 * 下载「内置鸟类模型」训练所用的 xeno-canto 录音到本地。
 * 输出目录：public/samples/built-in-bird-calls/<类别名>/XC<id>.mp3
 *
 * 运行：npm run download-bird-calls
 * 需联网；版权见各文件及 public/models/BIRD_AUDIO_ATTRIBUTION.md
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT_ROOT = path.join(ROOT, 'public', 'samples', 'built-in-bird-calls')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; EduBirdModel/1.0)'

const SOURCES = {
  喜鹊: [42388, 87689, 712688, 732048],
  乌鸦: [727695, 731996, 486743, 209767, 166338],
  麻雀: [455407, 455408, 455409, 455410, 455411, 455412],
  布谷鸟: [655226, 53403, 317900, 565207, 913187],
}

function safeFileName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120)
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true })
  let ok = 0
  let fail = 0

  for (const [label, ids] of Object.entries(SOURCES)) {
    const dir = path.join(OUT_ROOT, label)
    fs.mkdirSync(dir, { recursive: true })
    for (const id of ids) {
      const url = `https://xeno-canto.org/${id}/download`
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } })
        if (!res.ok) throw new Error(String(res.status))
        const cd = res.headers.get('content-disposition') || ''
        const m = cd.match(/filename="([^"]+)"/)
        let fname = m ? safeFileName(m[1]) : `XC${id}.mp3`
        if (!/\.(mp3|wav|ogg)$/i.test(fname)) fname = `XC${id}.mp3`
        const buf = Buffer.from(await res.arrayBuffer())
        const outPath = path.join(dir, fname)
        fs.writeFileSync(outPath, buf)
        console.log('已保存', outPath, `(${(buf.length / 1024).toFixed(1)} KB)`)
        ok++
      } catch (e) {
        console.warn(`失败 XC${id} (${label}):`, e.message)
        fail++
      }
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  const readme = `# 内置模型训练用鸟叫（本地副本）

这些文件与 **内置鸟类识别模型**（\`public/models/wiki-bird-model.json\`）训练时使用的录音一致，来自 [xeno-canto.org](https://xeno-canto.org)。

- 重新拉取：在项目根目录执行 \`npm run download-bird-calls\`
- 可用于：在百科解码器里 **上传声音识别** 做测试
- 版权：各录音版权归记录者，许可以 xeno-canto 页面为准；仅供学习演示

已下载：**${ok}** 个文件${fail ? `，失败 ${fail} 个` : ''}。
`
  fs.writeFileSync(path.join(OUT_ROOT, 'README.md'), readme, 'utf8')
  console.log(`\n完成：成功 ${ok}，失败 ${fail}。目录：${OUT_ROOT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
