import { useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse } from "../types/analysis";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import DocumentPreviewPanel from "./DocumentPreviewPanel";
import FieldsTable from "./FieldsTable";
import JsonViewer from "./JsonViewer";
import MarkdownViewer from "./MarkdownViewer";

type ModalTab = "fields" | "markdown" | "json";

interface FullscreenModalProps {
  result: AnalyzeResponse;
  uploadedFile: File;
  groundingMap: Map<string, BoundingRegion[]>;
  pageDimension: PageDimension | null;
  groundedFieldNames: Set<string>;
  selectedFieldName: string | null;
  onFieldSelect: (name: string | null) => void;
  activeTab: ModalTab;
  onTabChange: (tab: ModalTab) => void;
  onClose: () => void;
  markdownContent: string | null;
  figureMap?: Map<string, string>;
}

export default function FullscreenModal({
  result,
  uploadedFile,
  groundingMap,
  pageDimension,
  groundedFieldNames,
  selectedFieldName,
  onFieldSelect,
  activeTab,
  onTabChange,
  onClose,
  markdownContent,
  figureMap,
}: FullscreenModalProps) {
  const [hoveredFieldName, setHoveredFieldName] = useState<string | null>(null);
  const fieldDataMap = useMemo(
    () =>
      new Map(
        result.fields.map((f) => [
          f.name,
          { value: f.value, confidence: f.confidence },
        ]),
      ),
    [result.fields],
  );

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="relative bg-[#f9f9f8] rounded-2xl shadow-2xl flex flex-col w-full overflow-hidden border border-[#e5e4e2]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-[#e5e4e2] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide">
              {result.file_type.toUpperCase()}
            </span>
            <span
              className="text-sm font-semibold text-[#1a1a18] truncate max-w-[500px]"
              title={result.file_name}
            >
              {result.file_name}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close fullscreen"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b6b68] hover:text-[#1a1a18] hover:bg-[#f9f9f8] border border-transparent hover:border-[#e5e4e2] transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body — split layout fills remaining height */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden min-h-0">
          {/* Left — document / image preview, direct grid child so grid stretch applies */}
          <DocumentPreviewPanel
            fileType={result.file_type}
            fileName={result.file_name}
            uploadedFile={uploadedFile}
            groundingMap={groundingMap}
            pageDimension={pageDimension}
            selectedFieldName={selectedFieldName}
            hoveredFieldName={hoveredFieldName}
            fieldDataMap={fieldDataMap}
            onOverlayClick={onFieldSelect}
          />

          {/* Right — tabbed panel */}
          <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm flex flex-col overflow-hidden min-h-0">
            {/* Tab bar */}
            <div className="flex border-b border-[#e5e4e2] flex-shrink-0">
              <button
                onClick={() => onTabChange("fields")}
                className={[
                  "flex-1 px-5 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px",
                  activeTab === "fields"
                    ? "text-[#f05742] border-[#f05742] bg-[#f05742]/5"
                    : "text-[#6b6b68] border-transparent hover:text-[#1a1a18] hover:bg-[#f9f9f8]",
                ].join(" ")}
              >
                Extracted Fields
              </button>
              <button
                onClick={() => onTabChange("markdown")}
                className={[
                  "flex-1 px-5 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px",
                  activeTab === "markdown"
                    ? "text-[#f05742] border-[#f05742] bg-[#f05742]/5"
                    : "text-[#6b6b68] border-transparent hover:text-[#1a1a18] hover:bg-[#f9f9f8]",
                ].join(" ")}
              >
                Markdown
              </button>
              <button
                onClick={() => onTabChange("json")}
                className={[
                  "flex-1 px-5 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px",
                  activeTab === "json"
                    ? "text-[#f05742] border-[#f05742] bg-[#f05742]/5"
                    : "text-[#6b6b68] border-transparent hover:text-[#1a1a18] hover:bg-[#f9f9f8]",
                ].join(" ")}
              >
                Result{" "}
                <span className="ml-1 text-xs font-normal opacity-60">
                  JSON
                </span>
              </button>
            </div>

            {/* Tab content — relative container with absolute tab panels for correct height */}
            <div className="relative flex-1 min-h-0">
              <div
                className={`absolute inset-0 overflow-hidden ${
                  activeTab === "fields" ? "" : "hidden"
                }`}
              >
                <FieldsTable
                  fields={result.fields}
                  selectedFieldName={selectedFieldName}
                  onFieldSelect={onFieldSelect}
                  onFieldHover={setHoveredFieldName}
                  groundedFieldNames={groundedFieldNames}
                />
              </div>
              <div
                className={`absolute inset-0 ${
                  activeTab === "markdown" ? "" : "hidden"
                }`}
              >
                <MarkdownViewer
                  markdown={markdownContent}
                  figureMap={figureMap}
                />
              </div>
              <div
                className={`absolute inset-0 flex flex-col ${
                  activeTab === "json" ? "" : "hidden"
                }`}
              >
                <JsonViewer data={result.raw_result} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
