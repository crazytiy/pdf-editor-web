export interface PdfPageItem {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  sourcePageIndex: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnail?: string;
}

export interface PdfFileItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}
