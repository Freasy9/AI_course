# 发布到 GitHub（代码 + 网站）

## 一、把代码推到 GitHub

1. 打开 [github.com/new](https://github.com/new) 新建仓库（例如名称为 `AI_game`），**不要**勾选 “Add a README”。
2. 在本项目目录执行（把 `你的用户名` 和 `仓库名` 换成自己的）：

```bash
cd /Users/hailong/Desktop/AI_course/AI_game
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

若提示登录，可用 GitHub 网页生成的 **Personal Access Token** 代替密码，或安装 [GitHub CLI](https://cli.github.com/) 执行 `gh auth login`。

## 二、开启 GitHub Pages（别人用浏览器访问）

1. 打开仓库 **Settings → Pages**。
2. **Build and deployment** 里 **Source** 选 **GitHub Actions**（不要选 Deploy from branch）。
3. 再随便改点东西推送到 `main`，或到 **Actions** 里手动重新运行 **Deploy GitHub Pages**。
4. 成功后网站地址为：

   **`https://你的用户名.github.io/仓库名/`**

例如仓库叫 `AI_game`，用户名为 `zhang`，则：<https://zhang.github.io/AI_game/>

> 若仓库名是 **`用户名.github.io`**（专门做主页的仓库），网站根路径是 `https://用户名.github.io/`，需把构建命令里的 `base` 改成 `/`，并相应改 workflow 里的 build 步骤（可发 issue 或改 Agent 帮你改）。

## 三、摄像头 / HTTPS

GitHub Pages 默认是 **HTTPS**，手机和其他电脑一般可直接用摄像头（需用户授权）。

## 四、本地含密钥时不要提交

`.env` 已在 `.gitignore` 中；不要把 `VITE_XAI_API_KEY` 等写进仓库。
