# public/samples 文件访问说明

## 现状

`public/samples/` 目录下的文件（水果图片、模型 JSON、鸟类音频等）在构建时会**自动复制**到 `dist/samples/`，部署到 GitHub Pages 后可通过以下路径访问：

- **模型文件**：`https://freasy9.github.io/AI_course/samples/models/fruit-model.json`
- **水果图片**：`https://freasy9.github.io/AI_course/samples/fruits/苹果/apple_1.jpg`
- **鸟类模型**：`https://freasy9.github.io/AI_course/samples/models/wiki-bird-model.json`（若已训练）

## 代码中的访问方式

代码使用 `import.meta.env.BASE_URL` 获取基础路径（GitHub Pages 上为 `/AI_course/`），然后拼接相对路径：

```javascript
const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const url = `${base}/samples/models/fruit-model.json`
// GitHub Pages: /AI_course/samples/models/fruit-model.json
// 本地开发: /samples/models/fruit-model.json
```

## 验证文件是否可访问

部署后，在浏览器打开：

1. **模型文件**：https://freasy9.github.io/AI_course/samples/models/fruit-model.json
   - 应显示 JSON 内容（若文件存在）

2. **图片文件**：https://freasy9.github.io/AI_course/samples/fruits/苹果/apple_1.jpg
   - 应显示图片（若文件存在）

## 如果文件无法访问

### 检查 1：文件是否在 public/ 目录

只有 `public/` 目录下的文件会被 Vite 复制到 `dist/`。确保文件在：

```
public/
  samples/
    models/
      fruit-model.json
    fruits/
      苹果/
        apple_1.jpg
```

### 检查 2：文件是否被 .gitignore 排除

检查 `.gitignore` 是否排除了 `public/samples/` 下的某些文件。若被排除，文件不会进入仓库，CI 构建时也不会有。

### 检查 3：构建产物是否包含文件

本地构建后检查：

```bash
npm run build -- --base=/AI_course/
ls -la dist/samples/models/
ls -la dist/samples/fruits/苹果/
```

若 `dist/` 里没有，说明 `public/` 里也没有，或构建配置有问题。

### 检查 4：GitHub Actions 构建日志

在 Actions 的构建步骤里，确认没有报错，且 `upload-pages-artifact` 成功上传了 `dist/` 目录。

## 在百科解码器中使用示例图片

当前「上传图片识别」功能是**从用户本地上传**，不是从 `samples/` 读取。

若要让用户能**直接使用 samples 里的示例图片**，可以：

1. **在界面上添加「使用示例图片」按钮**，点击后：
   ```javascript
   const imgUrl = `${import.meta.env.BASE_URL || '/'}samples/fruits/苹果/apple_1.jpg`
   const response = await fetch(imgUrl)
   const blob = await response.blob()
   const dataUrl = await new Promise(resolve => {
     const reader = new FileReader()
     reader.onload = () => resolve(reader.result)
     reader.readAsDataURL(blob)
   })
   // 然后用 dataUrl 调用 predict()
   ```

2. **或提供示例图片列表**，让用户选择后自动加载并识别。

## 注意事项

- **文件大小**：`public/samples/` 下的文件会**全部**被打包到部署产物中，注意控制体积（GitHub Pages 有 1GB 限制，但建议单个仓库 < 100MB）。
- **音频文件**：`public/samples/built-in-bird-calls/` 下的 `.mp3/.wav` 已在 `.gitignore` 中，**不会**被提交和部署。若需要部署示例音频，需移除 `.gitignore` 中的对应规则，或使用其他方式（如 CDN）。
