/**
 * 步骤 2：每类用 webcam 捕捉或上传图片，显示已收集缩图（Teachable Machine 风格：Gather 样本）
 * 支持删除单张样本、每类进度显示、类别颜色标签
 */

import { useRef, useCallback, useState } from 'react'
import Webcam from 'react-webcam'
import type { Category } from '../types'
import {
  CLASS_COLORS,
  TARGET_SAMPLES_PER_CLASS,
  MIN_SAMPLES_PER_CLASS,
  MAX_SAMPLES_PER_CLASS,
} from '../constants'

const videoConstraints = { width: 224, height: 224, facingMode: 'user' }

interface SampleCollectorProps {
  categories: Category[]
  samples: Record<string, string[]>
  onSamplesChange: (classId: string, urls: string[]) => void
  onNext: () => void
}

export function SampleCollector({
  categories,
  samples,
  onSamplesChange,
  onNext,
}: SampleCollectorProps) {
  const webcamRef = useRef<Webcam>(null)
  const [activeClassId, setActiveClassId] = useState<string>(categories[0]?.id ?? '')
  const [cameraReady, setCameraReady] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const capture = useCallback(() => {
    const src = webcamRef.current?.getScreenshot()
    if (!src || !activeClassId) return
    const list = samples[activeClassId] ?? []
    if (list.length >= MAX_SAMPLES_PER_CLASS) return
    onSamplesChange(activeClassId, [...list, src])
  }, [activeClassId, samples, onSamplesChange])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, classId: string) => {
    setUploadError('')
    const files = e.target.files
    if (!files?.length) return
    const list = samples[classId] ?? []
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (!f.type.startsWith('image/')) continue
      urls.push(URL.createObjectURL(f))
    }
    if (urls.length + list.length > MAX_SAMPLES_PER_CLASS) {
      setUploadError(`每个类别最多 ${MAX_SAMPLES_PER_CLASS} 张，已截断。`)
      urls.splice(MAX_SAMPLES_PER_CLASS - list.length)
    }
    onSamplesChange(classId, [...list, ...urls])
    e.target.value = ''
  }

  const totalSamples = Object.values(samples).flat().length
  const canNext =
    categories.every((c) => (samples[c.id]?.length ?? 0) >= MIN_SAMPLES_PER_CLASS) &&
    totalSamples >= 10

  const removeSample = useCallback(
    (classId: string, index: number) => {
      const list = samples[classId] ?? []
      const next = list.filter((_, i) => i !== index)
      onSamplesChange(classId, next)
    },
    [samples, onSamplesChange]
  )

  if (categories.length === 0) {
    return (
      <div className="rounded-cartoon bg-white/90 p-6 text-center text-lg">
        请先回上一步建立类别哦！
      </div>
    )
  }

  return (
    <div className="rounded-cartoon bg-white/90 p-6 shadow-lg max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-[var(--color-secondary)]">
        📷 收集样本
      </h2>
      <p className="text-lg text-gray-700">
        每个类别至少 {MIN_SAMPLES_PER_CLASS} 张、建议 {TARGET_SAMPLES_PER_CLASS}+ 张（或上传图片），越多越好！AI 会更准哦 🎯
      </p>

      {/* 选择当前类别（带颜色与进度） */}
      <div>
        <p className="font-bold text-[var(--color-primary)] mb-2">选择要拍照的类别：</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => {
            const count = samples[c.id]?.length ?? 0
            const isActive = activeClassId === c.id
            const color = CLASS_COLORS[i % CLASS_COLORS.length]
            const ok = count >= MIN_SAMPLES_PER_CLASS
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveClassId(c.id)}
                className={`rounded-xl px-4 py-2 font-medium transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                {c.name} ({count} / {TARGET_SAMPLES_PER_CLASS})
                {ok && <span className="text-green-600">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Webcam */}
      <div className="rounded-xl overflow-hidden bg-gray-900 aspect-square max-h-64 mx-auto">
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
        <p className="text-center text-amber-600">正在开启相机…请允许使用镜头</p>
      )}

      <div className="flex gap-3 justify-center flex-wrap">
        <button
          type="button"
          onClick={capture}
          disabled={!cameraReady || !activeClassId}
          className="rounded-xl bg-[var(--color-accent)] text-gray-900 px-6 py-3 font-bold text-lg disabled:opacity-50 hover:opacity-90"
        >
          📸 捕捉
        </button>
        <label className="rounded-xl bg-[var(--color-secondary)] text-white px-6 py-3 font-bold text-lg cursor-pointer hover:opacity-90">
          📁 上传图片
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e, activeClassId)}
          />
        </label>
      </div>
      {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

      {/* 缩图预览（可删除单张） */}
      <div>
        <p className="font-bold text-[var(--color-primary)] mb-2">已收集的图片（点击可删除）：</p>
        {categories.map((c, classIndex) => {
          const list = samples[c.id] ?? []
          const color = CLASS_COLORS[classIndex % CLASS_COLORS.length]
          return (
            <div key={c.id} className="mb-4">
              <p className="text-gray-700 mb-1 flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                {c.name}：{list.length} / {TARGET_SAMPLES_PER_CLASS} 张
                {list.length >= MIN_SAMPLES_PER_CLASS && (
                  <span className="text-green-600 text-sm">✓ 已达最低</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1">
                {list.slice(-30).map((url, i) => {
                  const start = Math.max(0, list.length - 30)
                  const idx = start + i
                  return (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt=""
                        className="w-12 h-12 object-cover rounded-lg border-2 border-white shadow"
                      />
                      <button
                        type="button"
                        onClick={() => removeSample(c.id, idx)}
                        className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition"
                        title="删除这张"
                      >
                        删
                      </button>
                    </div>
                  )
                })}
                {list.length > 30 && (
                  <span className="text-sm text-gray-500 self-center">
                    +{list.length - 30} 张
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="w-full rounded-xl bg-[var(--color-secondary)] text-white py-4 text-xl font-bold disabled:opacity-50 hover:opacity-90"
      >
        下一步：训练模型 →
      </button>
    </div>
  )
}
