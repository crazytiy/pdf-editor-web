import {
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRef,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import {
  A4_HEIGHT,
  A4_WIDTH,
  composeA4PageWithTitle,
  embedTitleFont,
} from './pdfTitle';
import { deduplicateEmbeddedFonts } from './fontDedup';
import { getFileBaseName } from './fileName';
import { pdfjs } from './pdfWorker';
import type { PdfPageItem } from '../types';

export type ExportOptions = {
  /** 在每个源文件的第一页顶部绘制文件名（无路径、无后缀） */
  addFileNameTitle?: boolean;
  /** 在每页底部居中绘制页码；开启目录页时页码从正文第一页起算，目录页不计入 */
  addPageNumbers?: boolean;
  /** 在文档最前面插入一页「目录」，列出各文件标题及起始页码 */
  addTocPage?: boolean;
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

function wrapTocText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawTocPage(
  page: PDFPage,
  font: PDFFont,
  entries: { title: string; pageNumber: number }[],
): void {
  const { width, height } = page.getSize();

  const heading = '目  录';
  const headingSize = 26;
  const hw = font.widthOfTextAtSize(heading, headingSize);
  page.drawText(heading, {
    x: (width - hw) / 2,
    y: height - 80,
    size: headingSize,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });
  page.drawLine({
    start: { x: 90, y: height - 108 },
    end: { x: width - 90, y: height - 108 },
    thickness: 0.8,
    color: rgb(0.3, 0.3, 0.3),
  });

  let y = height - 150;
  for (const e of entries) {
    const titleSize = 13;
    const numSize = 12;
    const maxWidth = width - 180;
    const lines = wrapTocText(font, e.title, titleSize, maxWidth);
    const firstLineY = y;
    for (const line of lines) {
      page.drawText(line, { x: 90, y, size: titleSize, font });
      y -= 22;
    }
    const num = `第 ${e.pageNumber} 页`;
    const nw = font.widthOfTextAtSize(num, numSize);
    page.drawText(num, {
      x: width - 90 - nw,
      y: firstLineY + 2,
      size: numSize,
      font,
    });
    y -= 26;
  }
}

function addOutlineToDoc(
  doc: PDFDocument,
  entries: { title: string; pageNumber: number }[],
  tocPresent: boolean,
): void {
  const context = doc.context;
  const pages = doc.getPages();
  const childDicts: PDFDict[] = [];
  const childRefs: PDFRef[] = [];
  for (const e of entries) {
    const pageIndex = tocPresent ? e.pageNumber : e.pageNumber - 1;
    const page = pages[pageIndex];
    if (!page) continue;
    const dest = context.obj([page.ref, PDFName.of('XYZ'), null, null, null]);
    const dict = context.obj({ Title: PDFHexString.fromText(e.title), Dest: dest });
    const ref = context.register(dict);
    childDicts.push(dict);
    childRefs.push(ref);
  }
  if (childRefs.length === 0) return;
  const rootRef = context.register(
    context.obj({
      Type: PDFName.of('Outlines'),
      First: childRefs[0],
      Last: childRefs[childRefs.length - 1],
      Count: childRefs.length,
    }),
  );
  childDicts.forEach((dict, i) => {
    dict.set(PDFName.of('Parent'), rootRef);
    if (i > 0) dict.set(PDFName.of('Prev'), childRefs[i - 1]);
    if (i < childRefs.length - 1) dict.set(PDFName.of('Next'), childRefs[i + 1]);
  });
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

export async function exportPages(
  pages: PdfPageItem[],
  fileMap: Map<string, Uint8Array>,
  options?: ExportOptions,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();
  const addTitle = options?.addFileNameTitle ?? false;
  const addNumbers = options?.addPageNumbers ?? false;
  const addToc = options?.addTocPage ?? false;

  const titleFont = addTitle || addToc ? await embedTitleFont(out) : null;
  const numFont = addNumbers
    ? await out.embedStandardFont(StandardFonts.Helvetica)
    : null;

  const tocEntries: { title: string; pageNumber: number }[] = [];
  const tocByFile = new Map<string, number>();
  let pageNumber = 0;

  const drawPageNumber = (page: PDFPage) => {
    if (!numFont) return;
    const { width } = page.getSize();
    const label = `- ${pageNumber} -`;
    const size = 9;
    const w = numFont.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (width - w) / 2,
      y: 18,
      size,
      font: numFont,
      color: rgb(0.55, 0.55, 0.55),
    });
  };

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
      addTitle && item.sourcePageIndex === 0 && item.rotation === 0;

    let target: PDFPage;
    if (needsTitle) {
      target = out.addPage([A4_WIDTH, A4_HEIGHT]);
      await composeA4PageWithTitle(
        out,
        target,
        copied,
        item.sourceFileName,
        titleFont!,
      );
    } else {
      if (item.rotation !== 0) {
        copied.setRotation(degrees(item.rotation));
      }
      target = out.addPage(copied);
    }

    pageNumber += 1;
    if (!tocByFile.has(item.sourceFileId)) {
      tocByFile.set(item.sourceFileId, pageNumber);
      tocEntries.push({
        title: getFileBaseName(item.sourceFileName),
        pageNumber,
      });
    }
    drawPageNumber(target);
  }

  if (addToc && titleFont && tocEntries.length > 0) {
    out.insertPage(0, [A4_WIDTH, A4_HEIGHT]);
    drawTocPage(out.getPage(0), titleFont, tocEntries);
    addOutlineToDoc(out, tocEntries, true);
  }

  deduplicateEmbeddedFonts(out);
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
