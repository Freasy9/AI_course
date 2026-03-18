/**
 * 步骤 1：创建类别（2–4 个），输入框 + 新增按钮（Teachable Machine 风格：Gather 类别）
 */

import { useState } from 'react'
import type { Category } from '../types'
import { CLASS_COLORS, MAX_CATEGORIES, MIN_CATEGORIES } from '../constants'

interface ClassManagerProps {
  categories: Category[]
  onAdd: (name: string) => void
  onRemove: (id: string) => void
  onNext: () => void
}

export function ClassManager({
  categories,
  onAdd,
  onRemove,
  onNext,
}: ClassManagerProps) {
  const [input, setInput] = useState('')

  const handleAdd = () => {
    const name = input.trim()
    if (!name) return
    if (categories.length >= MAX_CATEGORIES) return
    onAdd(name)
    setInput('')
  }

  const canNext = categories.length >= MIN_CATEGORIES

  return (
    <div className="rounded-cartoon bg-white/90 p-6 shadow-lg max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--color-secondary)] mb-2">
        🏷️ 创建类别
      </h2>
      <p className="text-lg text-gray-700 mb-4">
        想一想你要教 AI 认识哪些东西？例如：苹果、香蕉（至少 {MIN_CATEGORIES} 个，最多 {MAX_CATEGORIES} 个）
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="输入类别名称，例如：苹果"
          className="flex-1 rounded-xl border-2 border-[var(--color-primary)] px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          maxLength={20}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={categories.length >= MAX_CATEGORIES || !input.trim()}
          className="rounded-xl bg-[var(--color-primary)] text-white px-5 py-3 font-bold text-lg disabled:opacity-50 hover:opacity-90 transition"
        >
          新增
        </button>
      </div>
      <ul className="space-y-2 mb-6">
        {categories.map((c, i) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl bg-[var(--color-bg)] px-4 py-3 text-lg"
          >
            <span className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }}
                aria-hidden
              />
              📦 {c.name}
            </span>
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="text-red-500 hover:underline text-sm font-medium"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[var(--color-accent)] font-medium mb-4">
        💡 加油！你正在教 AI 学习！
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="w-full rounded-xl bg-[var(--color-secondary)] text-white py-4 text-xl font-bold disabled:opacity-50 hover:opacity-90 transition"
      >
        下一步：收集样本 →
      </button>
    </div>
  )
}
