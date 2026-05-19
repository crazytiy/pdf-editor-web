export interface PdfPageItem {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  sourcePageIndex: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnail?: string;
  /** pdf.js 视口宽（pt），用于缩略图容器比例 */
  viewportWidth?: number;
  /** pdf.js 视口高（pt） */
  viewportHeight?: number;
}

export interface PdfFileItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}
