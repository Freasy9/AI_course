/**
 * 小小 AI 物体侦探 - 主应用
 * 步骤：1. 创建类别 → 2. 收集样本 → 3. 训练模型 → 4. 测试 AI
 * 参考 Teachable Machine：Gather → Train → Export / 即时测试
 */

import { useState, useCallback, useRef } from 'react'
import { ClassManager } from './components/ClassManager'
import { SampleCollector } from './components/SampleCollector'
import { Trainer } from './components/Trainer'
import { Predictor } from './components/Predictor'
import type { Category } from './types'
import type { HeadModelWeights } from './types'
import { MAX_CATEGORIES } from './constants'

const STEPS = [
  { id: 1, title: '创建类别', emoji: '🏷️' },
  { id: 2, title: '收集样本', emoji: '📷' },
  { id: 3, title: '训练模型', emoji: '🧠' },
  { id: 4, title: '测试 AI', emoji: '🔍' },
] as const

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function App() {
  const [step, setStep] = useState(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [samples, setSamples] = useState<Record<string, string[]>>({})
  const [headWeights, setHeadWeights] = useState<HeadModelWeights | null>(null)

  const addCategory = useCallback((name: string) => {
    setCategories((prev) => {
      if (prev.length >= MAX_CATEGORIES) return prev
      return [...prev, { id: generateId(), name: name.trim() }]
    })
  }, [])

  const removeCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setSamples((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const setSamplesForClass = useCallback((classId: string, urls: string[]) => {
    setSamples((prev) => ({ ...prev, [classId]: urls }))
  }, [])

  const importInputRef = useRef<HTMLInputElement>(null)
  const handleImportModel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as HeadModelWeights
        if (!data.weights || !data.classNames || data.numClasses === undefined) {
          throw new Error('无效的模型文件')
        }
        setHeadWeights(data)
        setStep(4)
      } catch {
        alert('无法读取模型，请确认是从本应用下载的 JSON 文件。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  return (
    <div className="min-h-screen py-6 px-4">
      {/* 大标题 + 步骤导航 */}
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-secondary)] mb-2 drop-shadow-sm">
          🔎 小小 AI 物体侦探
        </h1>
        <p className="text-xl text-gray-700 mb-4">
          加油！你正在教 AI 学习！全部在设备上完成，影像不会上传。
        </p>
        {/* 步骤进度条（Teachable Machine 风格） */}
        <div className="flex flex-wrap justify-center items-center gap-2 md:gap-4 mb-4">
          {STEPS.map((s) => {
            const done = s.id < step || (s.id === 3 && headWeights) || (s.id === 4 && headWeights)
            const active = step === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`rounded-xl px-4 py-2 text-lg font-medium transition flex items-center gap-1 ${
                  active
                    ? 'bg-[var(--color-primary)] text-white shadow-md'
                    : done
                      ? 'bg-white/90 text-green-700 border-2 border-green-400'
                      : 'bg-white/80 text-gray-600 hover:bg-white'
                }`}
              >
                {done && !active ? '✓' : s.emoji} {s.id}. {s.title}
              </button>
            )
          })}
        </div>
        {/* 导入模型（与 Teachable Machine Export 对应） */}
        <div className="flex justify-center">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportModel}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-xl bg-white/90 text-gray-700 px-4 py-2 text-sm font-medium border-2 border-gray-300 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
          >
            📥 导入已保存的模型
          </button>
        </div>
      </header>

      <main>
        {step === 1 && (
          <ClassManager
            categories={categories}
            onAdd={addCategory}
            onRemove={removeCategory}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <SampleCollector
            categories={categories}
            samples={samples}
            onSamplesChange={setSamplesForClass}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Trainer
            categories={categories}
            samples={samples}
            onDone={setHeadWeights}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <Predictor
            headWeights={headWeights}
            onImportClick={() => importInputRef.current?.click()}
          />
        )}
      </main>
    </div>
  )
}
