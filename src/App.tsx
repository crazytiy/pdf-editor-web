import { useCallback, useMemo, useRef, useState } from 'react';
import type { PdfFileItem, PdfPageItem } from './types';
import { convertKindLabel, prepareFileAsPdf } from './lib/convertToPdf';
import {
  buildPagesFromFile,
  downloadBytes,
  downloadZip,
  exportPages,
  getPageCount,
  splitEachPage,
} from './lib/pdfOperations';
import {
  ACCEPT_ATTR,
  FORMAT_HINT,
  getFileKind,
  isSupportedFile,
} from './lib/supportedFormats';
import { syncFilesWithPages } from './lib/syncFiles';
import './App.css';

function App() {
  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [pages, setPages] = useState<PdfPageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [dragPageId, setDragPageId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileMap = useCallback(() => {
    const m = new Map<string, Uint8Array>();
    for (const f of files) m.set(f.id, f.bytes);
    return m;
  }, [files]);

  const addFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter(isSupportedFile);
    if (incoming.length === 0) {
      alert('未识别到支持的文件。可上传 PDF、图片、Word (.docx)、文本或 Markdown。');
      return;
    }

    setLoading(true);
    setLoadingText('正在处理文件…');

    try {
      const newFiles: PdfFileItem[] = [];
      const newPages: PdfPageItem[] = [];

      for (const file of incoming) {
        const kind = getFileKind(file);
        if (kind !== 'pdf') {
          setLoadingText(
            `正在将 ${convertKindLabel(kind)} 转为 PDF：${file.name}`,
          );
        } else {
          setLoadingText(`正在加载：${file.name}`);
        }

        const { bytes, displayName } = await prepareFileAsPdf(file);
        const id = crypto.randomUUID();
        const count = await getPageCount(bytes);
        newFiles.push({ id, name: displayName, bytes, pageCount: count });
        setLoadingText(`正在生成预览：${displayName}`);
        const built = await buildPagesFromFile(id, displayName, bytes);
        newPages.push(...built);
      }

      setFiles((prev) => [...prev, ...newFiles]);
      setPages((prev) => [...prev, ...newPages]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '处理失败';
      alert(msg);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === pages.length) setSelected(new Set());
    else setSelected(new Set(pages.map((p) => p.id)));
  };

  const getOrderedSelection = (): PdfPageItem[] => {
    const sel = pages.filter((p) => selected.has(p.id));
    return sel.length > 0 ? sel : pages;
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    const nextPages = pages.filter((p) => !selected.has(p.id));
    setPages(nextPages);
    setFiles(
      nextPages.length === 0 ? [] : syncFilesWithPages(files, nextPages),
    );
    setSelected(new Set());
  };

  const displayFiles = useMemo(
    () => syncFilesWithPages(files, pages),
    [files, pages],
  );

  const rotateSelected = (delta: 90 | -90) => {
    if (selected.size === 0) return;
    setPages((prev) =>
      prev.map((p) => {
        if (!selected.has(p.id)) return p;
        const next = ((p.rotation + delta + 360) % 360) as 0 | 90 | 180 | 270;
        return { ...p, rotation: next };
      }),
    );
  };

  const movePage = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setPages((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === fromId);
      const toIdx = prev.findIndex((p) => p.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const handleExport = async (filename: string, exportPagesList: PdfPageItem[]) => {
    if (exportPagesList.length === 0) return;
    setLoading(true);
    setLoadingText('正在生成 PDF…');
    try {
      const bytes = await exportPages(exportPagesList, fileMap());
      downloadBytes(bytes, filename);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const downloadMerged = () => {
    void handleExport('合并结果.pdf', pages);
  };

  const downloadSelected = () => {
    const sel = getOrderedSelection();
    void handleExport(
      selected.size > 0 ? '选中页面.pdf' : '导出结果.pdf',
      sel,
    );
  };

  const splitSelected = async () => {
    const sel = getOrderedSelection();
    if (sel.length === 0) return;
    setLoading(true);
    setLoadingText('正在拆分…');
    try {
      if (sel.length === 1) {
        const bytes = await exportPages(sel, fileMap());
        downloadBytes(bytes, '拆分结果.pdf');
      } else {
        const parts = await splitEachPage(sel, fileMap());
        await downloadZip(parts, '拆分页面.zip');
      }
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const splitAllPages = async () => {
    if (pages.length === 0) return;
    setLoading(true);
    setLoadingText('正在逐页拆分…');
    try {
      const parts = await splitEachPage(pages, fileMap());
      await downloadZip(parts, '全部页面.zip');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const resetAll = () => {
    if (pages.length > 0 && !confirm('确定清空所有文件和页面？')) return;
    setFiles([]);
    setPages([]);
    setSelected(new Set());
  };

  const hasPages = pages.length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>PDF 编辑器</h1>
        <p>合并、拆分、调序，或将图片 / Word / 文本 / Markdown 转为 PDF</p>
        <span className="privacy-badge">🔒 文件不会上传到服务器</span>
      </header>

      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className="dropzone-icon">📄</div>
        <h2>点击或拖拽上传文件</h2>
        <p>{FORMAT_HINT}</p>
        <p className="dropzone-sub">支持多文件，可多次添加以实现合并</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden-input"
          onChange={onFileChange}
        />
      </div>

      {displayFiles.length > 0 && (
        <div className="file-list">
          {displayFiles.map((f) => (
            <span key={f.id} className="file-chip">
              <strong>{f.name}</strong>
              <span>{f.pageCount} 页</span>
            </span>
          ))}
        </div>
      )}

      {hasPages && (
        <>
          <div className="toolbar">
            <div className="toolbar-group">
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                ➕ 添加文件
              </button>
              <button type="button" className="btn" onClick={selectAll}>
                {selected.size === pages.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group">
              <button
                type="button"
                className="btn"
                disabled={selected.size === 0}
                onClick={() => rotateSelected(90)}
              >
                ↻ 顺时针
              </button>
              <button
                type="button"
                className="btn"
                disabled={selected.size === 0}
                onClick={() => rotateSelected(-90)}
              >
                ↺ 逆时针
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={selected.size === 0}
                onClick={deleteSelected}
              >
                🗑 删除选中
              </button>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group">
              <button type="button" className="btn btn-primary" onClick={downloadMerged}>
                ⬇ 下载合并 PDF
              </button>
              <button type="button" className="btn" onClick={downloadSelected}>
                ⬇ 导出{selected.size > 0 ? '选中' : '全部'}页
              </button>
              <button type="button" className="btn" onClick={() => void splitSelected()}>
                ✂ 拆分选中
              </button>
              <button type="button" className="btn" onClick={() => void splitAllPages()}>
                ✂ 逐页拆分 ZIP
              </button>
            </div>
            <div className="toolbar-divider" />
            <button type="button" className="btn btn-danger" onClick={resetAll}>
              清空
            </button>
          </div>

          <div className="pages-header">
            <h2>页面预览</h2>
            <span>
              共 {pages.length} 页
              {selected.size > 0 && ` · 已选 ${selected.size} 页`}
              {' · 拖拽卡片可调整顺序'}
            </span>
          </div>

          <div className="page-grid">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className={[
                  'page-card',
                  selected.has(page.id) ? 'selected' : '',
                  dragPageId === page.id ? 'dragging' : '',
                  dropTargetId === page.id ? 'drag-over' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={() => setDragPageId(page.id)}
                onDragEnd={() => {
                  setDragPageId(null);
                  setDropTargetId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetId(page.id);
                }}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragPageId) movePage(dragPageId, page.id);
                  setDragPageId(null);
                  setDropTargetId(null);
                }}
                onClick={() => toggleSelect(page.id)}
              >
                <input
                  type="checkbox"
                  className="page-checkbox"
                  checked={selected.has(page.id)}
                  onChange={() => toggleSelect(page.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="page-thumb">
                  {page.thumbnail && (
                    <img
                      src={page.thumbnail}
                      alt={`第 ${index + 1} 页`}
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                      draggable={false}
                    />
                  )}
                </div>
                <div className="page-meta">
                  <span className="page-index">#{index + 1}</span>
                  <span className="page-source" title={page.sourceFileName}>
                    {page.sourceFileName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!hasPages && !loading && (
        <p className="empty-hint">
          上传 PDF 或拖入图片、Word、文本、Markdown，自动转为 PDF 后可预览、排序、合并或拆分
        </p>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{loadingText || '处理中…'}</p>
        </div>
      )}
    </div>
  );
}

export default App;
