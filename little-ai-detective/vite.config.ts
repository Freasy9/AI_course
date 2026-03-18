import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// 本地开发用 base: '/'。部署到 GitHub Pages 时请改为 base: '/你的仓库名称/'
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
