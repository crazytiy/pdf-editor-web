import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { getFileBaseName } from './fileName';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.otf`;

/** A4 竖版（pt） */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

const A4_SIZE_TOLERANCE = 2;
const TITLE_BAR_HEIGHT = 28;
const TITLE_FONT_SIZE = 11;

let fontBytesCache: ArrayBuffer | null = null;

async function loadTitleFontBytes(): Promise<ArrayBuffer> {
  if (!fontBytesCache) {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error('标题字体加载失败');
    fontBytesCache = await res.arrayBuffer();
  }
  return fontBytesCache;
}

export async function embedTitleFont(doc: PDFDocument): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  const bytes = await loadTitleFontBytes();
  return doc.embedFont(bytes);
}

function isA4Portrait(width: number, height: number): boolean {
  return (
    Math.abs(width - A4_WIDTH) < A4_SIZE_TOLERANCE &&
    Math.abs(height - A4_HEIGHT) < A4_SIZE_TOLERANCE
  );
}

/** 将页面规范为 A4 竖版：原内容等比缩放并居中（小页放大、大页或横页缩小） */
function normalizePageToA4(page: PDFPage): void {
  const { width, height } = page.getSize();
  if (isA4Portrait(width, height)) return;

  const scale = Math.min(A4_WIDTH / width, A4_HEIGHT / height);
  const scaledW = width * scale;
  const scaledH = height * scale;
  const offsetX = (A4_WIDTH - scaledW) / 2;
  const offsetY = (A4_HEIGHT - scaledH) / 2;

  page.setSize(A4_WIDTH, A4_HEIGHT);
  page.translateContent(offsetX, offsetY);
  page.scaleContent(scale, scale);
}

/** 在 A4 页顶预留标题区：正文等比缩小至标题区下方 */
function shrinkContentForTitle(page: PDFPage): void {
  const { width, height } = page.getSize();
  const scale = (height - TITLE_BAR_HEIGHT) / height;
  const offsetX = (width * (1 - scale)) / 2;

  page.translateContent(offsetX, 0);
  page.scaleContent(scale, scale);
}

export function drawFileNameTitle(
  page: PDFPage,
  sourceFileName: string,
  font: PDFFont,
): void {
  const title = getFileBaseName(sourceFileName);
  if (!title) return;

  normalizePageToA4(page);
  shrinkContentForTitle(page);

  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(title, TITLE_FONT_SIZE);
  const x = Math.max(8, (width - textWidth) / 2);
  const y = height - TITLE_BAR_HEIGHT + (TITLE_BAR_HEIGHT - TITLE_FONT_SIZE) / 2 - 2;

  page.drawRectangle({
    x: 0,
    y: height - TITLE_BAR_HEIGHT,
    width,
    height: TITLE_BAR_HEIGHT,
    color: rgb(0.97, 0.97, 0.98),
  });

  page.drawLine({
    start: { x: 0, y: height - TITLE_BAR_HEIGHT },
    end: { x: width, y: height - TITLE_BAR_HEIGHT },
    thickness: 0.5,
    color: rgb(0.82, 0.84, 0.88),
  });

  page.drawText(title, {
    x,
    y,
    size: TITLE_FONT_SIZE,
    font,
    color: rgb(0.2, 0.2, 0.22),
  });
}
