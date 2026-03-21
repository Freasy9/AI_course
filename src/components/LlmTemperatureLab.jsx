/**
 * AI 对话实验室：用大语言模型的「下一词概率」演示温度 T 对分布的影响
 * 使用预设 logits + softmax(z/T)，条形图展示概率；可多次抽样观察随机性
 */

import { useState, useMemo, useCallback } from 'react'
import NeonProbabilityBars from './shared/NeonProbabilityBars'
import { useTabSwitch } from '../contexts/TabSwitchContext'

/** 数值稳定的 softmax(logits / T) */
function softmaxTemperature(logits, temperature) {
  const T = Math.max(temperature, 0.05)
  const scaled = logits.map((z) => z / T)
  const m = Math.max(...scaled)
  const exps = scaled.map((z) => Math.exp(z - m))
  const s = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / s)
}

/** 按概率数组抽样，返回索引 */
function sampleFromProbs(probs) {
  const r = Math.random()
  let c = 0
  for (let i = 0; i < probs.length; i++) {
    c += probs[i]
    if (r <= c) return i
  }
  return probs.length - 1
}

const SCENARIOS = [
  {
    id: 'next-word',
    title: '下一词预测',
    context: '今天天气',
    description: '模型在词表上输出 logits，经 softmax 得到下一词概率。',
    tokens: [
      { label: '很', logit: 2.2 },
      { label: '真', logit: 1.4 },
      { label: '不', logit: 0.3 },
      { label: '还', logit: -0.5 },
      { label: '？', logit: -1.2 },
    ],
  },
  {
    id: 'ambiguous',
    title: '两强相争',
    context: '人工智能将',
    description: '两个候选 logits 接近时，温度对「谁更占优」影响更大。',
    tokens: [
      { label: '改变', logit: 1.95 },
      { label: '重塑', logit: 1.9 },
      { label: '辅助', logit: 0.4 },
      { label: '取代', logit: -0.2 },
    ],
  },
  {
    id: 'flat',
    title: '较平分布',
    context: '请选择',
    description: 'logits 较接近时，高温会让分布更均匀，抽样更「飘」。',
    tokens: [
      { label: 'A', logit: 0.5 },
      { label: 'B', logit: 0.45 },
      { label: 'C', logit: 0.4 },
      { label: 'D', logit: 0.35 },
    ],
  },
]

