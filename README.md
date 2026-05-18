# PDF 编辑器 (pdf-editor-web)

浏览器端 PDF 工具：合并、拆分、页面排序、旋转，以及将图片 / Word (.docx) / 文本 / Markdown 转为 PDF。所有处理在本地完成，文件不上传服务器。

## 环境要求（本地开发与构建）

| 项目 | 说明 |
|------|------|
| **Node.js** | **20.x 或更高**（与 CI 一致；18 可能可用，未做长期验证） |
| **npm** | **10.x 或更高**（随 Node 20 LTS 安装） |
| **操作系统** | Windows 10/11、macOS、Linux 均可 |
| **浏览器** | 建议使用 **Chrome / Edge / Firefox** 等现代浏览器；Safari 一般可用，若预览异常可换 Chromium 系 |
| **磁盘与网络** | 首次 `npm install` 需联网下载依赖；`node_modules` 约数百 MB |
| **可选** | [Git](https://git-scm.com/) — 克隆与推送代码；[GitHub CLI](https://cli.github.com/) — 可选，用于 `gh` 命令 |

验证版本：

```bash
node -v   # 应显示 v20.x.x 或更高
npm -v    # 应显示 10.x.x 或更高
```

若本机 Node 版本过低，可到 [Node.js 官网](https://nodejs.org/) 安装 LTS，或使用 [nvm-windows](https://github.com/coreybutler/nvm-windows) / [fnm](https://github.com/Schniz/fnm) 管理多版本。

## 在线访问

部署成功后访问（将用户名换成你的 GitHub 登录名）：

**https://你的用户名.github.io/pdf-editor-web/**

示例：**https://crazytiy.github.io/pdf-editor-web/**

## 本地开发

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5175

Windows 也可双击 `run_dev.bat`。

## 构建

```bash
npm run build
npm run preview
```

## 部署到 GitHub Pages

1. 推送代码到 `main` 分支后，Actions 会自动构建并推送到 `gh-pages` 分支。
2. 仓库 **Settings → Pages → Build and deployment**：
   - **Source** 选 **Deploy from a branch**
   - **Branch** 选 **gh-pages** / **/ (root)**
3. 保存后等待 1–2 分钟，访问 https://crazytiy.github.io/pdf-editor-web/

## 技术栈

- React + Vite + TypeScript
- pdf-lib / pdf.js — PDF 读写与预览
- mammoth — Word 转 HTML
- marked + html2canvas — Markdown / 文本渲染为 PDF
