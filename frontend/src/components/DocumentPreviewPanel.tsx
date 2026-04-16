import ImagePreviewPanel from "./ImagePreviewPanel";
import PdfPreviewPanel from "./PdfPreviewPanel";
import type { BoundingRegion, PageDimension } from "../utils/grounding";

interface DocumentPreviewPanelProps {
  fileType: string;
  fileName: string;
  uploadedFile?: File | null;
  groundingMap?: Map<string, BoundingRegion[]>;
  pageDimension?: PageDimension | null;
  selectedFieldName?: string | null;
  hoveredFieldName?: string | null;
  fieldDataMap?: Map<
    string,
    { value: string | null; confidence: number | null }
  >;
  onOverlayClick?: (name: string | null) => void;
}

function PdfIcon() {
  return (
    <svg
      className="w-8 h-8 text-[#f05742]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      className="w-8 h-8 text-[#f05742]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

export default function DocumentPreviewPanel({
  fileType,
  uploadedFile,
  groundingMap,
  pageDimension,
  selectedFieldName,
  hoveredFieldName,
  fieldDataMap,
  onOverlayClick,
}: DocumentPreviewPanelProps) {
  const isPdf = fileType === "pdf";
  const canRenderPdf = fileType === "pdf" && uploadedFile != null;
  const canRenderImage = fileType === "image" && uploadedFile != null;

  return (
    <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/* Panel header */}
      <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center gap-2.5 flex-shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide flex-shrink-0">
          {fileType.toUpperCase()}
        </span>
        <span className="text-sm text-[#6b6b68]">
          {isPdf ? "PDF preview" : "Image preview"}
        </span>
      </div>

      {/* Body */}
      {canRenderPdf ? (
        <div className="flex-1 min-h-0 overflow-hidden bg-[#f9f9f8]">
          <PdfPreviewPanel
            pdfFile={uploadedFile!}
            groundingMap={groundingMap ?? new Map()}
            pageDimension={pageDimension ?? null}
            selectedFieldName={selectedFieldName ?? null}
            hoveredFieldName={hoveredFieldName ?? null}
            fieldDataMap={fieldDataMap}
            onOverlayClick={onOverlayClick ?? (() => {})}
          />
        </div>
      ) : canRenderImage ? (
        <div className="flex-1 overflow-auto bg-[#f9f9f8]">
          <ImagePreviewPanel
            imageFile={uploadedFile!}
            groundingMap={groundingMap ?? new Map()}
            pageDimension={pageDimension ?? null}
            selectedFieldName={selectedFieldName ?? null}
            hoveredFieldName={hoveredFieldName ?? null}
            fieldDataMap={fieldDataMap}
            onOverlayClick={onOverlayClick ?? (() => {})}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[460px] px-6 py-10 bg-[#f9f9f8]">
          <div className="w-full max-w-[280px] aspect-[3/4] border-2 border-dashed border-[#e5e4e2] rounded-xl flex flex-col items-center justify-center gap-4 bg-white">
            <div className="w-16 h-16 rounded-2xl bg-[#f05742]/8 border border-[#f05742]/20 flex items-center justify-center">
              {isPdf ? <PdfIcon /> : <ImageIcon />}
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-semibold text-[#1a1a18] mb-1">
                {isPdf ? "PDF Preview" : "Image Preview"}
              </p>
              <p className="text-xs text-[#6b6b68] leading-relaxed">
                Visual preview with field region highlights will appear here.
              </p>
            </div>
          </div>
          <p className="mt-5 text-xs text-[#6b6b68] text-center max-w-[240px] leading-relaxed">
            Select a field on the right to see where it was extracted from the{" "}
            {isPdf ? "document" : "image"}.
          </p>
        </div>
      )}
    </div>
  );
}
