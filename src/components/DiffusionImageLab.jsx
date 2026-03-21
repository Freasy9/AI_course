/**
 * 扩散图像实验室（教学演示）
 * 用「噪声 ⟷ 清晰图」多步混合模拟「去噪」视觉效果；配合科普与闯关小题。
 * 说明：非真实扩散采样，真实模型用神经网络每步预测噪声。
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const W = 320
const H = 320
const STEPS = 12 /** 0 = 全噪, STEPS = 清晰 */

/** 绘制一幅简单「风景」到 canvas（离线、可复现） */
function drawCleanScene(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65)
  sky.addColorStop(0, '#1a3a5c')
  sky.addColorStop(1, '#4a7ab0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H * 0.65)

  const hill = ctx.createLinearGradient(0, H * 0.45, 0, H)
  hill.addColorStop(0, '#2d5a3d')
  hill.addColorStop(1, '#1a3d28')
  ctx.fillStyle = hill
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.quadraticCurveTo(W * 0.5, H * 0.55, W, H)
  ctx.lineTo(W, H * 0.65)
  ctx.lineTo(0, H * 0.65)
  ctx.closePath()
  ctx.fill()

  // 太阳
  ctx.fillStyle = '#ffd54f'
  ctx.shadowColor = 'rgba(255, 213, 79, 0.6)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(W * 0.72, H * 0.22, 36, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // 小树
  ctx.fillStyle = '#5d4037'
  ctx.fillRect(W * 0.18, H * 0.48, 14, 42)
  ctx.fillStyle = '#43a047'
  ctx.beginPath()
  ctx.arc(W * 0.25, H * 0.46, 28, 0, Math.PI * 2)
  ctx.arc(W * 0.15, H * 0.5, 22, 0, Math.PI * 2)
  ctx.fill()

  // 云朵
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ;[
    [W * 0.35, H * 0.18, 22],
    [W * 0.42, H * 0.16, 28],
    [W * 0.48, H * 0.18, 24],
  ].forEach(([x, y, r]) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** 将清晰画布与随机噪声按 t 混合：t=0 全噪，t=1 全清晰 */
function renderBlend(cleanCanvas, displayCtx, noiseBufferRef, t) {
  const cleanCtx = cleanCanvas.getContext('2d', { willReadFrequently: true })
  const imgData = cleanCtx.getImageData(0, 0, W, H)
  const out = displayCtx.createImageData(W, H)
  const clean = imgData.data
  const noise = noiseBufferRef.current
  if (!noise || noise.length !== clean.length) return

  const tt = Math.max(0, Math.min(1, t))
  // 略加强中间阶段的可感知变化（教学用）
  const eased = tt * tt * (3 - 2 * tt)

  for (let i = 0; i < clean.length; i += 4) {
    out.data[i] = noise[i] * (1 - eased) + clean[i] * eased
    out.data[i + 1] = noise[i + 1] * (1 - eased) + clean[i + 1] * eased
    out.data[i + 2] = noise[i + 2] * (1 - eased) + clean[i + 2] * eased
    out.data[i + 3] = 255
  }
  displayCtx.putImageData(out, 0, 0)
}

const QUIZ = [
  {
    q: '下面哪种说法更符合「扩散模型生成图像」的起点？',
    options: [
      { k: 'A', text: '从一张已经特别清晰的成品照片开始', correct: false },
      { k: 'B', text: '从类似电视雪花、随机噪声那样的画面开始', correct: true },
      { k: 'C', text: '从一段声音开始', correct: false },
    ],
  },
  {
    q: '在「去噪」的每一步里，我们主要在做什么？（演示中的比喻）',
    options: [
      { k: 'A', text: '往画面上再加更多噪声', correct: false },
      { k: 'B', text: '让画面从模糊/杂乱慢慢变清楚', correct: true },
      { k: 'C', text: '把图片文件体积变小', correct: false },
    ],
  },
]

export default function DiffusionImageLab() {
  const displayRef = useRef(null)
  const cleanRef = useRef(null)
  const noiseRef = useRef(null)
  const [stepIndex, setStepIndex] = useState(0)
  /** 每题选中的选项字母，未答为 undefined */
  const [quizPick, setQuizPick] = useState({})

  const progress = stepIndex / STEPS

  const initBuffers = useCallback(() => {
    if (!cleanRef.current) {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      cleanRef.current = c
      const cctx = c.getContext('2d')
      drawCleanScene(cctx)
    }
    if (!noiseRef.current) {
      const arr = new Uint8ClampedArray(W * H * 4)
      for (let i = 0; i < arr.length; i += 4) {
        arr[i] = Math.random() * 256
        arr[i + 1] = Math.random() * 256
        arr[i + 2] = Math.random() * 256
        arr[i + 3] = 255
      }
      noiseRef.current = arr
    }
  }, [])

  useEffect(() => {
    initBuffers()
  }, [initBuffers])

  useEffect(() => {
    const canvas = displayRef.current
    if (!canvas || !cleanRef.current || !noiseRef.current) return
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    renderBlend(cleanRef.current, ctx, noiseRef, progress)
  }, [stepIndex, progress, initBuffers])

  const goPrev = () => setStepIndex((s) => Math.max(0, s - 1))
  const goNext = () => setStepIndex((s) => Math.min(STEPS, s + 1))

  const phaseLabel = useMemo(() => {
    if (stepIndex === 0) return '全是噪声（起点）'
    if (stepIndex < STEPS * 0.35) return '噪声仍很多'
    if (stepIndex < STEPS * 0.65) return '轮廓渐渐出现'
    if (stepIndex < STEPS) return '越来越清楚'
    return '清晰画面（演示终点）'
  }, [stepIndex])

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto pb-4">
      <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-cyan)]/25">
        <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-2">给初中同学的小科普</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          <strong className="text-gray-300">扩散模型</strong>做图像时，可以把它想成：从一团
          <strong className="text-[var(--lab-green)]">随机噪声</strong>出发，经过很多小步骤，每一步都让画面
          <strong className="text-[var(--lab-cyan)]">少一点糊、多一点像真正的图</strong>——这就叫「去噪」。
          真的模型里，每一步由<strong className="text-gray-300">神经网络</strong>来算；这里我们用
          <strong className="text-gray-300">噪声和清晰图混合</strong>来<strong>模拟视觉效果</strong>，方便大家建立直觉。
        </p>
      </section>

      <section className="rounded-lg bg-[var(--lab-panel)]/60 p-4 tech-border">
        <h3 className="text-[var(--lab-green)] font-bold mb-3 flex items-center gap-2">
          <span>🌫️</span> 小游戏：迷雾散去
        </h3>
        <p className="text-gray-500 text-xs mb-4">
          拖动滑块或点按钮，从第 0 步（最噪）走到第 {STEPS} 步（最清晰），观察画面如何一步步显现。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <div className="relative rounded-xl overflow-hidden border-2 border-[var(--lab-cyan)]/50 shadow-[0_0_24px_rgba(0,245,255,0.15)] bg-black">
            <canvas ref={displayRef} width={W} height={H} className="block w-[min(100%,320px)] h-auto" />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-center text-xs text-[var(--lab-cyan)]">
              {phaseLabel} · 步数 {stepIndex}/{STEPS}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex justify-between text-xs text-gray-500">
            <span>噪声多</span>
            <span>更清晰</span>
          </div>
          <input
            type="range"
            min={0}
            max={STEPS}
            step={1}
            value={stepIndex}
            onChange={(e) => setStepIndex(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none bg-[var(--lab-bg)] accent-[var(--lab-green)] cursor-pointer"
          />
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={goPrev}
              disabled={stepIndex <= 0}
              className="rounded-xl border-2 border-[var(--lab-border)] px-4 py-2 text-sm text-gray-300 disabled:opacity-40 hover:border-[var(--lab-cyan)]"
            >
              ← 上一步（更噪）
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={stepIndex >= STEPS}
              className="rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.1)] px-4 py-2 text-sm text-[var(--lab-green)] font-bold disabled:opacity-40 hover:bg-[rgba(57,255,20,0.2)]"
            >
              下一步（更清）→
            </button>
            <button
              type="button"
              onClick={() => setStepIndex(0)}
              className="rounded-xl border border-[var(--lab-border)] px-3 py-2 text-xs text-gray-500 hover:text-gray-300"
            >
              重置到全噪
            </button>
            <button
              type="button"
              onClick={() => setStepIndex(STEPS)}
              className="rounded-xl border border-[var(--lab-border)] px-3 py-2 text-xs text-gray-500 hover:text-gray-300"
            >
              跳到最清晰
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border">
        <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-2">想一想</h3>
        {QUIZ.map((item, qi) => {
          const answered = quizPick[qi] !== undefined
          return (
            <div key={qi} className="mb-4 last:mb-0">
              <p className="text-gray-300 text-sm mb-2">
                {qi + 1}. {item.q}
              </p>
              <div className="flex flex-col gap-2">
                {item.options.map((opt) => {
                  const picked = quizPick[qi]
                  const isPicked = picked === opt.k
                  const showCorrect = answered && opt.correct
                  const showWrong = answered && isPicked && !opt.correct
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setQuizPick((prev) => ({ ...prev, [qi]: opt.k }))}
                      className={`text-left rounded-lg px-3 py-2 text-sm border-2 transition ${
                        showCorrect
                          ? 'border-[var(--lab-green)] bg-[rgba(57,255,20,0.15)] text-[var(--lab-green)]'
                          : showWrong
                            ? 'border-red-400/60 bg-red-500/10 text-red-300'
                            : 'border-[var(--lab-border)] text-gray-400 hover:border-[var(--lab-cyan)]/50'
                      }`}
                    >
                      <span className="font-mono mr-2">{opt.k}</span>
                      {opt.text}
                      {showCorrect && ' ✓'}
                      {showWrong && ' ✗'}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        <p className="text-xs text-gray-600 mt-3">提示：可以结合上方演示，理解「从噪声到图像」的方向。</p>
      </section>
    </div>
  )
}
