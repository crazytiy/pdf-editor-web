import { PDFDocument } from 'pdf-lib';
import html2canvas from 'html2canvas';
import mammoth from 'mammoth';
import { marked } from 'marked';
import type { FileKind } from './supportedFormats';
import { getFileKind, toPdfFileName } from './supportedFormats';

const A4_W = 595.28;
const A4_H = 841.89;
const RENDER_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = Math.round((RENDER_WIDTH_PX * A4_H) / A4_W);

const DOC_STYLES = `
  * { box-sizing: border-box; }
  .doc-body {
    margin: 0;
    padding: 28px 36px;
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    word-wrap: break-word;
  }
  h1 { font-size: 1.75em; margin: 0.6em 0 0.4em; }
  h2 { font-size: 1.4em; margin: 0.55em 0 0.35em; }
  h3 { font-size: 1.15em; margin: 0.5em 0 0.3em; }
  p { margin: 0.5em 0; }
  pre, code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 12px;
  }
  pre {
    background: #f4f4f5;
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  code { background: #f0f0f2; padding: 2px 5px; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  blockquote {
    margin: 0.5em 0;
    padding-left: 12px;
    border-left: 4px solid #ccc;
    color: #444;
  }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f2; }
  img { max-width: 100%; height: auto; }
  ul, ol { padding-left: 1.5em; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
  .plain-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: Consolas, "Courier New", "Microsoft YaHei", monospace;
    font-size: 13px;
    background: transparent;
    padding: 0;
  }
`;

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法生成图片'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`无法加载图片：${file.name}`));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

async function convertImageToPdf(file: File): Promise<Uint8Array> {
  const canvas = await imageFileToCanvas(file);
  const pngBytes = await canvasToPngBytes(canvas);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const iw = image.width;
  const ih = image.height;

  const scale = Math.min(A4_W / iw, A4_H / ih, 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const page = pdf.addPage([A4_W, A4_H]);
  page.drawImage(image, {
    x: (A4_W - dw) / 2,
    y: (A4_H - dh) / 2,
    width: dw,
    height: dh,
  });
  return pdf.save();
}

async function renderContainerToPdf(container: HTMLElement): Promise<Uint8Array> {
  const fullCanvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const pdf = await PDFDocument.create();
  const scale = 2;
  const sliceHeight = PAGE_HEIGHT_PX * scale;
  const totalH = fullCanvas.height;

  if (totalH <= sliceHeight) {
    const png = await canvasToPngBytes(fullCanvas);
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([A4_W, A4_H]);
    const imgScale = Math.min(A4_W / img.width, A4_H / img.height);
    const w = img.width * imgScale;
    const h = img.height * imgScale;
    page.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
    return pdf.save();
  }

  let y = 0;
  while (y < totalH) {
    const h = Math.min(sliceHeight, totalH - y);
    const slice = document.createElement('canvas');
    slice.width = fullCanvas.width;
    slice.height = h;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(fullCanvas, 0, y, fullCanvas.width, h, 0, 0, fullCanvas.width, h);

    const png = await canvasToPngBytes(slice);
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([A4_W, A4_H]);
    const imgScale = A4_W / img.width;
    const drawH = img.height * imgScale;
    page.drawImage(img, {
      x: 0,
      y: A4_H - drawH,
      width: A4_W,
      height: drawH,
    });
    y += sliceHeight;
  }

  return pdf.save();
}

function mountHtmlDocument(innerHtml: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    `width: ${RENDER_WIDTH_PX}px`,
    'background: #fff',
    'z-index: -1',
  ].join(';');
  wrap.innerHTML = `<style>${DOC_STYLES}</style><div class="doc-body">${innerHtml}</div>`;
  document.body.appendChild(wrap);
  return wrap;
}

async function convertHtmlToPdf(html: string): Promise<Uint8Array> {
  const el = mountHtmlDocument(html);
  try {
    return await renderContainerToPdf(el);
  } finally {
    document.body.removeChild(el);
  }
}

async function convertTextToPdf(file: File): Promise<Uint8Array> {
  const text = await file.text();
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<pre class="plain-text">${escaped}</pre>`;
  return convertHtmlToPdf(html);
}

async function convertMarkdownToPdf(file: File): Promise<Uint8Array> {
  const md = await file.text();
  const body = await marked.parse(md, { async: true });
  return convertHtmlToPdf(typeof body === 'string' ? body : String(body));
}

async function convertWordToPdf(file: File): Promise<Uint8Array> {
  if (file.name.toLowerCase().endsWith('.doc')) {
    throw new Error('不支持旧版 .doc 格式，请先在 Word 中另存为 .docx 后再上传');
  }
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const warnings = result.messages.filter((m) => m.type === 'warning');
  if (warnings.length > 0) {
    console.warn('Word 转换警告:', warnings);
  }
  return convertHtmlToPdf(result.value);
}

export async function convertFileToPdf(
  file: File,
  kind: FileKind,
): Promise<Uint8Array> {
  switch (kind) {
    case 'image':
      return convertImageToPdf(file);
    case 'text':
      return convertTextToPdf(file);
    case 'markdown':
      return convertMarkdownToPdf(file);
    case 'word':
      return convertWordToPdf(file);
    default:
      throw new Error(`不支持转换：${file.name}`);
  }
}

export async function prepareFileAsPdf(
  file: File,
): Promise<{ bytes: Uint8Array; displayName: string; converted: boolean }> {
  const kind = getFileKind(file);
  if (kind === 'pdf') {
    const buffer = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      displayName: file.name,
      converted: false,
    };
  }
  if (kind === 'unknown') {
    throw new Error(`不支持的文件类型：${file.name}`);
  }
  const bytes = await convertFileToPdf(file, kind);
  return {
    bytes,
    displayName: toPdfFileName(file.name),
    converted: true,
  };
}

export function convertKindLabel(kind: FileKind): string {
  const map: Record<FileKind, string> = {
    pdf: 'PDF',
    image: '图片',
    word: 'Word',
    text: '文本',
    markdown: 'Markdown',
    unknown: '未知',
  };
  return map[kind];
}
