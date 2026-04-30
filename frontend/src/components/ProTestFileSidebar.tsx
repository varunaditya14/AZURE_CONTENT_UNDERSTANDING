import { useState, useRef } from "react";
import type { ProFile, TestFileSet } from "../types/proFileTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Matches the same types the standard UploadCard accepts
const ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.heif,.heic,.webp," +
  ".mp3,.wav,.ogg,.flac,.aac,.m4a,.mp4,.mov,.avi,.mkv,.webm," +
  ".docx,.txt";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FolderIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function UploadCloudIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function FileIcon({
  kind,
  className = "w-3.5 h-3.5",
}: {
  kind: ProFile["kind"];
  className?: string;
}) {
  if (kind === "pdf") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
      </svg>
    );
  }
  if (kind === "image") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    );
  }
  if (kind === "docx") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    );
  }
  if (kind === "txt") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 10h16M4 14h12M4 18h8"
        />
      </svg>
    );
  }
  // "other" — generic file (audio/video/etc.)
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function kindLabel(kind: ProFile["kind"]): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMG";
  if (kind === "docx") return "DOC";
  if (kind === "txt") return "TXT";
  return "FILE";
}

// ---------------------------------------------------------------------------
// Props (unchanged — ProWorkspace depends on this exact interface)
// ---------------------------------------------------------------------------

