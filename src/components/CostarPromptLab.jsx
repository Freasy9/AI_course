/**
 * COSTAR 提示词实验室：与「AI对话实验室」同款条形图，展示「提示完整度」教学演示分（非模型真实 logprob）
 * 可与魔法咒语工坊共用 generateSpellMagicOutput 文本管线（需配置 API，见环境变量）
 */

import { useState, useMemo, useCallback } from 'react'
import { COSTAR_FIELDS, generateSpellMagicOutput } from '../services/magicSpellService'
import NeonProbabilityBars from './shared/NeonProbabilityBars'
import { useTabSwitch } from '../contexts/TabSwitchContext'
import { writeMagicSpellSync } from '../utils/magicSpellSync'

function createCostarState() {
  return {
    context: '',
    objective: '',
    style: '',
    tone: '',
    audience: '',
    response: '',
  }
}

function hasAnyPrompt(commonPrompt, costar) {
  if (String(commonPrompt ?? '').trim()) return true
  return COSTAR_FIELDS.some((f) => String(costar[f.key] ?? '').trim())
}

function scoreLine(text, key) {
  const t = String(text ?? '').trim()
  if (!t) return 0
  let v = 0.35 + 0.65 * Math.min(1, t.length / 120)
  if (key === 'context' || key === 'objective') {
    v = Math.min(1, v * 1.08)
  }
  return v
}

const PRESET_MINIMAL = {
  commonPrompt: '写点东西',
  costar: createCostarState(),
}

const PRESET_RICH = {
  commonPrompt: '为初二学生家长写一则简短通知，说明期末线上家长会的安排。',
  costar: {
    context: '本校初二年级，期末后需开线上家长会，使用腾讯会议。',
    objective: '让家长知晓时间、入会方式与需要准备的材料。',
    style: '正式、简洁、条列清晰。',
    tone: '客气、负责、不制造焦虑。',
    audience: '初二学生家长，部分可能不熟悉线上会议。',
    response: '约 200 字内，分「时间」「入会方式」「备注」三段。',
  },
}

