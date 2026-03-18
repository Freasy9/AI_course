/**
 * 小小 AI 物体侦探 - 全局类型定义
 */

/** 单一类别（例如：苹果、香蕉） */
export interface Category {
  id: string
  name: string
}

/** 每个类别对应的图片数据（base64 或 blob URL） */
export type SamplesMap = Record<string, string[]>

/** 训练后的头部模型权重（可序列化以便分享） */
export interface HeadModelWeights {
  weights: number[][]
  biases: number[]
  numClasses: number
  embeddingDim: number
  classNames: string[]
}

/** 训练状态 */
export type TrainStatus = 'idle' | 'loading' | 'training' | 'done' | 'error'
