import type { PdfFileItem, PdfPageItem } from '../types';

/** 根据当前页面列表同步文件信息：更新页数，移除已无页面的文件 */
export function syncFilesWithPages(
  files: PdfFileItem[],
  pages: PdfPageItem[],
): PdfFileItem[] {
  const counts = new Map<string, number>();
  for (const p of pages) {
    counts.set(p.sourceFileId, (counts.get(p.sourceFileId) ?? 0) + 1);
  }
  return files
    .filter((f) => (counts.get(f.id) ?? 0) > 0)
    .map((f) => ({ ...f, pageCount: counts.get(f.id)! }));
}
