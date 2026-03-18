/**
 * 载入动画：卡通风格旋转 + 鼓励文字
 */

interface LoadingSpinnerProps {
  message?: string
}

export function LoadingSpinner({ message = '载入中…' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div
        className="h-14 w-14 rounded-full border-4 border-[var(--color-secondary)] border-t-[var(--color-accent)] animate-spin"
        role="status"
        aria-label="载入中"
      />
      <p className="text-xl font-bold text-[var(--color-primary)] animate-bounce-soft">
        {message}
      </p>
    </div>
  )
}