export default function LlmTemperatureLab() {
  const tabSwitch = useTabSwitch()
  const switchToTab = tabSwitch?.switchToTab

  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)
  const [temperature, setTemperature] = useState(1)
  const [sampleHistory, setSampleHistory] = useState([])

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) || SCENARIOS[0]
  const logits = useMemo(() => scenario.tokens.map((t) => t.logit), [scenario])
  const labels = useMemo(() => scenario.tokens.map((t) => t.label), [scenario])

  const probs = useMemo(
    () => softmaxTemperature(logits, temperature),
    [logits, temperature],
  )

  const argmaxIdx = useMemo(() => {
    let best = 0
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[best]) best = i
    }
    return best
  }, [probs])

  const handleSample = useCallback(() => {
    const idx = sampleFromProbs(probs)
    const label = labels[idx]
    setSampleHistory((h) => {
      const next = [
        { t: temperature, label, idx, p: probs[idx] },
        ...h,
      ].slice(0, 12)
      return next
    })
  }, [probs, labels, temperature])

  const handleClearHistory = useCallback(() => setSampleHistory([]), [])

  const barItems = useMemo(
    () =>
      labels.map((label, i) => ({
        key: `${scenario.id}-${label}-${i}`,
        label,
        shortLabel: label,
        value: probs[i],
      })),
    [scenario.id, labels, probs],
  )

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-cyan)]/20">
        <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-2">原理速览</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          大语言模型在每一步会对<strong className="text-gray-300">词表里的每个候选词</strong>打一个分数（logit），再经{' '}
          <strong className="text-[var(--lab-green)]">softmax</strong> 变成概率分布。
          引入<strong className="text-[var(--lab-cyan)]">温度 T</strong> 时，常用形式为：对 logits 除以 T 再 softmax，即
          P(i) ∝ exp(z<sub>i</sub> / T)。
        </p>
        <ul className="mt-2 text-xs text-gray-500 list-disc pl-5 space-y-1">
          <li>T <strong className="text-gray-400">较小</strong>：分布更「尖」，更常抽到概率最高的词（接近贪心）。</li>
          <li>T <strong className="text-gray-400">较大</strong>：分布更「平」，抽样结果更随机、更有探索感。</li>
        </ul>
      </section>

      <section className="space-y-3">
        <p className="text-gray-400 text-sm">选择演示场景（预设 logits，非真实 API）：</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setScenarioId(s.id)
                setSampleHistory([])
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium border-2 transition touch-manipulation ${
                scenarioId === s.id
                  ? 'border-[var(--lab-cyan)] bg-[rgba(0,245,255,0.12)] text-[var(--lab-cyan)]'
                  : 'border-[var(--lab-border)] text-gray-400 hover:border-[var(--lab-cyan)]/60'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
        <p className="text-[var(--lab-green)] font-mono text-sm">
          上文：<span className="text-gray-200">{scenario.context}</span>
          <span className="text-gray-500">___</span>
        </p>
        <p className="text-gray-500 text-xs">{scenario.description}</p>
      </section>

      <section className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="temp-slider" className="text-[var(--lab-cyan)] font-bold text-sm">
              温度 T = {temperature.toFixed(2)}
            </label>
            <span className="text-xs text-gray-500">0.2 — 2.0</span>
          </div>
          <input
            id="temp-slider"
            type="range"
            min={0.2}
            max={2}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none bg-[var(--lab-panel)] accent-[var(--lab-cyan)] cursor-pointer"
          />
        </div>

        <NeonProbabilityBars
          title="下一词概率（条形图）"
          headerRight={
            <span className="text-xs text-gray-500">
              当前最可能：<strong className="text-[var(--lab-green)]">{labels[argmaxIdx]}</strong>（
              {(probs[argmaxIdx] * 100).toFixed(1)}%）
            </span>
          }
          items={barItems}
        />

        <div className="rounded-lg border border-[var(--lab-border)] p-3 bg-[var(--lab-panel)]/40">
          <p className="text-xs text-gray-500 mb-2">各候选 logit（演示用固定值）：</p>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            {scenario.tokens.map((t) => (
              <span key={t.label} className="px-2 py-1 rounded bg-[var(--lab-bg)] text-gray-300">
                {t.label}: {t.logit.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={handleSample}
          className="rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.1)] text-[var(--lab-green)] px-6 py-3 font-bold hover:bg-[rgba(57,255,20,0.2)] transition touch-manipulation"
        >
          🎲 按当前概率抽一个词
        </button>
        <button
          type="button"
          onClick={handleClearHistory}
          className="rounded-xl border border-[var(--lab-border)] text-gray-400 px-4 py-2 text-sm hover:text-gray-200"
        >
          清空记录
        </button>
      </section>

      {sampleHistory.length > 0 && (
        <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border">
          <p className="text-[var(--lab-cyan)] text-sm font-bold mb-2">抽样记录（同一温度下每次也可能不同）</p>
          <ul className="text-sm text-gray-300 space-y-1 font-mono">
            {sampleHistory.map((row, i) => (
              <li key={i}>
                T={row.t.toFixed(2)} → 抽到 <strong className="text-[var(--lab-green)]">{row.label}</strong>
                <span className="text-gray-500 text-xs ml-2">（该词当时概率 {(row.p * 100).toFixed(1)}%）</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {switchToTab && (
        <section className="rounded-lg bg-[var(--lab-bg)]/80 p-4 tech-border border-[var(--lab-green)]/30">
          <p className="text-gray-400 text-sm mb-2">
            提示词写清楚、结构完整，会让模型整体更偏向你想要的答案——用同款条形图看「COSTAR 对齐度」：
          </p>
          <button
            type="button"
            onClick={() => switchToTab('costar')}
            className="text-[var(--lab-green)] font-bold text-sm underline underline-offset-2 hover:text-[var(--lab-cyan)]"
          >
            打开 COSTAR 提示词实验室 →
          </button>
        </section>
      )}
    </div>
  )
}
