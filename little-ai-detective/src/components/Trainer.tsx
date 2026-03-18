/**
 * 步骤 3：载入 MobileNet，训练顶层分类器，显示进度条（Teachable Machine 风格：Train → 即时 Export）
 */

import { useState } from 'react'
import { trainHead } from '../ml/transferLearning'
import type { Category } from '../types'
import type { HeadModelWeights } from '../types'
import { LoadingSpinner } from './LoadingSpinner'

interface TrainerProps {
  categories: Category[]
  samples: Record<string, string[]>
  onDone: (weights: HeadModelWeights) => void
  onNext: () => void
}

export function Trainer({ categories, samples, onDone, onNext }: TrainerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'training' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleTrain = async () => {
    setStatus('loading')
    setProgress(0)
    setMessage('正在载入 AI 模型…')
    setError('')
    try {
      const classNames = categories.map((c) => c.name)
      const samplesByClass: Record<string, string[]> = {}
      categories.forEach((c) => {
        samplesByClass[c.name] = samples[c.id] ?? []
      })
      setStatus('training')
      const weights = await trainHead(samplesByClass, classNames, (p, msg) => {
        setProgress(Math.round(p * 100))
        setMessage(msg)
      })
      setProgress(100)
      setMessage('训练完成！')
      setStatus('done')
      onDone(weights)
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '训练失败')
    }
  }

  const totalSamples = Object.values(samples).flat().length
  const canTrain =
    categories.length >= 2 &&
    totalSamples >= 10 &&
    categories.every((c) => (samples[c.id]?.length ?? 0) >= 2)

  return (
    <div className="rounded-cartoon bg-white/90 p-6 shadow-lg max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--color-secondary)] mb-2">
        🧠 训练模型
      </h2>
      <p className="text-lg text-gray-700 mb-4">
        按下「训练」后，AI 会用你收集的图片学习，几十秒内就能完成！
      </p>

      {(status === 'loading' || status === 'training') && (
        <div className="mb-6">
          <LoadingSpinner message={message} />
          <div className="w-full bg-gray-200 rounded-full h-4 mt-2">
            <div
              className="h-4 rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center font-bold text-[var(--color-primary)] mt-2">
            {progress}%
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mb-4 p-4 rounded-xl bg-red-100 text-red-700">
          ❌ {error}
        </div>
      )}

      {status === 'done' && (
        <>
          <div className="mb-4 p-4 rounded-xl bg-green-100 text-green-800 font-medium">
            ✅ 训练完成！到下一步可即时测试，并下载模型（与 Teachable Machine 的 Export 一样，可之后导入使用）。
          </div>
          <p className="text-sm text-gray-600 mb-4">
            📤 在「测试 AI」页面可下载模型 JSON，之后用顶部「导入已保存的模型」即可载入。
          </p>
        </>
      )}

      <button
        type="button"
        onClick={handleTrain}
        disabled={!canTrain || status === 'loading' || status === 'training'}
        className="w-full rounded-xl bg-[var(--color-primary)] text-white py-4 text-xl font-bold disabled:opacity-50 hover:opacity-90 transition"
      >
        {status === 'idle' || status === 'error' ? '🚀 开始训练' : '训练中…'}
      </button>

      {status === 'done' && (
        <button
          type="button"
          onClick={onNext}
          className="w-full mt-3 rounded-xl bg-[var(--color-secondary)] text-white py-4 text-xl font-bold hover:opacity-90"
        >
          下一步：测试 AI →
        </button>
      )}
    </div>
  )
}
