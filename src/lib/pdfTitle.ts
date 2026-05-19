import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { getFileBaseName } from './fileName';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.otf`;

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

/** 缩小并下移原有内容，在顶部留出标题区（不遮挡正文） */
function shrinkContentForTitle(page: PDFPage): void {
  const { width, height } = page.getSize();
  if (height <= TITLE_BAR_HEIGHT + 40) return;

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
