/**
 * fontkit 2.x 未内置 TypeScript 类型定义。
 * 这里只声明 pdf-lib 子集化流程实际用到的接口，类型以宽松为主（运行时行为以 fontkit 2.x 为准）。
 */
declare module 'fontkit' {
  export interface Glyph {
    id: number;
    path?: unknown;
  }

  export interface GlyphRun {
    glyphs: Glyph[];
    positions?: unknown[];
  }

  export interface Subset {
    cff?: unknown;
    includeGlyph(glyph: Glyph): number;
    encode(): Uint8Array;
    encodeStream?(): {
      on(event: string, handler: (...args: unknown[]) => void): unknown;
    };
  }

  export interface Font {
    postscriptName?: string;
    numGlyphs?: number;
    createSubset(): Subset;
    layout(str: string, features?: unknown): GlyphRun;
    glyphsForString(str: string): Glyph[];
    getGlyph(glyphId: number, codePoints?: number[]): Glyph;
  }

  export function create(buffer: Uint8Array, postscriptName?: string): Font;
  export function registerFormat(format: unknown): void;
  export let logErrors: boolean;
  export let defaultLanguage: string;
  export function setDefaultLanguage(lang: string): void;
}
