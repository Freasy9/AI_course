# 质心教育 · AI Lab

质心教育主题的单页 Web 应用，使用 React + Tailwind CSS 构建。深空科幻风格：荧光绿/青蓝主色、紫辅色高光，带网格背景与扫描线效果。

## 功能模块

- **📷 视觉探测器 (Vision Explorer)**：预留视觉识别模块入口
- **📖 百科解码器 (Wiki Decoder)**：RAG 知识库问答模块入口
- **🎤 频率监听阵列 (Audio Array)**：语音/音频模块入口
- **💬 AI对话实验室**：下一词概率与温度 T 的交互演示（条形图 + 抽样）
- **✳️ COSTAR提示词**：与上者同款条形图，演示提示完整度（教学分）与魔法工坊 COSTAR 字段一致；可一键「生成文本」走与魔法咒语工坊相同的 `generateSpellMagicOutput` 管线，并「同步到魔法工坊」将普通提示词 + 六维写入工坊（`sessionStorage` 一次性同步），自动切到魔法页
- **🖼️ 扩散图像实验室**：「迷雾散去」互动演示 + 小题（面向初中生的扩散直觉）
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
