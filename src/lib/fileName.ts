/** 仅保留文件名，不含路径与扩展名 */
export function getFileBaseName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
