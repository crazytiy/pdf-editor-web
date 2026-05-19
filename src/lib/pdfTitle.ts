import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { getFileBaseName } from './fileName';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.otf`;

/** A4 竖版（pt） */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

export const TITLE_BAR_HEIGHT = 28;
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

function drawTitleBar(page: PDFPage, title: string, font: PDFFont): void {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(title, TITLE_FONT_SIZE);
  const x = Math.max(8, (width - textWidth) / 2);
  const y =
    height - TITLE_BAR_HEIGHT + (TITLE_BAR_HEIGHT - TITLE_FONT_SIZE) / 2 - 2;

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

/**
 * 在全新 A4 页上绘制标题，并将源页内容等比缩放嵌入标题区下方（不改动源页流）。
 */
export async function composeA4PageWithTitle(
  doc: PDFDocument,
  targetPage: PDFPage,
  sourcePage: PDFPage,
  sourceFileName: string,
  font: PDFFont,
): Promise<void> {
  const title = getFileBaseName(sourceFileName);
  if (title) drawTitleBar(targetPage, title, font);

  const embedded = await doc.embedPage(sourcePage);
  const contentH = A4_HEIGHT - TITLE_BAR_HEIGHT;
  const scale = Math.min(A4_WIDTH / embedded.width, contentH / embedded.height);
  const dw = embedded.width * scale;
  const dh = embedded.height * scale;
  const x = (A4_WIDTH - dw) / 2;
  const y = (contentH - dh) / 2;

  targetPage.drawPage(embedded, { x, y, width: dw, height: dh });
}
