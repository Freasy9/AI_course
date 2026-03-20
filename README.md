# AI 实验室 | AI Lab

AI 实验室风格的单页 Web 应用，使用 React + Tailwind CSS 构建。深色主题、荧光绿/赛博蓝主色，带网格背景与扫描线效果。

## 功能模块

- **📷 视觉探测器 (Vision Explorer)**：预留视觉识别模块入口
- **📖 百科解码器 (Wiki Decoder)**：RAG 知识库问答模块入口
- **🎤 频率监听阵列 (Audio Array)**：语音/音频模块入口
- **🎮 机甲模拟训练 (AI Game Lab)**：AI 游戏与模拟训练入口

## 运行方式

```bash
npm install
npm run dev
```

在浏览器中打开终端提示的本地地址（如 `http://localhost:5173`）即可。

## GitHub 与在线访问

- 仓库：<https://github.com/Freasy9/AI_course>
- 推送：`git remote add origin https://github.com/Freasy9/AI_course.git`（若已添加可省略）→ `git push -u origin main`
- 开启 **Settings → Pages → Source: GitHub Actions** 后，站点一般为：<https://freasy9.github.io/AI_course/>

详细步骤见根目录 **[GITHUB_DEPLOY.md](./GITHUB_DEPLOY.md)**。

## 技术栈

- React 19 + Vite 7
- Tailwind CSS v4
- 响应式布局，大按钮适配平板与儿童使用
