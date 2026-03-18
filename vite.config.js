import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 保证全项目只用一份 tfjs，避免 "t3 is not a function" 等多实例错误
    dedupe: ['@tensorflow/tfjs', '@tensorflow/tfjs-core', '@tensorflow/tfjs-converter'],
  },
  optimizeDeps: {
    include: ['@tensorflow/tfjs', '@tensorflow-models/mobilenet'],
  },
})
