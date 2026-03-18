/**
 * 小小 AI 物体侦探 - 全局常数（参考 Teachable Machine 风格）
 */

/** 每个类别对应的标签颜色（用于徽章、进度条、预测条） */
export const CLASS_COLORS = [
  '#22c55e', // 绿
  '#a855f7', // 紫
  '#f97316', // 橙
  '#3b82f6', // 蓝
] as const

export const MIN_SAMPLES_PER_CLASS = 5
export const TARGET_SAMPLES_PER_CLASS = 20
export const MAX_SAMPLES_PER_CLASS = 50
export const MIN_CATEGORIES = 2
export const MAX_CATEGORIES = 4
