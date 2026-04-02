# GitHub Secrets 配置（COSTAR 创作工坊 / 文本与图像 API）

## 问题

部署到 GitHub Pages 后，**文本生成**和**图像生成**模块没有调用 API，只显示占位内容。

**原因**：GitHub Pages 是静态站点，无法在运行时读取 `.env` 文件。环境变量必须在**构建时**注入到代码中。

## 解决方案

### 方式一：使用 xAI API（推荐）

1. 打开仓库：**Settings → Secrets and variables → Actions**
2. 点击 **New repository secret**
3. 添加以下 Secret：

| Name | Value | 说明 |
|------|-------|------|
| `VITE_XAI_API_KEY` | 你的 xAI API 密钥 | 从 [xAI 控制台](https://console.x.ai/) 获取 |
| `VITE_XAI_BASE_URL` | `https://api.x.ai/v1` | （可选，默认值） |
| `VITE_MAGIC_SPELL_PROVIDER` | `xai` | （可选，自动检测） |

4. 保存后，**重新推送代码**或到 **Actions** 手动 **Run workflow**，让构建重新执行。

### 方式二：使用自建后端 API

1. 在 **Secrets** 中添加：

| Name | Value |
|------|-------|
| `VITE_MAGIC_SPELL_API_BASE` | 你的后端地址，如 `https://api.example.com` |
| `VITE_MAGIC_SPELL_PROVIDER` | `backend` |

2. 后端需实现：
   - `POST /api/magic-spell/story`（文本生成）
   - `POST /api/magic-spell/image`（图片生成）

   请求体格式见 `src/services/magicSpellService.js` 的 `buildRequestBody`。

### 方式三：仅本地占位（不推荐）

不配置任何 Secret，COSTAR 创作工坊会使用本地占位内容（纯文本示例、SVG 占位图），**不会真正调用 API**。

## 验证

配置后，重新部署（推送或手动 Run workflow），访问在线站点，在 **COSTAR 创作工坊** 输入指令，应能看到：
- **文本生成**：真实的 AI 生成文本（而非占位文案）
- **图片生成**：真实的 AI 生成图片（而非占位 SVG）

## 注意事项

- **Secret 名称必须以 `VITE_` 开头**，Vite 才会在构建时注入。
- Secret 值在构建时会被**硬编码到 JS 代码中**，因此：
  - ✅ 可以安全使用（代码已压缩混淆）
  - ⚠️ 不要在公开仓库的代码里直接写 API Key
  - ⚠️ 若仓库是公开的，部署后的 JS 里会包含 API Key（可被提取），建议用**自建后端代理**保护密钥
