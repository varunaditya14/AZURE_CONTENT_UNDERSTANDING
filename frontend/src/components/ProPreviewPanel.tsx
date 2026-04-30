import type { ProFile } from "../types/proFileTypes";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import PdfPreviewPanel from "./PdfPreviewPanel";
import ImagePreviewPanel from "./ImagePreviewPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const KIND_LABEL: Record<ProFile["kind"], string> = {
  pdf: "PDF",
  image: "Image",
  docx: "DOCX",
  txt: "TXT",
  other: "File",
};

// Neutral placeholder rows for the document mock — purely visual
const DOC_ROWS = [0.65, 0.85, 0.55, 0.72];
const TABLE_ROWS = [0.8, 0.6, 0.75, 0.65, 0.7];

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function IconBtn({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      className="w-7 h-7 rounded-lg border border-[#e5e4e2] flex items-center justify-center text-[#6b6b68] hover:border-[#f05742]/40 hover:text-[#f05742] transition-colors"
    >
      {children}
    </button>
  );
}

function FileTypeIcon({
  kind,
  className = "w-8 h-8",
}: {
  kind: ProFile["kind"];
  className?: string;
}) {
  if (kind === "image") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Viewport variants
// ---------------------------------------------------------------------------

function EmptyViewport() {
  return (
    <div className="flex-1 min-h-0 bg-[#efeeec] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-[#e5e4e2] shadow-sm px-8 py-10 flex flex-col items-center gap-3 max-w-xs text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#f5f5f4] flex items-center justify-center">
          <svg
            className="w-6 h-6 text-[#6b6b68]/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
            />
          </svg>
        </div>
        <p className="text-sm font-semibold text-[#1a1a18]">No file selected</p>
        <p className="text-xs text-[#6b6b68] leading-relaxed">
          Select a file from the sidebar to preview it here
        </p>
      </div>
    </div>
  );
}

function ImageViewport({ file }: { file: ProFile }) {
  return (
    <div className="flex-1 min-h-0 bg-[#efeeec] flex items-center justify-center p-6 overflow-hidden">
      <img
        src={file.previewUrl!}
        alt={file.name}
        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      />
    </div>
  );
}

function FileStubViewport({ file }: { file: ProFile }) {
  return (
    <div className="flex-1 min-h-0 bg-[#efeeec] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-[#e5e4e2] shadow-sm px-8 py-10 flex flex-col items-center gap-3 max-w-xs text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#f5f5f4] flex items-center justify-center">
          <FileTypeIcon
            kind={file.kind}
            className="w-7 h-7 text-[#6b6b68]/60"
          />
        </div>
        <p
          className="text-sm font-semibold text-[#1a1a18] max-w-[180px] break-words"
          title={file.name}
        >
          {file.name.length > 32 ? file.name.slice(0, 30) + "…" : file.name}
        </p>
        <p className="text-xs text-[#6b6b68]">{fmtSize(file.size)}</p>
        <p className="text-xs text-[#6b6b68]/70">Preview not available</p>
      </div>
    </div>
  );
}

function DocumentMockViewport() {
  return (
    <div className="flex-1 min-h-0 bg-[#efeeec] flex items-center justify-center p-6 overflow-hidden">
      {/* Document page mock */}
      <div
        className="bg-white rounded-lg shadow-lg border border-[#e5e4e2] w-full max-w-[280px] flex flex-col p-5 gap-3"
        style={{ aspectRatio: "8.5 / 11" }}
      >
        {/* Letterhead row */}
        <div className="flex items-start gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded bg-[#f05742]/15 flex-shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1 pt-1">
            <div className="h-2.5 bg-[#1a1a18]/18 rounded w-3/4" />
            <div className="h-2 bg-[#6b6b68]/20 rounded w-1/2" />
          </div>
        </div>

        {/* Document title bar */}
        <div className="h-3 bg-[#1a1a18]/14 rounded w-2/3 flex-shrink-0" />

        {/* Divider */}
        <div className="border-t border-[#e5e4e2] flex-shrink-0" />

        {/* Key-value pairs */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {DOC_ROWS.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-2 bg-[#6b6b68]/22 rounded"
                style={{ width: "34%" }}
              />
              <div
                className="h-2 bg-[#f05742]/18 rounded"
                style={{ width: `${w * 62}%` }}
              />
            </div>
          ))}
        </div>

        {/* Table mock */}
        <div className="flex-1 min-h-0 rounded border border-[#e5e4e2] overflow-hidden flex flex-col">
          {/* Table header */}
          <div className="flex gap-2 px-2 py-1.5 bg-[#f5f5f4] border-b border-[#e5e4e2] flex-shrink-0">
            <div className="h-1.5 bg-[#6b6b68]/35 rounded flex-1" />
            <div className="h-1.5 bg-[#6b6b68]/35 rounded w-10" />
          </div>
          {/* Table body rows */}
          {TABLE_ROWS.map((w, i) => (
            <div
              key={i}
              className="flex gap-2 px-2 py-1.5 border-b border-[#e5e4e2] last:border-0"
            >
              <div
                className="h-1.5 bg-[#6b6b68]/18 rounded"
                style={{ width: `${w * 58}%` }}
              />
              <div className="h-1.5 bg-[#6b6b68]/14 rounded w-8" />
            </div>
          ))}
        </div>

        {/* Footer text */}
        <div className="flex-shrink-0 flex flex-col gap-1.5">
          <div className="h-1.5 bg-[#6b6b68]/14 rounded w-2/3" />
          <div className="h-1.5 bg-[#6b6b68]/14 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProPreviewPanelProps {
  previewFile: ProFile | null;
  previewFileBlob?: File | null;
  groundingMap?: Map<string, BoundingRegion[]>;
  pageDimension?: PageDimension | null;
  fieldDataMap?: Map<
    string,
    { value: string | null; confidence: number | null }
  >;
  selectedFieldName?: string | null;
  onFieldSelect?: (name: string | null) => void;
}

export default function ProPreviewPanel({
  previewFile,
  previewFileBlob,
  groundingMap,
  pageDimension,
  fieldDataMap,
  selectedFieldName,
  onFieldSelect,
}: ProPreviewPanelProps) {
  const hasPdfBlob = previewFile?.kind === "pdf" && previewFileBlob != null;
  const hasImageBlob = previewFile?.kind === "image" && previewFileBlob != null;
  const hasPdfUrl =
    previewFile?.kind === "pdf" &&
    !previewFileBlob &&
    !!previewFile?.previewUrl;
  // Hide the static footer when a real panel is active (PdfPreviewPanel has its own floating zoom)
  const showFooter = !hasPdfBlob && !hasImageBlob && !hasPdfUrl;

  // Determine which viewport to show
  function renderViewport() {
    if (!previewFile) return <EmptyViewport />;

    if (hasPdfBlob) {
      return (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PdfPreviewPanel
            pdfFile={previewFileBlob!}
            groundingMap={groundingMap ?? new Map()}
            pageDimension={pageDimension ?? null}
            selectedFieldName={selectedFieldName ?? null}
            fieldDataMap={fieldDataMap}
            onOverlayClick={onFieldSelect ?? (() => {})}
          />
        </div>
      );
    }

    if (hasImageBlob) {
      return (
        <div className="flex-1 overflow-auto">
          <ImagePreviewPanel
            imageFile={previewFileBlob!}
            groundingMap={groundingMap ?? new Map()}
            pageDimension={pageDimension ?? null}
            selectedFieldName={selectedFieldName ?? null}
            onOverlayClick={onFieldSelect ?? (() => {})}
          />
        </div>
      );
    }

    if (previewFile.kind === "image" && previewFile.previewUrl) {
      return <ImageViewport file={previewFile} />;
    }
    if (hasPdfUrl) {
      return (
        <div className="flex-1 min-h-0 overflow-hidden">
          <iframe
            src={previewFile.previewUrl!}
            title={previewFile.name}
            className="w-full h-full border-0"
          />
        </div>
      );
    }
    if (previewFile.kind === "pdf") {
      return <DocumentMockViewport />;
    }
    return <FileStubViewport file={previewFile} />;
  }

  return (
    <div className="flex flex-col rounded-[20px] border border-[#e5e4e2] bg-white overflow-hidden">
      {/* Panel header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 border-b border-[#e5e4e2]"
        style={{ height: 52 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {previewFile ? (
            <FileTypeIcon
              kind={previewFile.kind}
              className="w-4 h-4 flex-shrink-0 text-[#6b6b68]"
            />
          ) : (
            <svg
              className="w-4 h-4 text-[#6b6b68]/40 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
              />
            </svg>
          )}
          <span className="text-sm font-medium text-[#1a1a18] truncate">
            {previewFile?.name ?? "No file selected"}
          </span>
        </div>
        {previewFile && (
          <div className="flex-shrink-0 ml-3 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#6b6b68] bg-[#f5f5f4] border border-[#e5e4e2] rounded-full px-2.5 py-0.5">
              {KIND_LABEL[previewFile.kind]}
            </span>
            <span
              className={[
                "text-[10px] font-medium rounded-full px-2 py-0.5 border",
                previewFile.sourceKind === "reference"
                  ? "text-[#7c3aed] bg-[#f5f3ff] border-[#7c3aed]/20"
                  : "text-[#0369a1] bg-[#f0f9ff] border-[#0369a1]/20",
              ].join(" ")}
            >
              {previewFile.sourceKind === "reference"
                ? "Reference"
                : "Test file"}
            </span>
          </div>
        )}
      </div>

      {/* Preview viewport */}
      {renderViewport()}

      {/* Footer controls — hidden when a real preview panel (PDF/image) is active */}
      {showFooter && (
        <div className="flex-shrink-0 h-14 flex items-center justify-between px-4 border-t border-[#e5e4e2] bg-white">
          {/* Page navigation */}
          <div className="flex items-center gap-2">
            <IconBtn title="Previous page">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </IconBtn>
            <span className="text-xs text-[#6b6b68] w-16 text-center tabular-nums select-none">
              Page 1 / 1
            </span>
            <IconBtn title="Next page">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </IconBtn>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5">
            <IconBtn title="Zoom out">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 12H4"
                />
              </svg>
            </IconBtn>
            <span className="text-xs text-[#6b6b68] w-10 text-center tabular-nums select-none">
              100%
            </span>
            <IconBtn title="Zoom in">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </IconBtn>
            <div className="w-px h-4 bg-[#e5e4e2] mx-0.5" />
            <IconBtn title="Fit to width">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
                />
              </svg>
            </IconBtn>
          </div>
        </div>
      )}
    </div>
  );
}
