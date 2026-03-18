import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AudioRecognitionProvider } from './contexts/AudioRecognitionContext'
import { VisionModelProvider } from './contexts/VisionModelContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AudioRecognitionProvider>
      <VisionModelProvider>
        <App />
      </VisionModelProvider>
    </AudioRecognitionProvider>
  </StrictMode>,
)
