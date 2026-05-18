# PDF 编辑器 (pdf-editor-web)

浏览器端 PDF 工具：合并、拆分、页面排序、旋转，以及将图片 / Word (.docx) / 文本 / Markdown 转为 PDF。所有处理在本地完成，文件不上传服务器。

## 在线访问

部署成功后访问：

**https://\<你的 GitHub 用户名\>.github.io/pdf-editor-web/**

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

1. 在 GitHub 创建仓库 `pdf-editor-web`（公开仓库）。
2. 推送本目录代码到 `main` 分支。
3. 仓库 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**。
4. 推送后 Actions 会自动构建并发布；首次可在 Actions 页查看 `Deploy to GitHub Pages` 工作流。

## 技术栈

- React + Vite + TypeScript
- pdf-lib / pdf.js — PDF 读写与预览
- mammoth — Word 转 HTML
- marked + html2canvas — Markdown / 文本渲染为 PDF
