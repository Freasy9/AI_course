/**
 * 视觉模型全局单例（React Context）。
 * Vision Model 实例在此处全局可用：视觉探测器训练/导入后写入，机甲模拟训练从此读取。
 * 确保全应用仅此一份手势模型引用，模块四进入时自动检测 gestureHeadWeights 是否已加载。
 */
import { createContext, useContext, useState, useCallback } from 'react'

const VisionModelContext = createContext(null)

export function VisionModelProvider({ children }) {
  const [gestureHeadWeights, setGestureHeadWeightsState] = useState(null)

  const setGestureHeadWeights = useCallback((weights) => {
    setGestureHeadWeightsState(weights || null)
  }, [])

  return (
    <VisionModelContext.Provider
      value={{
        gestureHeadWeights,
        setGestureHeadWeights,
      }}
    >
      {children}
    </VisionModelContext.Provider>
  )
}

export function useVisionModel() {
  const ctx = useContext(VisionModelContext)
  if (!ctx) {
    throw new Error('useVisionModel must be used within VisionModelProvider')
  }
  return ctx
}

export function useVisionModelOptional() {
  return useContext(VisionModelContext)
}
