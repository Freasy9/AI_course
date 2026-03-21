/**
 * 与「AI对话实验室」一致的霓虹条形图：value 为 0～1，柱宽按相对最大值归一化。
 * 可用于下一词概率、COSTAR 教学对齐分等。
 */

export default function NeonProbabilityBars({
  items,
  title = '条形图',
  headerRight = null,
  footnote = null,
  /** 若 false，柱宽直接使用 value*100%（绝对比例），否则除以 max(value) */
  relativeToMax = true,
}) {
  const maxVal = relativeToMax
    ? Math.max(...items.map((i) => i.value), 1e-9)
    : 1

  return (
    <div className="rounded-lg bg-[var(--lab-bg)] tech-border overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--lab-border)] flex justify-between items-center flex-wrap gap-2">
        <span className="text-[var(--lab-cyan)] text-sm font-bold">{title}</span>
        {headerRight}
      </div>
      <div className="p-4 space-y-3">
        {items.map((row) => {
          const w = relativeToMax ? (row.value / maxVal) * 100 : row.value * 100
          const barStyle = row.barColor
            ? { background: row.barColor }
            : undefined
          return (
            <div key={row.key} className="flex items-center gap-3">
              <span
                className="w-12 sm:w-14 shrink-0 text-center font-mono text-xs sm:text-sm font-bold truncate"
                style={{ color: row.labelColor || 'var(--lab-green)' }}
                title={row.label}
              >
                {row.shortLabel ?? row.label}
              </span>
              <div className="flex-1 h-8 bg-[var(--lab-panel)] rounded overflow-hidden relative">
                <div
                  className={
                    row.barColor
                      ? 'h-full rounded transition-all duration-200'
                      : 'h-full rounded transition-all duration-200 bg-gradient-to-r from-[var(--lab-cyan)]/80 to-[var(--lab-green)]/70'
                  }
                  style={{
                    width: `${w}%`,
                    ...(barStyle || {}),
                  }}
                />
              </div>
              <span className="w-14 text-right text-xs font-mono text-gray-400 shrink-0">
                {(row.value * 100).toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
      {footnote && <div className="px-4 pb-3 text-xs text-gray-500 border-t border-[var(--lab-border)] pt-2">{footnote}</div>}
    </div>
  )
}
