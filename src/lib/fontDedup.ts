import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';

/**
 * 跨文档字体去重：合并 PDF 后，把内嵌字体数据逐字节相同的字体合并为一个。
 *
 * pdf-lib 的 `copyPages` 每次调用都会新建 `PDFObjectCopier`，其去重缓存只存活于
 * 单次调用内，因此同一字体被不同源文档（甚至同一文档的不同页）复制时会被重复嵌入。
 * 这里在最终保存前做一次引用级合并：指纹相同的字体只保留一棵子树，其余引用重定向
 * 到保留字体，并删除因此产生的孤儿对象。
 */

interface FontRecord {
  fontRef: PDFRef;
  data: Uint8Array;
  /** 合并键：BaseFont + 字体流长度 + 度量/映射元数据 + ToUnicode，逐项一致才算"同字体" */
  key: string;
}

const isContainer = (v: unknown): v is PDFDict | PDFArray | PDFStream =>
  v instanceof PDFDict || v instanceof PDFArray || v instanceof PDFStream;

/** 取出对象底层的 ES Map 字典（兼容 PDFDict 与 PDFStream；经 unknown 绕过私有字段） */
function getDictMap(obj: unknown): Map<PDFName, unknown> | null {
  if (!obj || typeof obj !== 'object') return null;
  if (obj instanceof PDFDict) {
    return (obj as unknown as { dict: Map<PDFName, unknown> }).dict;
  }
  if (obj instanceof PDFStream) {
    return (obj.dict as unknown as { dict: Map<PDFName, unknown> }).dict;
  }
  const dict = (obj as { dict?: unknown }).dict;
  if (dict instanceof PDFDict) {
    return (dict as unknown as { dict: Map<PDFName, unknown> }).dict;
  }
  if (dict instanceof Map) return dict as Map<PDFName, unknown>;
  return null;
}

function decodeStreamBytes(stream: PDFRawStream): Uint8Array {
  return decodePDFRawStream(stream).decode();
}

function getEntry(map: Map<PDFName, unknown>, name: string): unknown {
  return map.get(PDFName.of(name));
}

/** 把 PDF 对象序列化成稳定的比较字符串（含解引用） */
function serializeEntry(doc: PDFDocument, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (value instanceof PDFRef) return 'R:' + serializeEntry(doc, doc.context.lookup(value));
  if (value instanceof PDFArray) {
    const parts: string[] = [];
    for (let i = 0; i < value.size(); i++) parts.push(serializeEntry(doc, value.get(i)));
    return `[${parts.join(',')}]`;
  }
  if (value instanceof PDFDict) {
    const parts: string[] = [];
    for (const [k, v] of value.entries()) parts.push(`${String(k)}:${serializeEntry(doc, v)}`);
    return `{${parts.join(',')}}`;
  }
  if (value instanceof PDFName) return `/${value.decodeText()}`;
  return String(value);
}

