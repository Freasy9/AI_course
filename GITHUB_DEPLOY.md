# GitHub 配置说明（本仓库：Freasy9/AI_course）

## 当前远程仓库

| 项 | 值 |
|----|-----|
| 仓库 | [github.com/Freasy9/AI_course](https://github.com/Freasy9/AI_course) |
| 默认分支 | `main` |
| 在线站点（Pages 成功后） | **https://freasy9.github.io/AI_course/** |

## 一、绑定远程（若尚未配置）

```bash
cd /Users/hailong/Desktop/AI_course/AI_game
git remote remove origin 2>/dev/null
git remote add origin https://github.com/Freasy9/AI_course.git
git branch -M main
git remote -v
```

## 二、推送代码（HTTPS）

GitHub **不再支持**用「登录密码」推代码；`Password` 一栏必须填 **Personal Access Token（PAT）**，否则会报：

`Password authentication is not supported for Git operations`

### 用 Token 推送（推荐新手）

1. 浏览器打开（需登录 GitHub）：  
   **https://github.com/settings/tokens**
2. **Generate new token** → 选 **Fine-grained** 或 **Classic** 均可。  
   - Classic：勾选 **`repo`** 即可。  
   - Fine-grained：Repository 选 `AI_course`，Permissions → **Contents: Read and write**。
3. 生成后**复制整串 token**（只显示一次）。
4. 在终端执行：

```bash
git push -u origin main
```

- **Username**：`Freasy9`  
- **Password**：粘贴 **token**（不是你的 GitHub 密码）

5. 可选：用 macOS **钥匙串**保存凭据，避免每次都输入：

```bash
git config --global credential.helper osxkeychain
```

### 用 SSH 推送（免每次输 Token）

1. 若本机还没有密钥：  
   `ssh-keygen -t ed25519 -C "你的邮箱" -f ~/.ssh/id_ed25519`（一路回车即可）  
2. 显示公钥并复制：  
   `cat ~/.ssh/id_ed25519.pub`  
3. 打开 **https://github.com/settings/keys** → **New SSH key** → 粘贴保存。  
4. 改远程并推送：

```bash
git remote set-url origin git@github.com:Freasy9/AI_course.git
ssh -T git@github.com   # 首次会问是否信任，输入 yes
git push -u origin main
```

## 三、开启 GitHub Pages

1. 打开 [仓库 Settings → Pages](https://github.com/Freasy9/AI_course/settings/pages)
2. **Build and deployment** → **Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）
3. 推送 `main` 后，到 **Actions** 查看 **Deploy GitHub Pages** 是否成功；也可在 Actions 里点 **Run workflow** 手动再跑一遍

## 四、构建说明

CI 使用 `npm run build -- --base=/AI_course/`，与 Pages 子路径一致。本地开发仍用默认根路径，无需改 `vite.config.js`。

## 五、密钥

勿将 `.env` 中的 API Key 提交仓库；`.env` 已在 `.gitignore` 中。
