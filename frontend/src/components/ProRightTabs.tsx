import { useRef, useState } from "react";
import ProSchemaTab from "./ProSchemaTab";
import FieldsTable from "./FieldsTable";
import MetricsBar from "./MetricsBar";
import JsonViewer from "./JsonViewer";
import type { AnalyzerSchema, SchemaField } from "../types/proTypes";
import type { ProFile, ReferenceFileSet } from "../types/proFileTypes";
import type { AnalyzeResponse } from "../types/analysis";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type TabId = "schema" | "reference" | "prediction" | "result";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "schema", label: "Schema" },
  { id: "reference", label: "Reference files" },
  { id: "prediction", label: "Prediction" },
  { id: "result", label: "Result" },
];

// ---------------------------------------------------------------------------
// Shared mini-components
// ---------------------------------------------------------------------------

function OutlineBtn({
  children,
  className = "",
  danger = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-8 px-3 flex items-center gap-1.5 text-xs font-medium rounded-lg border transition-colors",
        danger
          ? "border-[#e5e4e2] text-[#6b6b68] hover:border-[#dc2626]/40 hover:text-[#dc2626] bg-white"
          : "border-[#e5e4e2] text-[#1a1a18] hover:border-[#d1d0ce] bg-white",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Reference files tab (multi-set, two-view)
// ---------------------------------------------------------------------------

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const REF_ACCEPT = ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt";
type RefView = "sets" | "files";

interface ReferencePanelProps {
  referenceFileSets: ReferenceFileSet[];
  selectedReferenceFileSetId: string;
  selectedReferenceFileId: string | null;
  onSelectReferenceSet: (id: string) => void;
  onCreateReferenceSet: (name: string) => void;
  onRenameReferenceSet: (id: string, name: string) => void;
  onDeleteReferenceSet: (id: string) => void;
  onSaveReferenceSet: (id: string) => Promise<void>;
  onAddFilesToReferenceSet: (files: File[]) => void;
  onRemoveFileFromReferenceSet: (fileId: string) => void;
  onSelectReferenceFile: (id: string) => void;
  savingReferenceSet: boolean;
  referenceSetSaveError: string | null;
  setsLoading?: boolean;
}

function ReferencePanel({
  referenceFileSets,
  selectedReferenceFileSetId,
  selectedReferenceFileId,
  onSelectReferenceSet,
  onCreateReferenceSet,
  onRenameReferenceSet,
  onDeleteReferenceSet,
  onSaveReferenceSet,
  onAddFilesToReferenceSet,
  onRemoveFileFromReferenceSet,
  onSelectReferenceFile,
  savingReferenceSet,
  referenceSetSaveError,
  setsLoading,
}: ReferencePanelProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<RefView>("sets");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newSetName, setNewSetName] = useState("");

  const activeSet =
    referenceFileSets.find((s) => s.id === selectedReferenceFileSetId) ??
    referenceFileSets[0] ??
    null;
  const selectedFile =
    activeSet?.files.find((f) => f.id === selectedReferenceFileId) ?? null;

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onAddFilesToReferenceSet(files);
    e.target.value = "";
  }

  function commitCreate() {
    const name = newSetName.trim();
    if (name) onCreateReferenceSet(name);
    setIsCreating(false);
    setNewSetName("");
  }

  function commitRename(id: string) {
    const name = renameValue.trim();
    if (name) onRenameReferenceSet(id, name);
    setRenamingId(null);
    setRenameValue("");
  }

  // ── SETS VIEW ─────────────────────────────────────────────────────────────
  if (view === "sets") {
    return (
      <div className="h-full flex flex-col overflow-hidden p-3 gap-3">
        <p className="text-xs font-semibold text-[#1a1a18] px-1 flex-shrink-0">
          Reference sets
        </p>

        {setsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[#f05742]/30 border-t-[#f05742] animate-spin" />
          </div>
        ) : referenceFileSets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#e5e4e2] rounded-xl">
            <svg
              className="w-7 h-7 text-[#6b6b68]/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <p className="text-xs text-[#6b6b68] text-center">
              No reference sets yet
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
            {referenceFileSets.map((set) => {
              const isActive = set.id === selectedReferenceFileSetId;
              const isRenaming = renamingId === set.id;
              return (
                <div
                  key={set.id}
                  className={[
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all duration-150",
                    isActive
                      ? "border-[#f05742] bg-[#fff5f4]"
                      : "border-[#e5e4e2] bg-white hover:border-[#f05742]/40 hover:bg-[#fff9f8]",
                  ].join(" ")}
                  onClick={() => {
                    onSelectReferenceSet(set.id);
                    if (!isRenaming) setView("files");
                  }}
                >
                  <svg
                    className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#f05742]" : "text-[#6b6b68]"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>

                  {isRenaming ? (
                    <input
                      autoFocus
                      className="flex-1 min-w-0 text-xs font-medium bg-transparent border-0 border-b border-[#f05742] outline-none text-[#1a1a18] pb-0.5"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(set.id);
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      onBlur={() => commitRename(set.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-medium truncate ${isActive ? "text-[#f05742]" : "text-[#1a1a18]"}`}
                      >
                        {set.name}
                      </p>
                      <p className="text-[10px] text-[#6b6b68] mt-0.5">
                        {set.files.length} file
                        {set.files.length !== 1 ? "s" : ""}
                        {set.isDirty && (
                          <span className="ml-1 text-[#f05742]">&middot; unsaved</span>
                        )}
                      </p>
                    </div>
                  )}

                  {!isRenaming && (
                    <div
                      className="flex items-center gap-1 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        title="Rename"
                        onClick={() => {
                          setRenamingId(set.id);
                          setRenameValue(set.name);
                        }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[#6b6b68] hover:text-[#1a1a18] hover:bg-[#f5f5f4] transition-colors"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      {referenceFileSets.length > 1 && (
                        <button
                          title="Delete"
                          onClick={() => onDeleteReferenceSet(set.id)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-[#6b6b68] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-shrink-0">
          {isCreating ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#f05742]/40 bg-[#fff5f4]">
              <input
                autoFocus
                placeholder="Set name..."
                className="flex-1 min-w-0 text-xs font-medium bg-transparent border-0 border-b border-[#f05742] outline-none text-[#1a1a18] pb-0.5"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreate();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewSetName("");
                  }
                }}
              />
              <button
                onClick={commitCreate}
                className="text-xs text-[#f05742] font-semibold hover:underline"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewSetName("");
                }}
                className="text-xs text-[#6b6b68] hover:text-[#1a1a18]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium text-[#6b6b68] hover:text-[#1a1a18] border border-dashed border-[#e5e4e2] hover:border-[#d1d0ce] rounded-xl transition-colors"
            >
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
              New reference set
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── FILES VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden p-4">
      {/* Back + header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setView("sets")}
          className="w-7 h-7 rounded-lg border border-[#e5e4e2] flex items-center justify-center text-[#6b6b68] hover:border-[#f05742]/40 hover:text-[#f05742] transition-colors"
          title="Back to sets"
        >
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
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#1a1a18] truncate">
            {activeSet?.name ?? "Reference set"}
          </p>
          {activeSet?.isDirty && (
            <span className="text-[10px] text-[#f05742]">Unsaved changes</span>
          )}
        </div>
        {activeSet?.isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#f05742] flex-shrink-0" />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <input
          ref={uploadRef}
          type="file"
          multiple
          accept={REF_ACCEPT}
          className="hidden"
          onChange={handleUpload}
        />
        <button
          onClick={() => uploadRef.current?.click()}
          className="h-8 px-3 flex items-center gap-1.5 bg-[#f05742] hover:bg-[#d94332] text-white text-xs font-semibold rounded-lg transition-colors"
        >
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Upload files
        </button>
        {selectedReferenceFileId && (
          <OutlineBtn
            danger
            onClick={() => onRemoveFileFromReferenceSet(selectedReferenceFileId)}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Remove
          </OutlineBtn>
        )}
        {activeSet && (
          <OutlineBtn
            onClick={() => void onSaveReferenceSet(activeSet.id)}
            className={
              activeSet.isDirty || !activeSet.savedId ? "" : "opacity-50"
            }
          >
            {savingReferenceSet ? (
              <span className="w-3 h-3 rounded-full border-2 border-[#6b6b68]/30 border-t-[#6b6b68] animate-spin" />
            ) : (
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            )}
            {activeSet.savedId && !activeSet.isDirty ? "Saved" : "Save"}
            {activeSet.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#f05742] ml-0.5" />
            )}
          </OutlineBtn>
        )}
      </div>

      {referenceSetSaveError && (
        <p className="text-[11px] text-[#dc2626] px-1 flex-shrink-0">
          {referenceSetSaveError}
        </p>
      )}

      {!activeSet || activeSet.files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#e5e4e2] rounded-xl">
          <svg
            className="w-8 h-8 text-[#6b6b68]/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <p className="text-xs text-[#6b6b68] text-center leading-snug">
            No reference files yet.
            <br />
            Upload files to use as references.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-3">
          {/* Left file list */}
          <div className="w-48 flex-shrink-0 flex flex-col gap-1.5 overflow-y-auto">
            {activeSet.files.map((file) => {
              const active = file.id === selectedReferenceFileId;
              return (
                <button
                  key={file.id}
                  onClick={() => onSelectReferenceFile(file.id)}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150",
                    active
                      ? "border-[#f05742] bg-[#fff5f4]"
                      : "border-[#e5e4e2] bg-white hover:border-[#f05742]/40 hover:bg-[#fff9f8]",
                  ].join(" ")}
                >
                  <svg
                    className={`w-4 h-4 flex-shrink-0 ${active ? "text-[#f05742]" : "text-[#6b6b68]"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    {file.kind === "image" ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                      />
                    )}
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${active ? "text-[#f05742]" : "text-[#1a1a18]"}`}
                    >
                      {file.name}
                    </p>
                    <p className="text-[10px] text-[#6b6b68] mt-0.5">
                      {fmtSize(file.size)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right preview — image shown inline; others show file card */}
          <div className="flex-1 min-w-0 bg-[#f5f5f4] rounded-xl border border-[#e5e4e2] flex flex-col items-center justify-center gap-3 overflow-hidden">
            {selectedFile?.kind === "image" && selectedFile.previewUrl ? (
              <img
                src={selectedFile.previewUrl}
                alt={selectedFile.name}
                className="max-w-full max-h-full object-contain p-3"
              />
            ) : selectedFile ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-[#f05742]/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-[#f05742]"
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
                <div className="text-center px-4">
                  <p className="text-xs font-semibold text-[#1a1a18] truncate max-w-[140px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-[#6b6b68] mt-0.5">
                    {selectedFile.kind.toUpperCase()} &middot;{" "}
                    {fmtSize(selectedFile.size)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-[#e5e4e2] flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-[#6b6b68]/40"
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
                <p className="text-xs text-[#6b6b68] text-center">
                  No file selected
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction tab
// ---------------------------------------------------------------------------

function PredictionPanel({
  result,
  running,
  error,
  selectedFieldName,
  onFieldSelect,
}: {
  result: AnalyzeResponse | null;
  running: boolean;
  error?: string | null;
  selectedFieldName?: string | null;
  onFieldSelect?: (name: string | null) => void;
}) {
  if (running) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-10 h-10 rounded-full border-4 border-[#f05742]/20 border-t-[#f05742] animate-spin" />
        <p className="text-sm text-[#6b6b68]">Analyzing...</p>
      </div>
    );
  }

  if (!result) {
    if (error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-14 h-14 rounded-2xl bg-[#fef2f2] border border-[#fecaca] flex items-center justify-center">
            <svg
              className="w-7 h-7 text-[#dc2626]/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-center max-w-[260px]">
            <p className="text-sm font-semibold text-[#dc2626]">
              Analysis failed
            </p>
            <p className="text-xs text-[#6b6b68] mt-1.5 leading-relaxed break-words">
              {error}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-14 h-14 rounded-2xl bg-[#f5f5f4] border border-[#e5e4e2] flex items-center justify-center">
          <svg
            className="w-7 h-7 text-[#6b6b68]/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <div className="text-center max-w-[200px]">
          <p className="text-sm font-semibold text-[#1a1a18]">
            No prediction yet
          </p>
          <p className="text-xs text-[#6b6b68] mt-1.5 leading-relaxed">
            Upload test files and run analysis to see extracted fields here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-[#e5e4e2]">
        <MetricsBar
          latencyMs={result.latency_ms}
          fieldCount={result.field_count}
          averageConfidence={result.average_confidence}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FieldsTable
          fields={result.fields}
          selectedFieldName={selectedFieldName ?? null}
          onFieldSelect={onFieldSelect}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result tab
// ---------------------------------------------------------------------------

function ResultPanel({
  result,
  running,
}: {
  result: AnalyzeResponse | null;
  running: boolean;
}) {
  if (running) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-10 h-10 rounded-full border-4 border-[#f05742]/20 border-t-[#f05742] animate-spin" />
        <p className="text-sm text-[#6b6b68]">Analyzing...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-14 h-14 rounded-2xl bg-[#1a1a18]/5 border border-[#e5e4e2] flex items-center justify-center">
          <svg
            className="w-7 h-7 text-[#6b6b68]/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
        </div>
        <div className="text-center max-w-[200px]">
          <p className="text-sm font-semibold text-[#1a1a18]">No result yet</p>
          <p className="text-xs text-[#6b6b68] mt-1.5 leading-relaxed">
            Run analysis to see the full JSON output here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <JsonViewer data={result.raw_result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface ProRightTabsProps {
  /** Null when no analyzer is selected or while the detail is loading. */
  schema: AnalyzerSchema | null;
  /** True while the selected analyzer's schema detail is being fetched. */
  schemaLoading?: boolean;
  /** When true, all mutation controls in the Schema tab are hidden. */
  readOnly?: boolean;
  onFieldAdd: (field: Omit<SchemaField, "id">) => void;
  onFieldUpdate: (
    fieldId: string,
    patch: Partial<Omit<SchemaField, "id">>,
  ) => void;
  onFieldDelete: (fieldId: string) => void;
  onSchemaUpdate: (
    patch: Partial<Pick<AnalyzerSchema, "name" | "description" | "status">>,
  ) => void;
  exportSchema: () => void;
  importSchema: (json: string) => void;
  // Lifted tab state
  activeTab: TabId;
  onActiveTabChange: (tab: TabId) => void;
  // Reference file set props
  referenceFileSets: ReferenceFileSet[];
  selectedReferenceFileSetId: string;
  selectedReferenceFileId: string | null;
  onSelectReferenceSet: (id: string) => void;
  onCreateReferenceSet: (name: string) => void;
  onRenameReferenceSet: (id: string, name: string) => void;
  onDeleteReferenceSet: (id: string) => void;
  onSaveReferenceSet: (id: string) => Promise<void>;
  onAddFilesToReferenceSet: (files: File[]) => void;
  onRemoveFileFromReferenceSet: (fileId: string) => void;
  onSelectReferenceFile: (id: string) => void;
  savingReferenceSet: boolean;
  referenceSetSaveError: string | null;
  setsLoading?: boolean;
  /** Full response from the last successful Pro analysis run (null = not run yet). */
  analysisResult?: AnalyzeResponse | null;
  /** True while a Pro analysis request is in flight. */
  analysisRunning?: boolean;
  /** Error message from the last failed run, if any. */
  analysisError?: string | null;
  /** Currently selected field name for bounding-box highlight sync. */
  selectedFieldName?: string | null;
  /** Called when the user clicks a field row to select/deselect it. */
  onFieldSelect?: (name: string | null) => void;
  /** Called when the user clicks "New analyzer" from the empty schema state. */
  onNew?: () => void;
}

export default function ProRightTabs({
  schema,
  schemaLoading = false,
  readOnly = false,
  onFieldAdd,
  onFieldUpdate,
  onFieldDelete,
  onSchemaUpdate,
  exportSchema,
  importSchema,
  activeTab,
  onActiveTabChange,
  referenceFileSets,
  selectedReferenceFileSetId,
  selectedReferenceFileId,
  onSelectReferenceSet,
  onCreateReferenceSet,
  onRenameReferenceSet,
  onDeleteReferenceSet,
  onSaveReferenceSet,
  onAddFilesToReferenceSet,
  onRemoveFileFromReferenceSet,
  onSelectReferenceFile,
  savingReferenceSet,
  referenceSetSaveError,
  setsLoading,
  analysisResult = null,
  analysisRunning = false,
  analysisError = null,
  selectedFieldName,
  onFieldSelect,
  onNew,
}: ProRightTabsProps) {
  return (
    <div className="flex flex-col rounded-[20px] border border-[#e5e4e2] bg-white overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex-shrink-0 flex items-end border-b border-[#e5e4e2] px-3 bg-white"
        style={{ height: 52 }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onActiveTabChange(tab.id)}
              className={[
                "relative h-full px-4 text-sm whitespace-nowrap transition-colors duration-150 select-none",
                active
                  ? "font-semibold text-[#f05742]"
                  : "font-medium text-[#6b6b68] hover:text-[#1a1a18]",
              ].join(" ")}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#f05742] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "schema" &&
          (schemaLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-10 h-10 rounded-full border-4 border-[#f05742]/20 border-t-[#f05742] animate-spin" />
              <p className="text-sm text-[#6b6b68]">Loading schema...</p>
            </div>
          ) : schema === null ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-14 h-14 rounded-2xl bg-[#f5f5f4] border border-[#e5e4e2] flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-[#6b6b68]/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div className="text-center max-w-[220px]">
                <p className="text-sm font-semibold text-[#1a1a18]">
                  No analyzer selected
                </p>
                <p className="text-xs text-[#6b6b68] mt-1.5 leading-relaxed">
                  Select an existing analyzer from the list, or create a new
                  one.
                </p>
              </div>
              {onNew && (
                <button
                  onClick={onNew}
                  className="h-9 px-5 flex items-center gap-2 bg-[#f05742] hover:bg-[#d94332] active:bg-[#c23a2b] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm select-none"
                >
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  New analyzer
                </button>
              )}
            </div>
          ) : (
            <ProSchemaTab
              schema={schema}
              readOnly={readOnly}
              onFieldAdd={onFieldAdd}
              onFieldUpdate={onFieldUpdate}
              onFieldDelete={onFieldDelete}
              onSchemaUpdate={onSchemaUpdate}
              exportSchema={exportSchema}
              importSchema={importSchema}
            />
          ))}
        {activeTab === "reference" && (
          <ReferencePanel
            referenceFileSets={referenceFileSets}
            selectedReferenceFileSetId={selectedReferenceFileSetId}
            selectedReferenceFileId={selectedReferenceFileId}
            onSelectReferenceSet={onSelectReferenceSet}
            onCreateReferenceSet={onCreateReferenceSet}
            onRenameReferenceSet={onRenameReferenceSet}
            onDeleteReferenceSet={onDeleteReferenceSet}
            onSaveReferenceSet={onSaveReferenceSet}
            onAddFilesToReferenceSet={onAddFilesToReferenceSet}
            onRemoveFileFromReferenceSet={onRemoveFileFromReferenceSet}
            onSelectReferenceFile={onSelectReferenceFile}
            savingReferenceSet={savingReferenceSet}
            referenceSetSaveError={referenceSetSaveError}
            setsLoading={setsLoading}
          />
        )}
        {activeTab === "prediction" && (
          <PredictionPanel
            result={analysisResult}
            running={analysisRunning}
            error={analysisError}
            selectedFieldName={selectedFieldName}
            onFieldSelect={onFieldSelect}
          />
        )}
        {activeTab === "result" && (
          <ResultPanel result={analysisResult} running={analysisRunning} />
        )}
      </div>
    </div>
  );
}
