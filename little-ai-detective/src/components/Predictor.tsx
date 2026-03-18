/**
 * 步骤 4：用 webcam 即时测试，显示预测类别 + 信心度条形图；导出/导入模型（Teachable Machine 风格）
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { predict } from '../ml/transferLearning'
import type { HeadModelWeights } from '../types'
import { CLASS_COLORS } from '../constants'

const videoConstraints = { width: 224, height: 224, facingMode: 'user' }
const PREDICT_INTERVAL_MS = 300

interface PredictorProps {
  headWeights: HeadModelWeights | null
  onShare?: (data: HeadModelWeights) => void
  /** 点击「导入模型」时由 App 触发文件选择 */
  onImportClick?: () => void
}

export function Predictor({ headWeights, onImportClick }: PredictorProps) {
  const webcamRef = useRef<Webcam>(null)
  const [result, setResult] = useState<{ className: string; probability: number }[]>([])
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState('')

  const runPredict = useCallback(async () => {
    if (!headWeights || !webcamRef.current) return
    const src = webcamRef.current.getScreenshot()
    if (!src) return
    try {
      const pred = await predict(src, headWeights)
      setResult(pred)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '预测失败')
    }
  }, [headWeights])

  useEffect(() => {
    if (!cameraReady || !headWeights) return
    const id = setInterval(runPredict, PREDICT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [cameraReady, headWeights, runPredict])

  const handleDownload = () => {
    if (!headWeights) return
    const json = JSON.stringify(headWeights)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'little-ai-detective-model.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!headWeights) {
    return (
      <div className="rounded-cartoon bg-white/90 p-6 text-center text-lg">
        请先完成训练，再来测试 AI 哦！
      </div>
    )
  }

  const top = result[0]

  return (
    <div className="rounded-cartoon bg-white/90 p-6 shadow-lg max-w-xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-[var(--color-secondary)]">
        🔍 测试 AI
      </h2>
      <p className="text-lg text-gray-700">
        把东西拿到镜头前，看看 AI 猜得准不准！信心度越高越有把握哦～
      </p>
      <p className="text-sm text-gray-500 italic">
        🔒 全部在设备上完成，影像不会上传。
      </p>

      <div className="rounded-xl overflow-hidden bg-gray-900 aspect-square max-h-72 mx-auto">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          onUserMedia={() => setCameraReady(true)}
          className="w-full h-full object-cover"
        />
      </div>
      {!cameraReady && (
        <p className="text-center text-amber-600">正在开启相机…</p>
      )}

      {error && (
        <p className="text-center text-red-500 text-sm">{error}</p>
      )}

      <div className="rounded-xl bg-[var(--color-bg)] p-4">
        {top ? (
          <>
            <p className="text-2xl font-bold text-[var(--color-primary)] text-center">
              🎯 可能是：{top.className}
            </p>
            <p className="text-xl text-[var(--color-secondary)] mt-1 text-center">
              信心度：{Math.round(top.probability * 100)}%
            </p>
            {/* 各类别概率条形图（Teachable Machine 风格） */}
            <div className="mt-4 space-y-2">
              {result.map((r) => {
                const colorIdx = headWeights.classNames.indexOf(r.className) % CLASS_COLORS.length
                const color = CLASS_COLORS[colorIdx]
                const pct = Math.round(r.probability * 100)
                return (
                  <div key={r.className} className="flex items-center gap-2">
                    <span className="w-20 text-sm font-medium truncate shrink-0">{r.className}</span>
                    <div className="flex-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-10 text-sm font-bold shrink-0">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-center">等待预测…</p>
        )}
      </div>

      {/* 导出 / 导入（对应 Teachable Machine Export） */}
      <div className="flex flex-col gap-3 p-4 rounded-xl border-2 border-[var(--color-primary)]/30 bg-white/80">
        <p className="font-medium text-[var(--color-primary)]">📤 导出与分享</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-xl bg-[var(--color-accent)] text-gray-900 py-3 px-5 font-bold hover:opacity-90"
          >
            下载模型 JSON
          </button>
          {onImportClick && (
            <button
              type="button"
              onClick={onImportClick}
              className="rounded-xl bg-white text-gray-700 py-3 px-5 font-bold border-2 border-gray-300 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              📥 导入其他模型
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500">
          下载后可分享或之后用顶部「导入已保存的模型」载入；全部在设备上完成。
        </p>
      </div>
    </div>
  )
}
