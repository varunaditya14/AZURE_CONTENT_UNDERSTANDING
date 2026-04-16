import { useMemo, useState } from "react";
import type { AnalyzeResponse } from "../types/analysis";
import { buildGroundingMap, extractPageDimension } from "../utils/grounding";
import { extractMarkdown, extractFigureMap } from "../utils/markdown";
import AnalyzerBadge from "./AnalyzerBadge";
import MetricsBar from "./MetricsBar";
import DocumentPreviewPanel from "./DocumentPreviewPanel";
import FieldsTable from "./FieldsTable";
import JsonViewer from "./JsonViewer";
import MarkdownViewer from "./MarkdownViewer";
import FullscreenModal from "./FullscreenModal";

type RightTab = "fields" | "markdown" | "json";

interface SplitReviewLayoutProps {
  result: AnalyzeResponse;
  uploadedFile: File;
  selectedFieldName: string | null;
  onFieldSelect: (name: string | null) => void;
}

export default function SplitReviewLayout({
  result,
  uploadedFile,
  selectedFieldName,
  onFieldSelect,
}: SplitReviewLayoutProps) {
  const [activeTab, setActiveTab] = useState<RightTab>("fields");
  const [modalOpen, setModalOpen] = useState(false);
  const [hoveredFieldName, setHoveredFieldName] = useState<string | null>(null);
  const groundingMap = useMemo(
    () => buildGroundingMap(result.raw_result),
    [result.raw_result],
  );

  const pageDimension = useMemo(
    () => extractPageDimension(result.raw_result),
    [result.raw_result],
  );

  const groundedFieldNames = useMemo(
    () => new Set(groundingMap.keys()),
    [groundingMap],
  );

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

  const markdownContent = useMemo(
    () => extractMarkdown(result.raw_result),
    [result.raw_result],
  );

  const figureMap = useMemo(
    () => extractFigureMap(result.raw_result),
    [result.raw_result],
  );

  return (
    <>
      <div className="space-y-5 animate-fade-in">
        {/* Summary row */}
        <AnalyzerBadge
          analyzerId={result.analyzer_id}
          fileType={result.file_type}
          fileName={result.file_name}
        />
        <MetricsBar
          latencyMs={result.latency_ms}
          fieldCount={result.field_count}
          averageConfidence={result.average_confidence}
        />

        {/* Split pane */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[640px]">
          {/* Left — document / image preview */}
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
          <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center border-b border-[#e5e4e2] flex-shrink-0">
              <button
                onClick={() => setActiveTab("fields")}
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
                onClick={() => setActiveTab("markdown")}
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
                onClick={() => setActiveTab("json")}
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

              {/* Expand / fullscreen button */}
              <button
                onClick={() => setModalOpen(true)}
                title="Expand to fullscreen"
                aria-label="Expand to fullscreen"
                className="mx-2 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/8 border border-transparent hover:border-[#f05742]/20 transition-colors"
              >
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
                    d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
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

      {modalOpen && (
        <FullscreenModal
          result={result}
          uploadedFile={uploadedFile}
          groundingMap={groundingMap}
          pageDimension={pageDimension}
          groundedFieldNames={groundedFieldNames}
          selectedFieldName={selectedFieldName}
          onFieldSelect={onFieldSelect}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={() => setModalOpen(false)}
          markdownContent={markdownContent}
          figureMap={figureMap}
        />
      )}
    </>
  );
}
