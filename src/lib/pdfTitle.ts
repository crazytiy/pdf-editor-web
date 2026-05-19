import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { getFileBaseName } from './fileName';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.otf`;

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

export function drawFileNameTitle(
  page: PDFPage,
  sourceFileName: string,
  font: PDFFont,
): void {
  const title = getFileBaseName(sourceFileName);
  if (!title) return;

  const fontSize = 11;
  const barHeight = 22;
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(title, fontSize);
  const x = Math.max(12, (width - textWidth) / 2);
  const y = height - barHeight + 5;

  page.drawRectangle({
    x: 0,
    y: height - barHeight,
    width,
    height: barHeight,
    color: rgb(1, 1, 1),
    opacity: 0.93,
  });

  page.drawText(title, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });
}