export default function CostarPromptLab() {
  const tabSwitch = useTabSwitch()
  const switchToTab = tabSwitch?.switchToTab

  const [commonPrompt, setCommonPrompt] = useState(PRESET_MINIMAL.commonPrompt)
  const [costar, setCostar] = useState(() => ({ ...createCostarState() }))
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')
  const [genText, setGenText] = useState('')
  const [genSource, setGenSource] = useState('')
  const [genPrompt, setGenPrompt] = useState('')
  const [showSpellPrompt, setShowSpellPrompt] = useState(false)

  const barItems = useMemo(() => {
    const common = scoreLine(commonPrompt, 'common')
    const rows = [
      {
        key: 'common',
        label: '普通提示词',
        shortLabel: '普',
        value: common,
        labelColor: '#94a3b8',
        barColor: 'linear-gradient(90deg, rgba(148,163,184,0.95), rgba(71,85,105,0.75))',
      },
      ...COSTAR_FIELDS.map((f) => ({
        key: f.key,
        label: `${f.letter} ${f.label}`,
        shortLabel: f.letter,
        value: scoreLine(costar[f.key], f.key),
        labelColor: f.accent,
        barColor: `linear-gradient(90deg, ${f.accent}dd, ${f.accent}55)`,
      })),
    ]
    return rows
  }, [commonPrompt, costar])

  const avgSix = useMemo(() => {
    const s = COSTAR_FIELDS.map((f) => scoreLine(costar[f.key], f.key))
    return s.reduce((a, b) => a + b, 0) / s.length
  }, [costar])

  const setField = useCallback((key, v) => {
    setCostar((prev) => ({ ...prev, [key]: v }))
  }, [])

  const loadPreset = useCallback((which) => {
    if (which === 'min') {
      setCommonPrompt(PRESET_MINIMAL.commonPrompt)
      setCostar(createCostarState())
    } else {
      setCommonPrompt(PRESET_RICH.commonPrompt)
      setCostar({ ...PRESET_RICH.costar })
    }
    setGenError('')
    setGenText('')
    setGenSource('')
    setGenPrompt('')
  }, [])

  const handleGenerateText = useCallback(async () => {
    if (!hasAnyPrompt(commonPrompt, costar)) {
      setGenError('请至少填写「普通提示词」或 COSTAR 中任意一维，再生成。')
      return
    }
    setGenError('')
    setGenLoading(true)
    setGenText('')
    setGenSource('')
    setGenPrompt('')
    try {
      const result = await generateSpellMagicOutput({
        branch: 'text',
        commonPrompt,
        costar,
      })
      setGenText(result.text || '')
      setGenSource(result.source || '')
      setGenPrompt(result.prompt || '')
      if (result.error) {
        setGenError(result.error)
      }
    } catch (e) {
      setGenError(e?.message || '生成失败')
    } finally {
      setGenLoading(false)
    }
  }, [commonPrompt, costar])

  const handleSyncToMagic = useCallback(() => {
    if (!hasAnyPrompt(commonPrompt, costar)) {
      setGenError('请至少填写「普通提示词」或 COSTAR 中任意一维，再同步到工坊。')
      return
    }
    setGenError('')
    const ok = writeMagicSpellSync({ commonPrompt, costar })
    if (!ok) {
      setGenError('无法写入浏览器会话存储，请检查是否禁用 Cookie/存储。')
      return
    }
    switchToTab?.('magic')
  }, [commonPrompt, costar, switchToTab])

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto pb-4">
      <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-green)]/20">
        <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-2">和「AI对话实验室」的关系</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          那边用条形图表示<strong className="text-gray-300">下一词在词表上的概率</strong>（由 logits + softmax 算出）。
          这里用<strong className="text-[var(--lab-green)]">同款条形图</strong>表示<strong className="text-gray-300">提示词完整度演示分</strong>：填的维度越多、内容越具体，分数越高——用来比喻「好提示让模型更可能朝你想要的方向生成」。
          <strong className="text-amber-400/90"> 分数为教学启发式，不是 API 返回的真实概率。</strong>
        </p>
        {switchToTab && (
          <button
            type="button"
            onClick={() => switchToTab('llm')}
            className="mt-3 text-sm text-[var(--lab-cyan)] underline underline-offset-2 hover:text-[var(--lab-green)]"
          >
            去看「下一词概率」演示（AI对话实验室）→
          </button>
        )}
      </section>

      <section className="flex flex-wrap gap-2">
        <span className="text-gray-500 text-sm w-full mb-1">快速对比：</span>
        <button
          type="button"
          onClick={() => loadPreset('min')}
          className="rounded-xl border border-[var(--lab-border)] px-4 py-2 text-sm text-gray-400 hover:border-amber-500/50 hover:text-amber-200"
        >
          载入「差提示」示例
        </button>
        <button
          type="button"
          onClick={() => loadPreset('rich')}
          className="rounded-xl border-2 border-[var(--lab-green)] px-4 py-2 text-sm text-[var(--lab-green)] hover:bg-[rgba(57,255,20,0.1)]"
        >
          载入「好提示」示例（COSTAR 较全）
        </button>
      </section>

      <section className="space-y-3">
        <label className="block">
          <span className="text-[var(--lab-cyan)] font-bold text-sm mb-1 block">普通提示词</span>
          <textarea
            value={commonPrompt}
            onChange={(e) => setCommonPrompt(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-[var(--lab-bg)] border-2 border-[var(--lab-border)] px-3 py-2 text-gray-200 text-sm focus:border-[var(--lab-cyan)] focus:outline-none"
            placeholder="一句话任务，可先写得很随便…"
          />
        </label>
      </section>

      <section className="grid gap-4 sm:grid-cols-1">
        {COSTAR_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-[var(--lab-bg)]"
                style={{ backgroundColor: field.accent }}
              >
                {field.letter}
              </span>
              <span className="text-gray-200 font-medium text-sm">{field.label}</span>
            </div>
            <textarea
              value={costar[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
              rows={2}
              className="w-full rounded-lg bg-[var(--lab-bg)] border-2 border-[var(--lab-border)] px-3 py-2 text-gray-200 text-sm focus:outline-none"
              style={{ borderColor: costar[field.key]?.trim() ? `${field.accent}66` : undefined }}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </section>

      <NeonProbabilityBars
        title="提示对齐度（演示分 · 条形图）"
        headerRight={
          <span className="text-xs text-gray-500">
            COSTAR 六维平均：<strong className="text-[var(--lab-green)]">{(avgSix * 100).toFixed(0)}%</strong>
          </span>
        }
        items={barItems}
        footnote="计分规则（本地启发式）：非空则有一定基础分，随有效字数增加趋近 100%；Context / Objective 略加权。仅用于课堂直观对比。"
      />

      <section className="rounded-lg bg-[var(--lab-bg)] p-4 tech-border border-[var(--lab-cyan)]/30 space-y-4">
        <div>
          <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-1">与魔法咒语工坊 · 文本生成联动</h3>
          <p className="text-gray-500 text-xs leading-relaxed">
            下方按钮与「魔法咒语工坊」在选<strong className="text-gray-400">文本</strong>时相同：先根据 COSTAR 生成一句「创作意图」概括，再据此调用文本接口写出正文（详见{' '}
            <code className="text-[var(--lab-green)]/90">generateSpellMagicOutput</code>）。
            部署时需配置 <code className="text-gray-500">VITE_XAI_API_KEY</code> 等（见项目 <code className="text-gray-500">GITHUB_SECRETS.md</code>），否则可能为本地占位文案。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={genLoading || !hasAnyPrompt(commonPrompt, costar)}
            onClick={handleGenerateText}
            className="rounded-xl border-2 border-[var(--lab-green)] bg-[rgba(57,255,20,0.12)] text-[var(--lab-green)] px-5 py-3 font-bold hover:bg-[rgba(57,255,20,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition touch-manipulation"
          >
            {genLoading ? '正在生成…' : '🪄 生成文本（与工坊相同管线）'}
          </button>
          {switchToTab && (
            <button
              type="button"
              disabled={genLoading || !hasAnyPrompt(commonPrompt, costar)}
              onClick={handleSyncToMagic}
              className="rounded-xl border-2 border-[var(--lab-cyan)] bg-[rgba(0,245,255,0.08)] text-[var(--lab-cyan)] px-5 py-3 font-bold hover:bg-[rgba(0,245,255,0.15)] disabled:opacity-50 transition touch-manipulation"
            >
              同步到魔法工坊并打开 →
            </button>
          )}
        </div>
        {genError && (
          <p className="text-amber-400/95 text-sm border border-amber-500/30 rounded-lg px-3 py-2 bg-amber-500/10">
            {genError}
          </p>
        )}
        {genSource && (
          <p className="text-xs text-gray-500">
            来源：<span className="font-mono text-[var(--lab-cyan)]">{genSource}</span>
            {genSource === 'local' && (
              <span className="text-gray-600 ml-2">（未配置 API 时为本地占位，非真实大模型输出）</span>
            )}
          </p>
        )}
        {genPrompt && (
          <div className="border border-[var(--lab-border)] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSpellPrompt((v) => !v)}
              className="w-full flex justify-between items-center px-3 py-2 text-left text-sm text-gray-400 hover:bg-[var(--lab-panel)]"
            >
              <span>查看拼好的最终咒语（buildMagicSpellPrompt）</span>
              <span className="text-[var(--lab-cyan)]">{showSpellPrompt ? '收起' : '展开'}</span>
            </button>
            {showSpellPrompt && (
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words max-h-48 overflow-auto px-3 pb-3 font-mono border-t border-[var(--lab-border)] pt-2">
                {genPrompt}
              </pre>
            )}
          </div>
        )}
        {genText && (
          <div className="rounded-xl border border-[var(--lab-green)]/40 bg-[var(--lab-panel)]/60 p-4">
            <p className="text-[var(--lab-green)] font-bold text-sm mb-2">生成正文</p>
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed font-sans">
              {genText}
            </pre>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--lab-border)] p-4 bg-[var(--lab-panel)]/40">
        <p className="text-xs text-gray-500 leading-relaxed">
          小练习：先点「差提示」，看条形图；再点「好提示」，对比「普」与 C～R
          的变化。再试着只改某一维，观察对应字母那一行如何变化。
        </p>
      </section>
    </div>
  )
}
