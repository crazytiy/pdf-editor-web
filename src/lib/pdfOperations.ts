import { PDFDocument, degrees } from 'pdf-lib';
import { A4_HEIGHT, A4_WIDTH, composeA4PageWithTitle, embedTitleFont } from './pdfTitle';
import { pdfjs } from './pdfWorker';
import type { PdfPageItem } from '../types';

export type ExportOptions = {
  /** 在每个源文件的第一页顶部绘制文件名（无路径、无后缀） */
  addFileNameTitle?: boolean;
};

export async function loadPdfBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

async function renderPageToDataUrl(
  bytes: Uint8Array,
  pageIndex: number,
  scale: number,
  quality = 0.82,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const base = page.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', width: base.width, height: base.height };
  await page.render({ canvasContext: ctx, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width: base.width,
    height: base.height,
  };
}

export async function renderThumbnail(
  bytes: Uint8Array,
  pageIndex: number,
  scale = 0.35,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return renderPageToDataUrl(bytes, pageIndex, scale);
}

/** 高清单页预览（弹窗用） */
export async function renderPagePreview(
  bytes: Uint8Array,
  pageIndex: number,
  scale = 1.25,
): Promise<string> {
  const { dataUrl } = await renderPageToDataUrl(bytes, pageIndex, scale, 0.92);
  return dataUrl;
}

export async function buildPagesFromFile(
  fileId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<PdfPageItem[]> {
  const count = await getPageCount(bytes);
  const pages: PdfPageItem[] = [];
  for (let i = 0; i < count; i++) {
    const { dataUrl, width, height } = await renderThumbnail(bytes, i);
    pages.push({
      id: crypto.randomUUID(),
      sourceFileId: fileId,
      sourceFileName: fileName,
      sourcePageIndex: i,
      rotation: 0,
      thumbnail: dataUrl,
      viewportWidth: width,
      viewportHeight: height,
    });
  }
  return pages;
}

export async function exportPages(
  pages: PdfPageItem[],
  fileMap: Map<string, Uint8Array>,
  options?: ExportOptions,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();
  const addTitle = options?.addFileNameTitle ?? false;
  const titleFont = addTitle ? await embedTitleFont(out) : null;

  for (const item of pages) {
    let src = cache.get(item.sourceFileId);
    if (!src) {
      const bytes = fileMap.get(item.sourceFileId);
      if (!bytes) continue;
      src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      cache.set(item.sourceFileId, src);
    }
    const [copied] = await out.copyPages(src, [item.sourcePageIndex]);
    const needsTitle =
      titleFont &&
      item.sourcePageIndex === 0 &&
      item.rotation === 0;

    if (needsTitle) {
      const titlePage = out.addPage([A4_WIDTH, A4_HEIGHT]);
      await composeA4PageWithTitle(
        out,
        titlePage,
        copied,
        item.sourceFileName,
        titleFont,
      );
    } else {
      if (item.rotation !== 0) {
        copied.setRotation(degrees(item.rotation));
      }
      out.addPage(copied);
    }
  }

  return out.save();
}

export async function splitEachPage(
  pages: PdfPageItem[],
  fileMap: Map<string, Uint8Array>,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const bytes = await exportPages([pages[i]], fileMap);
    const base = pages[i].sourceFileName.replace(/\.pdf$/i, '');
    results.push({
      name: `${base}_第${i + 1}页.pdf`,
      bytes,
    });
  }
  return results;
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadZip(
  files: { name: string; bytes: Uint8Array }[],
  zipName: string,
) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.bytes);
  }
  const content = await zip.generateAsync({ type: 'uint8array' });
  downloadBytes(content, zipName);
}
