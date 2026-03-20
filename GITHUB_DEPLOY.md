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

## 二、推送代码

```bash
git push -u origin main
```

若提示登录：使用 **Personal Access Token** 作为密码，或配置 [SSH 密钥](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) 后改用：

```bash
git remote set-url origin git@github.com:Freasy9/AI_course.git
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
