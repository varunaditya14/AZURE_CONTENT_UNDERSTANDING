import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse } from "../types/analysis";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import type { TranscriptSegment } from "../utils/transcript";
import type { Modality } from "../utils/fileRouting";
import { detectModality } from "../utils/fileRouting";
import DocumentPreviewPanel from "./DocumentPreviewPanel";
import AudioPreviewPanel from "./AudioPreviewPanel";
import VideoPreviewPanel from "./VideoPreviewPanel";
import FieldsTable from "./FieldsTable";
import JsonViewer from "./JsonViewer";
import MarkdownViewer from "./MarkdownViewer";
import TranscriptPanel from "./TranscriptPanel";

// Shared with SplitReviewLayout
type ModalTab = "fields" | "markdown" | "transcript" | "json";

interface TabDef {
  id: ModalTab;
  label: string;
}

function getTabDefs(modality: Modality): TabDef[] {
  if (modality === "audio" || modality === "video") {
    return [
      { id: "fields", label: "Extracted Fields" },
      { id: "transcript", label: "Transcript" },
      { id: "json", label: "Result JSON" },
    ];
  }
  return [
    { id: "fields", label: "Extracted Fields" },
    { id: "markdown", label: "Markdown" },
    { id: "json", label: "Result JSON" },
  ];
}

interface FullscreenModalProps {
  result: AnalyzeResponse;
  uploadedFile: File;
  modality?: Modality;
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
  transcript?: TranscriptSegment[];
}

export default function FullscreenModal({
  result,
  uploadedFile,
  modality: modalityProp,
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
  transcript = [],
}: FullscreenModalProps) {
  const modality = modalityProp ?? detectModality(result.file_type);
  const tabs = getTabDefs(modality);
  const isAudio = modality === "audio";
  const isVideo = modality === "video";
  const isMedia = isAudio || isVideo;

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

  // Modal-local media player state (independent from the non-modal player)
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);

  const setMediaRefCb = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  }, []);

  function seekMedia(timeSec: number) {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = timeSec;
    el.play().catch(() => {});
  }

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
      {/* Panel */}
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

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden min-h-0">
          {/* Left -- modality-aware preview */}
          {isAudio ? (
            <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
              <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center gap-2.5 flex-shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide flex-shrink-0">
                  AUDIO
                </span>
                <span className="text-sm text-[#6b6b68]">Audio preview</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AudioPreviewPanel
                  audioFile={uploadedFile}
                  segments={transcript}
                  currentTime={mediaCurrentTime}
                  onMediaRef={setMediaRefCb}
                  onTimeUpdate={setMediaCurrentTime}
                />
              </div>
            </div>
          ) : isVideo ? (
            <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
              <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center gap-2.5 flex-shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide flex-shrink-0">
                  VIDEO
                </span>
                <span className="text-sm text-[#6b6b68]">Video preview</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <VideoPreviewPanel
                  videoFile={uploadedFile}
                  segments={transcript}
                  currentTime={mediaCurrentTime}
                  onMediaRef={setMediaRefCb}
                  onTimeUpdate={setMediaCurrentTime}
                />
              </div>
            </div>
          ) : (
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
          )}

          {/* Right -- tabbed panel */}
          <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm flex flex-col overflow-hidden min-h-0">
            <div className="flex border-b border-[#e5e4e2] flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    "flex-1 px-5 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px",
                    activeTab === tab.id
                      ? "text-[#f05742] border-[#f05742] bg-[#f05742]/5"
                      : "text-[#6b6b68] border-transparent hover:text-[#1a1a18] hover:bg-[#f9f9f8]",
                  ].join(" ")}
                >
                  {tab.id === "json" ? (
                    <>
                      Result{" "}
                      <span className="ml-1 text-xs font-normal opacity-60">
                        JSON
                      </span>
                    </>
                  ) : (
                    tab.label
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="relative flex-1 min-h-0">
              {/* Extracted Fields */}
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
                  groundedFieldNames={isMedia ? new Set() : groundedFieldNames}
                />
              </div>

              {/* Markdown (document / image only) */}
              {!isMedia && (
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
              )}

              {/* Transcript (audio / video only) */}
              {isMedia && (
                <div
                  className={`absolute inset-0 flex flex-col ${
                    activeTab === "transcript" ? "" : "hidden"
                  }`}
                >
                  <TranscriptPanel
                    segments={transcript}
                    currentTime={mediaCurrentTime}
                    onSeek={seekMedia}
                  />
                </div>
              )}

              {/* Result JSON */}
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