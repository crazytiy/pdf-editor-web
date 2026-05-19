/** 仅保留文件名，不含路径与扩展名 */
export function getFileBaseName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** 导出用本地时间标签：YYYYMMDD_HHmmss */
export function exportTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 在文件名与扩展名之间插入时间标签，如 合并结果_20260519_143052.pdf */
export function withExportTimestamp(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const tag = exportTimestamp();
  if (dot > 0) {
    return `${fileName.slice(0, dot)}_${tag}${fileName.slice(dot)}`;
  }
  return `${fileName}_${tag}`;
}