/** 把（可选的）ToUnicode CMap 流内容并入合并键，避免合并后文本提取差异 */
function serializeStreamEntry(doc: PDFDocument, value: unknown): string {
  if (!(value instanceof PDFRef)) return '';
  const obj = doc.context.lookup(value);
  if (!(obj instanceof PDFRawStream)) return 'R';
  try {
    return 'S:' + bytesToLatin1(decodeStreamBytes(obj));
  } catch {
    return 'S:?';
  }
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 收集所有 Type0 内嵌字体的指纹信息 */
function collectFonts(doc: PDFDocument): FontRecord[] {
  const fonts: FontRecord[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    const map = getDictMap(obj);
    if (!map) continue;
    if (getEntry(map, 'Type') !== PDFName.of('Font')) continue;
    if (getEntry(map, 'Subtype') !== PDFName.of('Type0')) continue;

    const baseFont = String(getEntry(map, 'BaseFont'));
    const dd = getEntry(map, 'DescendantFonts');
    if (!(dd instanceof PDFArray) || dd.size() === 0) continue;
    const cidRef = dd.get(0);
    if (!(cidRef instanceof PDFRef)) continue;
    const cidMap = getDictMap(doc.context.lookup(cidRef));
    if (!cidMap) continue;

    const descRef = getEntry(cidMap, 'FontDescriptor');
    if (!(descRef instanceof PDFRef)) continue;
    const descMap = getDictMap(doc.context.lookup(descRef));
    if (!descMap) continue;

    let fileRef: PDFRef | null = null;
    for (const key of ['FontFile2', 'FontFile3', 'FontFile']) {
      const v = getEntry(descMap, key);
      if (v instanceof PDFRef) {
        fileRef = v;
        break;
      }
    }
    if (!fileRef) continue;

    const stream = doc.context.lookup(fileRef);
    if (!(stream instanceof PDFRawStream)) continue;
    let data: Uint8Array;
    try {
      data = decodeStreamBytes(stream);
    } catch {
      continue;
    }

    const w = serializeEntry(doc, getEntry(cidMap, 'W'));
    const cidToGid = serializeEntry(doc, getEntry(cidMap, 'CIDToGIDMap'));
    const cidSys = serializeEntry(doc, getEntry(cidMap, 'CIDSystemInfo'));
    const toUnicode = serializeStreamEntry(doc, getEntry(map, 'ToUnicode'));

    const key = [baseFont, data.length, w, cidToGid, cidSys, toUnicode].join('|');
    fonts.push({ fontRef: ref, data, key });
  }
  return fonts;
}

/** 遍历文档对象图，把对 oldRef 的所有引用替换为 newRef */
function replaceRef(doc: PDFDocument, oldRef: PDFRef, newRef: PDFRef) {
  const oldStr = oldRef.toString();
  const visited = new Set<object>();
  const visit = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);
    const map = getDictMap(obj);
    if (map) {
      map.forEach((v, k) => {
        if (v instanceof PDFRef) {
          if (v.toString() === oldStr) map.set(k, newRef);
        } else if (isContainer(v)) {
          visit(v);
        }
      });
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const v = obj.get(i);
        if (v instanceof PDFRef) {
          if (v.toString() === oldStr) obj.set(i, newRef);
        } else if (isContainer(v)) {
          visit(v);
        }
      }
    }
  };
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => visit(obj));
}

/** 从 Catalog 等根出发做可达性遍历，删除不可达的孤儿对象 */
function deleteOrphans(doc: PDFDocument): number {
  const { Root, Info } = doc.context.trailerInfo;
  if (!Root) return 0;
  const reachable = new Set<object>();
  const queue: unknown[] = [Root, Info].filter((v): v is PDFRef => v !== undefined);
  while (queue.length) {
    const item = queue.shift() as unknown;
    if (item instanceof PDFRef) {
      if (reachable.has(item)) continue;
      const obj = doc.context.lookup(item);
      if (!obj) continue;
      reachable.add(item);
      queue.push(obj);
      continue;
    }
    if (reachable.has(item as object)) continue;
    reachable.add(item as object);
    const map = getDictMap(item);
    if (map) {
      map.forEach((v) => queue.push(v));
    } else if (item instanceof PDFArray) {
      for (let i = 0; i < item.size(); i++) queue.push(item.get(i));
    }
  }
  let removed = 0;
  for (const [ref] of doc.context.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) {
      doc.context.delete(ref);
      removed++;
    }
  }
  return removed;
}

/**
 * 合并内嵌字体数据完全相同的字体，返回被合并（删除）的字体个数。
 * 调用时机：文档所有页面都已加入、保存之前。
 */
export function deduplicateEmbeddedFonts(doc: PDFDocument): number {
  const fonts = collectFonts(doc);
  const groups = new Map<string, FontRecord[]>();
  for (const f of fonts) {
    const list = groups.get(f.key);
    if (list) list.push(f);
    else groups.set(f.key, [f]);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      if (bytesEqual(keep.data, group[i].data)) {
        replaceRef(doc, group[i].fontRef, keep.fontRef);
        merged++;
      }
    }
  }
  if (merged > 0) deleteOrphans(doc);
  return merged;
}
