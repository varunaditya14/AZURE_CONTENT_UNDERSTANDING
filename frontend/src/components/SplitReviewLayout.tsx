import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse } from "../types/analysis";
import { buildGroundingMap, extractPageDimension } from "../utils/grounding";
import { extractMarkdown, extractFigureMap } from "../utils/markdown";
import { extractTranscript } from "../utils/transcript";
import { detectModality } from "../utils/fileRouting";
import type { Modality } from "../utils/fileRouting";
import AnalyzerBadge from "./AnalyzerBadge";
import MetricsBar from "./MetricsBar";
import DocumentPreviewPanel from "./DocumentPreviewPanel";
import AudioPreviewPanel from "./AudioPreviewPanel";
import VideoPreviewPanel from "./VideoPreviewPanel";
import FieldsTable from "./FieldsTable";
import JsonViewer from "./JsonViewer";
import MarkdownViewer from "./MarkdownViewer";
import TranscriptPanel from "./TranscriptPanel";
import FullscreenModal from "./FullscreenModal";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

export type RightTab = "fields" | "markdown" | "transcript" | "json";

interface TabDef {
  id: RightTab;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const modality = useMemo(
    () => detectModality(result.file_type),
    [result.file_type],
  );
  const tabs = useMemo(() => getTabDefs(modality), [modality]);

  const [activeTab, setActiveTab] = useState<RightTab>(tabs[0].id);
  const [modalOpen, setModalOpen] = useState(false);
  const [hoveredFieldName, setHoveredFieldName] = useState<string | null>(null);

  // Reset active tab when modality changes (e.g. user re-uploads a different file type)
  useEffect(() => {
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeTab)) {
      setActiveTab(tabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.file_type]);

  // -- Document / image grounding --
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

  // -- Document markdown + figures --
  const markdownContent = useMemo(
    () => extractMarkdown(result.raw_result),
    [result.raw_result],
  );
  const figureMap = useMemo(
    () => extractFigureMap(result.raw_result),
    [result.raw_result],
  );

  // -- Audio / video transcript --
  const transcript = useMemo(
    () => extractTranscript(result.raw_result),
    [result.raw_result],
  );

  // Shared media element ref + current-time state for cross-panel coordination
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);

  // Reset media time when the result changes
  useEffect(() => {
    setMediaCurrentTime(0);
  }, [result]);

  const setMediaRefCb = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  }, []);

  function seekMedia(timeSec: number) {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = timeSec;
    el.play().catch(() => {});
  }

  const isAudio = modality === "audio";
  const isVideo = modality === "video";
  const isMedia = isAudio || isVideo;

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
          {/* Left -- preview panel (modality-aware) */}
          {isMedia ? (
            <div
              className={[
                "bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col",
                isAudio ? "lg:self-start" : "",
              ].join(" ")}
            >
              {/* Panel header for audio / video */}
              <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center gap-2.5 flex-shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide flex-shrink-0">
                  {result.file_type.toUpperCase()}
                </span>
                <span className="text-sm text-[#6b6b68]">
                  {isAudio ? "Audio preview" : "Video preview"}
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {isAudio ? (
                  <AudioPreviewPanel
                    audioFile={uploadedFile}
                    segments={transcript}
                    currentTime={mediaCurrentTime}
                    onMediaRef={setMediaRefCb}
                    onTimeUpdate={setMediaCurrentTime}
                  />
                ) : (
                  <VideoPreviewPanel
                    videoFile={uploadedFile}
                    segments={transcript}
                    currentTime={mediaCurrentTime}
                    onMediaRef={setMediaRefCb}
                    onTimeUpdate={setMediaCurrentTime}
                  />
                )}
              </div>
            </div>
          ) : (
            /* Document / image — DocumentPreviewPanel owns its own panel shell */
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
          <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center border-b border-[#e5e4e2] flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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

      {modalOpen && (
        <FullscreenModal
          result={result}
          uploadedFile={uploadedFile}
          modality={modality}
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
          transcript={transcript}
        />
      )}
    </>
  );
}
