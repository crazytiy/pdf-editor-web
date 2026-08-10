import {
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
} from 'pdf-lib';
import type { PageBoundingBox } from 'pdf-lib';
import { getFileBaseName } from './fileName';
import { registerPdfFontkit } from './pdfFontkit';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.otf`;

/** A4 竖版（pt） */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

const A4_ASPECT = A4_WIDTH / A4_HEIGHT;
const A4_SIZE_TOLERANCE = 3;
const ASPECT_TOLERANCE = 0.08;

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
  registerPdfFontkit(doc);
  const bytes = await loadTitleFontBytes();
  return doc.embedFont(bytes, { subset: true });
}

function cropToBoundingBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): PageBoundingBox {
  return {
    left: box.x,
    bottom: box.y,
    right: box.x + box.width,
    top: box.y + box.height,
  };
}

function shouldUseCropBox(page: PDFPage): boolean {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  return (
    crop.width < media.width * 0.98 || crop.height < media.height * 0.98
  );
}

function isPortraitA4Like(width: number, height: number): boolean {
  if (height < width) return false;
  return Math.abs(width / height - A4_ASPECT) < ASPECT_TOLERANCE;
}

function isStandardA4Size(width: number, height: number): boolean {
  return (
    Math.abs(width - A4_WIDTH) < A4_SIZE_TOLERANCE &&
    Math.abs(height - A4_HEIGHT) < A4_SIZE_TOLERANCE
  );
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
    color: rgb(1, 1, 1),
  });

  page.drawText(title, {
    x,
    y,
    size: TITLE_FONT_SIZE,
    font,
    color: rgb(0.2, 0.2, 0.22),
  });
}

type PageLayout = {
  dw: number;
  dh: number;
  x: number;
  y: number;
  /** 整页铺满 A4 后标题白底叠在顶部（不再为标题区二次缩小正文） */
  titleOverlay: boolean;
};

function computePageLayout(
  pageWidth: number,
  pageHeight: number,
): PageLayout {
  const contentH = A4_HEIGHT - TITLE_BAR_HEIGHT;
  const fitInContent = Math.min(
    A4_WIDTH / pageWidth,
    contentH / pageHeight,
  );
  const fitInFull = Math.min(A4_WIDTH / pageWidth, A4_HEIGHT / pageHeight);
  const portraitA4Like = isPortraitA4Like(pageWidth, pageHeight);

  // 标准 A4 或「竖版 A4 比例但 MediaBox 很大」的扫描件：按 A4 物理尺寸绘制，标题叠顶
  if (
    portraitA4Like &&
    (isStandardA4Size(pageWidth, pageHeight) ||
      pageHeight > A4_HEIGHT * 1.15 ||
      fitInFull >= 0.92)
  ) {
    const scale = fitInFull;
    const dw = pageWidth * scale;
    const dh = pageHeight * scale;
    return {
      dw,
      dh,
      x: (A4_WIDTH - dw) / 2,
      y: A4_HEIGHT - dh,
      titleOverlay: true,
    };
  }

  // 小页、横版、异形页：缩放到标题区以下
  const scale = fitInContent;
  const dw = pageWidth * scale;
  const dh = pageHeight * scale;
  return {
    dw,
    dh,
    x: (A4_WIDTH - dw) / 2,
    y: (contentH - dh) / 2,
    titleOverlay: false,
  };
}

/**
 * 在全新 A4 页上绘制标题，并将源页内容等比缩放嵌入（不改动源页流）。
 */
export async function composeA4PageWithTitle(
  doc: PDFDocument,
  targetPage: PDFPage,
  sourcePage: PDFPage,
  sourceFileName: string,
  font: PDFFont,
): Promise<void> {
  const title = getFileBaseName(sourceFileName);
  const boundingBox = shouldUseCropBox(sourcePage)
    ? cropToBoundingBox(sourcePage.getCropBox())
    : undefined;

  const embedded = await doc.embedPage(sourcePage, boundingBox);
  const layout = computePageLayout(embedded.width, embedded.height);

  if (!layout.titleOverlay && title) {
    drawTitleBar(targetPage, title, font);
  }

  targetPage.drawPage(embedded, {
    x: layout.x,
    y: layout.y,
    width: layout.dw,
    height: layout.dh,
  });

  if (layout.titleOverlay && title) {
    drawTitleBar(targetPage, title, font);
  }
}
