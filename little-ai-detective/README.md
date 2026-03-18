# 🔎 小小 AI 物体侦探

适合 6–12 岁小孩的单页网页应用：用 **TensorFlow.js + MobileNet 迁移学习**，自己建立类别、收集图片、训练模型，并即时用 webcam 测试 AI。  
流程与体验参考 [Google Teachable Machine](https://teachablemachine.withgoogle.com/)（Gather → Train → Export / 即时测试），并强调**全部在设备上完成，影像不会上传**。

---

## 功能

- **步骤 1：创建类别** — 新增 2–4 个类别（例如：苹果、香蕉），每类有对应颜色标签
- **步骤 2：收集样本** — 每类用 webcam 捕捉或上传图片；显示每类进度（如 5/20 张）、可删除单张样本
- **步骤 3：训练模型** — 载入 MobileNet、训练顶层分类器，显示进度条；完成后可到下一步导出模型
- **步骤 4：测试 AI** — 即时 webcam 预测，**各类别信心度条形图**、下载模型 JSON、导入已保存模型
- **导入 / 导出** — 顶部「导入已保存的模型」可载入先前下载的 JSON，直接进入测试；测试页可下载或导入其他模型

界面为中文、大字体、卡通风格、圆角与明亮色（蓝绿黄），并有 emoji 与鼓励文字。

---

## 如何运行

### 安装依赖（若尚未安装）

```bash
cd little-ai-detective
npm install
```

### 开发模式

```bash
npm run dev
```

在浏览器打开终端显示的网址（通常是 `http://localhost:5173`）。  
使用 **HTTPS 或 localhost** 才能正常使用 webcam。

### 预览正式构建

```bash
npm run build
npm run preview
```

---

## 部署到 GitHub Pages

1. **在项目根目录建立 GitHub 仓库**，并将代码 push 上去。

2. **设置 Vite 的 base**（若仓库名为 `little-ai-detective`，网址会是 `https://<username>.github.io/little-ai-detective/`）：

   在 `vite.config.ts` 中把 `base` 改为你的仓库路径：

   ```ts
   base: '/little-ai-detective/',  // 改成你的仓库名称，结尾要有 /
   ```

3. **构建**：

   ```bash
   npm run build
   ```

4. **部署 dist 目录**：
   - 在 GitHub 仓库的 **Settings → Pages**
   - Source 选 **GitHub Actions**，或选 **main 分支 / docs** 并把 `dist` 内容放到 `docs` 或根目录
   - 若用 **Actions**：可添加 workflow 用 `peaceiris/actions-gh-pages` 把 `dist` 推到 `gh-pages` 分支

   使用 GitHub Actions 的示例（`.github/workflows/deploy.yml`）：

   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
             cache: 'npm'
             cache-dependency-path: little-ai-detective/package-lock.json
         - run: cd little-ai-detective && npm ci && npm run build
         - uses: peaceiris/actions-gh-pages@v3
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: little-ai-detective/dist
   ```

5. 部署完成后，用 **HTTPS** 打开 `https://<username>.github.io/little-ai-detective/`。  
   **注意**：GitHub Pages 为 HTTPS，可正常使用 webcam。

---

## 技术与依赖

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS**（卡通风格、大字体、圆角、明亮色）
- **@tensorflow/tfjs**、**@tensorflow-models/mobilenet**（迁移学习：MobileNet 特征 + 自定义顶层）
- **react-webcam**（拍照与即时预测）

代码中含中文注释，便于教学与修改。

---

## 参考

- [Teachable Machine](https://teachablemachine.withgoogle.com/) — Google 的网页版教学工具，本项目在流程与导出/导入上与之对齐，便于教学对照。
