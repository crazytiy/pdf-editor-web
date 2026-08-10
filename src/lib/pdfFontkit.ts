import * as fontkit from 'fontkit';
import type { PDFDocument } from 'pdf-lib';

type StreamHandlers = Record<string, (...args: unknown[]) => void>;

interface EncodeStreamLike {
  on(event: string, handler: (...args: unknown[]) => void): EncodeStreamLike;
}

/**
 * fontkit 2.x 的 Subset 只提供同步 encode()，而 pdf-lib 的
 * CustomFontSubsetEmbedder 依赖 fontkit 1.x 的 Node 流式 encodeStream()。
 * 这里补一个浏览器兼容的极简事件流。
 */
function makeEncodeStream(encode: () => Uint8Array): EncodeStreamLike {
  const handlers: StreamHandlers = {};
  let started = false;
  const stream: EncodeStreamLike = {
    on(event, handler) {
      handlers[event] = handler;
      if (event === 'data' && !started) {
        started = true;
        // 等所有 on() 注册完毕（含 end/error）后再派发
        queueMicrotask(() => {
          try {
            const data = encode();
            handlers['data']?.(data);
            handlers['end']?.();
          } catch (err) {
            handlers['error']?.(err);
          }
        });
      }
      return stream;
    },
  };
  return stream;
}

/**
 * 把 fontkit 2.x 注册给 pdf-lib 用于子集化。
 *
 * @pdf-lib/fontkit 1.1.1 是 fontkit 的过时 fork，其 CFF/CID 子集化存在两个已知 bug：
 * 1. CFF header 的 offSize 被写成表长截断值（非法），导致 FreeType/poppler
 *    拒绝整个嵌入字体，部分浏览器缺字；
 * 2. FDSelect/local-subr 归因错误，多 FD 的 CJK 字体（如 Noto Sans SC）中
 *    部分字形轮廓损坏。
 * fontkit 2.x 已修复这两个问题，这里用它替换旧 fork。
 */
export function registerPdfFontkit(doc: PDFDocument): void {
  const originalCreate = fontkit.create.bind(fontkit);
  doc.registerFontkit({
    create: (fontData: Uint8Array): any => {
      const font = originalCreate(fontData);
      const originalCreateSubset = font.createSubset.bind(font);
      font.createSubset = () => {
        const subset = originalCreateSubset();
        if (!subset.encodeStream) {
          subset.encodeStream = () => makeEncodeStream(() => subset.encode());
        }
        return subset;
      };
      return font;
    },
  });
}
