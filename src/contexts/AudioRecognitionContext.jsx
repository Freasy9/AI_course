/**
 * 音频模型全局单例（React Context）。
 * Audio Model 实例在此处全局可用：频率监听阵列训练/导入后写入，机甲模拟训练从此读取并监听 lastResult。
 * 确保全应用仅此一份声控模型引用，模块四进入时自动检测 audioModel / audioLabels 是否已加载。
 */
import { createContext, useContext, useState, useCallback } from 'react'

const AudioRecognitionContext = createContext(null)

export function AudioRecognitionProvider({ children }) {
  const [lastResult, setLastResult] = useState(null) // { label, probability, scores }
  const [isListening, setIsListening] = useState(false)
  const [wordLabels, setWordLabels] = useState([])
  const [audioModel, setAudioModelState] = useState(null)
  const [audioLabels, setAudioLabelsState] = useState([])

  const setResult = useCallback((result) => {
    setLastResult(result)
  }, [])

  const setListening = useCallback((v) => {
    setIsListening(!!v)
  }, [])

  const setLabels = useCallback((labels) => {
    setWordLabels(Array.isArray(labels) ? labels : [])
  }, [])

  const setAudioModel = useCallback((model) => {
    setAudioModelState(model || null)
  }, [])

  const setAudioLabels = useCallback((labels) => {
    setAudioLabelsState(Array.isArray(labels) ? labels : [])
  }, [])

  return (
    <AudioRecognitionContext.Provider
      value={{
        lastResult,
        isListening,
        wordLabels,
        setResult,
        setListening,
        setLabels,
        audioModel,
        audioLabels,
        setAudioModel,
        setAudioLabels,
      }}
    >
      {children}
    </AudioRecognitionContext.Provider>
  )
}

export function useAudioRecognition() {
  const ctx = useContext(AudioRecognitionContext)
  if (!ctx) {
    throw new Error('useAudioRecognition must be used within AudioRecognitionProvider')
  }
  return ctx
}

export function useAudioRecognitionOptional() {
  return useContext(AudioRecognitionContext)
}
