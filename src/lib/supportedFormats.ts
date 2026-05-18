export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff'];
export const WORD_EXT = ['docx'];
export const TEXT_EXT = ['txt', 'text', 'log', 'csv', 'json', 'xml', 'yaml', 'yml'];
export const MD_EXT = ['md', 'markdown'];

const ALL_EXT = [...IMAGE_EXT, ...WORD_EXT, ...TEXT_EXT, ...MD_EXT, 'pdf'];

export type FileKind = 'pdf' | 'image' | 'word' | 'text' | 'markdown' | 'unknown';

export function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function getFileKind(file: File): FileKind {
  const ext = getExtension(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext) || file.type.startsWith('image/')) return 'image';
  if (WORD_EXT.includes(ext) || file.type.includes('wordprocessingml')) return 'word';
  if (MD_EXT.includes(ext)) return 'markdown';
  if (
    TEXT_EXT.includes(ext) ||
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    file.type === 'application/xml'
  ) {
    return 'text';
  }
  return 'unknown';
}

export function isSupportedFile(file: File): boolean {
  return getFileKind(file) !== 'unknown';
}

export const ACCEPT_ATTR = [
  '.pdf,application/pdf',
  ...IMAGE_EXT.map((e) => `.${e},image/*`),
  ...WORD_EXT.map((e) => `.${e}`),
  ...TEXT_EXT.map((e) => `.${e}`),
  ...MD_EXT.map((e) => `.${e}`),
  'text/plain,text/markdown',
].join(',');

export const FORMAT_HINT =
  'PDF · 图片 (JPG/PNG/WebP/GIF 等) · Word (.docx) · 文本 (.txt) · Markdown (.md)';

export function toPdfFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || originalName;
  return `${base}.pdf`;
}

export function isConvertibleKind(kind: FileKind): boolean {
  return kind !== 'pdf' && kind !== 'unknown';
}

export { ALL_EXT };
