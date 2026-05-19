import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfPageItem } from '../types';
import { exportPages, renderPagePreview } from '../lib/pdfOperations';
import './PdfPreviewModal.css';

export type PreviewMode = 'page' | 'document';

type Props = {
  open: boolean;
  mode: PreviewMode;
  pages: PdfPageItem[];
  fileMap: Map<string, Uint8Array>;
  initialIndex?: number;
  onClose: () => void;
};

export default function PdfPreviewModal({
  open,
  mode,
  pages,
  fileMap,
  initialIndex = 0,
  onClose,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const docUrlRef = useRef<string | null>(null);

  const currentPage = pages[index];
  const total = pages.length;

  const revokeDocUrl = useCallback(() => {
    if (docUrlRef.current) {
      URL.revokeObjectURL(docUrlRef.current);
      docUrlRef.current = null;
    }
    setDocUrl(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(initialIndex, Math.max(0, pages.length - 1)));
    setZoom(100);
    setError(null);
  }, [open, initialIndex, pages.length]);

  useEffect(() => {
    if (!open || mode !== 'page' || !currentPage) return;

    let cancelled = false;
    const bytes = fileMap.get(currentPage.sourceFileId);
    if (!bytes) {
      setError('找不到源文件');
      setPageImage(null);
      return;
    }

    setLoading(true);
    setError(null);
    setPageImage(null);

    const scale = (zoom / 100) * 1.25;
    renderPagePreview(bytes, currentPage.sourcePageIndex, scale)
      .then((url) => {
        if (!cancelled) setPageImage(url);
      })
      .catch(() => {
        if (!cancelled) setError('页面渲染失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, currentPage, fileMap, index, zoom]);

  useEffect(() => {
    if (!open || mode !== 'document' || pages.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    revokeDocUrl();

    exportPages(pages, fileMap)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        docUrlRef.current = url;
        setDocUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError('生成预览 PDF 失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, pages, fileMap, revokeDocUrl]);

  useEffect(() => {
    if (!open) revokeDocUrl();
  }, [open, revokeDocUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (mode === 'page' && total > 1) {
        if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
        if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, total, onClose]);

  if (!open) return null;

  const title =
    mode === 'document'
      ? `选中页面预览 · 共 ${total} 页`
      : `第 ${index + 1} / ${total} 页 · ${currentPage?.sourceFileName ?? ''}`;

  return (
    <div
      className="preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="PDF 预览"
      onClick={onClose}
    >
      <div className="preview-panel" onClick={(e) => e.stopPropagation()}>
        <header className="preview-header">
          <h3 className="preview-title">{title}</h3>
          <div className="preview-header-actions">
            {mode === 'page' && (
              <div className="preview-zoom">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={zoom <= 50}
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                  aria-label="缩小"
                >
                  −
                </button>
                <span>{zoom}%</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={zoom >= 200}
                  onClick={() => setZoom((z) => Math.min(200, z + 25))}
                  aria-label="放大"
                >
                  +
                </button>
              </div>
            )}
            <button type="button" className="btn btn-sm" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
        </header>

        <div className="preview-body">
          {loading && <p className="preview-status">正在加载预览…</p>}
          {error && <p className="preview-status preview-error">{error}</p>}

          {mode === 'page' && pageImage && !loading && (
            <div className="preview-page-wrap">
              <img
                src={pageImage}
                alt={`第 ${index + 1} 页`}
                className="preview-page-img"
                style={{
                  transform: `rotate(${currentPage?.rotation ?? 0}deg)`,
                }}
              />
            </div>
          )}

          {mode === 'document' && docUrl && !loading && (
            <iframe
              title="PDF 文档预览"
              src={docUrl}
              className="preview-iframe"
            />
          )}
        </div>

        {mode === 'page' && total > 1 && (
          <footer className="preview-footer">
            <button
              type="button"
              className="btn"
              disabled={index <= 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              ← 上一页
            </button>
            <span className="preview-page-num">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              className="btn"
              disabled={index >= total - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              下一页 →
            </button>
          </footer>
        )}

        {mode === 'page' && (
          <p className="preview-hint">方向键翻页 · Esc 关闭</p>
        )}
      </div>
    </div>
  );
}