export interface ProTestFileSidebarProps {
  testFileSets: TestFileSet[];
  selectedTestFileSetId: string;
  selectedPreviewFileId: string | null;
  onCreateSet: (name: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onDeleteSet: (id: string) => void;
  onSelectSet: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (fileId: string) => void;
  onSelectPreviewFile: (fileId: string) => void;
  onSaveSet: (id: string) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  setsLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Main component — two internal views: "sets" | "files"
// ---------------------------------------------------------------------------

type View = "sets" | "files";

export default function ProTestFileSidebar({
  testFileSets,
  selectedTestFileSetId,
  selectedPreviewFileId,
  onCreateSet,
  onRenameSet,
  onDeleteSet,
  onSelectSet,
  onAddFiles,
  onRemoveFile,
  onSelectPreviewFile,
  onSaveSet,
  saving,
  saveError,
  setsLoading,
}: ProTestFileSidebarProps) {
  const [view, setView] = useState<View>("sets");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const activeSet = testFileSets.find((s) => s.id === selectedTestFileSetId);

  // ── Shared handlers ──────────────────────────────────────────────────────

  function handleSelectSet(id: string) {
    onSelectSet(id);
    setView("files");
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onAddFiles(files);
    e.target.value = "";
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameSet(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleCreate() {
    if (!newSetName.trim()) return;
    onCreateSet(newSetName.trim());
    setNewSetName("");
    setIsCreating(false);
    setView("files");
  }

  // ── Drag-and-drop handlers (files view) ──────────────────────────────────

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onAddFiles(files);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETS VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "sets") {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] border border-[#e5e4e2] bg-white p-4 min-h-0">
        {/* Section header */}
        <p className="flex-shrink-0 text-[11px] font-semibold text-[#6b6b68] uppercase tracking-wider">
          Test file sets
        </p>

        {/* Sets list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
          {setsLoading ? (
            <div className="flex flex-col gap-1.5 animate-pulse">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-12 rounded-xl bg-[#f9f9f8] border border-[#e5e4e2]"
                />
              ))}
            </div>
          ) : (
            testFileSets.map((set) => {
              const isActive = set.id === selectedTestFileSetId;
              const isRenaming = renamingId === set.id;
              const needsSave = !set.savedId || set.isDirty;

              return (
                <div
                  key={set.id}
                  className={[
                    "group flex items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-all",
                    isActive
                      ? "border-[#f05742] bg-[#fff5f4]"
                      : "border-[#e5e4e2] bg-white hover:border-[#f05742]/40 hover:bg-[#fff9f8]",
                  ].join(" ")}
                >
                  <div className="relative flex-shrink-0">
                    <FolderIcon
                      className={`w-4 h-4 ${isActive ? "text-[#f05742]" : "text-[#6b6b68]"}`}
                    />
                    {needsSave && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                        title="Unsaved changes"
                      />
                    )}
                  </div>

                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={commitRename}
                      className="flex-1 min-w-0 text-xs bg-transparent border-b border-[#f05742] outline-none text-[#1a1a18] py-0.5"
                    />
                  ) : (
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => handleSelectSet(set.id)}
                    >
                      <p
                        className={`text-xs font-semibold truncate leading-tight ${isActive ? "text-[#f05742]" : "text-[#1a1a18]"}`}
                      >
                        {set.name}
                      </p>
                      <p className="text-[10px] text-[#6b6b68] mt-0.5">
                        {set.files.length}{" "}
                        {set.files.length === 1 ? "file" : "files"}
                      </p>
                    </button>
                  )}

                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(set.id, set.name);
                        }}
                        title="Rename"
                        className="w-5 h-5 rounded flex items-center justify-center text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/10 transition-colors"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>

                      {testFileSets.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSet(set.id);
                          }}
                          title="Delete"
                          className="w-5 h-5 rounded flex items-center justify-center text-[#6b6b68] hover:text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors"
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
            })
          )}
        </div>

        {/* Create new set */}
        <div className="flex-shrink-0">
          {isCreating ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setNewSetName("");
                    setIsCreating(false);
                  }
                }}
                placeholder="Set name..."
                className="w-full h-8 px-2.5 rounded-lg border border-[#e5e4e2] text-xs text-[#1a1a18] outline-none focus:border-[#f05742] focus:ring-2 focus:ring-[#f05742]/15 transition-colors"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setNewSetName("");
                    setIsCreating(false);
                  }}
                  className="flex-1 h-7 rounded-lg border border-[#e5e4e2] text-[11px] font-medium text-[#6b6b68] hover:bg-[#f9f9f8] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="flex-1 h-7 rounded-lg bg-[#f05742] hover:bg-[#d94332] text-white text-[11px] font-semibold transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              style={{ height: 48 }}
              className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-[#e5e4e2] rounded-xl text-xs font-medium text-[#6b6b68] hover:border-[#f05742]/50 hover:text-[#f05742] hover:bg-[#fff5f4] transition-colors"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New test file set
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILES VIEW (inside selected set)
  // ═══════════════════════════════════════════════════════════════════════════

  const fileCount = activeSet?.files.length ?? 0;

  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-[20px] border bg-white p-4 min-h-0 transition-colors",
        isDragging ? "border-[#f05742] bg-[#fff5f4]" : "border-[#e5e4e2]",
      ].join(" ")}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={uploadRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={handleUpload}
      />

      {/* Breadcrumb */}
      <button
        onClick={() => setView("sets")}
        className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-[#6b6b68] hover:text-[#f05742] transition-colors text-left -mt-0.5"
      >
        <svg
          className="w-3 h-3 flex-shrink-0"
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
        Test file sets
      </button>

      {/* Set title + file count */}
      <div className="flex-shrink-0 flex items-center justify-between -mt-1">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1a1a18] truncate leading-tight">
            {activeSet?.name ?? "Set"}
          </p>
          <p className="text-[10px] text-[#6b6b68] mt-0.5">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {/* Save button */}
          {activeSet && (activeSet.isDirty || !activeSet.savedId) ? (
            <button
              onClick={() => activeSet && onSaveSet(activeSet.id)}
              disabled={saving}
              title="Save test file set"
              className="flex items-center gap-1 h-7 px-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[11px] font-semibold rounded-lg transition-colors"
            >
              {saving ? (
                <svg
                  className="w-3 h-3 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
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
              )}
              {saving ? "Saving…" : "Save"}
            </button>
          ) : activeSet?.savedId ? (
            <span className="flex items-center gap-1 h-7 px-2.5 bg-emerald-100 text-emerald-700 text-[11px] font-semibold rounded-lg">
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </span>
          ) : null}
          {/* Upload button */}
          <button
            onClick={() => uploadRef.current?.click()}
            title="Upload files"
            className="flex items-center gap-1 h-7 px-2.5 bg-[#f05742] hover:bg-[#d94332] text-white text-[11px] font-semibold rounded-lg transition-colors"
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
            Add
          </button>
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <p className="flex-shrink-0 text-[10px] text-red-600 bg-red-50 rounded-lg px-2.5 py-1 -mt-1">
          {saveError}
        </p>
      )}

      {/* File list — or empty state */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-0.5">
        {fileCount > 0 ? (
          activeSet!.files.map((file) => {
            const isSelected = selectedPreviewFileId === file.id;
            return (
              <div
                key={file.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPreviewFile(file.id)}
                onKeyDown={(e) =>
                  e.key === "Enter" && onSelectPreviewFile(file.id)
                }
                className={[
                  "group flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#f05742]/40",
                  isSelected
                    ? "border-[#f05742] bg-[#fff5f4]"
                    : "border-[#e5e4e2] bg-white hover:border-[#f05742]/40 hover:bg-[#fff9f8]",
                ].join(" ")}
              >
                {/* File type icon */}
                <FileIcon
                  kind={file.kind}
                  className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-[#f05742]" : "text-[#6b6b68]"}`}
                />

                {/* Name + size */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-medium truncate leading-tight ${isSelected ? "text-[#f05742]" : "text-[#1a1a18]"}`}
                  >
                    {file.name}
                  </p>
                  <p className="text-[10px] text-[#6b6b68] mt-0.5">
                    {fmtSize(file.size)}
                  </p>
                </div>

                {/* Kind badge */}
                <span
                  className={[
                    "text-[9px] font-bold px-1 py-0.5 rounded tracking-wide flex-shrink-0 transition-colors",
                    isSelected
                      ? "bg-[#f05742]/15 text-[#f05742]"
                      : "bg-[#f9f9f8] text-[#6b6b68] group-hover:bg-[#f05742]/10 group-hover:text-[#f05742]",
                  ].join(" ")}
                >
                  {kindLabel(file.kind)}
                </span>

                {/* Remove ✕ */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(file.id);
                  }}
                  title="Remove file"
                  className="w-4 h-4 rounded flex items-center justify-center text-[#6b6b68] hover:text-[#dc2626] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            );
          })
        ) : (
          /* Empty state — also acts as a drop/click zone */
          <button
            onClick={() => uploadRef.current?.click()}
            className={[
              "w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-all",
              isDragging
                ? "border-[#f05742] bg-[#fff5f4]"
                : "border-[#e5e4e2] hover:border-[#f05742]/50 hover:bg-[#fff9f8]",
            ].join(" ")}
          >
            <UploadCloudIcon
              className={`w-8 h-8 transition-colors ${isDragging ? "text-[#f05742]" : "text-[#6b6b68]/30"}`}
            />
            <div className="text-center">
              <p
                className={`text-[11px] font-medium transition-colors ${isDragging ? "text-[#f05742]" : "text-[#6b6b68]"}`}
              >
                {isDragging ? "Drop to add files" : "Drop files here"}
              </p>
              {!isDragging && (
                <p className="text-[10px] text-[#6b6b68]/60 mt-0.5">
                  or click to browse
                </p>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Drag overlay label — shows when dragging over a non-empty list */}
      {isDragging && fileCount > 0 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-[#f05742] bg-[#fff5f4]">
          <svg
            className="w-3.5 h-3.5 text-[#f05742]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-[11px] font-semibold text-[#f05742]">
            Drop to add
          </span>
        </div>
      )}
    </div>
  );
}
